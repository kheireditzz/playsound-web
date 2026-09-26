import { fetchLyrics } from '../services/lyrics.service.js';
import { scrapeFullAudio, searchSongs } from '../services/audio.service.js';
import { fetchTopAlbums, fetchAlbumDetail } from '../services/album.service.js';
import { resolveSpotiFlyerLink } from '../services/spotiflyer.service.js';
import { getDirectYouTubeAudioUrl } from '../services/youtube-audio.service.js';
import {
  fetchSpotifyPlaylist,
  fetchDeezerGlobal,
  fetchAppleRss,
  fetchTikTokViralHits,
  fetchFreshReleases,
  fetchSearchGenre,
  scrapeViralIndo
} from '../services/spotify.service.js';

// In-memory Cache
const cache = {
  data: {},
  timestamps: {},
  TTL_MS: 3 * 60 * 1000 // 3 minutes
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

export async function handleApiRoute(req, res, pathname, parsedUrl) {
  res.setHeader('Content-Type', 'application/json');

  // 1. ── TRENDS ENDPOINT ──
  if (pathname === '/api/trends') {
    const category = parsedUrl.searchParams.get('category') || 'global';
    const isFresh = parsedUrl.searchParams.get('fresh') === '1';
    const cacheKey = `trends_${category}`;
    const cached = isFresh ? null : getFromCache(cacheKey);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

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
      tracks = jpRss.length > 0 ? jpRss : await fetchSearchGenre('jpop viral hits', 'J-Pop');
    } else if (category === 'indo') {
      tracks = await scrapeViralIndo();
    } else {
      tracks = await fetchDeezerGlobal(true);
    }

    if (tracks.length > 0) {
      setCache(cacheKey, tracks);
    }

    res.writeHead(200);
    res.end(JSON.stringify({ category, cached: false, timestamp: Date.now(), count: tracks.length, data: tracks }));
    return;
  }

  // 2. ── SPOTIFLYER UNIVERSAL LINK RESOLVER ──
  if (pathname === '/api/spotiflyer/resolve' || pathname === '/api/resolve-link') {
    const rawUrl = parsedUrl.searchParams.get('url') || '';
    if (!rawUrl) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'url parameter is required' }));
      return;
    }

    const resolved = await resolveSpotiFlyerLink(rawUrl);
    if (resolved && resolved.tracks && resolved.tracks.length > 0) {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        url: rawUrl,
        provider: resolved.provider || 'universal',
        importType: resolved.type || 'track',
        title: resolved.title || '',
        subtitle: resolved.subtitle || '',
        cover: resolved.cover || '',
        albumName: resolved.albumName || '',
        count: resolved.tracks.length,
        totalTracks: resolved.totalTracks || resolved.tracks.length,
        data: resolved.tracks
      }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ success: false, error: 'Could not resolve audio from provided link', url: rawUrl }));
    }
    return;
  }

  // 3. ── SPOTIFLYER / AUDIO DOWNLOAD ENDPOINT ──
  if (pathname === '/api/spotiflyer/download' || pathname === '/api/download') {
    let audioUrl = parsedUrl.searchParams.get('url') || '';
    const artist = parsedUrl.searchParams.get('artist') || '';
    const title = parsedUrl.searchParams.get('title') || '';
    const videoIdParam = parsedUrl.searchParams.get('id') || '';
    let filename = parsedUrl.searchParams.get('name') || `${artist} - ${title}`.trim() || 'playmusic_track';

    if (videoIdParam) {
      const ytInfo = await getDirectYouTubeAudioUrl(videoIdParam);
      if (ytInfo && ytInfo.directUrl) audioUrl = ytInfo.directUrl;
    }

    if (audioUrl && audioUrl.includes('/api/stream-audio')) {
      const match = audioUrl.match(/id=([a-zA-Z0-9_-]{11})/);
      if (match) {
        const ytInfo = await getDirectYouTubeAudioUrl(match[1]);
        if (ytInfo && ytInfo.directUrl) audioUrl = ytInfo.directUrl;
      }
    }

    if (!audioUrl && (artist || title)) {
      try {
        const scraped = await scrapeFullAudio(`${artist} ${title}`, artist, title);
        if (scraped && scraped.streamUrl) {
          if (scraped.streamUrl.includes('/api/stream-audio')) {
            const match = scraped.streamUrl.match(/id=([a-zA-Z0-9_-]{11})/);
            if (match) {
              const ytInfo = await getDirectYouTubeAudioUrl(match[1]);
              if (ytInfo && ytInfo.directUrl) audioUrl = ytInfo.directUrl;
            }
          } else {
            audioUrl = scraped.streamUrl;
          }
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

  // 3B. ── YOUTUBE AUDIO PROXY STREAM (Full Duration & Seeking Range Support) ──
  if (pathname === '/api/stream-audio') {
    const videoId = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('v') || '';
    if (!videoId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'id required' }));
      return;
    }

    try {
      const audioInfo = await getDirectYouTubeAudioUrl(videoId);
      if (!audioInfo || !audioInfo.directUrl) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Audio stream not found' }));
        return;
      }

      const reqHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };
      if (req.headers.range) {
        reqHeaders['range'] = req.headers.range;
      }

      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Type': 'audio/mp4',
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=18000'
        });
        res.end();
        return;
      }

      const audioStreamRes = await fetch(audioInfo.directUrl, { headers: reqHeaders });
      const statusCode = audioStreamRes.status;
      const resHeaders = {
        'Content-Type': audioStreamRes.headers.get('content-type') || 'audio/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=18000'
      };
      if (audioStreamRes.headers.has('content-length')) {
        resHeaders['Content-Length'] = audioStreamRes.headers.get('content-length');
      }
      if (audioStreamRes.headers.has('content-range')) {
        resHeaders['Content-Range'] = audioStreamRes.headers.get('content-range');
      }

      res.writeHead(statusCode, resHeaders);
      if (audioStreamRes.body) {
        const { Readable } = await import('node:stream');
        Readable.fromWeb(audioStreamRes.body).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      console.error('Audio streaming proxy error:', err.message);
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    }
    return;
  }

  // 4. ── SEARCH ENDPOINT (With Auto-Link Detection) ──
  if (pathname === '/api/search') {
    const q = parsedUrl.searchParams.get('q');
    if (!q) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Query parameter q is required' }));
      return;
    }

    const trimmedQ = q.trim();
    const isMusicUrl = /^https?:\/\//i.test(trimmedQ) || /(spotify\.com|jiosaavn\.com|youtube\.com|youtu\.be|soundcloud\.com|gaana\.com)/i.test(trimmedQ);
    if (isMusicUrl) {
      const linkResult = await resolveSpotiFlyerLink(trimmedQ);
      if (linkResult && linkResult.tracks && linkResult.tracks.length > 0) {
        res.writeHead(200);
        res.end(JSON.stringify({
          query: q,
          isLinkImport: true,
          provider: linkResult.provider || 'universal',
          importType: linkResult.type,
          source: linkResult.provider,
          albumName: linkResult.albumName || '',
          count: linkResult.tracks.length,
          data: linkResult.tracks
        }));
        return;
      }
    }

    const results = await searchSongs(q);
    res.writeHead(200);
    res.end(JSON.stringify({ query: q, count: results.length, data: results }));
    return;
  }

  // 5. ── ALBUMS ENDPOINTS ──
  if (pathname === '/api/albums') {
    const isFresh = parsedUrl.searchParams.get('fresh') === '1';
    const albums = await fetchTopAlbums(isFresh);
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

  // 6. ── LYRICS ENDPOINT ──
  if (pathname === '/api/lyrics') {
    const artist = parsedUrl.searchParams.get('artist') || '';
    const title  = parsedUrl.searchParams.get('title')  || '';
    if (!artist || !title) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'artist and title are required' }));
      return;
    }
    const result = await fetchLyrics(artist, title);
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return;
  }

  // 7. ── AUDIO STREAM ENDPOINT ──
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

    const result = await scrapeFullAudio(query, artist, title);
    if (result) {
      setCache(streamKey, result);
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } else {
      res.writeHead(200);
      res.end(JSON.stringify({ found: false, query }));
    }
    return;
  }

  // 8. ── YOUTUBE SEARCH ENDPOINT ──
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
            videoId = hits[0].videoId;
            videoTitle = hits[0].title || '';
            break;
          }
        } catch { continue; }
      }
    }

    const ytResult = { videoId, title: videoTitle, found: !!videoId };
    if (videoId) {
      setCache(ytKey, ytResult);
    }
    res.writeHead(200);
    res.end(JSON.stringify(ytResult));
    return;
  }

  // 9. ── APP VERSION & IN-APP UPDATE ENDPOINT ──
  if (pathname === '/api/app-version') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({
      version: '2.5.0',
      versionCode: 250,
      appName: 'Play Music Pro',
      packageName: 'id.my.kheireditz.playmusic',
      releaseDate: '2026-09-26',
      downloadUrl: 'https://github.com/kheireditzz/playsound-web/releases/latest/download/playmusic-release.apk',
      githubReleasesUrl: 'https://github.com/kheireditzz/playsound-web/releases',
      changelog: [
        '100% Real Native Android APK (Zero WebView, Native MediaPlayer & MediaSession)',
        'Dock navigasi bawah melengkung tactile neumorphic dengan fitur tengah naik ke atas (raised center action)',
        'Tombol Tutup (X) pada mini player pemutar musik di bagian bawah',
        'Riwayat Pencarian interaktif dengan hapus item dan hapus semua, serta chip tren populer',
        'Menu Pengaturan lengkap: Kualitas bitrate (320kbps Hi-Fi), equalizer suara, sleep timer, & pembersih cache',
        'Loading state shimmer skeleton tactile yang halus saat memuat lagu dan pencarian'
      ]
    }));
    return;
  }

  // 10. ── DIRECT APK DOWNLOAD REDIRECT ──
  if (pathname === '/download/apk' || pathname === '/api/apk/latest' || pathname === '/download-apk') {
    res.writeHead(302, {
      'Location': 'https://github.com/kheireditzz/playsound-web/releases/latest/download/playmusic-release.apk'
    });
    res.end();
    return;
  }

  // 404 for unknown API routes
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'API endpoint not found' }));
}
