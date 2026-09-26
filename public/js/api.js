// ── PlayMusic & SpotiFlyer API Client Module ──

export const API = {
  // 1. Fetch Chart & Trends
  async getTrends(category = 'global', forceFresh = false) {
    const url = `/api/trends?category=${encodeURIComponent(category)}${forceFresh ? '&fresh=1' : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Trends API HTTP ${res.status}`);
    return await res.json();
  },

  // 2. Search Music or Universal Link
  async search(query) {
    const url = `/api/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Search API HTTP ${res.status}`);
    return await res.json();
  },

  // 3. Universal Music Link Resolver (Spotify, JioSaavn, YouTube, SoundCloud, Gaana)
  async resolveLink(linkUrl) {
    const url = `/api/spotiflyer/resolve?url=${encodeURIComponent(linkUrl)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Link Resolver HTTP ${res.status}`);
    }
    return await res.json();
  },
  async resolveSpotiFlyerLink(linkUrl) {
    return this.resolveLink(linkUrl);
  },

  // 4. Download Audio MP3 (320kbps)
  getDownloadUrl(audioUrl, artist = '', title = '', filename = '') {
    const params = new URLSearchParams();
    if (audioUrl) params.set('url', audioUrl);
    if (artist) params.set('artist', artist);
    if (title) params.set('title', title);
    if (filename) params.set('name', filename);
    return `/api/spotiflyer/download?${params.toString()}`;
  },

  // 5. Synced Karaoke Lyrics
  async getLyrics(artist, title) {
    const url = `/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return { synced: false, lyrics: '', found: false };
    return await res.json();
  },

  // 6. Albums Endpoints
  async getTopAlbums(forceFresh = false) {
    const url = `/api/albums${forceFresh ? '?fresh=1' : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Albums API HTTP ${res.status}`);
    return await res.json();
  },

  async getAlbumDetail(albumId) {
    const url = `/api/album-detail?id=${encodeURIComponent(albumId)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Album Detail API HTTP ${res.status}`);
    return await res.json();
  },

  // 7. Full 320kbps Audio Stream Scraper
  async getStreamAudio(query, artist = '', title = '') {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (artist) params.set('artist', artist);
    if (title) params.set('title', title);
    const res = await fetch(`/api/stream?${params.toString()}`);
    if (!res.ok) return null;
    return await res.json();
  },

  // 8. YouTube Video Search
  async getYtVideo(query) {
    const url = `/api/yt-search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  }
};
