import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CryptoJS from 'crypto-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// In-memory Cache
const cache = {
  data: {},
  timestamps: {},
  TTL_MS: 15 * 60 * 1000 // 15 minutes
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

// Data Fetchers
async function fetchDeezerGlobal() {
  try {
    const res = await fetch('https://api.deezer.com/chart/0/tracks?limit=30');
    if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
    const json = await res.json();
    if (!json.tracks?.data && !json.data) return [];
    const list = json.tracks?.data || json.data;

    return list.map((item, idx) => ({
      id: `dz-${item.id}`,
      rank: idx + 1,
      title: item.title_short || item.title,
      artist: item.artist?.name || 'Unknown Artist',
      album: item.album?.title || 'Single',
      cover: item.album?.cover_medium || item.album?.cover_big || item.album?.cover || '',
      preview: item.preview || '',
      duration: item.duration || 30,
      trendVelocity: idx === 0 ? '🔥 #1 VIRAL' : idx < 5 ? `▲ +${5 - idx}` : idx % 4 === 0 ? '★ NEW' : '▲ HOT',
      origin: idx % 2 === 0 ? 'Spotify' : 'TikTok',
      youtubeQuery: `${item.artist?.name} ${item.title_short || item.title} official audio`,
      externalUrls: {
        deezer: item.link || '',
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.artist?.name + ' ' + (item.title_short || item.title))}`
      }
    }));
  } catch (err) {
    console.error('Deezer fetch error:', err.message);
    return [];
  }
}

async function fetchAppleRss(country = 'us', originTag = 'Billboard') {
  try {
    const res = await fetch(`https://itunes.apple.com/${country}/rss/topsongs/limit=30/json`);
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
        trendVelocity: idx === 0 ? '🔥 #1' : idx < 4 ? `▲ +${4 - idx}` : idx % 3 === 0 ? '★ NEW' : '▲ TOP',
        origin: originTag,
        youtubeQuery: `${artist} ${title} official audio`,
        externalUrls: {
          apple: appleUrl,
          youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`
        }
      };
    });
  } catch (err) {
    console.error(`Apple RSS fetch error (${country}):`, err.message);
    return [];
  }
}

async function fetchTikTokViralHits() {
  try {
    const res = await fetch('https://itunes.apple.com/search?term=tiktok+viral+hits&entity=song&limit=30');
    if (!res.ok) throw new Error(`iTunes search HTTP ${res.status}`);
    const json = await res.json();
    const results = json.results || [];

    return results.map((item, idx) => ({
      id: `tt-${item.trackId || idx}`,
      rank: idx + 1,
      title: item.trackName || 'Viral Sound',
      artist: item.artistName || 'Unknown Artist',
      album: item.collectionName || 'TikTok Trends',
      cover: (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      preview: item.previewUrl || '',
      duration: Math.round((item.trackTimeMillis || 30000) / 1000),
      trendVelocity: idx === 0 ? '🔥 SOUND OF THE WEEK' : idx < 5 ? '⚡ 5M+ VIDEOS' : '★ TRENDING',
      origin: 'TikTok',
      youtubeQuery: `${item.artistName} ${item.trackName} official sound`,
      externalUrls: {
        apple: item.trackViewUrl || '',
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.artistName + ' ' + item.trackName)}`
      }
    }));
  } catch (err) {
    console.error('TikTok search error:', err.message);
    return [];
  }
}

async function searchSongs(query) {
  try {
    const cleanQ = query.replace(/[^\w\s]/gi, ' ').trim();
    const sUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(cleanQ)}&n=25&p=1`;
    const sRes = await fetch(sUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    if (sRes.ok) {
      const data = await sRes.json();
      const list = data.results || [];
      if (list.length > 0) {
        return list.map((item, idx) => {
          const streamUrl = decryptSaavnMedia(item.more_info?.encrypted_media_url);
          const title = (item.title || 'Track').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
          const artist = (item.subtitle || item.more_info?.music || 'Artist').replace(/&amp;/g, '&');
          return {
            id: `sr-${item.id || idx}`,
            rank: idx + 1,
            title,
            artist,
            album: item.more_info?.album || 'Single',
            cover: item.image ? item.image.replace('150x150', '500x500') : '',
            preview: streamUrl || '',
            fullStreamUrl: streamUrl || '',
            duration: Number(item.more_info?.duration) || 180,
            trendVelocity: '⚡ 320kbps HD',
            origin: 'Free Stream',
            youtubeQuery: `${artist} ${title} official audio`,
            externalUrls: {
              saavn: item.perma_url || '',
              youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`
            }
          };
        }).filter(t => t.preview);
      }
    }
  } catch (err) {
    console.error('Saavn search error, fallback to iTunes:', err.message);
  }

  // Fallback to iTunes search
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=25`);
    if (!res.ok) throw new Error(`iTunes search HTTP ${res.status}`);
    const json = await res.json();
    const results = json.results || [];

    return results.map((item, idx) => ({
      id: `sr-${item.trackId || idx}`,
      rank: idx + 1,
      title: item.trackName,
      artist: item.artistName,
      album: item.collectionName,
      cover: (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      preview: item.previewUrl || '',
      fullStreamUrl: '',
      duration: Math.round((item.trackTimeMillis || 30000) / 1000),
      trendVelocity: '🔍 PREVIEW',
      origin: 'iTunes',
      youtubeQuery: `${item.artistName} ${item.trackName} official audio`,
      externalUrls: {
        apple: item.trackViewUrl || '',
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.artistName + ' ' + item.trackName)}`
      }
    }));
  } catch (err) {
    console.error('Search error:', err.message);
    return [];
  }
}

async function fetchSearchGenre(term, originTag) {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=30`);
    if (!res.ok) throw new Error(`iTunes search HTTP ${res.status}`);
    const json = await res.json();
    const results = json.results || [];

    return results.map((item, idx) => ({
      id: `gn-${item.trackId || idx}`,
      rank: idx + 1,
      title: item.trackName || 'Viral Song',
      artist: item.artistName || 'Unknown Artist',
      album: item.collectionName || 'Top Hits',
      cover: (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      preview: item.previewUrl || '',
      duration: Math.round((item.trackTimeMillis || 30000) / 1000),
      trendVelocity: idx === 0 ? '🔥 #1' : idx < 5 ? `▲ +${5 - idx}` : '★ TRENDING',
      origin: originTag,
      youtubeQuery: `${item.artistName} ${item.trackName} official`,
      externalUrls: {
        apple: item.trackViewUrl || '',
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.artistName + ' ' + item.trackName)}`
      }
    }));
  } catch (err) {
    console.error(`Genre search error (${term}):`, err.message);
    return [];
  }
}

// Preload Cache
let preloadedGlobalTracks = [];
async function preload() {
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
    const cleanQ = query.replace(/[^\w\s]/gi, ' ').trim();
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(cleanQ)}&n=5&p=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(6000)
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
          cover: item.image ? item.image.replace('150x150', '500x500') : '',
          streamUrl,
          bitrate: '320kbps HD'
        };
      }
    }
  } catch (err) {
    console.error('Free music scraper error:', err.message);
  }
  return null;
}

async function scrapeViralIndo() {
  try {
    const url = 'https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=indonesia+viral+tiktok+hits&n=30&p=1';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((item, idx) => {
      const streamUrl = decryptSaavnMedia(item.more_info?.encrypted_media_url);
      const title = (item.title || 'Lagu Viral').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
      const artist = (item.subtitle || 'Top Artist').replace(/&amp;/g, '&');
      return {
        id: `sv-${item.id || idx}`,
        rank: idx + 1,
        title,
        artist,
        album: item.more_info?.album || 'Viral Hits',
        cover: item.image ? item.image.replace('150x150', '500x500') : '',
        preview: streamUrl || '',
        fullStreamUrl: streamUrl || '',
        duration: Number(item.more_info?.duration) || 180,
        trendVelocity: idx === 0 ? '🔥 #1 INDO' : idx < 5 ? `▲ +${5 - idx}` : '★ TOP HITS',
        origin: 'Indo Hits',
        youtubeQuery: `${artist} ${title} official audio`,
        externalUrls: {
          saavn: item.perma_url || '',
          youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`
        }
      };
    }).filter(t => t.preview);
  } catch (err) {
    console.error('Viral Indo scrape error:', err.message);
    return [];
  }
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
      const cacheKey = `trends_${category}`;
      const cached = getFromCache(cacheKey);

      if (cached && cached.length > 0) {
        res.writeHead(200);
        res.end(JSON.stringify({ category, cached: true, count: cached.length, data: cached }));
        return;
      }

      let tracks = [];
      if (category === 'global') {
        const deezer = await fetchDeezerGlobal();
        if (deezer.length > 0) {
          tracks = deezer;
        } else {
          tracks = await fetchAppleRss('us', 'Billboard');
        }
      } else if (category === 'tiktok') {
        tracks = await fetchTikTokViralHits();
      } else if (category === 'us') {
        tracks = await fetchAppleRss('us', 'Billboard');
      } else if (category === 'uk') {
        tracks = await fetchAppleRss('gb', 'UK Official');
      } else if (category === 'kpop') {
        tracks = await fetchSearchGenre('kpop viral hits', 'K-Pop');
      } else if (category === 'japan') {
        tracks = await fetchSearchGenre('jpop viral hits', 'J-Pop');
      } else if (category === 'indo') {
        tracks = await scrapeViralIndo();
      } else {
        tracks = await fetchDeezerGlobal();
      }

      if (tracks.length > 0) {
        setCache(cacheKey, tracks);
        if (category === 'global') preloadedGlobalTracks = tracks;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ category, cached: false, count: tracks.length, data: tracks }));
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
      const audioUrl = parsedUrl.searchParams.get('url');
      const filename = parsedUrl.searchParams.get('name') || 'viral_track';
      if (!audioUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url parameter is required' }));
        return;
      }

      try {
        const audioRes = await fetch(audioUrl);
        if (!audioRes.ok) throw new Error(`Audio fetch status: ${audioRes.status}`);

        const cleanName = filename.replace(/[^a-zA-Z0-9_\-\.\s]/g, '').trim() || 'track';
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${cleanName}.mp3"`,
          'Cache-Control': 'public, max-age=86400'
        });

        const arrayBuffer = await audioRes.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
      } catch (err) {
        console.error('Download error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to download audio file' }));
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
      try {
        const lyrRes = await fetch(
          `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
        );
        if (!lyrRes.ok) throw new Error(`lyrics.ovh HTTP ${lyrRes.status}`);
        const lyrJson = await lyrRes.json();
        const result = {
          artist, title,
          lyrics: lyrJson.lyrics || '',
          found: !!(lyrJson.lyrics && lyrJson.lyrics.trim().length > 10)
        };
        // Override TTL to 60 min for lyrics (they never change)
        cache.data[lKey] = result;
        cache.timestamps[lKey] = Date.now() - cache.TTL_MS + 60 * 60 * 1000;
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('Lyrics fetch error:', err.message);
        res.writeHead(200);
        res.end(JSON.stringify({ artist, title, lyrics: '', found: false }));
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
