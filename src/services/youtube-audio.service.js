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
