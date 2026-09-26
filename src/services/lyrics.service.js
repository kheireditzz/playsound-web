// ── Lyrics Service (Synced Karaoke LRCLIB & Fallback) ──
const lyricsCache = {
  data: {},
  timestamps: {},
  TTL_MS: 3600 * 1000 // 1 hour TTL
};

export async function fetchLyrics(artist = '', title = '') {
  if (!artist || !title) return null;
  const lKey = `lyr_${artist}_${title}`.toLowerCase().replace(/\s+/g, '_').slice(0, 120);

  const cached = lyricsCache.data[lKey];
  if (cached && (Date.now() - lyricsCache.timestamps[lKey] < lyricsCache.TTL_MS)) {
    return cached;
  }

  // 1. Try LRCLIB for Time-Synced Lyrics (Direct Get -> Smart Search)
  try {
    const cleanArtist = artist.replace(/\s*(feat\.|ft\.|with|,|\/).*$/i, '').trim();
    const cleanTitle = title.replace(/\s*(\(.*\)|\[.*\]).*$/i, '').trim();

    let lrcData = null;

    // Exact match query
    const lrcRes = await fetch(
      `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`,
      { headers: { 'User-Agent': 'PlayMusicSpotiFlyer/1.0' }, signal: AbortSignal.timeout(4500) }
    ).catch(() => null);

    if (lrcRes && lrcRes.ok) {
      lrcData = await lrcRes.json().catch(() => null);
    }

    // Search fallback if direct match missing synced lyrics
    if (!lrcData || !lrcData.syncedLyrics) {
      const searchQueries = [
        `${cleanArtist} ${cleanTitle}`,
        `${artist} ${title}`,
        cleanTitle
      ];

      for (const sQuery of searchQueries) {
        const sRes = await fetch(
          `https://lrclib.net/api/search?q=${encodeURIComponent(sQuery)}`,
          { headers: { 'User-Agent': 'PlayMusicSpotiFlyer/1.0' }, signal: AbortSignal.timeout(4000) }
        ).catch(() => null);

        if (sRes && sRes.ok) {
          const list = await sRes.json().catch(() => []);
          if (Array.isArray(list) && list.length > 0) {
            const bestSynced = list.find(item => item.syncedLyrics && item.syncedLyrics.trim().length > 10);
            if (bestSynced) {
              lrcData = bestSynced;
              break;
            } else if (!lrcData && list[0].plainLyrics) {
              lrcData = list[0];
            }
          }
        }
      }
    }

    if (lrcData && (lrcData.syncedLyrics || lrcData.plainLyrics)) {
      const result = {
        artist,
        title,
        synced: !!lrcData.syncedLyrics,
        syncedLyrics: lrcData.syncedLyrics || '',
        lyrics: lrcData.plainLyrics || lrcData.syncedLyrics || '',
        found: true
      };
      lyricsCache.data[lKey] = result;
      lyricsCache.timestamps[lKey] = Date.now();
      return result;
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
    if (lyrRes.ok) {
      const lyrJson = await lyrRes.json();
      const result = {
        artist,
        title,
        synced: false,
        syncedLyrics: '',
        lyrics: lyrJson.lyrics || '',
        found: !!(lyrJson.lyrics && lyrJson.lyrics.trim().length > 10)
      };
      lyricsCache.data[lKey] = result;
      lyricsCache.timestamps[lKey] = Date.now();
      return result;
    }
  } catch {}

  return { artist, title, synced: false, syncedLyrics: '', lyrics: '', found: false };
}
