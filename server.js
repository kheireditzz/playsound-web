import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      duration: Math.round((item.trackTimeMillis || 30000) / 1000),
      trendVelocity: '🔍 MATCH',
      origin: 'Global',
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

// Router
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

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

      if (cached) {
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
        tracks = await fetchAppleRss('kr', 'K-Pop Radar');
      } else if (category === 'japan') {
        tracks = await fetchAppleRss('jp', 'Oricon / J-Pop');
      } else {
        tracks = await fetchDeezerGlobal();
      }

      setCache(cacheKey, tracks);
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
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[RADAR-MUSIC] Server aktif di http://localhost:${PORT}`);
});
