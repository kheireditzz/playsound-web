import { scrapeFullAudio, searchSongs, decryptSaavnMedia } from './audio.service.js';
import { fetchSpotifyPlaylist, getSpotifyToken } from './spotify.service.js';

// ── SpotiFlyer Universal Link Resolver Engine ──
// Mendukung Spotify, YouTube, YouTube Music, JioSaavn, SoundCloud, Gaana
export async function resolveSpotiFlyerLink(rawUrl) {
  try {
    const cleanUrl = (rawUrl || '').trim();
    if (!cleanUrl) return null;

    const urlStr = /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // ─────────────────────────────────────────────────────────────
    // 1. SPOTIFY PROVIDER (Track, Album, Playlist)
    // ─────────────────────────────────────────────────────────────
    if (host.includes('spotify.com')) {
      // 1A. Single Track
      const trackMatch = pathname.match(/track\/([a-zA-Z0-9]+)/);
      if (trackMatch) {
        const trackId = trackMatch[1];

        // Layer 1: Spotify Embed Next.js Data Scraper (Full Metadata)
        try {
          const res = await fetch(`https://open.spotify.com/embed/track/${trackId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(6000)
          });
          if (res.ok) {
            const html = await res.text();
            const dataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (dataMatch) {
              const json = JSON.parse(dataMatch[1]);
              const entity = json.props?.pageProps?.state?.data?.entity;
              if (entity) {
                const title = entity.name || 'Spotify Track';
                const artist = entity.artists?.map(a => a.name).join(', ') || 'Artist';
                const cover = entity.coverArt?.sources?.[0]?.url || '';
                const durSec = Math.round((entity.duration || 180000) / 1000);
                const albumTitle = entity.album?.name || 'Spotify Single';

                const streamData = await scrapeFullAudio(`${artist} ${title}`, artist, title);
                const streamUrl = streamData?.streamUrl || '';

                const trackObj = {
                  id: `sp-${trackId}`,
                  rank: 1,
                  title,
                  artist,
                  album: albumTitle,
                  cover,
                  preview: streamUrl,
                  fullStreamUrl: streamUrl,
                  duration: durSec,
                  trendVelocity: 'SPOTIFY',
                  origin: 'Spotify',
                  youtubeQuery: `${artist} ${title} official audio`,
                  externalUrls: {
                    spotify: cleanUrl,
                    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
                    tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`
                  }
                };

                return {
                  provider: 'spotify',
                  type: 'track',
                  title,
                  subtitle: artist,
                  cover,
                  albumName: albumTitle,
                  totalTracks: 1,
                  tracks: [trackObj]
                };
              }
            }
          }
        } catch (spErr) {
          console.warn('SpotiFlyer Spotify track embed warning:', spErr.message);
        }

        // Layer 2: Spotify oEmbed Fallback
        try {
          const oRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(4500)
          });
          if (oRes.ok) {
            const oData = await oRes.json();
            const songTitle = (oData.title || '').trim();
            const songCover = oData.thumbnail_url || '';
            const matchedSongs = await searchSongs(songTitle);
            if (matchedSongs && matchedSongs.length > 0) {
              const best = matchedSongs[0];
              return {
                provider: 'spotify',
                type: 'track',
                title: best.title,
                subtitle: best.artist,
                cover: best.cover || songCover,
                albumName: best.album || 'Single',
                totalTracks: 1,
                tracks: [{
                  ...best,
                  id: `sp-${trackId}`,
                  cover: best.cover || songCover,
                  origin: 'Spotify'
                }]
              };
            }
          }
        } catch {}
      }

      // 1B. Album
      const albumMatch = pathname.match(/album\/([a-zA-Z0-9]+)/);
      if (albumMatch) {
        const albumId = albumMatch[1];
        try {
          const res = await fetch(`https://open.spotify.com/embed/album/${albumId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(6000)
          });
          if (res.ok) {
            const html = await res.text();
            const dataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (dataMatch) {
              const json = JSON.parse(dataMatch[1]);
              const entity = json.props?.pageProps?.state?.data?.entity;
              const albumTitle = entity?.name || 'Spotify Album';
              const albumArtist = entity?.artists?.map(a => a.name).join(', ') || 'Various Artists';
              const albumCover = entity?.coverArt?.sources?.[0]?.url || '';
              const trackList = entity?.trackList || [];

              const tracks = trackList.map((t, idx) => ({
                id: `sp-alb-${albumId}-${idx}`,
                trackNumber: idx + 1,
                rank: idx + 1,
                title: t.title || 'Track',
                artist: t.subtitle || albumArtist,
                album: albumTitle,
                cover: albumCover,
                preview: '',
                fullStreamUrl: '',
                duration: Math.round((t.duration || 180000) / 1000),
                trendVelocity: `TRACK ${String(idx + 1).padStart(2, '0')}`,
                origin: 'Spotify Album',
                youtubeQuery: `${t.subtitle || albumArtist} ${t.title || ''} official audio`,
                externalUrls: {
                  spotify: cleanUrl,
                  youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent((t.subtitle || albumArtist) + ' ' + (t.title || ''))}`,
                  tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent((t.subtitle || albumArtist) + ' ' + (t.title || ''))}`
                }
              }));

              return {
                provider: 'spotify',
                type: 'album',
                title: albumTitle,
                subtitle: albumArtist,
                cover: albumCover,
                albumName: albumTitle,
                totalTracks: tracks.length,
                tracks
              };
            }
          }
        } catch (albErr) {
          console.warn('SpotiFlyer Spotify album error:', albErr.message);
        }
      }

      // 1C. Playlist
      const playlistMatch = pathname.match(/playlist\/([a-zA-Z0-9]+)/);
      if (playlistMatch) {
        const playlistId = playlistMatch[1];
        const plTracks = await fetchSpotifyPlaylist(playlistId, 'Spotify Playlist', 60);
        if (plTracks && plTracks.length > 0) {
          return {
            provider: 'spotify',
            type: 'playlist',
            title: plTracks[0]?.album || 'Spotify Playlist',
            subtitle: `${plTracks.length} Lagu Pilihan`,
            cover: plTracks[0]?.cover || '',
            albumName: plTracks[0]?.album || 'Playlist',
            totalTracks: plTracks.length,
            tracks: plTracks
          };
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. YOUTUBE & YOUTUBE MUSIC PROVIDER
    // ─────────────────────────────────────────────────────────────
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      let videoId = null;
      if (host.includes('youtu.be')) {
        videoId = pathname.replace('/', '').split('?')[0];
      } else {
        videoId = parsed.searchParams.get('v');
      }

      // 2A. Single Video / Music Track
      if (videoId && videoId.length === 11) {
        try {
          const oRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(4500)
          });
          let title = 'YouTube Track';
          let artist = 'Artist';
          const cover = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          if (oRes.ok) {
            const oData = await oRes.json();
            title = oData.title || title;
            artist = oData.author_name || artist;
          }

          const cleanTitle = title.replace(/\(.*?\)|\[.*?\]|official|music|video|audio|lyric|mv/gi, '').trim();
          const streamData = await scrapeFullAudio(`${artist} ${cleanTitle}`, artist, cleanTitle);
          const streamUrl = streamData?.streamUrl || '';

          const trackObj = {
            id: `yt-${videoId}`,
            rank: 1,
            title,
            artist,
            album: 'YouTube Music Single',
            cover,
            preview: streamUrl,
            fullStreamUrl: streamUrl,
            duration: streamData?.duration || 180,
            trendVelocity: 'YOUTUBE',
            origin: 'YouTube',
            youtubeQuery: `${artist} ${cleanTitle}`,
            externalUrls: {
              youtube: `https://www.youtube.com/watch?v=${videoId}`,
              spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`,
              tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`
            }
          };

          return {
            provider: 'youtube',
            type: 'track',
            title,
            subtitle: artist,
            cover,
            albumName: 'YouTube Music',
            totalTracks: 1,
            tracks: [trackObj]
          };
        } catch (ytErr) {
          console.warn('SpotiFlyer YouTube parse warning:', ytErr.message);
        }
      }

      // 2B. Playlist: list=...
      const listId = parsed.searchParams.get('list');
      if (listId) {
        const query = parsed.searchParams.get('v') ? `playlist ${listId}` : 'popular music';
        const ytTracks = await searchSongs(query);
        if (ytTracks.length > 0) {
          return {
            provider: 'youtube',
            type: 'playlist',
            title: `YouTube Playlist (${listId.slice(0, 8)})`,
            subtitle: 'Koleksi YouTube Music',
            cover: ytTracks[0]?.cover || '',
            albumName: 'YouTube Playlist',
            totalTracks: ytTracks.length,
            tracks: ytTracks
          };
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. JIOSAAVN PROVIDER (Direct 320kbps DES Decryption)
    // ─────────────────────────────────────────────────────────────
    if (host.includes('jiosaavn.com')) {
      try {
        const res = await fetch(cleanUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          const html = await res.text();

          // 3A. Check for Song
          const titleMatch = html.match(/<title>([^<]+)<\/title>/);
          const rawTitle = titleMatch ? titleMatch[1].replace(' - JioSaavn', '').replace(' JioSaavn', '').trim() : '';

          if (rawTitle) {
            const parts = rawTitle.split(/by|-/);
            const songTitle = parts[0]?.trim() || rawTitle;
            const songArtist = parts[1]?.trim() || 'JioSaavn Artist';

            // Query JioSaavn WebAPI
            const searchApiUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(songTitle + ' ' + songArtist)}&n=5&p=1`;
            const saavnRes = await fetch(searchApiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4500) });

            if (saavnRes.ok) {
              const sData = await saavnRes.json();
              const firstItem = sData.results?.[0];
              if (firstItem) {
                const streamUrl = decryptSaavnMedia(firstItem.more_info?.encrypted_media_url);
                const title = (firstItem.title || songTitle).replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
                const artist = (firstItem.subtitle || songArtist).replace(/&amp;/g, '&');
                const cover = firstItem.image ? firstItem.image.replace('150x150', '350x350') : '';
                const duration = Number(firstItem.more_info?.duration) || 180;
                const album = firstItem.more_info?.album || 'JioSaavn Single';

                const trackObj = {
                  id: `sv-${firstItem.id || Date.now()}`,
                  rank: 1,
                  title,
                  artist,
                  album,
                  cover,
                  preview: streamUrl || '',
                  fullStreamUrl: streamUrl || '',
                  duration,
                  trendVelocity: 'SAAVN 320K',
                  origin: 'JioSaavn 320k',
                  youtubeQuery: `${artist} ${title} official audio`,
                  externalUrls: {
                    saavn: cleanUrl,
                    youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
                    spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`,
                    tiktok: `https://www.tiktok.com/search?q=${encodeURIComponent(artist + ' ' + title)}`
                  }
                };

                return {
                  provider: 'jiosaavn',
                  type: 'track',
                  title,
                  subtitle: artist,
                  cover,
                  albumName: album,
                  totalTracks: 1,
                  tracks: [trackObj]
                };
              }
            }
          }
        }
      } catch (svErr) {
        console.warn('SpotiFlyer JioSaavn parse warning:', svErr.message);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 4. SOUNDCLOUD PROVIDER
    // ─────────────────────────────────────────────────────────────
    if (host.includes('soundcloud.com')) {
      try {
        const oUrl = `https://soundcloud.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
        const scRes = await fetch(oUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4500) });
        if (scRes.ok) {
          const scData = await scRes.json();
          const title = scData.title || 'SoundCloud Track';
          const artist = scData.author_name || 'SoundCloud Artist';
          const cover = scData.thumbnail_url || '';

          const streamData = await scrapeFullAudio(`${artist} ${title}`, artist, title);
          const streamUrl = streamData?.streamUrl || '';

          const trackObj = {
            id: `sc-${Date.now()}`,
            rank: 1,
            title,
            artist,
            album: 'SoundCloud Original',
            cover,
            preview: streamUrl,
            fullStreamUrl: streamUrl,
            duration: streamData?.duration || 180,
            trendVelocity: 'SOUNDCLOUD',
            origin: 'SoundCloud',
            youtubeQuery: `${artist} ${title}`,
            externalUrls: {
              soundcloud: cleanUrl,
              youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(artist + ' ' + title)}`,
              spotify: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`
            }
          };

          return {
            provider: 'soundcloud',
            type: 'track',
            title,
            subtitle: artist,
            cover,
            albumName: 'SoundCloud',
            totalTracks: 1,
            tracks: [trackObj]
          };
        }
      } catch (scErr) {
        console.warn('SpotiFlyer SoundCloud parse warning:', scErr.message);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. GAANA PROVIDER
    // ─────────────────────────────────────────────────────────────
    if (host.includes('gaana.com')) {
      try {
        const parts = pathname.split('/').filter(Boolean);
        const songSlug = parts[parts.length - 1]?.replace(/-/g, ' ') || 'Gaana Music';
        const results = await searchSongs(songSlug);
        if (results && results.length > 0) {
          return {
            provider: 'gaana',
            type: 'track',
            title: results[0].title,
            subtitle: results[0].artist,
            cover: results[0].cover,
            albumName: results[0].album || 'Gaana Music',
            totalTracks: 1,
            tracks: results.slice(0, 1)
          };
        }
      } catch (gaanaErr) {
        console.warn('SpotiFlyer Gaana parse warning:', gaanaErr.message);
      }
    }

  } catch (err) {
    console.error('resolveSpotiFlyerLink global error:', err.message);
  }

  return null;
}
