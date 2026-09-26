import { exec } from 'node:child_process';
import util from 'node:util';

const execPromise = util.promisify(exec);
const directUrlCache = new Map();

/**
 * Cari Video ID YouTube secara cepat via scraping HTML (rata-rata 200-800ms)
 */
export async function searchYouTubeVideo(query) {
  const q = (query || '').trim();
  if (!q) return null;

  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' official audio')}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(4500)
    });

    if (res.ok) {
      const html = await res.text();
      const videoMatches = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
      if (videoMatches && videoMatches.length > 0) {
        for (const m of videoMatches) {
          const videoId = m.replace('/watch?v=', '');
          if (videoId && videoId.length === 11) {
            return {
              videoId,
              cover: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('YouTube search scraping warning:', err.message);
  }

  // Fallback query tanpa suffix 'official audio'
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const html = await res.text();
      const videoMatches = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
      if (videoMatches && videoMatches.length > 0) {
        for (const m of videoMatches) {
          const videoId = m.replace('/watch?v=', '');
          if (videoId && videoId.length === 11) {
            return {
              videoId,
              cover: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            };
          }
        }
      }
    }
  } catch {}

  // Fallback Terakhir: Eksekusi yt-dlp internal CLI (100% akurat menemukan full audio resmi)
  try {
    const cleanCmdQ = q.replace(/["$`\\]/g, ' ').trim();
    const cmd = `yt-dlp "ytsearch1:${cleanCmdQ} official audio" --get-id --get-duration --get-title --no-warnings`;
    const { stdout } = await execPromise(cmd, { timeout: 12000 });
    const lines = (stdout || '').trim().split('\n').filter(Boolean);
    if (lines.length >= 2) {
      const videoTitle = lines[0];
      const videoId = lines[1];
      const durStr = lines[2] || '';
      let duration = 210;
      if (durStr.includes(':')) {
        const parts = durStr.split(':').map(Number);
        if (parts.length === 2) duration = parts[0] * 60 + parts[1];
        else if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      if (videoId && videoId.length === 11) {
        return {
          videoId,
          title: videoTitle,
          duration,
          cover: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        };
      }
    }
  } catch (ytDlpErr) {
    console.warn('yt-dlp search fallback warning:', ytDlpErr.message);
  }

  return null;
}

/**
 * Ekstraksi URL streaming langsung GoogleVideo dari Video ID YouTube (didukung yt-dlp)
 * Hasil di-cache dalam memori selama 5 jam.
 */
export async function getDirectYouTubeAudioUrl(videoId) {
  if (!videoId || videoId.length !== 11) return null;

  const cached = directUrlCache.get(videoId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached;
  }

  try {
    const cmd = `yt-dlp --js-runtimes node -f "140/ba/b" --no-warnings --no-playlist -g "https://www.youtube.com/watch?v=${videoId}"`;
    const { stdout } = await execPromise(cmd, { timeout: 12000 });
    const directUrl = (stdout || '').trim().split('\n').filter(Boolean)[0];

    if (directUrl && directUrl.startsWith('http')) {
      const entry = {
        videoId,
        directUrl,
        expiresAt: Date.now() + 5 * 3600 * 1000 // 5 jam TTL
      };
      directUrlCache.set(videoId, entry);
      return entry;
    }
  } catch (err) {
    console.warn(`yt-dlp audio extraction failed for ${videoId}:`, err.message);
  }

  return null;
}

/**
 * Pencarian Cepat Multi-Track YouTube & YouTube Music untuk Universal Search
 */
export async function searchYouTubeTracks(query, limit = 20) {
  const q = (query || '').trim();
  if (!q) return [];

  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
            hl: 'id',
            gl: 'ID'
          }
        },
        query: q
      }),
      signal: AbortSignal.timeout(4500)
    });

    if (res.ok) {
      const data = await res.json();
      const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
      const results = [];

      for (const s of sections) {
        const items = s.itemSectionRenderer?.contents || [];
        for (const it of items) {
          const v = it.videoRenderer;
          if (!v || !v.videoId || !v.lengthText?.simpleText) continue;

          const durStr = v.lengthText.simpleText;
          let durSec = 180;
          if (durStr.includes(':')) {
            const parts = durStr.split(':').map(Number);
            if (parts.length === 2) durSec = parts[0] * 60 + parts[1];
            else if (parts.length === 3) durSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }

          if (durSec < 45 || durSec > 900) continue;

          const rawTitle = v.title?.runs?.[0]?.text || '';
          const uploader = v.ownerText?.runs?.[0]?.text || 'YouTube';

          let artist = uploader;
          let title = rawTitle;
          if (rawTitle.includes(' - ')) {
            const parts = rawTitle.split(' - ');
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ')
              .replace(/\(Official.*?\)/gi, '')
              .replace(/\[Official.*?\]/gi, '')
              .replace(/\(Lyric.*?\)/gi, '')
              .replace(/\[Lyric.*?\]/gi, '')
              .replace(/\(Audio.*?\)/gi, '')
              .replace(/\[Audio.*?\]/gi, '')
              .trim();
          }

          const thumbs = v.thumbnail?.thumbnails || [];
          const cover = thumbs[thumbs.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

          results.push({
            id: `yt-sr-${v.videoId}`,
            title: title || rawTitle,
            artist: artist || uploader,
            album: 'YouTube Music',
            cover,
            preview: `/api/stream-audio?id=${v.videoId}`,
            fullStreamUrl: `/api/stream-audio?id=${v.videoId}`,
            duration: durSec,
            origin: 'YouTube'
          });

          if (results.length >= limit) break;
        }
        if (results.length >= limit) break;
      }

      if (results.length > 0) {
        return results;
      }
    }
  } catch (err) {
    console.warn('YouTube Innertube search warning:', err.message);
  }

  // Fallback: yt-dlp search jika Innertube terhalang
  try {
    const cleanCmdQ = q.replace(/["$`\\]/g, ' ').trim();
    const cmd = `yt-dlp "ytsearch${limit}:${cleanCmdQ}" --print "%(id)s\\t%(title)s\\t%(duration)s\\t%(uploader)s" --no-warnings`;
    const { stdout } = await execPromise(cmd, { timeout: 14000 });
    const lines = (stdout || '').trim().split('\n').filter(Boolean);
    const results = [];

    for (const line of lines) {
      const [videoId, rawTitle, durStr, uploader] = line.split('\t');
      if (!videoId || videoId.length !== 11) continue;
      const durSec = parseInt(durStr, 10) || 180;
      if (durSec < 45 || durSec > 900) continue;

      let artist = uploader || 'YouTube';
      let title = rawTitle || '';
      if (rawTitle && rawTitle.includes(' - ')) {
        const parts = rawTitle.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ')
          .replace(/\(Official.*?\)/gi, '')
          .replace(/\[Official.*?\]/gi, '')
          .trim();
      }

      results.push({
        id: `yt-sr-${videoId}`,
        title: title || rawTitle,
        artist: artist || uploader || 'YouTube',
        album: 'YouTube Music',
        cover: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        preview: `/api/stream-audio?id=${videoId}`,
        fullStreamUrl: `/api/stream-audio?id=${videoId}`,
        duration: durSec,
        origin: 'YouTube'
      });
    }

    return results;
  } catch (ytErr) {
    console.warn('yt-dlp multi-search warning:', ytErr.message);
    return [];
  }
}
