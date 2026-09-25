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
  const cleanQ = (query || '').replace(/[^\w\s]/gi, ' ').trim();
  if (!cleanQ) return [];

  const results = [];
  const seen = new Set();

  // 1. Search JioSaavn for 320kbps full tracks
  try {
    const sUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(cleanQ)}&n=20&p=1`;
    const sRes = await fetch(sUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4500)
    });
    if (sRes.ok) {
      const data = await sRes.json();
      const list = data.results || [];
      for (const item of list) {
        const streamUrl = decryptSaavnMedia(item.more_info?.encrypted_media_url);
        const title = (item.title || 'Track').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
        const artist = (item.subtitle || item.more_info?.music || 'Artist').replace(/&amp;/g, '&');
        const key = `${title.toLowerCase()}_${artist.toLowerCase()}`;
        if (!seen.has(key) && streamUrl) {
          seen.add(key);
          results.push({
            id: `sr-${item.id || results.length}`,
            rank: results.length + 1,
            title,
            artist,
            album: item.more_info?.album || 'Single',
            cover: item.image ? item.image.replace('150x150', '250x250') : '',
            preview: streamUrl,
            fullStreamUrl: streamUrl,
            duration: Number(item.more_info?.duration) || 180,
            trendVelocity: '320kbps HD',
            origin: 'Free MP3',
            youtubeQuery: `${artist} ${title} official audio`,
            externalUrls: {
              saavn: item.perma_url || '',
              youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
              tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`,
              spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
            }
          });
        }
      }
    }
  } catch (err) {
    console.error('Saavn search error:', err.message);
  }

  // 2. Search iTunes for catalog completeness (international, K-Pop, viral hits)
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=25`);
    if (res.ok) {
      const json = await res.json();
      const list = json.results || [];
      for (const item of list) {
        const title = item.trackName;
        const artist = item.artistName;
        const key = `${title.toLowerCase()}_${artist.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            id: `sr-it-${item.trackId || results.length}`,
            rank: results.length + 1,
            title,
            artist,
            album: item.collectionName || 'Single',
            cover: (item.artworkUrl100 || '').replace('100x100bb', '250x250bb'),
            preview: item.previewUrl || '',
            fullStreamUrl: '',
            duration: Math.round((item.trackTimeMillis || 30000) / 1000),
            trendVelocity: 'VIRAL',
            origin: 'iTunes',
            youtubeQuery: `${artist} ${title} official audio`,
            externalUrls: {
              apple: item.trackViewUrl || '',
              youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
              tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`,
              spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
            }
          });
        }
      }
    }
  } catch (err) {
    console.error('iTunes search error:', err.message);
  }

  return results;
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

      const INVIDIOUS = [
        'https://inv.nadeko.net',
        'https://invidious.privacyredirect.com',
        'https://yewtu.be',
        'https://iv.datura.network'
      ];

      let videoId = null;
      let videoTitle = '';
      for (const instance of INVIDIOUS) {
        try {
          const r = await fetch(
            `${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video&fields=videoId,title&page=1`,
            { signal: AbortSignal.timeout(5000) }
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

const isMain = process.argv[1] && (
  process.argv[1].endsWith('server.js') ||
  fileURLToPath(import.meta.url) === process.argv[1]
);

if (isMain) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[RADAR-MUSIC] Server aktif di http://localhost:${PORT}`);
  });
}

export default handleRequest;
