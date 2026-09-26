import CryptoJS from 'crypto-js';
import { BAD_TRACK_KEYWORDS } from '../config/constants.js';
import { getSpotifyToken } from './spotify.service.js';

// ── Free Music Scraper (JioSaavn 320kbps Stream Decryptor) ──
export function decryptSaavnMedia(enc) {
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

export function isForbiddenTrack(title, subtitle, artist) {
  const all = ((title || '') + ' ' + (subtitle || '') + ' ' + (artist || '')).toLowerCase();
  return BAD_TRACK_KEYWORDS.some(w => all.includes(w));
}

function normalizeCleanStr(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isArtistMatching(expected, candidate) {
  if (!expected || !candidate) return true;
  const expPrimary = expected.toLowerCase().split(/[,&/]|feat|ft\./)[0].trim().replace(/[^a-z0-9]/g, '');
  if (!expPrimary || expPrimary.length < 2) return true;
  const candNorm = normalizeCleanStr(candidate);
  const expNorm = normalizeCleanStr(expected);
  return candNorm.includes(expPrimary) || expNorm.includes(candNorm) || candNorm.includes(expNorm);
}

export async function scrapeFullAudio(query, expectedArtist = '', expectedTitle = '') {
  try {
    const cleanQ = (query || '').replace(/[^\w\s]/gi, ' ').trim();
    if (!cleanQ) return null;

    // 1. Coba JioSaavn HANYA jika lagu asli (bukan karaoke/piano/cover dan artis cocok)
    const searchSaavn = async (term) => {
      try {
        const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(term)}&n=8&p=1`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(4500)
        });
        if (!res.ok) return null;
        const data = await res.json();
        const results = data.results || [];
        for (const item of results) {
          const itemTitle = (item.title || '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
          const itemArtist = item.subtitle || item.more_info?.music || '';
          if (isForbiddenTrack(itemTitle, itemArtist, itemArtist)) continue;
          if (expectedArtist && !isArtistMatching(expectedArtist, itemArtist)) continue;

          const enc = item.more_info?.encrypted_media_url;
          const streamUrl = decryptSaavnMedia(enc);
          if (streamUrl) {
            return {
              found: true,
              isVerifiedOriginal: true,
              source: 'jiosaavn_320kbps',
              title: itemTitle,
              artist: itemArtist,
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

    let found = await searchSaavn(cleanQ);
    if (found) return found;

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

    // 2. Fallback: Cari iTunes Audio Preview Resmi
    try {
      const itUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&entity=song&limit=6`;
      const itRes = await fetch(itUrl, { signal: AbortSignal.timeout(5000) });
      if (itRes.ok) {
        const itData = await itRes.json();
        for (const item of (itData.results || [])) {
          if (!item.previewUrl) continue;
          if (isForbiddenTrack(item.trackName, item.artistName || '', '')) continue;
          if (expectedArtist && !isArtistMatching(expectedArtist, item.artistName || '')) continue;
          return {
            found: true,
            isVerifiedOriginal: true,
            source: 'itunes_official',
            title: item.trackName,
            artist: item.artistName || expectedArtist,
            album: item.collectionName || '',
            duration: Math.round((item.trackTimeMillis || 30000) / 1000),
            cover: (item.artworkUrl100 || '').replace('100x100bb', '250x250bb'),
            streamUrl: item.previewUrl,
            bitrate: 'Original Studio Audio'
          };
        }
      }
    } catch {}

    // 3. Fallback: Cari Audio Asli Studio Rekaman via Deezer Official
    try {
      const dzUrl = `https://api.deezer.com/search?q=${encodeURIComponent(cleanQ)}&limit=6`;
      const dzRes = await fetch(dzUrl, { signal: AbortSignal.timeout(5000) });
      if (dzRes.ok) {
        const dzData = await dzRes.json();
        for (const item of (dzData.data || [])) {
          if (!item.preview) continue;
          if (isForbiddenTrack(item.title, item.artist?.name || '', '')) continue;
          if (expectedArtist && !isArtistMatching(expectedArtist, item.artist?.name || '')) continue;
          return {
            found: true,
            isVerifiedOriginal: true,
            source: 'deezer_official',
            title: item.title,
            artist: item.artist?.name || expectedArtist,
            album: item.album?.title || '',
            duration: item.duration || 30,
            cover: item.album?.cover_medium || '',
            streamUrl: item.preview,
            bitrate: 'Original Studio Audio'
          };
        }
      }
    } catch {}

  } catch (err) {
    console.error('Free music scraper error:', err.message);
  }
  return null;
}

export async function searchSongs(query) {
  const rawQ = (query || '').trim();
  if (!rawQ) return [];

  const cleanQ = rawQ.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const queryTokens = cleanQ.toLowerCase().split(' ').filter(t => t.length > 0);

  const seen = new Set();
  const candidates = [];

  // 1. Search Deezer Global
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

  // 2. Search Spotify via Pathfinder Desktop Search
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

  // 3. Search JioSaavn
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

  // 4. Search iTunes
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

  const [deezerRes, spotifyRes, saavnRes, itunesRes] = await Promise.allSettled([
    deezerPromise, spotifyPromise, saavnPromise, itunesPromise
  ]);

  const rawList = [
    ...(deezerRes.status === 'fulfilled' ? deezerRes.value : []),
    ...(spotifyRes.status === 'fulfilled' ? spotifyRes.value : []),
    ...(saavnRes.status === 'fulfilled' ? saavnRes.value : []),
    ...(itunesRes.status === 'fulfilled' ? itunesRes.value : [])
  ];

  const lowerQ = rawQ.toLowerCase().trim();
  for (const item of rawList) {
    if (!item.title || !item.artist) continue;
    const lowerTitle = item.title.toLowerCase();
    const lowerArtist = item.artist.toLowerCase();
    const fullText = `${lowerTitle} ${lowerArtist}`;
    const dedupeKey = `${lowerTitle.replace(/[^a-z0-9]/g, '')}_${lowerArtist.replace(/[^a-z0-9]/g, '')}`;

    if (seen.has(dedupeKey)) {
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
    if (lowerTitle === lowerQ) score += 200;
    else if (lowerTitle.startsWith(lowerQ)) score += 120;
    else if (lowerTitle.includes(lowerQ)) score += 90;
    else if (fullText.includes(lowerQ)) score += 70;

    for (const tok of queryTokens) {
      if (tok.length <= 1) continue;
      if (lowerTitle.includes(tok)) score += 30;
      if (lowerArtist.includes(tok)) score += 20;
    }

    if (item.fullStreamUrl) score += 35;
    else if (item.preview) score += 25;
    if (item.cover && item.cover.startsWith('http')) score += 10;

    item.relevanceScore = score;
    item.dedupeKey = dedupeKey;
    candidates.push(item);
  }

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
