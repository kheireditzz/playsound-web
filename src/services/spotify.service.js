import { decryptSaavnMedia } from './audio.service.js';

let cachedSpotifySession = { token: null, expiresAt: 0 };

export async function getSpotifyToken() {
  const now = Date.now();
  if (cachedSpotifySession.token && now < cachedSpotifySession.expiresAt - 60000) {
    return cachedSpotifySession.token;
  }
  try {
    const res = await fetch("https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(4500)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    const json = JSON.parse(m[1]);
    const session = json.props?.pageProps?.state?.settings?.session;
    if (session?.accessToken) {
      cachedSpotifySession = {
        token: session.accessToken,
        expiresAt: session.accessTokenExpirationTimestampMs || (Date.now() + 3600000)
      };
      return cachedSpotifySession.token;
    }
  } catch (err) {
    console.warn("Spotify token fetch warning:", err.message);
  }
  return null;
}

export async function fetchSpotifyPlaylist(playlistId, originTag = "Spotify", limit = 50) {
  try {
    const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5500)
    });
    if (!embedRes.ok) return [];
    const html = await embedRes.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return [];
    const json = JSON.parse(m[1]);
    const entity = json.props?.pageProps?.state?.data?.entity;
    const embedTracks = entity?.trackList || [];
    if (embedTracks.length === 0) return [];

    let coversMap = {};
    const token = await getSpotifyToken();
    if (token) {
      try {
        const vars = JSON.stringify({
          uri: `spotify:playlist:${playlistId}`,
          offset: 0,
          limit: Math.min(100, embedTracks.length),
          enableWatchFeedEntrypoint: false
        });
        const extensions = JSON.stringify({
          persistedQuery: {
            version: 1,
            sha256Hash: "a65e12194ed5fc443a1cdebed5fabe33ca5b07b987185d63c72483867ad13cb4"
          }
        });
        const qUrl = `https://api-partner.spotify.com/pathfinder/v1/query?operationName=fetchPlaylist&variables=${encodeURIComponent(vars)}&extensions=${encodeURIComponent(extensions)}`;
        const qRes = await fetch(qUrl, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          },
          signal: AbortSignal.timeout(4500)
        });
        if (qRes.ok) {
          const qData = await qRes.json();
          const items = qData.data?.playlistV2?.content?.items || [];
          for (const it of items) {
            const d = it.itemV2?.data;
            if (d?.uri) {
              const sources = d.albumOfTrack?.coverArt?.sources || [];
              const best = sources.find(s => s.width >= 300) || sources[0];
              if (best) coversMap[d.uri] = best.url;
            }
          }
        }
      } catch (qErr) {
        console.warn("Pathfinder cover query non-blocking warning:", qErr.message);
      }
    }

    return embedTracks.slice(0, limit).map((t, idx) => {
      const rawTitle = t.title || "Track";
      const rawArtist = (t.subtitle || "Artist").replace(/\u00A0/g, " ");
      const spotifyTrackId = t.uri ? t.uri.replace("spotify:track:", "") : `${idx}`;
      return {
        id: `sp-${spotifyTrackId}`,
        rank: idx + 1,
        title: rawTitle,
        artist: rawArtist,
        album: entity.name || "Spotify Hits",
        cover: coversMap[t.uri] || "",
        preview: t.audioPreview?.url || "",
        duration: Math.round((t.duration || 30000) / 1000),
        trendVelocity: idx === 0 ? "TOP 1" : idx < 5 ? "TOP" : idx % 3 === 0 ? "BARU" : "HOT",
        origin: originTag,
        youtubeQuery: `${rawArtist} ${rawTitle} official audio`,
        externalUrls: {
          spotify: `https://open.spotify.com/track/${spotifyTrackId}`,
          youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(rawArtist + " " + rawTitle)}`,
          tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(rawArtist + " " + rawTitle)}`
        }
      };
    });
  } catch (err) {
    console.error("fetchSpotifyPlaylist error:", err.message);
    return [];
  }
}

export async function fetchDeezerGlobal(isRotating = true) {
  try {
    const res = await fetch('https://api.deezer.com/chart/0/tracks?limit=100');
    if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
    const json = await res.json();
    if (!json.tracks?.data && !json.data) return [];
    const list = json.tracks?.data || json.data;

    const mapped = list.map((item, idx) => {
      const title = item.title_short || item.title;
      const artist = item.artist?.name || 'Unknown Artist';
      return {
        id: `dz-${item.id}`,
        rank: idx + 1,
        title,
        artist,
        album: item.album?.title || 'Single',
        cover: item.album?.cover_medium || item.album?.cover_big || item.album?.cover || '',
        preview: item.preview || '',
        duration: item.duration || 30,
        trendVelocity: idx === 0 ? 'TOP GLOBAL' : idx < 5 ? 'TOP' : idx % 4 === 0 ? 'BARU' : 'HOT',
        origin: idx % 2 === 0 ? 'Spotify' : 'TikTok',
        youtubeQuery: `${artist} ${title} official audio`,
        externalUrls: {
          deezer: item.link || '',
          youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
          tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`,
          spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
        }
      };
    });

    if (!isRotating || mapped.length <= 15) return mapped.slice(0, 35);

    const coreTop = mapped.slice(0, 5);
    const pool = mapped.slice(5);
    const now = new Date();
    const timeSeed = now.getUTCDate() * 24 + Math.floor(now.getUTCHours() / 4);
    const offset = (timeSeed * 7) % Math.max(1, pool.length - 30);
    const rotatedRest = [...pool.slice(offset), ...pool.slice(0, offset)].slice(0, 30);

    return [...coreTop, ...rotatedRest];
  } catch (err) {
    console.error('Deezer fetch error:', err.message);
    return [];
  }
}

export async function fetchAppleRss(country = 'us', originTag = 'Billboard', limit = 40) {
  try {
    const res = await fetch(`https://itunes.apple.com/${country}/rss/topsongs/limit=${limit}/json`);
    if (!res.ok) throw new Error(`Apple RSS HTTP ${res.status}`);
    const json = await res.json();
    const entries = json.feed?.entry || [];

    return entries.map((entry, idx) => {
      const title = entry['im:name']?.label || 'Unknown Title';
      const artist = entry['im:artist']?.label || 'Unknown Artist';
      const album = entry['im:collection']?.['im:name']?.label || 'Single';
      const images = entry['im:image'] || [];
      const cover = images.length > 0 ? images[images.length - 1].label : '';
      const preview = entry.link?.find(l => l.attributes?.['im:assetType'] === 'preview')?.attributes?.href || '';
      const appleUrl = entry.id?.label || '';

      return {
        id: `ap-${country}-${idx}-${Math.abs(title.length + artist.length)}`,
        rank: idx + 1,
        title,
        artist,
        album,
        cover,
        preview,
        duration: 30,
        trendVelocity: idx === 0 ? 'TOP 1' : idx < 4 ? 'TOP' : idx % 3 === 0 ? 'BARU' : 'POPULER',
        origin: originTag,
        youtubeQuery: `${artist} ${title} official audio`,
        externalUrls: {
          apple: appleUrl,
          youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
          tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`,
          spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
        }
      };
    });
  } catch (err) {
    console.error(`Apple RSS fetch error (${country}):`, err.message);
    return [];
  }
}

export async function fetchTikTokViralHits() {
  const TIKTOK_QUERIES = [
    'tiktok viral hits 2026',
    'viral songs trending fyp',
    'tiktok sound trend viral',
    'popular dance hits tiktok',
    'trending speed up songs tiktok',
    'global viral tiktok sound',
    'tiktok hits nightcore viral'
  ];
  const now = new Date();
  const queryIdx = (now.getUTCDay() + Math.floor(now.getUTCHours() / 6)) % TIKTOK_QUERIES.length;
  const currentQuery = TIKTOK_QUERIES[queryIdx];

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(currentQuery)}&entity=song&limit=35`);
    if (!res.ok) throw new Error(`iTunes search HTTP ${res.status}`);
    const json = await res.json();
    const results = json.results || [];

    return results.map((item, idx) => {
      const title = item.trackName || 'Viral Sound';
      const artist = item.artistName || 'Unknown Artist';
      return {
        id: `tt-${item.trackId || idx}`,
        rank: idx + 1,
        title,
        artist,
        album: item.collectionName || 'TikTok Trends',
        cover: (item.artworkUrl100 || '').replace('100x100bb', '250x250bb'),
        preview: item.previewUrl || '',
        duration: Math.round((item.trackTimeMillis || 30000) / 1000),
        trendVelocity: idx === 0 ? 'TOP SOUND' : idx < 5 ? 'VIRAL FYP' : 'TRENDING',
        origin: 'TikTok',
        youtubeQuery: `${artist} ${title} official sound`,
        externalUrls: {
          apple: item.trackViewUrl || '',
          youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
          tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`,
          spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
        }
      };
    });
  } catch (err) {
    console.error('TikTok search error:', err.message);
    return [];
  }
}

export async function fetchFreshReleases() {
  try {
    const res = await fetch('https://itunes.apple.com/search?term=new+music+releases+2026&entity=song&limit=35');
    if (res.ok) {
      const json = await res.json();
      const results = json.results || [];
      if (results.length > 0) {
        return results.map((item, idx) => {
          const title = item.trackName || 'Fresh Track';
          const artist = item.artistName || 'Unknown Artist';
          return {
            id: `fr-${item.trackId || idx}`,
            rank: idx + 1,
            title,
            artist,
            album: item.collectionName || 'New Single',
            cover: (item.artworkUrl100 || '').replace('100x100bb', '250x250bb'),
            preview: item.previewUrl || '',
            duration: Math.round((item.trackTimeMillis || 30000) / 1000),
            trendVelocity: idx === 0 ? 'RILIS BARU' : idx < 5 ? 'BARU' : 'POPULER',
            origin: 'Fresh Hits',
            youtubeQuery: `${artist} ${title} official audio`,
            externalUrls: {
              apple: item.trackViewUrl || '',
              youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
              tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`,
              spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
            }
          };
        });
      }
    }
  } catch (e) {
    console.error('Fresh releases error:', e.message);
  }
  return fetchAppleRss('us', 'Fresh Hits', 35);
}

export async function fetchSearchGenre(term, originTag) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=30`);
    if (!res.ok) throw new Error(`iTunes search HTTP ${res.status}`);
    const json = await res.json();
    const results = json.results || [];

    return results.map((item, idx) => {
      const title = item.trackName || 'Viral Song';
      const artist = item.artistName || 'Unknown Artist';
      return {
        id: `gn-${item.trackId || idx}`,
        rank: idx + 1,
        title,
        artist,
        album: item.collectionName || 'Top Hits',
        cover: (item.artworkUrl100 || '').replace('100x100bb', '250x250bb'),
        preview: item.previewUrl || '',
        duration: Math.round((item.trackTimeMillis || 30000) / 1000),
        trendVelocity: idx === 0 ? 'TOP 1' : idx < 5 ? 'TOP' : 'TRENDING',
        origin: originTag,
        youtubeQuery: `${artist} ${title} official`,
        externalUrls: {
          apple: item.trackViewUrl || '',
          youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
          tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`,
          spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
        }
      };
    });
  } catch (err) {
    console.error(`Genre search error (${term}):`, err.message);
    return [];
  }
}

export async function scrapeViralIndo() {
  const seen = new Set();
  const list = [];

  try {
    const appleIndo = await fetchAppleRss('id', 'Indo Hits', 30);
    for (const t of appleIndo) {
      const key = `${t.title.toLowerCase()}_${t.artist.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(t);
      }
    }
  } catch (err) {
    console.error('Apple Indo error:', err.message);
  }

  try {
    const url = 'https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=indonesia+viral+tiktok+hits&n=30&p=1';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(7000)
    });
    if (res.ok) {
      const data = await res.json();
      (data.results || []).forEach((item, idx) => {
        const streamUrl = decryptSaavnMedia(item.more_info?.encrypted_media_url);
        const title = (item.title || 'Lagu Viral').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
        const artist = (item.subtitle || 'Top Artist').replace(/&amp;/g, '&');
        const key = `${title.toLowerCase()}_${artist.toLowerCase()}`;
        if (!seen.has(key) && streamUrl) {
          seen.add(key);
          list.push({
            id: `sv-${item.id || idx}`,
            rank: list.length + 1,
            title,
            artist,
            album: item.more_info?.album || 'Viral Hits',
            cover: item.image ? item.image.replace('150x150', '250x250') : '',
            preview: streamUrl || '',
            fullStreamUrl: streamUrl || '',
            duration: Number(item.more_info?.duration) || 180,
            trendVelocity: idx < 3 ? 'TOP INDO' : 'HITS',
            origin: 'Indo Hits',
            youtubeQuery: `${artist} ${title} official audio`,
            externalUrls: {
              saavn: item.perma_url || '',
              youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
              tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`,
              spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
            }
          });
        }
      });
    }
  } catch (err) {
    console.error('Viral Indo scrape error:', err.message);
  }

  return list.slice(0, 35);
}
