import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CryptoJS from 'crypto-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// In-memory Cache (Fast 3-min TTL for real-time fresh charts)
const cache = {
  data: {},
  timestamps: {},
  TTL_MS: 3 * 60 * 1000 // 3 minutes for fresh real-time updates
};

function getFromCache(key) {
  const ts = cache.timestamps[key];
  if (ts && Date.now() - ts < cache.TTL_MS && cache.data[key]) {
    return cache.data[key];
  }
  return null;
}

function setCache(key, val) {
  cache.data[key] = val;
  cache.timestamps[key] = Date.now();
}

// ── Spotify Realtime Scraper Engine (Embed & Pathfinder GraphQL) ──
let cachedSpotifySession = { token: null, expiresAt: 0 };

async function getSpotifyToken() {
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

async function fetchSpotifyPlaylist(playlistId, originTag = "Spotify", limit = 50) {
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

// Data Fetchers with Dynamic Daily Rotation & Fresh Releases
async function fetchDeezerGlobal(isRotating = true) {
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

    // Rotasi Harian & 4-Jam Dinamis:
    // Peringkat 1-5 dipertahankan sebagai Core Viral Hits tak terbantahkan.
    // Peringkat 6-100 dirotasikan secara cerdas berdasarkan jam/hari agar lagu variatif & tidak monoton!
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

async function fetchAppleRss(country = 'us', originTag = 'Billboard', limit = 40) {
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

async function fetchTikTokViralHits() {
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

async function fetchFreshReleases() {
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

async function searchSongs(query) {
  const rawQ = (query || '').trim();
  if (!rawQ) return [];

  const cleanQ = rawQ.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const queryTokens = cleanQ.toLowerCase().split(' ').filter(t => t.length > 0);

  const seen = new Set();
  const candidates = [];

  // 1. Search Deezer Global (90M+ katalog musik global & Indonesia dengan cover HD & MP3 preview instan)
  const deezerPromise = (async () => {
    try {
      const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(rawQ)}&limit=30`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(4500)
      });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data || []).map(t => ({
        id: `dz-sr-${t.id}`,
        title: t.title_short || t.title,
        artist: t.artist?.name || 'Artist',
        album: t.album?.title || 'Single',
        cover: t.album?.cover_medium || t.album?.cover_big || t.album?.cover || '',
        preview: t.preview || '',
        fullStreamUrl: '',
        duration: t.duration || 30,
        origin: 'Deezer'
      }));
    } catch {
      return [];
    }
  })();

  // 2. Search Spotify via Pathfinder Desktop Search (katalog resmi Spotify internasional)
  const spotifyPromise = (async () => {
    try {
      const token = await getSpotifyToken();
      if (!token) return [];
      const vars = JSON.stringify({
        searchTerm: rawQ,
        offset: 0,
        limit: 20,
        numberOfTopResults: 5,
        includeAudiobooks: false,
        includePreReleases: true,
        includeAlbumPreReleases: false,
        includeAuthors: false,
        includeEpisodeContentRatingsV2: false
      });
      const extensions = JSON.stringify({
        persistedQuery: {
          version: 1,
          sha256Hash: "eff59fa0a3d026b88b56fddbcf4bdfa16a186b8175a5c1a358c072e053c2e5b0"
        }
      });
      const qUrl = `https://api-partner.spotify.com/pathfinder/v1/query?operationName=searchDesktop&variables=${encodeURIComponent(vars)}&extensions=${encodeURIComponent(extensions)}`;
      const res = await fetch(qUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        signal: AbortSignal.timeout(4500)
      });
      if (!res.ok) return [];
      const json = await res.json();
      const items = json.data?.searchV2?.tracksV2?.items || [];
      return items.map(it => {
        const d = it.item?.data;
        if (!d) return null;
        const covers = d.albumOfTrack?.coverArt?.sources || [];
        const bestCover = covers.find(c => c.width >= 300) || covers[0];
        const artist = d.artists?.items?.map(a => a.profile?.name).filter(Boolean).join(', ') || 'Artist';
        const durSec = Math.round((d.duration?.totalMilliseconds || 30000) / 1000);
        return {
          id: `sp-sr-${d.id || Math.random()}`,
          title: d.name || 'Track',
          artist,
          album: d.albumOfTrack?.name || 'Single',
          cover: bestCover?.url || '',
          preview: '',
          fullStreamUrl: '',
          duration: durSec,
          origin: 'Spotify'
        };
      }).filter(Boolean);
    } catch {
      return [];
    }
  })();

  // 3. Search JioSaavn (untuk 320kbps full stream langsung jika ada)
  const saavnPromise = (async () => {
    try {
      const sUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(cleanQ)}&n=20&p=1`;
      const res = await fetch(sUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(4500)
      });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.results || []).map(item => {
        const streamUrl = decryptSaavnMedia(item.more_info?.encrypted_media_url);
        const title = (item.title || 'Track').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
        const artist = (item.subtitle || item.more_info?.music || 'Artist').replace(/&amp;/g, '&');
        return {
          id: `saavn-sr-${item.id}`,
          title,
          artist,
          album: item.more_info?.album || 'Single',
          cover: item.image ? item.image.replace('150x150', '250x250') : '',
          preview: streamUrl || '',
          fullStreamUrl: streamUrl || '',
          duration: Number(item.more_info?.duration) || 180,
          origin: '320kbps HD'
        };
      });
    } catch {
      return [];
    }
  })();

  // 4. Search iTunes (Katalog Apple Music global)
  const itunesPromise = (async () => {
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(rawQ)}&entity=song&limit=20`, {
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) return [];
      const json = await res.json();
      return (json.results || []).map(item => ({
        id: `it-sr-${item.trackId}`,
        title: item.trackName,
        artist: item.artistName,
        album: item.collectionName || 'Single',
        cover: (item.artworkUrl100 || '').replace('100x100bb', '300x300bb'),
        preview: item.previewUrl || '',
        fullStreamUrl: '',
        duration: Math.round((item.trackTimeMillis || 30000) / 1000),
        origin: 'Apple'
      }));
    } catch {
      return [];
    }
  })();

  // Eksekusi paralel semua provider secara serentak
  const [deezerRes, spotifyRes, saavnRes, itunesRes] = await Promise.allSettled([
    deezerPromise, spotifyPromise, saavnPromise, itunesPromise
  ]);

  const rawList = [
    ...(deezerRes.status === 'fulfilled' ? deezerRes.value : []),
    ...(spotifyRes.status === 'fulfilled' ? spotifyRes.value : []),
    ...(saavnRes.status === 'fulfilled' ? saavnRes.value : []),
    ...(itunesRes.status === 'fulfilled' ? itunesRes.value : [])
  ];

  // Algoritma Word Relevance Matching
  const lowerQ = rawQ.toLowerCase().trim();
  for (const item of rawList) {
    if (!item.title || !item.artist) continue;
    const lowerTitle = item.title.toLowerCase();
    const lowerArtist = item.artist.toLowerCase();
    const fullText = `${lowerTitle} ${lowerArtist}`;
    const dedupeKey = `${lowerTitle.replace(/[^a-z0-9]/g, '')}_${lowerArtist.replace(/[^a-z0-9]/g, '')}`;

    if (seen.has(dedupeKey)) {
      // Jika sudah ada tapi yang ini punya preview atau cover lebih baik, update kandidat yang ada
      const existing = candidates.find(c => c.dedupeKey === dedupeKey);
      if (existing) {
        if (!existing.preview && item.preview) existing.preview = item.preview;
        if (!existing.fullStreamUrl && item.fullStreamUrl) existing.fullStreamUrl = item.fullStreamUrl;
        if (!existing.cover && item.cover) existing.cover = item.cover;
      }
      continue;
    }
    seen.add(dedupeKey);

    let score = 0;

    // 1. Exact phrase match
    if (lowerTitle === lowerQ) score += 200;
    else if (lowerTitle.startsWith(lowerQ)) score += 120;
    else if (lowerTitle.includes(lowerQ)) score += 90;
    else if (fullText.includes(lowerQ)) score += 70;

    // 2. Token / word matching
    for (const tok of queryTokens) {
      if (tok.length <= 1) continue;
      if (lowerTitle.includes(tok)) score += 30;
      if (lowerArtist.includes(tok)) score += 20;
    }

    // 3. Media playback availability
    if (item.fullStreamUrl) score += 35;
    else if (item.preview) score += 25;
    if (item.cover && item.cover.startsWith('http')) score += 10;

    item.relevanceScore = score;
    item.dedupeKey = dedupeKey;
    candidates.push(item);
  }

  // Urutkan berdasarkan skor kecocokan kata tertinggi
  candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return candidates.slice(0, 45).map((t, idx) => ({
    id: t.id || `sr-${idx}`,
    rank: idx + 1,
    title: t.title,
    artist: t.artist,
    album: t.album || 'Single',
    cover: t.cover || '',
    preview: t.preview || '',
    fullStreamUrl: t.fullStreamUrl || '',
    duration: t.duration || 30,
    trendVelocity: idx === 0 ? 'TOP RELEVAN' : idx < 5 ? 'TOP' : 'COCOK',
    origin: t.origin,
    youtubeQuery: `${t.artist} ${t.title} official audio`,
    externalUrls: {
      spotify: `https://open.spotify.com/search/${encodeURIComponent(t.artist + ' ' + t.title)}`,
      youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(t.artist + ' ' + t.title)}`,
      tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(t.artist + ' ' + t.title)}`
    }
  }));
}

async function fetchSearchGenre(term, originTag) {
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

// ── Top & Fresh Albums Fetcher (Realtime Billboard / Apple Music Global & Indo) ──
async function fetchTopAlbums() {
  const cached = getFromCache('albums_top_list');
  if (cached) return cached;

  const albums = [];
  const seen = new Set();

  // 1. Apple Music US & Global Top Albums
  try {
    const resUs = await fetch('https://itunes.apple.com/us/rss/topalbums/limit=35/json', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    if (resUs.ok) {
      const json = await resUs.json();
      const entries = json.feed?.entry || [];
      for (const entry of entries) {
        const id = entry.id?.attributes?.['im:id'];
        const title = entry['im:name']?.label || 'Album';
        const artist = entry['im:artist']?.label || 'Artist';
        const dedupeKey = `${title.toLowerCase()}_${artist.toLowerCase()}`;
        if (!id || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const images = entry['im:image'] || [];
        const cover = images.length > 0 ? images[images.length - 1].label : '';
        const trackCount = Number(entry['im:itemCount']?.label) || 10;
        const releaseDate = entry['im:releaseDate']?.attributes?.label || entry['im:releaseDate']?.label?.slice(0, 10) || '2026';
        const genre = entry.category?.attributes?.label || 'Music';

        albums.push({
          id,
          title,
          artist,
          cover: cover.replace(/170x170/g, '450x450').replace(/100x100/g, '450x450'),
          trackCount,
          releaseDate,
          genre,
          origin: 'Top Billboard'
        });
      }
    }
  } catch (err) {
    console.error('Fetch US albums error:', err.message);
  }

  // 2. Apple Music Indonesia Top Albums
  try {
    const resId = await fetch('https://itunes.apple.com/id/rss/topalbums/limit=25/json', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    if (resId.ok) {
      const json = await resId.json();
      const entries = json.feed?.entry || [];
      for (const entry of entries) {
        const id = entry.id?.attributes?.['im:id'];
        const title = entry['im:name']?.label || 'Album';
        const artist = entry['im:artist']?.label || 'Artist';
        const dedupeKey = `${title.toLowerCase()}_${artist.toLowerCase()}`;
        if (!id || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const images = entry['im:image'] || [];
        const cover = images.length > 0 ? images[images.length - 1].label : '';
        const trackCount = Number(entry['im:itemCount']?.label) || 10;
        const releaseDate = entry['im:releaseDate']?.attributes?.label || entry['im:releaseDate']?.label?.slice(0, 10) || '2026';
        const genre = entry.category?.attributes?.label || 'Indo Music';

        albums.push({
          id,
          title,
          artist,
          cover: cover.replace(/170x170/g, '450x450').replace(/100x100/g, '450x450'),
          trackCount,
          releaseDate,
          genre,
          origin: 'Top Indo'
        });
      }
    }
  } catch (err) {
    console.error('Fetch Indo albums error:', err.message);
  }

  if (albums.length > 0) {
    setCache('albums_top_list', albums);
  }
  return albums;
}

// ── Full Album Detail & Tracklist Lookup ──
async function fetchAlbumDetail(albumId) {
  if (!albumId) return null;
  const cacheKey = `album_det_${albumId}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(albumId)}&entity=song`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const results = json.results || [];
    if (results.length === 0) return null;

    const albumInfo = results[0];
    const rawTracks = results.slice(1);

    const tracks = rawTracks.map((t, idx) => {
      const title = t.trackName || `Track ${idx + 1}`;
      const artist = t.artistName || albumInfo.artistName || 'Artist';
      const durationSec = Math.round((t.trackTimeMillis || 30000) / 1000);
      const cover = (t.artworkUrl100 || albumInfo.artworkUrl100 || '').replace(/100x100bb/g, '400x400bb');
      const preview = t.previewUrl || '';
      return {
        id: `alb-tr-${t.trackId || idx}`,
        trackNumber: t.trackNumber || (idx + 1),
        rank: idx + 1,
        title,
        artist,
        album: albumInfo.collectionName || 'Album',
        cover,
        preview,
        fullStreamUrl: '',
        duration: durationSec,
        trendVelocity: `TRACK ${String(t.trackNumber || (idx + 1)).padStart(2, '0')}`,
        origin: 'Album Track',
        youtubeQuery: `${artist} ${title} official audio`,
        externalUrls: {
          apple: t.trackViewUrl || albumInfo.collectionViewUrl || '',
          youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
          tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`,
          spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
        }
      };
    });

    const albumDetail = {
      id: albumId,
      title: albumInfo.collectionName || 'Album',
      artist: albumInfo.artistName || 'Artist',
      cover: (albumInfo.artworkUrl100 || '').replace(/100x100bb/g, '600x600bb'),
      genre: albumInfo.primaryGenreName || 'Pop',
      releaseDate: (albumInfo.releaseDate || '').slice(0, 10),
      copyright: albumInfo.copyright || '',
      trackCount: tracks.length,
      tracks
    };

    cache.data[cacheKey] = albumDetail;
    cache.timestamps[cacheKey] = Date.now() - cache.TTL_MS + 30 * 60 * 1000;
    return albumDetail;
  } catch (err) {
    console.error(`Fetch album detail error (${albumId}):`, err.message);
    return null;
  }
}

// Preload Cache
let preloadedGlobalTracks = [];
async function preload() {
  try {
    const sp = await fetchSpotifyPlaylist('37i9dQZEVXbMDoHDwVN2tF', 'Spotify Global', 50);
    if (sp && sp.length > 0) {
      preloadedGlobalTracks = sp;
      setCache('trends_global', sp);
      return;
    }
  } catch (e) {
    console.warn('Preload Spotify warning:', e.message);
  }
  const d = await fetchDeezerGlobal();
  if (d && d.length > 0) {
    preloadedGlobalTracks = d;
    setCache('trends_global', d);
  } else {
    const a = await fetchAppleRss('us', 'Billboard');
    preloadedGlobalTracks = a;
    setCache('trends_global', a);
  }
}
preload();

// ── Free Music Scraper (JioSaavn 320kbps Stream Decryptor) ──
function decryptSaavnMedia(enc) {
  if (!enc) return null;
  try {
    const key = CryptoJS.enc.Utf8.parse('38346591');
    const decrypted = CryptoJS.DES.decrypt({
      ciphertext: CryptoJS.enc.Base64.parse(enc)
    }, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    });
    const url = decrypted.toString(CryptoJS.enc.Utf8);
    if (!url) return null;
    return url.replace(/_[0-9]+\.mp4/, '_320.mp4');
  } catch {
    return null;
  }
}

async function scrapeFullAudio(query) {
  try {
    const cleanQ = (query || '').replace(/[^\w\s]/gi, ' ').trim();
    if (!cleanQ) return null;

    const searchSaavn = async (term) => {
      try {
        const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(term)}&n=5&p=1`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        const results = data.results || [];
        for (const item of results) {
          const enc = item.more_info?.encrypted_media_url;
          const streamUrl = decryptSaavnMedia(enc);
          if (streamUrl) {
            return {
              found: true,
              title: (item.title || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&'),
              artist: item.subtitle || item.more_info?.music || '',
              album: item.more_info?.album || '',
              duration: Number(item.more_info?.duration) || 0,
              cover: item.image ? item.image.replace('150x150', '250x250') : '',
              streamUrl,
              bitrate: '320kbps HD'
            };
          }
        }
      } catch {}
      return null;
    };

    // 1. Coba pencarian penuh
    let found = await searchSaavn(cleanQ);
    if (found) return found;

    // 2. Jika query berisi banyak artis (ada tanda koma atau spasi panjang), cari artis pertama + judul
    if (query.includes(',')) {
      const parts = query.split(',');
      const primaryArtist = parts[0].trim();
      const afterLastComma = parts[parts.length - 1].trim();
      const subQuery = `${primaryArtist} ${afterLastComma}`.replace(/[^\w\s]/gi, ' ').trim();
      if (subQuery && subQuery !== cleanQ) {
        found = await searchSaavn(subQuery);
        if (found) return found;
      }
    }
  } catch (err) {
    console.error('Free music scraper error:', err.message);
  }
  return null;
}

async function scrapeViralIndo() {
  const seen = new Set();
  const list = [];

  // 1. Ambil chart resmi Apple Music Indonesia (lagu-lagu hits Indonesia riil yang sedang trending)
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

  // 2. Gabungkan JioSaavn Indonesia Trending (dengan full 320kbps audio jika tersedia)
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

// Router
export async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.pathname;
  if ((pathname === '/api' || pathname === '/api/' || pathname === '/api/index.js') && req.headers['x-matched-path']) {
    try {
      const matched = new URL(req.headers['x-matched-path'], `http://${req.headers.host || 'localhost'}`);
      pathname = matched.pathname;
    } catch {}
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoints
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');

    if (pathname === '/api/trends') {
      const category = parsedUrl.searchParams.get('category') || 'global';
      const isFresh = parsedUrl.searchParams.get('fresh') === '1';
      const cacheKey = `trends_${category}`;
      const cached = isFresh ? null : getFromCache(cacheKey);

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      if (cached && cached.length > 0) {
        res.writeHead(200);
        res.end(JSON.stringify({ category, cached: true, timestamp: Date.now(), count: cached.length, data: cached }));
        return;
      }

      let tracks = [];
      if (category === 'global') {
        const spotifyGlobal = await fetchSpotifyPlaylist('37i9dQZEVXbMDoHDwVN2tF', 'Spotify Global', 50);
        if (spotifyGlobal.length > 0) {
          tracks = spotifyGlobal;
        } else {
          const deezer = await fetchDeezerGlobal(true);
          tracks = deezer.length > 0 ? deezer : await fetchAppleRss('us', 'Billboard', 35);
        }
      } else if (category === 'fresh') {
        const spotifyFresh = await fetchSpotifyPlaylist('37i9dQZF1DXcBWIGoYBM5M', 'Spotify Hits', 50);
        tracks = spotifyFresh.length > 0 ? spotifyFresh : await fetchFreshReleases();
      } else if (category === 'tiktok') {
        const spotifyViral = await fetchSpotifyPlaylist('37i9dQZF1DX2L0iB23Enbq', 'Spotify Viral', 50);
        tracks = spotifyViral.length > 0 ? spotifyViral : await fetchTikTokViralHits();
      } else if (category === 'us') {
        tracks = await fetchAppleRss('us', 'Billboard', 35);
      } else if (category === 'uk') {
        tracks = await fetchAppleRss('gb', 'UK Official', 35);
      } else if (category === 'kpop') {
        const KPOP_QUERIES = [
          'kpop viral hits 2026',
          'kpop top trending songs',
          'kpop girl group viral',
          'kpop boy group viral'
        ];
        const qIdx = (new Date().getUTCDay() + Math.floor(new Date().getUTCHours() / 6)) % KPOP_QUERIES.length;
        tracks = await fetchSearchGenre(KPOP_QUERIES[qIdx], 'K-Pop');
      } else if (category === 'japan') {
        const jpRss = await fetchAppleRss('jp', 'J-Pop', 35);
        if (jpRss.length > 0) {
          tracks = jpRss;
        } else {
          tracks = await fetchSearchGenre('jpop viral hits', 'J-Pop');
        }
      } else if (category === 'indo') {
        tracks = await scrapeViralIndo();
      } else {
        tracks = await fetchDeezerGlobal(true);
      }

      if (tracks.length > 0) {
        setCache(cacheKey, tracks);
        if (category === 'global') preloadedGlobalTracks = tracks;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ category, cached: false, timestamp: Date.now(), count: tracks.length, data: tracks }));
      return;
    }

    if (pathname === '/api/search') {
      const q = parsedUrl.searchParams.get('q');
      if (!q) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Query parameter q is required' }));
        return;
      }
      const results = await searchSongs(q);
      res.writeHead(200);
      res.end(JSON.stringify({ query: q, count: results.length, data: results }));
      return;
    }

    // ── Albums Endpoints (Top & Fresh Albums Realtime) ──
    if (pathname === '/api/albums') {
      const isFresh = parsedUrl.searchParams.get('fresh') === '1';
      if (isFresh) delete cache.timestamps['albums_top_list'];
      const albums = await fetchTopAlbums();
      res.writeHead(200);
      res.end(JSON.stringify({ count: albums.length, data: albums }));
      return;
    }

    if (pathname === '/api/album-detail') {
      const albumId = parsedUrl.searchParams.get('id');
      if (!albumId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'id parameter is required' }));
        return;
      }
      const detail = await fetchAlbumDetail(albumId);
      if (!detail) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Album not found' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(detail));
      return;
    }

    if (pathname === '/api/download') {
      let audioUrl = parsedUrl.searchParams.get('url');
      const artist = parsedUrl.searchParams.get('artist') || '';
      const title = parsedUrl.searchParams.get('title') || '';
      let filename = parsedUrl.searchParams.get('name') || `${artist} - ${title}`.trim() || 'viral_track';

      // Auto-lookup full 320kbps audio if not yet resolved
      if (!audioUrl && (artist || title)) {
        try {
          const scraped = await scrapeFullAudio(`${artist} ${title}`);
          if (scraped && scraped.streamUrl) {
            audioUrl = scraped.streamUrl;
          }
        } catch (e) {
          console.warn('Auto scrape download stream failed:', e.message);
        }
      }

      if (!audioUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url or artist/title required for download' }));
        return;
      }

      const cleanName = filename.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'track';

      try {
        const audioRes = await fetch(audioUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!audioRes.ok) {
          // Fallback direct redirection
          res.writeHead(302, { 'Location': audioUrl });
          res.end();
          return;
        }

        const contentLength = audioRes.headers.get('content-length');
        const headers = {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(cleanName)}.mp3"`,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        };
        if (contentLength) headers['Content-Length'] = contentLength;

        res.writeHead(200, headers);
        const arrayBuffer = await audioRes.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
      } catch (err) {
        console.error('Download proxy error, redirecting:', err.message);
        res.writeHead(302, { 'Location': audioUrl });
        res.end();
      }
      return;
    }


    if (pathname === '/api/lyrics') {
      const artist = parsedUrl.searchParams.get('artist') || '';
      const title  = parsedUrl.searchParams.get('title')  || '';
      if (!artist || !title) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'artist and title are required' }));
        return;
      }
      const lKey = `lyr_${artist}_${title}`.toLowerCase().replace(/\s+/g, '_').slice(0, 120);
      const cachedLyr = getFromCache(lKey);
      if (cachedLyr) {
        res.writeHead(200);
        res.end(JSON.stringify(cachedLyr));
        return;
      }

      // 1. Try LRCLIB for Time-Synced Lyrics
      try {
        const cleanArtist = artist.replace(/\s*(feat\.|ft\.|with|,|\/).*$/i, '').trim();
        const cleanTitle = title.replace(/\s*(\(.*\)|\[.*\]).*$/i, '').trim();
        
        let lrcRes = await fetch(
          `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`,
          { headers: { 'User-Agent': 'PlaySoundWeb/1.0' }, signal: AbortSignal.timeout(4500) }
        );
        
        if (!lrcRes.ok) {
          lrcRes = await fetch(
            `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`,
            { headers: { 'User-Agent': 'PlaySoundWeb/1.0' }, signal: AbortSignal.timeout(4500) }
          );
        }

        if (lrcRes.ok) {
          const lrcData = await lrcRes.json();
          if (lrcData.syncedLyrics || lrcData.plainLyrics) {
            const result = {
              artist,
              title,
              synced: !!lrcData.syncedLyrics,
              syncedLyrics: lrcData.syncedLyrics || '',
              lyrics: lrcData.plainLyrics || lrcData.syncedLyrics || '',
              found: true
            };
            cache.data[lKey] = result;
            cache.timestamps[lKey] = Date.now() - cache.TTL_MS + 60 * 60 * 1000;
            res.writeHead(200);
            res.end(JSON.stringify(result));
            return;
          }
        }
      } catch (err) {
        console.warn('LRCLIB fetch error:', err.message);
      }

      // 2. Fallback to lyrics.ovh
      try {
        const lyrRes = await fetch(
          `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (!lyrRes.ok) throw new Error(`lyrics.ovh HTTP ${lyrRes.status}`);
        const lyrJson = await lyrRes.json();
        const result = {
          artist, title,
          synced: false,
          syncedLyrics: '',
          lyrics: lyrJson.lyrics || '',
          found: !!(lyrJson.lyrics && lyrJson.lyrics.trim().length > 10)
        };
        cache.data[lKey] = result;
        cache.timestamps[lKey] = Date.now() - cache.TTL_MS + 60 * 60 * 1000;
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('Lyrics fetch error:', err.message);
        res.writeHead(200);
        res.end(JSON.stringify({ artist, title, synced: false, syncedLyrics: '', lyrics: '', found: false }));
      }
      return;
    }


    // ── YouTube Video ID Search via Invidious ──
    if (pathname === '/api/yt-search') {
      const q = parsedUrl.searchParams.get('q') || '';
      if (!q.trim()) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'q required' }));
        return;
      }
      const ytKey = `yt_${q}`.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 110);
      const ytCached = getFromCache(ytKey);
      if (ytCached) {
        res.writeHead(200);
        res.end(JSON.stringify(ytCached));
        return;
      }

      let videoId = null;
      let videoTitle = '';

      // Layer 1: Direct YouTube HTML Search Scraper (Prioritize Official MV & Verified Tracks)
      try {
        const queriesToTry = [
          q.toLowerCase().includes('official') ? q : `${q} official mv`,
          q
        ];

        for (const queryStr of queriesToTry) {
          const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(queryStr)}`;
          const r = await fetch(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
              'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            signal: AbortSignal.timeout(5000)
          });
          if (r.ok) {
            const html = await r.text();
            const videoMatches = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
            if (videoMatches && videoMatches.length > 0) {
              for (const m of videoMatches) {
                const id = m.replace('/watch?v=', '');
                if (id && id.length === 11) {
                  videoId = id;
                  videoTitle = q;
                  break;
                }
              }
            }
          }
          if (videoId) break;
        }
      } catch (err) {
        console.warn('Direct YouTube search in server error:', err.message);
      }

      // Layer 2: Fallback ke Invidious jika Layer 1 tidak menemukan videoId
      if (!videoId) {
        const INVIDIOUS = [
          'https://inv.nadeko.net',
          'https://invidious.privacyredirect.com',
          'https://yewtu.be',
          'https://iv.datura.network'
        ];

        for (const instance of INVIDIOUS) {
          try {
            const r = await fetch(
              `${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title&page=1`,
              { signal: AbortSignal.timeout(4500) }
            );
            if (!r.ok) continue;
            const hits = await r.json();
            if (Array.isArray(hits) && hits[0]?.videoId) {
              videoId   = hits[0].videoId;
              videoTitle = hits[0].title || '';
              break;
            }
          } catch { continue; }
        }
      }

      const ytResult = { videoId, title: videoTitle, found: !!videoId };
      if (videoId) {
        // Cache 30 min (reuse existing TTL slot by adjusting timestamp)
        cache.data[ytKey] = ytResult;
        cache.timestamps[ytKey] = Date.now() - cache.TTL_MS + 30 * 60 * 1000;
      }
      res.writeHead(200);
      res.end(JSON.stringify(ytResult));
      return;
    }

    // ── Free Full Music Audio Stream Scraper (320kbps HD) ──
    if (pathname === '/api/stream') {
      const q = parsedUrl.searchParams.get('q') || '';
      const artist = parsedUrl.searchParams.get('artist') || '';
      const title = parsedUrl.searchParams.get('title') || '';
      const query = q || `${artist} ${title}`.trim();

      if (!query) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'q or artist+title required' }));
        return;
      }

      const streamKey = `str_${query.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 100)}`;
      const cached = getFromCache(streamKey);
      if (cached) {
        res.writeHead(200);
        res.end(JSON.stringify(cached));
        return;
      }

      const result = await scrapeFullAudio(query);
      if (result) {
        // Cache for 30 minutes
        cache.data[streamKey] = result;
        cache.timestamps[streamKey] = Date.now() - cache.TTL_MS + 30 * 60 * 1000;
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ found: false, query }));
      }
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
    return;


  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security check to prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Error loading file');
        return;
      }

      if (ext === '.html') {
        let htmlStr = content.toString('utf-8');
        const initialData = preloadedGlobalTracks.length > 0 ? preloadedGlobalTracks : (getFromCache('trends_global') || []);
        const injection = `<script>window.INITIAL_TRACKS = ${JSON.stringify(initialData)};</script>\n</head>`;
        htmlStr = htmlStr.replace('</head>', injection);
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache, no-store, must-revalidate' });
        res.end(htmlStr);
        return;
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

const server = http.createServer(handleRequest);

const isMain = !process.env.VERCEL;

if (isMain) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[RADAR-MUSIC] Server aktif di http://localhost:${PORT}`);
  });
}

export default handleRequest;
