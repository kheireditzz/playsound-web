const albumCache = {
  data: {},
  timestamps: {},
  TTL_MS: 30 * 60 * 1000
};

export async function fetchTopAlbums(forceFresh = false) {
  if (!forceFresh && albumCache.data['albums_top_list'] && Date.now() - albumCache.timestamps['albums_top_list'] < albumCache.TTL_MS) {
    return albumCache.data['albums_top_list'];
  }

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
    albumCache.data['albums_top_list'] = albums;
    albumCache.timestamps['albums_top_list'] = Date.now();
  }
  return albums;
}

export async function fetchAlbumDetail(albumId) {
  if (!albumId) return null;
  const cacheKey = `album_det_${albumId}`;
  if (albumCache.data[cacheKey] && Date.now() - albumCache.timestamps[cacheKey] < albumCache.TTL_MS) {
    return albumCache.data[cacheKey];
  }

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

    albumCache.data[cacheKey] = albumDetail;
    albumCache.timestamps[cacheKey] = Date.now();
    return albumDetail;
  } catch (err) {
    console.error(`Fetch album detail error (${albumId}):`, err.message);
    return null;
  }
}
