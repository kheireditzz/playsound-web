// Neumorphic Fallback Cover (Pure SVG, Zero Network Dependency)
    const DEFAULT_NEU_COVER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23DCDAD7' rx='14'/%3E%3Cpath d='M38 68a8 8 0 1 1-8-8 8 8 0 0 1 8 8zm30-7a8 8 0 1 1-8-8 8 8 0 0 1 8 8z' fill='%23006666'/%3E%3Cpath d='M38 68V34l30-7v34' fill='none' stroke='%23006666' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

    // State
    const state = {
      currentCategory: 'global',
      tracks: [],
      currentIndex: -1,
      isPlaying: false,
      currentTrack: null,
      isShuffle: false,
      repeatMode: 'off', // 'off' | 'all' | 'one'
      isRepeat: false,
      activePlayerTab: 'artwork',
      sleepOnTrackEnd: false
    };

    // DOM Elements
    const tracksGrid = document.getElementById('tracksGrid');
    const filterTabs = document.getElementById('filterTabs');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const categoryHeading = document.getElementById('categoryHeading');
    const trackCountBadge = document.getElementById('trackCountBadge');
    const syncTime = document.getElementById('syncTime');
    
    // Player DOM
    const audioEngine = document.getElementById('audioEngine');
    let currentPlaybackToken = 0;
    let currentStreamAbortController = null;
    const mainPlayBtn = document.getElementById('mainPlayBtn');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const dockCover = document.getElementById('dockCover');
    const dockTitle = document.getElementById('dockTitle');
    const dockArtist = document.getElementById('dockArtist');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const progressThumb = document.getElementById('progressThumb');
    const currentTimeText = document.getElementById('currentTimeText');
    const totalDurationText = document.getElementById('totalDurationText');
    const soundWave = document.getElementById('soundWave');

    // Spotify-Style Fullscreen Player DOM Elements
    const spotifyFullPlayer = document.getElementById('spotifyFullPlayer');
    const fullPlayerTitle = document.getElementById('fullPlayerTitle');
    const fullPlayerArtist = document.getElementById('fullPlayerArtist');
    const fullPlayerCover = document.getElementById('fullPlayerCover');
    const fullPlayerQualityBadge = document.getElementById('fullPlayerQualityBadge');
    const fullPlayerLoveBtn = document.getElementById('fullPlayerLoveBtn');
    const fullPlayIcon = document.getElementById('fullPlayIcon');
    const fullPauseIcon = document.getElementById('fullPauseIcon');
    const fullProgressBar = document.getElementById('fullProgressBar');
    const fullProgressFill = document.getElementById('fullProgressFill');
    const fullProgressThumb = document.getElementById('fullProgressThumb');
    const fullCurrentTime = document.getElementById('fullCurrentTime');
    const fullTotalDuration = document.getElementById('fullTotalDuration');
    const fullProgressBarWrap = document.getElementById('fullProgressBarWrap');
    const fullShuffleBtn = document.getElementById('fullShuffleBtn');
    const fullRepeatBtn = document.getElementById('fullRepeatBtn');
    const fullDownloadBtn = document.getElementById('fullDownloadBtn');

    // Modal DOM
    const videoModal = document.getElementById('videoModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalSongTitle = document.getElementById('modalSongTitle');
    const videoFrameContainer = document.getElementById('videoFrameContainer');

    // History DOM Elements (Baru Saja Didengar)
    const historySection = document.getElementById('historySection');
    const historyScrollRow = document.getElementById('historyScrollRow');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // ── Spotify-Style Listening History (Realtime & LocalStorage) ──
    const HISTORY_KEY = 'playsound_history_v1';
    let historyTracks = [];

    function loadHistory() {
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (raw) {
          historyTracks = JSON.parse(raw);
          if (!Array.isArray(historyTracks)) historyTracks = [];
        }
      } catch (err) {
        historyTracks = [];
      }
      renderHistory();
    }

    function saveHistory() {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(historyTracks));
      } catch (err) {}
    }

    function addToHistory(track) {
      if (!track || !track.title) return;
      const entry = {
        id: track.id,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        cover: track.cover || '',
        preview: track.preview || '',
        fullStreamUrl: track.fullStreamUrl || '',
        duration: track.duration || 30,
        trendVelocity: track.trendVelocity || 'VIRAL',
        origin: track.origin || 'Spotify',
        externalUrls: track.externalUrls || {}
      };

      // Filter out duplicate by ID or same title + artist
      historyTracks = historyTracks.filter(t => {
        if (t.id && entry.id && t.id === entry.id) return false;
        if (t.title.toLowerCase() === entry.title.toLowerCase() && t.artist.toLowerCase() === entry.artist.toLowerCase()) return false;
        return true;
      });

      historyTracks.unshift(entry);
      if (historyTracks.length > 15) historyTracks = historyTracks.slice(0, 15);
      saveHistory();
      renderHistory();
    }

    function renderHistorySkeleton(count = 5) {
      if (!historySection || !historyScrollRow) return;
      historySection.style.display = 'block';
      historyScrollRow.innerHTML = Array(count).fill(0).map(() => `
        <div class="history-card skeleton-pulse-neu" style="pointer-events: none; opacity: 0.95;">
          <div class="history-cover-wrap skeleton-shimmer-box" style="margin-bottom: 8px;"></div>
          <div class="skeleton-shimmer-box" style="width: 80%; height: 11px; border-radius: 4px; margin-bottom: 5px;"></div>
          <div class="skeleton-shimmer-box" style="width: 55%; height: 9px; border-radius: 3px;"></div>
        </div>
      `).join('');
    }

    function renderHistory() {
      if (!historySection || !historyScrollRow) return;
      if (historyTracks.length === 0) {
        historySection.style.display = 'none';
        historyScrollRow.innerHTML = '';
        return;
      }

      historySection.style.display = 'block';
      historyScrollRow.innerHTML = historyTracks.map((t, idx) => {
        const isPlaying = state.currentTrack && (state.currentTrack.id === t.id || (state.currentTrack.title === t.title && state.currentTrack.artist === t.artist)) && state.isPlaying;
        const safeTitle = escapeHtml(t.title);
        const safeArtist = escapeHtml(t.artist);
        const coverUrl = t.cover || DEFAULT_NEU_COVER;

        return `
          <div class="history-card ${isPlaying ? 'is-playing' : ''}" onclick="playHistoryTrack(${idx})" title="${safeTitle} - ${safeArtist}">
            <div class="history-cover-wrap">
              <img src="${coverUrl}" alt="${safeTitle}" class="history-cover" draggable="false" oncontextmenu="return false;" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=DEFAULT_NEU_COVER;">
              <div class="history-wave-mini">
                <div class="history-mini-bar"></div>
                <div class="history-mini-bar"></div>
                <div class="history-mini-bar"></div>
              </div>
              <div class="history-play-badge">
                ${isPlaying ? `
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                  </svg>` : `
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6 3 20 12 6 21 6 3"></polygon>
                  </svg>`}
              </div>
            </div>
            <div class="history-title-text">${safeTitle}</div>
            <div class="history-artist-text">${safeArtist}</div>
          </div>
        `;
      }).join('');
    }

    window.playHistoryTrack = function(idx) {
      if (idx < 0 || idx >= historyTracks.length) return;
      const track = historyTracks[idx];

      // If already playing this track, toggle play/pause
      if (state.currentTrack && (state.currentTrack.id === track.id || (state.currentTrack.title === track.title && state.currentTrack.artist === track.artist))) {
        if (state.isPlaying) {
          audioEngine.pause();
        } else {
          audioEngine.play().catch(e => console.log('Autoplay policy:', e));
        }
        return;
      }

      // If exists in current tracks list, use playTrackByIndex
      const foundIdx = state.tracks.findIndex(t => t.id === track.id || (t.title === track.title && t.artist === track.artist));
      if (foundIdx !== -1) {
        playTrackByIndex(foundIdx);
        return;
      }

      // Directly play from history
      const playerDock = document.getElementById('playerDock');
      playerDock.style.display = 'flex';
      playerDock.classList.add('visible');
      document.body.classList.add('has-player');
      if (spotifyFullPlayer && spotifyFullPlayer.classList.contains('is-open')) {
        updateFullPlayerDetails();
      }

      const thisToken = ++currentPlaybackToken;
      if (currentStreamAbortController) {
        try { currentStreamAbortController.abort(); } catch (e) {}
        currentStreamAbortController = null;
      }

      // 1. Matikan audio sebelumnya seketika dan kosongkan pipeline agar audio lama tidak bocor
      try {
        audioEngine.pause();
        audioEngine.currentTime = 0;
        audioEngine.removeAttribute('src');
        audioEngine.load();
      } catch (e) {}

      state.currentIndex = -1;
      state.currentTrack = track;
      state.isPlaying = true;

      // 2. Reset progress bar dan durasi segera
      const neuProgressFill = document.getElementById('neuProgressFill');
      const currentTimeEl = document.getElementById('currentTime');
      const durationTimeEl = document.getElementById('durationTime');
      if (neuProgressFill) neuProgressFill.style.width = '0%';
      if (currentTimeEl) currentTimeEl.textContent = '0:00';
      if (durationTimeEl) durationTimeEl.textContent = formatTime(track.duration || 30);

      dockTitle.textContent = track.title;
      dockArtist.textContent = track.artist;
      dockCover.src = track.cover || DEFAULT_NEU_COVER;
      dockCover.onerror = () => { dockCover.src = DEFAULT_NEU_COVER; };

      // 3. Update status UI seketika
      updatePlayerUI();
      renderTracks();
      addToHistory(track);

      const initialAudio = track.fullStreamUrl || track.preview;
      if (dockDownloadBtn) {
        if (initialAudio) {
          dockDownloadBtn.href = '/api/download?url=' + encodeURIComponent(initialAudio) + '&name=' + encodeURIComponent(track.artist + ' - ' + track.title);
        } else {
          dockDownloadBtn.href = '/api/download?artist=' + encodeURIComponent(track.artist) + '&title=' + encodeURIComponent(track.title) + '&name=' + encodeURIComponent(track.artist + ' - ' + track.title);
        }
        dockDownloadBtn.style.display = 'inline-flex';
      }

      if (initialAudio) {
        audioEngine.src = initialAudio;
        audioEngine.play().catch(err => console.warn('Playback error:', err));
      }

      if (!track.fullStreamUrl) {
        const abortCtrl = new AbortController();
        currentStreamAbortController = abortCtrl;
        fetch('/api/stream?artist=' + encodeURIComponent(track.artist) + '&title=' + encodeURIComponent(track.title), { signal: abortCtrl.signal })
          .then(r => r.json())
          .then(streamData => {
            if (thisToken !== currentPlaybackToken || !state.currentTrack || (state.currentTrack.id !== track.id && state.currentTrack.title !== track.title)) {
              return;
            }
            if (streamData.found && streamData.streamUrl && streamData.isVerifiedOriginal) {
              track.fullStreamUrl = streamData.streamUrl;
              state.currentTrack.fullStreamUrl = streamData.streamUrl;
              if (dockDownloadBtn) {
                dockDownloadBtn.href = '/api/download?url=' + encodeURIComponent(streamData.streamUrl) + '&name=' + encodeURIComponent(track.artist + ' - ' + track.title);
              }
              if (!initialAudio) {
                audioEngine.src = streamData.streamUrl;
                audioEngine.currentTime = 0;
                audioEngine.play().then(() => {
                  state.isPlaying = true;
                  updatePlayerUI();
                  renderTracks();
                }).catch(() => {});
              }
            }
          }).catch(e => {
            if (e.name !== 'AbortError') console.warn('Stream lookup error:', e);
          });
      }

      addToHistory(track);
    };

    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        historyTracks = [];
        saveHistory();
        renderHistory();
      });
    }

    // Loved Tracks DOM Elements (Riwayat Love)
    const headerLovedBtn = document.getElementById('headerLovedBtn');
    const headerLovedBadge = document.getElementById('headerLovedBadge');

    // ── Loved / Saved Tracks System (Realtime & LocalStorage) ──
    const LOVED_KEY = 'playsound_loved_tracks_v1';
    let lovedTracks = [];

    function loadLovedTracks() {
      try {
        const raw = localStorage.getItem(LOVED_KEY);
        if (raw) {
          lovedTracks = JSON.parse(raw);
          if (!Array.isArray(lovedTracks)) lovedTracks = [];
        }
      } catch (err) {
        lovedTracks = [];
      }
      updateLovedBadge();
    }

    function saveLovedTracks() {
      try {
        localStorage.setItem(LOVED_KEY, JSON.stringify(lovedTracks));
      } catch (e) {
        console.warn('LocalStorage save error:', e);
      }
      updateLovedBadge();
    }

    function updateLovedBadge() {
      if (headerLovedBadge) {
        headerLovedBadge.textContent = lovedTracks.length;
      }
    }

    function isTrackLoved(track) {
      if (!track) return false;
      return lovedTracks.some(t => {
        if (t.id && track.id && t.id === track.id) return true;
        if (t.title && track.title && t.artist && track.artist && 
            t.title.toLowerCase() === track.title.toLowerCase() && 
            t.artist.toLowerCase() === track.artist.toLowerCase()) {
          return true;
        }
        return false;
      });
    }

    window.toggleLoveTrack = function(e, idx) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (idx < 0 || idx >= state.tracks.length) return;
      const track = state.tracks[idx];
      const safeId = String(track.id || idx).replace(/[^a-zA-Z0-9_-]/g, '_');

      const existingIdx = lovedTracks.findIndex(t => {
        if (t.id && track.id && t.id === track.id) return true;
        if (t.title && track.title && t.artist && track.artist && 
            t.title.toLowerCase() === track.title.toLowerCase() && 
            t.artist.toLowerCase() === track.artist.toLowerCase()) {
          return true;
        }
        return false;
      });

      const isNowLoved = existingIdx === -1;

      if (isNowLoved) {
        // Tambahkan ke riwayat love (terbaru di paling atas)
        const entry = {
          id: track.id || `loved-${Date.now()}`,
          title: track.title,
          artist: track.artist,
          album: track.album || '',
          cover: track.cover || '',
          preview: track.preview || '',
          fullStreamUrl: track.fullStreamUrl || '',
          duration: track.duration || 30,
          trendVelocity: track.trendVelocity || 'SAVED',
          origin: track.origin || 'Spotify',
          rank: track.rank || (lovedTracks.length + 1),
          externalUrls: track.externalUrls || {}
        };
        lovedTracks.unshift(entry);
      } else {
        // Hapus dari riwayat love
        lovedTracks.splice(existingIdx, 1);
      }

      saveLovedTracks();

      // Realtime update: jika sedang melihat view 'loved', langsung render ulang
      if (state.currentCategory === 'loved') {
        state.tracks = [...lovedTracks];
        renderTracks();
        const lovedBarCountBadge = document.getElementById('lovedBarCountBadge');
        if (lovedBarCountBadge) lovedBarCountBadge.textContent = `${lovedTracks.length} Lagu Disimpan`;
        return;
      }

      // Realtime update tombol love pada kartu yang bersangkutan
      const card = document.getElementById(`card-${safeId}`);
      if (card) {
        const btn = card.querySelector('.btn-love-card');
        if (btn) {
          btn.classList.toggle('is-loved', isNowLoved);
          btn.title = isNowLoved ? 'Hapus dari Riwayat Love' : 'Simpan ke Riwayat Love';
          const svg = btn.querySelector('svg');
          if (svg) {
            svg.setAttribute('fill', isNowLoved ? '#FF2157' : 'none');
            svg.setAttribute('stroke', isNowLoved ? '#FF2157' : 'currentColor');
          }
        }
      }
    };

    window.openLovedView = function() {
      const dlView = document.getElementById('downloadViewContainer');
      if (dlView) dlView.style.display = 'none';
      const headerDlBtn = document.getElementById('headerDownloadBtn');
      if (headerDlBtn) headerDlBtn.style.display = 'inline-flex';

      state.currentCategory = 'loved';

      // 1. Sembunyikan Trending Banner
      const trendingBanner = document.getElementById('trendingBanner');
      if (trendingBanner) trendingBanner.style.display = 'none';

      // 2. Sembunyikan Riwayat Musik yang didengar
      if (historySection) historySection.style.display = 'none';

      // 3. Sembunyikan Kotak Pencarian dan Kategori Tabs
      const controlsWrapper = document.querySelector('.controls-wrapper');
      if (controlsWrapper) controlsWrapper.style.display = 'none';

      // 4. Sembunyikan Section Title default
      const sectionMeta = document.querySelector('.section-meta');
      if (sectionMeta) sectionMeta.style.display = 'none';

      // 5. Tampilkan Loved Page Bar
      const lovedPageBar = document.getElementById('lovedPageBar');
      if (lovedPageBar) lovedPageBar.style.display = 'block';

      const lovedBarCountBadge = document.getElementById('lovedBarCountBadge');
      if (lovedBarCountBadge) lovedBarCountBadge.textContent = `${lovedTracks.length} Lagu Disimpan`;

      // 6. Muat HANYA musik yang di-love
      state.tracks = [...lovedTracks];
      renderTracks();

      // Scroll ke paling atas
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.exitLovedView = function() {
      const headerDlBtn = document.getElementById('headerDownloadBtn');
      if (headerDlBtn) headerDlBtn.style.display = 'inline-flex';

      state.currentCategory = 'global';

      // 1. Tampilkan kembali Trending Banner
      const trendingBanner = document.getElementById('trendingBanner');
      if (trendingBanner) trendingBanner.style.display = 'block';

      // 2. Tampilkan kembali Riwayat Musik jika ada
      renderHistory();

      // 3. Tampilkan kembali Kotak Pencarian dan Kategori Tabs
      const controlsWrapper = document.querySelector('.controls-wrapper');
      if (controlsWrapper) controlsWrapper.style.display = 'flex';

      // 4. Tampilkan kembali Section Title default
      const sectionMeta = document.querySelector('.section-meta');
      if (sectionMeta) sectionMeta.style.display = 'flex';

      // 5. Sembunyikan Loved Page Bar
      const lovedPageBar = document.getElementById('lovedPageBar');
      if (lovedPageBar) lovedPageBar.style.display = 'none';

      // 7. Reset active tab ke 'global'
      document.querySelectorAll('.neu-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === 'global');
      });

      // 8. Muat kembali chart global terbaru
      loadTracks('global');

      // Scroll ke paling atas
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // ── In-Web Realtime Refresh (Tanpa Reload Browser) ──
    let isRefreshingApp = false;
    let toastTimer = null;

    function showToast(msg) {
      const toast = document.getElementById('neuToast');
      const toastMsg = document.getElementById('toastMsg');
      if (!toast || !toastMsg) return;

      toastMsg.textContent = msg;
      toast.classList.add('show');

      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }

    window.refreshAppRealtime = async function() {
      if (isRefreshingApp) return;
      isRefreshingApp = true;

      const refreshIcon = document.getElementById('webRefreshIcon');
      if (refreshIcon) refreshIcon.classList.add('is-spinning');

      try {
        if (state.currentCategory === 'loved') {
          // Jika sedang di Riwayat Love, refresh lagu-lagu tersimpan
          loadLovedTracks();
          state.tracks = [...lovedTracks];
          renderTracks();
          const lovedBarCountBadge = document.getElementById('lovedBarCountBadge');
          if (lovedBarCountBadge) lovedBarCountBadge.textContent = `${lovedTracks.length} Lagu Disimpan`;
        } else {
          // Ambil chart lagu terbaru secara realtime dari server (bypass cache)
          await loadTracks(state.currentCategory, true);
        }

        // Sinkronisasi riwayat musik & status loved
        loadHistory();
        loadLovedTracks();

        showToast('Musik berhasil diperbarui secara realtime');
      } catch (err) {
        console.error('Refresh realtime error:', err);
        showToast('Gagal memperbarui musik. Periksa koneksi internet.');
      } finally {
        setTimeout(() => {
          if (refreshIcon) refreshIcon.classList.remove('is-spinning');
          isRefreshingApp = false;
        }, 700);
      }
    };

    // Format Seconds to M:SS
    function formatTime(seconds) {
      if (isNaN(seconds)) return '0:00';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // ── Albums Feature (Full Album, In-Place View, Realtime & Terbaru) ──
    let currentAlbumData = null;
    let albumsCache = [];

    async function loadAlbums(forceRefresh = false) {
      state.currentCategory = 'albums';
      if (categoryHeading) categoryHeading.textContent = 'KOLEKSI ALBUM TERBARU & POPULER';

      // Pastikan banner, riwayat, controls, dan section meta terlihat saat di tab Top Album
      const trendingBanner = document.getElementById('trendingBanner');
      if (trendingBanner) trendingBanner.style.display = 'block';
      if (historySection) renderHistory();
      const controlsWrapper = document.querySelector('.controls-wrapper');
      if (controlsWrapper) controlsWrapper.style.display = 'flex';
      const sectionMeta = document.querySelector('.section-meta');
      if (sectionMeta) sectionMeta.style.display = 'flex';

      if (window.scrollX !== 0 || window.pageXOffset !== 0) window.scrollTo(0, window.scrollY);
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;

      tracksGrid.innerHTML = `
        <div class="albums-grid" style="grid-column: 1 / -1; width: 100%;">
          ${Array(8).fill(0).map(() => `
            <div class="album-card skeleton-pulse-neu" style="pointer-events: none;">
              <div class="skeleton-shimmer-box" style="width: 100%; aspect-ratio: 1/1; border-radius: 14px;"></div>
              <div class="album-details" style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                <div class="skeleton-shimmer-box" style="width: 85%; height: 16px; border-radius: 6px;"></div>
                <div class="skeleton-shimmer-box" style="width: 55%; height: 12px; border-radius: 4px;"></div>
                <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                  <div class="skeleton-shimmer-box" style="width: 35%; height: 11px; border-radius: 4px;"></div>
                  <div class="skeleton-shimmer-box" style="width: 25%; height: 11px; border-radius: 4px;"></div>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                <div class="skeleton-shimmer-box" style="height: 32px; border-radius: 10px;"></div>
                <div class="skeleton-shimmer-box" style="height: 32px; border-radius: 10px;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      try {
        const res = await fetch(`/api/albums${forceRefresh ? '?fresh=1' : ''}`);
        const data = await res.json();
        albumsCache = data.data || [];
        renderAlbums(albumsCache);
        if (trackCountBadge) trackCountBadge.textContent = `${albumsCache.length} Album`;
        if (syncTime) syncTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (err) {
        console.error('Load albums error:', err);
        tracksGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--color-danger); font-family: 'Space Mono';">Gagal memuat album terbaru.</div>`;
      }
    }

    function renderAlbums(albums) {
      if (!albums || albums.length === 0) {
        tracksGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--color-text-muted); font-family: 'Space Mono';">Tidak ada album ditemukan.</div>`;
        return;
      }

      tracksGrid.innerHTML = `
        <div class="albums-grid" style="grid-column: 1 / -1; width: 100%;">
          ${albums.map((alb, idx) => {
            const safeTitle = escapeHtml(alb.title || 'Album');
            const safeArtist = escapeHtml(alb.artist || 'Artist');
            const safeId = escapeHtml(String(alb.id || ''));
            const coverUrl = alb.cover || DEFAULT_NEU_COVER;
            const releaseYear = alb.releaseDate ? String(alb.releaseDate).slice(0, 4) : '2026';

            return `
              <div class="album-card" onclick="window.openAlbumDetail('${safeId}')" title="Klik untuk lihat isi album ${safeTitle}">
                <div class="album-cover-box">
                  <img src="${coverUrl}" alt="${safeTitle}" class="album-cover-img" draggable="false" oncontextmenu="return false;" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=DEFAULT_NEU_COVER;">
                  <span class="album-badge-overlay">${alb.trackCount || 10} LAGU</span>
                </div>
                <div class="album-details">
                  <div class="album-title-text" title="${safeTitle}">${safeTitle}</div>
                  <div class="album-artist-text" title="${safeArtist}">${safeArtist}</div>
                  <div class="album-meta-row">
                    <span>${escapeHtml(alb.genre || 'Music')}</span>
                    <span>${releaseYear}</span>
                  </div>
                </div>
                <div class="album-card-btns" onclick="event.stopPropagation()">
                  <button type="button" class="tactile-btn album-action-btn" onclick="window.openAlbumDetail('${safeId}')">
                    LIHAT TRACKS
                  </button>
                  <button type="button" class="tactile-btn play-btn-primary album-action-btn" onclick="window.quickPlayAlbum('${safeId}')">
                    PUTAR
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    async function openAlbumDetail(albumId) {
      if (!albumId) return;
      state.currentCategory = 'album-detail';

      // 1. Sembunyikan Trending Banner saat melihat track album
      const trendingBanner = document.getElementById('trendingBanner');
      if (trendingBanner) trendingBanner.style.display = 'none';

      // 2. Sembunyikan Riwayat Musik saat melihat track album
      if (historySection) historySection.style.display = 'none';

      // 3. Sembunyikan Kotak Pencarian dan Kategori Tabs
      const controlsWrapper = document.querySelector('.controls-wrapper');
      if (controlsWrapper) controlsWrapper.style.display = 'none';

      // 4. Sembunyikan Section Title default
      const sectionMeta = document.querySelector('.section-meta');
      if (sectionMeta) sectionMeta.style.display = 'none';

      // 5. Scroll ke paling atas halaman secara mulus
      window.scrollTo({ top: 0, behavior: 'smooth' });

      tracksGrid.innerHTML = `
        <div class="album-view-container">
          <div class="album-view-nav-bar">
            <button type="button" class="album-back-btn" onclick="window.exitAlbumView()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>KEMBALI KE TOP ALBUM</span>
            </button>
            <div class="skeleton-shimmer-box" style="width: 80px; height: 24px; border-radius: 12px;"></div>
          </div>

          <div class="album-hero-card skeleton-pulse-neu" style="margin-bottom: 24px;">
            <div class="skeleton-shimmer-box album-hero-cover" style="border-radius: 18px; flex-shrink: 0;"></div>
            <div class="album-hero-info" style="flex: 1; display: flex; flex-direction: column; gap: 12px; width: 100%;">
              <div class="skeleton-shimmer-box" style="width: 120px; height: 16px; border-radius: 6px;"></div>
              <div class="skeleton-shimmer-box" style="width: 65%; height: 26px; border-radius: 8px;"></div>
              <div class="skeleton-shimmer-box" style="width: 40%; height: 16px; border-radius: 6px;"></div>
              <div class="skeleton-shimmer-box" style="width: 150px; height: 38px; border-radius: 12px; margin-top: 6px;"></div>
            </div>
          </div>

          <div class="album-tracklist-wrapper">
            ${Array(6).fill(0).map(() => `
              <div class="album-track-item skeleton-pulse-neu" style="pointer-events: none;">
                <div class="album-track-left" style="align-items: center; gap: 14px; flex: 1;">
                  <div class="skeleton-shimmer-box" style="width: 20px; height: 16px; border-radius: 4px;"></div>
                  <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                    <div class="skeleton-shimmer-box" style="width: 48%; height: 15px; border-radius: 4px;"></div>
                    <div class="skeleton-shimmer-box" style="width: 28%; height: 11px; border-radius: 4px;"></div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div class="skeleton-shimmer-box" style="width: 32px; height: 14px; border-radius: 4px;"></div>
                  <div class="skeleton-shimmer-box" style="width: 58px; height: 28px; border-radius: 8px;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      try {
        const res = await fetch(`/api/album-detail?id=${encodeURIComponent(albumId)}`);
        if (!res.ok) throw new Error('Album lookup failed');
        const album = await res.json();
        currentAlbumData = album;
        renderAlbumDetailView(album);
      } catch (err) {
        console.error('Album detail load error:', err);
        tracksGrid.innerHTML = `
          <div class="album-view-container">
            <div class="album-view-nav-bar">
              <button type="button" class="album-back-btn" onclick="window.exitAlbumView()">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span>KEMBALI KE TOP ALBUM</span>
              </button>
            </div>
            <div style="text-align: center; padding: 30px; font-family: 'Space Mono'; color: var(--color-danger); background: var(--bg-surface); border-radius: 20px; box-shadow: var(--neu-extruded-card);">
              Gagal memuat tracklist album. Silakan coba kembali.
            </div>
          </div>
        `;
      }
    }

    function renderAlbumDetailView(album) {
      if (!album) return;
      const releaseYear = album.releaseDate ? String(album.releaseDate).slice(0, 4) : '2026';
      const trackCount = album.tracks ? album.tracks.length : 0;
      if (trackCountBadge) trackCountBadge.textContent = `${trackCount} Lagu`;

      tracksGrid.innerHTML = `
        <div class="album-view-container">
          <div class="album-view-nav-bar">
            <button type="button" class="album-back-btn" onclick="window.exitAlbumView()" title="Kembali ke Daftar Top Album">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>KEMBALI KE TOP ALBUM</span>
            </button>
            <div class="album-hero-meta-badge">
              <span>${escapeHtml(album.genre || 'Music')}</span>
              <span>•</span>
              <span>${releaseYear}</span>
            </div>
          </div>

          <div class="album-hero-card">
            <img src="${album.cover || DEFAULT_NEU_COVER}" alt="${escapeHtml(album.title)}" class="album-hero-cover" draggable="false" oncontextmenu="return false;" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=DEFAULT_NEU_COVER;">
            <div class="album-hero-info">
              <div class="album-hero-meta-badge">ALBUM LENGKAP • ${trackCount} LAGU</div>
              <h2 class="album-hero-title">${escapeHtml(album.title)}</h2>
              <p class="album-hero-artist">${escapeHtml(album.artist)}</p>
              <div class="album-hero-actions">
                <button type="button" class="tactile-btn play-btn-primary" onclick="window.playAllAlbumTracks()" style="padding: 10px 20px; font-size: 0.82rem; font-family: 'Space Mono'; display: inline-flex; align-items: center; gap: 8px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  <span>PUTAR SEMUA LAGU</span>
                </button>
              </div>
            </div>
          </div>

          <div class="album-tracklist-wrapper" id="albumTrackListWrapper">
            ${renderAlbumTracksHtml(album.tracks || [])}
          </div>
        </div>
      `;
    }

    function renderAlbumTracksHtml(tracks) {
      if (!tracks || tracks.length === 0) {
        return `<div style="text-align: center; padding: 24px; font-family: 'Space Mono'; color: var(--color-text-muted);">Tidak ada lagu dalam album ini.</div>`;
      }

      return tracks.map((t, idx) => {
        const isCurrent = state.currentTrack && (state.currentTrack.id === t.id || (state.currentTrack.title === t.title && state.currentTrack.artist === t.artist));
        const isPlayingThis = isCurrent && state.isPlaying;
        const dlAudio = t.fullStreamUrl || t.preview;
        const dlUrl = dlAudio 
          ? `/api/download?url=${encodeURIComponent(dlAudio)}&name=${encodeURIComponent(t.artist + ' - ' + t.title)}`
          : `/api/download?artist=${encodeURIComponent(t.artist)}&title=${encodeURIComponent(t.title)}&name=${encodeURIComponent(t.artist + ' - ' + t.title)}`;

        return `
          <div class="album-track-item ${isPlayingThis ? 'is-playing' : ''}" id="alb-tr-row-${idx}">
            <div class="album-track-left">
              <span class="album-track-num">${String(t.trackNumber || (idx + 1)).padStart(2, '0')}</span>
              <div style="min-width: 0;">
                <div class="album-track-name" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
                <div style="font-size: 0.72rem; color: var(--color-text-muted);">${escapeHtml(t.artist)}</div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="album-track-dur">${formatTime(t.duration || 30)}</span>
              <button type="button" class="tactile-btn ${isPlayingThis ? 'tactile-btn' : 'play-btn-primary'}" onclick="window.playAlbumTrackByIndex(${idx})" style="padding: 7px 14px; font-size: 0.74rem; font-family: 'Space Mono';">
                ${isPlayingThis ? 'JEDA' : 'PUTAR'}
              </button>
              <a href="${dlUrl}" download class="tactile-btn" title="Download MP3" style="padding: 7px 10px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </a>
            </div>
          </div>
        `;
      }).join('');
    }

    function updateAlbumTrackListView() {
      const container = document.getElementById('albumTrackListWrapper');
      if (container && currentAlbumData && currentAlbumData.tracks) {
        container.innerHTML = renderAlbumTracksHtml(currentAlbumData.tracks);
      }
    }

    function playAlbumTrackByIndex(trackIndex) {
      if (!currentAlbumData || !currentAlbumData.tracks || !currentAlbumData.tracks[trackIndex]) return;
      if (state.currentTrack && state.currentTrack.id === currentAlbumData.tracks[trackIndex].id && state.tracks === currentAlbumData.tracks) {
        if (state.isPlaying) {
          audioEngine.pause();
        } else {
          audioEngine.play().catch(e => console.log('Autoplay policy:', e));
        }
        updateAlbumTrackListView();
        return;
      }
      state.tracks = currentAlbumData.tracks;
      window.playTrackByIndex(trackIndex);
      updateAlbumTrackListView();
    }

    function playAllAlbumTracks() {
      if (!currentAlbumData || !currentAlbumData.tracks || currentAlbumData.tracks.length === 0) return;
      state.tracks = currentAlbumData.tracks;
      window.playTrackByIndex(0);
      updateAlbumTrackListView();
    }

    async function quickPlayAlbum(albumId) {
      await openAlbumDetail(albumId);
      playAllAlbumTracks();
    }

    function exitAlbumView() {
      // 1. Tampilkan kembali Trending Banner
      const trendingBanner = document.getElementById('trendingBanner');
      if (trendingBanner) trendingBanner.style.display = 'block';

      // 2. Tampilkan kembali Riwayat Musik jika ada
      renderHistory();

      // 3. Tampilkan kembali Kotak Pencarian dan Kategori Tabs
      const controlsWrapper = document.querySelector('.controls-wrapper');
      if (controlsWrapper) controlsWrapper.style.display = 'flex';

      // 4. Tampilkan kembali Section Title default
      const sectionMeta = document.querySelector('.section-meta');
      if (sectionMeta) sectionMeta.style.display = 'flex';

      // 5. Kembalikan tab active ke 'albums'
      document.querySelectorAll('.neu-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === 'albums');
      });

      // 6. Kembalikan status dan render list album
      state.currentCategory = 'albums';
      if (categoryHeading) categoryHeading.textContent = 'KOLEKSI ALBUM TERBARU & POPULER';
      if (albumsCache && albumsCache.length > 0) {
        renderAlbums(albumsCache);
        if (trackCountBadge) trackCountBadge.textContent = `${albumsCache.length} Album`;
      } else {
        loadAlbums(false);
      }

      // 7. Scroll ke paling atas secara mulus
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Expose album functions to global window for seamless onclick handlers
    window.renderAlbums = renderAlbums;
    window.openAlbumDetail = openAlbumDetail;
    window.renderAlbumDetailView = renderAlbumDetailView;
    window.renderAlbumTracksHtml = renderAlbumTracksHtml;
    window.updateAlbumTrackListView = updateAlbumTrackListView;
    window.playAlbumTrackByIndex = playAlbumTrackByIndex;
    window.playAllAlbumTracks = playAllAlbumTracks;
    window.quickPlayAlbum = quickPlayAlbum;
    window.exitAlbumView = exitAlbumView;

    // Helper: Render High-End Neumorphic Shimmer Skeleton Song Cards (Pure Shapes, Zero Text)
    function renderTracksSkeleton(count = 6) {
      return Array(count).fill(0).map(() => `
        <div class="song-card skeleton-pulse-neu" style="pointer-events: none; opacity: 0.95;">
          <div class="card-top">
            <div class="cover-wrapper skeleton-shimmer-box" style="border-radius: 14px;"></div>
            <div class="card-info" style="gap: 8px;">
              <div class="skeleton-shimmer-box" style="width: 80%; height: 16px; border-radius: 6px;"></div>
              <div class="skeleton-shimmer-box" style="width: 52%; height: 12px; border-radius: 4px;"></div>
              <div class="badges-row" style="margin-top: 4px; gap: 6px;">
                <div class="skeleton-shimmer-box" style="width: 50px; height: 16px; border-radius: 6px;"></div>
                <div class="skeleton-shimmer-box" style="width: 42px; height: 16px; border-radius: 6px;"></div>
              </div>
            </div>
          </div>
          <div class="card-actions" style="margin-top: 6px;">
            <div class="skeleton-shimmer-box" style="width: 80px; height: 32px; border-radius: 10px;"></div>
            <div class="card-actions-right" style="gap: 6px;">
              <div class="skeleton-shimmer-box" style="width: 32px; height: 32px; border-radius: 10px;"></div>
              <div class="skeleton-shimmer-box" style="width: 32px; height: 32px; border-radius: 10px;"></div>
              <div class="skeleton-shimmer-box" style="width: 32px; height: 32px; border-radius: 10px;"></div>
            </div>
          </div>
        </div>
      `).join('');
    }

    // Load Category Tracks (Realtime with fresh cache-busting)
    async function loadTracks(cat, forceRefresh = false) {
      // Pastikan banner, controls, dan section meta kembali tampil saat berganti kategori
      const trendingBanner = document.getElementById('trendingBanner');
      if (trendingBanner) trendingBanner.style.display = 'block';
      const controlsWrapper = document.querySelector('.controls-wrapper');
      if (controlsWrapper) controlsWrapper.style.display = 'flex';
      const sectionMeta = document.querySelector('.section-meta');
      if (sectionMeta) sectionMeta.style.display = 'flex';

      if (cat === 'loved') {
        openLovedView();
        return;
      }

      if (cat === 'albums') {
        loadAlbums(forceRefresh);
        return;
      }

      state.currentCategory = cat;
      if (window.scrollX !== 0 || window.pageXOffset !== 0) window.scrollTo(0, window.scrollY);
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;

      tracksGrid.innerHTML = renderTracksSkeleton(6);

      try {
        const res = await fetch(`/api/trends?category=${cat}&_t=${Date.now()}${forceRefresh ? '&fresh=1' : ''}`);
        const data = await res.json();
        state.tracks = data.data || [];
        renderTracks();
        initBanner(state.tracks);
        if (trackCountBadge) trackCountBadge.textContent = `${state.tracks.length} Tracks`;
        if (syncTime) syncTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      } catch (err) {
        console.error(err);
        tracksGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--color-danger); font-family: 'Space Mono'; width: 100%; max-width: 100%; box-sizing: border-box; word-break: break-word;">Gagal mengambil chart musik. Pastikan koneksi internet aktif.</div>`;
      }
    }

    // Paste Link Button Handler (SpotiFlyer Style)
    window.handlePasteMusicLink = async function() {
      try {
        let text = '';
        if (navigator.clipboard && navigator.clipboard.readText) {
          try {
            text = await navigator.clipboard.readText();
          } catch (clipErr) {
            console.log('Clipboard permission prompt:', clipErr);
          }
        }
        if (window.openDownloadCenter) {
          window.openDownloadCenter(text ? text.trim() : '');
        } else {
          if (!text) {
            text = prompt('Tempel link musik (Spotify / YouTube / JioSaavn) di sini:');
          }
          if (text && text.trim()) {
            const cleanText = text.trim();
            if (searchInput) searchInput.value = cleanText;
            runSearch(cleanText);
          }
        }
      } catch (err) {
        if (window.openDownloadCenter) {
          window.openDownloadCenter('');
        }
      }
    };

    // Search Query (Pencarian Global Realtime & SpotiFlyer Link Importer)
    async function runSearch(query) {
      const cleanQ = (query || '').trim();
      if (!cleanQ) return;
      if (window.scrollX !== 0 || window.pageXOffset !== 0) window.scrollTo(0, window.scrollY);
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;

      // Reset active tabs
      document.querySelectorAll('.neu-tab-btn').forEach(b => b.classList.remove('active'));

      const isUrl = /^https?:\/\//i.test(cleanQ) || /(spotify\.com|jiosaavn\.com|youtube\.com|youtu\.be)/i.test(cleanQ);
      if (isUrl) {
        if (categoryHeading) categoryHeading.textContent = `MENGIMPOR LINK: "${cleanQ.slice(0, 36)}..."`;
      } else {
        if (categoryHeading) categoryHeading.textContent = `PENCARIAN GLOBAL: "${cleanQ.toUpperCase()}"`;
      }
      tracksGrid.innerHTML = renderTracksSkeleton(4);

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(cleanQ)}`);
        const data = await res.json();
        state.tracks = data.data || [];
        renderTracks();
        if (trackCountBadge) trackCountBadge.textContent = `${state.tracks.length} Hasil`;

        // SpotiFlyer-Style Link Import Response Handler
        if (data.isLinkImport && state.tracks.length > 0) {
          if (categoryHeading) {
            categoryHeading.textContent = data.albumName ? `IMPOR ALBUM: ${data.albumName.toUpperCase()}` : `LAGU TERIMPOR (${(data.source || 'LINK').toUpperCase()})`;
          }
          // Jika single track, otomatis langsung putar lagu pertama!
          if (data.importType === 'track') {
            setTimeout(() => {
              playTrackByIndex(0);
            }, 100);
          }
        }
      } catch (err) {
        console.error(err);
        tracksGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--color-danger); font-family: 'Space Mono'; width: 100%; max-width: 100%; box-sizing: border-box; word-break: break-word;">Gagal memproses pencarian atau impor link. Periksa koneksi internet.</div>`;
      }
    }

    // Safe HTML Escape
    function escapeHtml(text) {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Render Track Cards
    function renderTracks() {
      if (state.tracks.length === 0) {
        if (state.currentCategory === 'loved') {
          tracksGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 48px 16px; color: var(--color-text-muted); font-family: 'Space Mono', monospace; width: 100%; box-sizing: border-box;">
              <div style="font-size: 0.9rem; font-weight: 700; color: var(--color-primary); margin-bottom: 8px; letter-spacing: 1px;">KOSONG</div>
              <div style="font-size: 1rem; font-weight: 700; color: var(--color-text); margin-bottom: 8px;">Belum Ada Musik yang di-Love</div>
              <div style="font-size: 0.8rem; max-width: 320px; margin: 0 auto 20px auto; line-height: 1.5;">
                Klik tombol love pada kartu lagu mana saja untuk menyimpannya ke koleksi Anda secara realtime.
              </div>
              <button class="tactile-btn play-btn-primary" onclick="exitLovedView()">
                KEMBALI KE DASHBOARD
              </button>
            </div>
          `;
          return;
        }

        tracksGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--color-text-muted); font-family: 'Space Mono';">
            Tidak ada musik ditemukan.
            <div style="margin-top: 14px;">
              <button class="tactile-btn play-btn-primary" onclick="loadTracks(state.currentCategory)">Muat Ulang</button>
            </div>
          </div>
        `;
        return;
      }

      // Preload gambar 8 lagu pertama agar instan tanpa rendering delay
      state.tracks.slice(0, 8).forEach(t => {
        if (t.cover) {
          const img = new Image();
          img.src = t.cover;
        }
      });

      tracksGrid.innerHTML = state.tracks.map((track, idx) => {
        const isCurrent = state.currentTrack && state.currentTrack.id === track.id;
        const isPlayingThis = isCurrent && state.isPlaying;
        const isLoved = isTrackLoved(track);
        const safeTitle = escapeHtml(track.title);
        const safeArtist = escapeHtml(track.artist);
        const safeId = String(track.id || idx).replace(/[^a-zA-Z0-9_-]/g, '_');
        const coverUrl = track.cover || DEFAULT_NEU_COVER;

        const dlAudio = track.fullStreamUrl || track.preview;
        const dlUrl = dlAudio 
          ? `/api/download?url=${encodeURIComponent(dlAudio)}&name=${encodeURIComponent(track.artist + ' - ' + track.title)}`
          : `/api/download?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}&name=${encodeURIComponent(track.artist + ' - ' + track.title)}`;

        const ytUrl = track.externalUrls?.youtube || `https://www.youtube.com/results?search_query=${encodeURIComponent(track.artist + ' ' + track.title)}`;
        const ttUrl = track.externalUrls?.tiktok || `https://www.tiktok.com/search?q=${encodeURIComponent(track.artist + ' ' + track.title)}`;
        const spUrl = track.externalUrls?.spotify || `https://open.spotify.com/search/${encodeURIComponent(track.artist + ' ' + track.title)}`;

        return `
          <div class="song-card ${isPlayingThis ? 'is-playing' : ''}" id="card-${safeId}">
            <div class="card-top">
              <div class="cover-wrapper">
                <img src="${coverUrl}" alt="${safeTitle}" class="cover-img" draggable="false" oncontextmenu="return false;" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=DEFAULT_NEU_COVER;">
              </div>
              <div class="card-info">
                <div class="song-title" title="${safeTitle}">${safeTitle}</div>
                <div class="song-artist" title="${safeArtist}">${safeArtist}</div>
                <div class="badges-row">
                  <span class="velocity-badge">${track.trendVelocity}</span>
                  <span class="origin-badge">${track.origin}</span>
                </div>
              </div>
            </div>

            <div class="card-actions">
              <button class="tactile-btn ${isPlayingThis ? 'tactile-btn' : 'play-btn-primary'}" onclick="playTrackByIndex(${idx})">
                ${isPlayingThis ? 'JEDA' : 'PUTAR'}
              </button>
              
              <div class="card-actions-right">
                <!-- Tombol Love / Simpan Lagu -->
                <button type="button" class="tactile-btn btn-love-card ${isLoved ? 'is-loved' : ''}" onclick="toggleLoveTrack(event, ${idx})" title="${isLoved ? 'Hapus dari Riwayat Love' : 'Simpan ke Riwayat Love'}" aria-label="Love Lagu">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="${isLoved ? '#FF2157' : 'none'}" stroke="${isLoved ? '#FF2157' : 'currentColor'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                </button>

                <a href="${dlUrl}" download class="tactile-btn btn-dl-card" title="Download Audio MP3 (Gratis & Cepat)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  <span>MP3</span>
                </a>

                <!-- Dropdown Platform: YouTube, TikTok, Spotify -->
                <div class="neu-dropdown-container">
                  <button class="tactile-btn neu-dropdown-trigger" onclick="togglePlatformDropdown(event, '${safeId}')" title="Pilihan Platform">
                    <span>PILIH</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  <div class="neu-dropdown-menu" id="dropdown-${safeId}">
                    <button class="dropdown-item" onclick="openYouTubeModalByIndex(${idx}); closeAllDropdowns();">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#FF2157">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                      <span>YouTube Video</span>
                    </button>
                    <a href="${ttUrl}" target="_blank" rel="noopener noreferrer" class="dropdown-item" onclick="closeAllDropdowns();">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68 6.34 6.34 0 0 0 9.35 22a6.33 6.33 0 0 0 6.33-6.32V8.4a8.3 8.3 0 0 0 3.91 1.09V6.69z"/>
                      </svg>
                      <span>TikTok Sound</span>
                    </a>
                    <a href="${spUrl}" target="_blank" rel="noopener noreferrer" class="dropdown-item" onclick="closeAllDropdowns();">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#1DB954">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                      <span>Buka di Spotify</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Dropdown handlers
    window.togglePlatformDropdown = function(e, id) {
      e.stopPropagation();
      const menu = document.getElementById('dropdown-' + id);
      const card = document.getElementById('card-' + id);
      const isShown = menu && menu.classList.contains('show');
      closeAllDropdowns();
      if (menu && !isShown) {
        menu.classList.add('show');
        if (card) card.classList.add('has-dropdown-open');
      }
    };

    window.closeAllDropdowns = function() {
      document.querySelectorAll('.neu-dropdown-menu.show').forEach(m => m.classList.remove('show'));
      document.querySelectorAll('.song-card.has-dropdown-open').forEach(c => c.classList.remove('has-dropdown-open'));
    };

    document.addEventListener('click', () => {
      closeAllDropdowns();
    });

    // ── Spotify-Style Fullscreen Player Logic ──
    window.openFullPlayer = function() {
      if (!spotifyFullPlayer) return;
      updateFullPlayerDetails();
      const playerDock = document.getElementById('playerDock');
      if (playerDock) playerDock.classList.add('is-rising');
      spotifyFullPlayer.classList.add('is-open');
      document.body.classList.add('full-player-active');
    };

    window.closeFullPlayer = function() {
      if (!spotifyFullPlayer) return;
      const playerDock = document.getElementById('playerDock');
      if (playerDock) playerDock.classList.remove('is-rising');
      spotifyFullPlayer.classList.remove('is-open');
      document.body.classList.remove('full-player-active');
    };

    function updateFullPlayerDetails() {
      const track = state.currentTrack;
      if (!track) return;
      if (fullPlayerTitle) fullPlayerTitle.textContent = track.title || '-';
      if (fullPlayerArtist) fullPlayerArtist.textContent = track.artist || '-';
      if (fullPlayerCover) {
        fullPlayerCover.src = track.cover || DEFAULT_NEU_COVER;
        fullPlayerCover.onerror = () => { fullPlayerCover.src = DEFAULT_NEU_COVER; };
      }
      if (fullPlayerQualityBadge) {
        fullPlayerQualityBadge.textContent = track.fullStreamUrl ? '320 KBPS HI-FI' : '320 KBPS STREAM';
      }
      if (fullDownloadBtn) {
        const audioUrl = track.fullStreamUrl || track.preview;
        if (audioUrl) {
          fullDownloadBtn.href = '/api/download?url=' + encodeURIComponent(audioUrl) + '&name=' + encodeURIComponent(track.artist + ' - ' + track.title);
        } else {
          fullDownloadBtn.href = '/api/download?artist=' + encodeURIComponent(track.artist) + '&title=' + encodeURIComponent(track.title) + '&name=' + encodeURIComponent(track.artist + ' - ' + track.title);
        }
      }
      updateFullPlayerLoveState();

      // Sinkronisasi status LED dan badge
      if (fullShuffleBtn) fullShuffleBtn.classList.toggle('is-active', !!state.isShuffle);
      updateRepeatUI();

      // Jika tab lirik sedang aktif, muat lirik untuk lagu ini
      if (state.activePlayerTab === 'lyrics') {
        loadLyricsForTrack(track);
      }
    }

    function updateFullPlayerLoveState() {
      if (!fullPlayerLoveBtn) return;
      const isLoved = isTrackLoved(state.currentTrack);
      fullPlayerLoveBtn.classList.toggle('is-loved', isLoved);
      fullPlayerLoveBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="${isLoved ? '#FF2157' : 'none'}" stroke="${isLoved ? '#FF2157' : 'currentColor'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
      `;
      fullPlayerLoveBtn.title = isLoved ? 'Hapus dari Lagu Disukai' : 'Simpan ke Lagu Disukai';
    }

    window.toggleLoveCurrentTrack = function() {
      if (!state.currentTrack) return;
      const track = state.currentTrack;
      const existingIdx = lovedTracks.findIndex(t => {
        if (t.id && track.id && t.id === track.id) return true;
        if (t.title && track.title && t.artist && track.artist && 
            t.title.toLowerCase() === track.title.toLowerCase() && 
            t.artist.toLowerCase() === track.artist.toLowerCase()) {
          return true;
        }
        return false;
      });

      if (existingIdx === -1) {
        lovedTracks.unshift({ ...track });
      } else {
        lovedTracks.splice(existingIdx, 1);
      }
      saveLovedTracks();
      updateLovedBadge();
      updateFullPlayerLoveState();
      renderTracks();
      if (state.currentCategory === 'loved-tracks') {
        renderLovedTracksPage();
      }
    };

    // ── FITUR 1: LIRIK KARAOKE REAL-TIME (SYNCED LYRICS DENGAN 60FPS RAF SYNC & KALIBRASI) ──
    let lyricsData = []; // Array of { time: number, text: string }
    let activeLyricIndex = -1;
    let currentLyricsTrackKey = '';
    let isUserScrollingLyrics = false;
    let lyricsScrollTimeout = null;
    let lyricsRafId = null;

    // Offset Kompensasi Default (+0.45s lead-time) agar lirik pas bersamaan dengan vokal
    let lyricsOffset = 0.45;
    try {
      const savedOffset = localStorage.getItem('playsound_lyrics_offset');
      if (savedOffset !== null) {
        lyricsOffset = parseFloat(savedOffset);
        if (isNaN(lyricsOffset)) lyricsOffset = 0.45;
      }
    } catch(e) {}

    function updateLyricsOffsetBadge() {
      const badge = document.getElementById('lyricsOffsetBadge');
      if (badge) {
        const sign = lyricsOffset >= 0 ? '+' : '';
        badge.textContent = `SYNC: ${sign}${lyricsOffset.toFixed(2)}s`;
      }
    }

    window.adjustLyricsOffset = function(delta) {
      lyricsOffset = Math.round((lyricsOffset + delta) * 100) / 100;
      try { localStorage.setItem('playsound_lyrics_offset', lyricsOffset); } catch(e) {}
      updateLyricsOffsetBadge();
      syncKaraokeLyrics(audioEngine.currentTime || 0, true);
    };

    window.resetLyricsOffset = function() {
      lyricsOffset = 0.45;
      try { localStorage.setItem('playsound_lyrics_offset', lyricsOffset); } catch(e) {}
      updateLyricsOffsetBadge();
      syncKaraokeLyrics(audioEngine.currentTime || 0, true);
    };

    function startLyricsRafLoop() {
      if (lyricsRafId) cancelAnimationFrame(lyricsRafId);
      function frame() {
        if (state.isPlaying && !audioEngine.paused && state.activePlayerTab === 'lyrics') {
          syncKaraokeLyrics(audioEngine.currentTime || 0);
        }
        lyricsRafId = requestAnimationFrame(frame);
      }
      lyricsRafId = requestAnimationFrame(frame);
    }

    function stopLyricsRafLoop() {
      if (lyricsRafId) {
        cancelAnimationFrame(lyricsRafId);
        lyricsRafId = null;
      }
    }

    const lyricsContainer = document.getElementById('fullLyricsContainer');
    if (lyricsContainer) {
      lyricsContainer.addEventListener('scroll', () => {
        isUserScrollingLyrics = true;
        clearTimeout(lyricsScrollTimeout);
        lyricsScrollTimeout = setTimeout(() => {
          isUserScrollingLyrics = false;
        }, 2000);
      }, { passive: true });
    }

    window.switchPlayerTab = function(tab) {
      state.activePlayerTab = tab;
      const tabArtworkBtn = document.getElementById('tabArtworkBtn');
      const tabLyricsBtn = document.getElementById('tabLyricsBtn');
      const artworkBox = document.getElementById('fullArtworkBox');
      const lyricsBox = document.getElementById('fullLyricsContainer');
      const syncBar = document.getElementById('lyricsSyncBar');

      if (tab === 'lyrics') {
        if (tabArtworkBtn) tabArtworkBtn.classList.remove('active');
        if (tabLyricsBtn) tabLyricsBtn.classList.add('active');
        if (artworkBox) artworkBox.style.display = 'none';
        if (lyricsBox) lyricsBox.style.display = 'flex';
        if (syncBar) syncBar.style.display = 'flex';

        updateLyricsOffsetBadge();
        startLyricsRafLoop();

        if (state.currentTrack) {
          loadLyricsForTrack(state.currentTrack);
        }
      } else {
        if (tabLyricsBtn) tabLyricsBtn.classList.remove('active');
        if (tabArtworkBtn) tabArtworkBtn.classList.add('active');
        if (lyricsBox) lyricsBox.style.display = 'none';
        if (syncBar) syncBar.style.display = 'none';
        if (artworkBox) artworkBox.style.display = 'flex';
        stopLyricsRafLoop();
      }
    };

    function parseLrc(lrcText) {
      if (!lrcText || typeof lrcText !== 'string') return [];
      const lines = lrcText.split(/\r?\n/);
      const parsed = [];
      const timeRegex = /\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)/;

      for (const line of lines) {
        const match = timeRegex.exec(line.trim());
        if (match) {
          const min = parseInt(match[1], 10);
          const sec = parseFloat(match[2]);
          const text = match[3] ? match[3].trim() : '';
          const totalSec = min * 60 + sec;
          if (text) {
            parsed.push({ time: totalSec, text });
          }
        }
      }
      parsed.sort((a, b) => a.time - b.time);

      // Tambahkan intro jika baris pertama dimulai di atas 3 detik
      if (parsed.length > 0 && parsed[0].time > 3) {
        parsed.unshift({ time: 0, text: '♪ ... Instrumental Intro ... ♪' });
      }

      return parsed;
    }

    async function loadLyricsForTrack(track) {
      if (!track || !track.title) return;
      const trackKey = (track.artist || '') + ' - ' + track.title;
      if (currentLyricsTrackKey === trackKey && lyricsData.length > 0) {
        syncKaraokeLyrics(audioEngine.currentTime || 0, true);
        return;
      }

      currentLyricsTrackKey = trackKey;
      lyricsData = [];
      activeLyricIndex = -1;

      if (!lyricsContainer) return;
      lyricsContainer.innerHTML = `
        <div class="lyric-empty" id="lyricsStatus">
          <div class="skeleton-shimmer-box" style="width: 140px; height: 16px; border-radius: 6px; margin: 0 auto 10px;"></div>
          <span>Menyelaraskan lirik karaoke...</span>
        </div>`;

      try {
        const query = '/api/lyrics?artist=' + encodeURIComponent(track.artist || '') + '&title=' + encodeURIComponent(track.title);
        const res = await fetch(query);
        const data = await res.json();

        if (currentLyricsTrackKey !== trackKey) return; // Lagu sudah diganti user

        if (data && data.found && data.syncedLyrics) {
          lyricsData = parseLrc(data.syncedLyrics);
          if (lyricsData.length > 0) {
            lyricsContainer.innerHTML = lyricsData.map((item, idx) => `
              <div class="lyric-line" id="lyric-line-${idx}" data-idx="${idx}" onclick="seekToLyricTime(${item.time})">
                ${escapeHtml(item.text)}
              </div>
            `).join('');
            syncKaraokeLyrics(audioEngine.currentTime || 0, true);
            return;
          }
        }

        // Fallback plain lyrics jika ada
        if (data && data.found && data.plainLyrics) {
          const rawLines = data.plainLyrics.split(/\r?\n/).filter(l => l.trim().length > 0);
          lyricsContainer.innerHTML = rawLines.map((line, idx) => `
            <div class="lyric-line ${idx === 0 ? 'active' : ''}" style="cursor: default;">
              ${escapeHtml(line)}
            </div>
          `).join('');
          return;
        }

        lyricsContainer.innerHTML = `
          <div class="lyric-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity: 0.45; margin-bottom: 8px;"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            <div>Lirik karaoke belum tersedia untuk lagu ini.</div>
          </div>`;
      } catch (err) {
        console.warn('Lyrics fetch error:', err);
        lyricsContainer.innerHTML = `
          <div class="lyric-empty">
            <div>Gagal memuat lirik. Silakan periksa koneksi internet.</div>
          </div>`;
      }
    }

    function syncKaraokeLyrics(currentTime, forceScroll = false) {
      if (!lyricsData || lyricsData.length === 0 || !lyricsContainer) return;
      if (lyricsContainer.style.display === 'none') return;

      // Hitung waktu efektif dengan kompensasi latensi vokal
      const effectiveTime = currentTime + lyricsOffset;

      let currentIdx = -1;
      for (let i = 0; i < lyricsData.length; i++) {
        if (effectiveTime >= lyricsData[i].time) {
          currentIdx = i;
        } else {
          break;
        }
      }

      if (currentIdx !== activeLyricIndex || forceScroll) {
        // Reset kelas pada semua baris yang pernah aktif
        lyricsContainer.querySelectorAll('.lyric-line.active, .lyric-line.near-active').forEach(el => {
          el.classList.remove('active', 'near-active');
        });

        activeLyricIndex = currentIdx;

        if (currentIdx >= 0) {
          const activeEl = document.getElementById(`lyric-line-${currentIdx}`);
          const prevEl = document.getElementById(`lyric-line-${currentIdx - 1}`);
          const nextEl = document.getElementById(`lyric-line-${currentIdx + 1}`);

          if (activeEl) activeEl.classList.add('active');
          if (prevEl) prevEl.classList.add('near-active');
          if (nextEl) nextEl.classList.add('near-active');

          if (activeEl && (!isUserScrollingLyrics || forceScroll)) {
            const targetTop = activeEl.offsetTop - (lyricsContainer.clientHeight / 2) + (activeEl.clientHeight / 2);
            lyricsContainer.scrollTo({
              top: Math.max(0, targetTop),
              behavior: 'smooth'
            });
          }
        }
      }
    }

    window.seekToLyricTime = function(time) {
      if (typeof time !== 'number' || isNaN(time)) return;
      if (audioEngine) {
        audioEngine.currentTime = time;
        if (audioEngine.paused) {
          audioEngine.play().catch(() => {});
        }
        syncKaraokeLyrics(time, true);
      }
    };

    // ── FITUR 2: EQUALIZER & BASS BOOST PRESETS ──
    const EQ_PRESETS = {
      flat: { bass: 0, mid: 0, treble: 0, name: 'Flat (Normal)' },
      bass: { bass: 8, mid: 1, treble: 3, name: 'Bass Booster 🔥' },
      vocal: { bass: -2, mid: 6, treble: 4, name: 'Vocal Pop 🎤' },
      acoustic: { bass: 4, mid: 2, treble: 5, name: 'Acoustic Warm' },
      lofi: { bass: 6, mid: -3, treble: -6, name: 'Lo-Fi Chill ☕' }
    };

    let currentEqState = { bass: 0, mid: 0, treble: 0, preset: 'flat' };

    function initAudioEqualizer() {
      try {
        const savedEq = localStorage.getItem('playsound_eq_settings');
        if (savedEq) {
          const parsed = JSON.parse(savedEq);
          setEqBands(parsed.bass || 0, parsed.mid || 0, parsed.treble || 0);
          if (parsed.preset) {
            highlightEqPresetBtn(parsed.preset);
          }
        }
      } catch (e) {}
    }

    function setEqBands(bass, mid, treble) {
      currentEqState.bass = bass;
      currentEqState.mid = mid;
      currentEqState.treble = treble;

      const bInput = document.getElementById('eqBass');
      const mInput = document.getElementById('eqMid');
      const tInput = document.getElementById('eqTreble');
      const bVal = document.getElementById('eqBassVal');
      const mVal = document.getElementById('eqMidVal');
      const tVal = document.getElementById('eqTrebleVal');

      if (bInput) bInput.value = bass;
      if (mInput) mInput.value = mid;
      if (tInput) tInput.value = treble;
      if (bVal) bVal.textContent = (bass > 0 ? '+' : '') + bass + ' dB';
      if (mVal) mVal.textContent = (mid > 0 ? '+' : '') + mid + ' dB';
      if (tVal) tVal.textContent = (treble > 0 ? '+' : '') + treble + ' dB';

      const eqActiveLabel = document.getElementById('eqActiveLabel');
      if (eqActiveLabel) {
        const isCustom = bass !== 0 || mid !== 0 || treble !== 0;
        eqActiveLabel.textContent = isCustom ? 'EQ ON' : 'EQUALIZER';
      }
    }

    function highlightEqPresetBtn(presetKey) {
      document.querySelectorAll('.eq-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `preset-${presetKey}`);
      });
    }

    window.openEqualizerModal = function() {
      initAudioEqualizer();
      const modal = document.getElementById('eqModal');
      if (modal) modal.classList.add('open');
    };

    window.closeEqualizerModal = function() {
      const modal = document.getElementById('eqModal');
      if (modal) modal.classList.remove('open');
    };

    window.updateEqSlider = function(band, val) {
      const numVal = parseFloat(val);
      if (band === 'bass') currentEqState.bass = numVal;
      if (band === 'mid') currentEqState.mid = numVal;
      if (band === 'treble') currentEqState.treble = numVal;

      const labelEl = document.getElementById('eq' + band.charAt(0).toUpperCase() + band.slice(1) + 'Val');
      if (labelEl) labelEl.textContent = (numVal > 0 ? '+' : '') + numVal + ' dB';

      document.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));

      const eqActiveLabel = document.getElementById('eqActiveLabel');
      if (eqActiveLabel) {
        const isCustom = currentEqState.bass !== 0 || currentEqState.mid !== 0 || currentEqState.treble !== 0;
        eqActiveLabel.textContent = isCustom ? 'EQ ON' : 'EQUALIZER';
      }

      try {
        localStorage.setItem('playsound_eq_settings', JSON.stringify({
          bass: currentEqState.bass,
          mid: currentEqState.mid,
          treble: currentEqState.treble,
          preset: 'custom'
        }));
      } catch(e) {}
    };

    window.applyEqPreset = function(presetKey, btnEl) {
      const preset = EQ_PRESETS[presetKey];
      if (!preset) return;

      setEqBands(preset.bass, preset.mid, preset.treble);
      highlightEqPresetBtn(presetKey);

      try {
        localStorage.setItem('playsound_eq_settings', JSON.stringify({
          bass: preset.bass,
          mid: preset.mid,
          treble: preset.treble,
          preset: presetKey
        }));
      } catch(e) {}
    };

    // ── FITUR 3: SLEEP TIMER TAKTIL DENGAN VOLUME FADE-OUT ──
    let sleepTimerInterval = null;
    let sleepTimerRemainingSec = 0;
    let isFadingOut = false;

    window.openSleepTimerModal = function() {
      const modal = document.getElementById('sleepTimerModal');
      if (modal) modal.classList.add('open');
    };

    window.closeSleepTimerModal = function() {
      const modal = document.getElementById('sleepTimerModal');
      if (modal) modal.classList.remove('open');
    };

    function formatTimerDisplay(seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    window.setSleepTimer = function(minutesOrMode, btnEl) {
      clearInterval(sleepTimerInterval);
      sleepTimerInterval = null;
      state.sleepOnTrackEnd = false;
      isFadingOut = false;
      audioEngine.volume = 1;

      document.querySelectorAll('.timer-option-btn').forEach(b => b.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');

      const timerStatusLabel = document.getElementById('timerStatusLabel');

      if (minutesOrMode === 0) {
        if (timerStatusLabel) timerStatusLabel.textContent = 'SLEEP TIMER';
        window.closeSleepTimerModal();
        return;
      }

      if (minutesOrMode === 'end') {
        state.sleepOnTrackEnd = true;
        if (timerStatusLabel) timerStatusLabel.textContent = 'TIMER: AKHIR LAGU';
        window.closeSleepTimerModal();
        return;
      }

      const minutes = parseInt(minutesOrMode, 10);
      if (isNaN(minutes) || minutes <= 0) return;

      sleepTimerRemainingSec = minutes * 60;
      if (timerStatusLabel) timerStatusLabel.textContent = `TIMER: ${formatTimerDisplay(sleepTimerRemainingSec)}`;
      window.closeSleepTimerModal();

      sleepTimerInterval = setInterval(() => {
        sleepTimerRemainingSec--;

        if (sleepTimerRemainingSec <= 15 && sleepTimerRemainingSec > 0) {
          // Smooth volume fade-out dalam 15 detik terakhir
          isFadingOut = true;
          const fadeRatio = sleepTimerRemainingSec / 15;
          audioEngine.volume = Math.max(0.05, Math.min(1, fadeRatio));
        }

        if (sleepTimerRemainingSec <= 0) {
          clearInterval(sleepTimerInterval);
          sleepTimerInterval = null;
          audioEngine.pause();
          audioEngine.volume = 1;
          isFadingOut = false;
          if (timerStatusLabel) timerStatusLabel.textContent = 'SLEEP TIMER';
          document.querySelectorAll('.timer-option-btn').forEach(b => {
            b.classList.toggle('active', b.id === 'timer-0');
          });
          return;
        }

        if (timerStatusLabel) {
          timerStatusLabel.textContent = `TIMER: ${formatTimerDisplay(sleepTimerRemainingSec)}`;
        }
      }, 1000);
    };

    // ── FITUR 4: SHUFFLE & REPEAT (OFF, ALL, ONE) ENGINE ──
    function updateRepeatUI() {
      const badge = document.getElementById('repeatOneBadge');
      if (state.repeatMode === 'off') {
        if (fullRepeatBtn) fullRepeatBtn.classList.remove('is-active');
        if (badge) badge.style.display = 'none';
      } else if (state.repeatMode === 'all') {
        if (fullRepeatBtn) fullRepeatBtn.classList.add('is-active');
        if (badge) badge.style.display = 'none';
      } else if (state.repeatMode === 'one') {
        if (fullRepeatBtn) fullRepeatBtn.classList.add('is-active');
        if (badge) badge.style.display = 'inline-block';
      }
    }

    window.toggleShuffle = function() {
      state.isShuffle = !state.isShuffle;
      if (fullShuffleBtn) fullShuffleBtn.classList.toggle('is-active', state.isShuffle);
    };

    window.toggleRepeat = function() {
      if (state.repeatMode === 'off') {
        state.repeatMode = 'all';
        state.isRepeat = true;
      } else if (state.repeatMode === 'all') {
        state.repeatMode = 'one';
        state.isRepeat = true;
      } else {
        state.repeatMode = 'off';
        state.isRepeat = false;
      }
      updateRepeatUI();
    };

    window.playPrevTrack = function() {
      if (state.tracks.length === 0) return;
      if (state.currentIndex > 0) {
        playTrackByIndex(state.currentIndex - 1);
      } else {
        playTrackByIndex(state.tracks.length - 1);
      }
    };

    window.playNextTrack = function(forceLoop = false) {
      if (state.tracks.length === 0) return;
      if (state.isShuffle) {
        let randIdx = Math.floor(Math.random() * state.tracks.length);
        if (state.tracks.length > 1 && randIdx === state.currentIndex) {
          randIdx = (randIdx + 1) % state.tracks.length;
        }
        playTrackByIndex(randIdx);
      } else {
        if (state.currentIndex + 1 < state.tracks.length) {
          playTrackByIndex(state.currentIndex + 1);
        } else if (forceLoop || state.repeatMode === 'all') {
          playTrackByIndex(0);
        } else {
          // Manual next klik saat di akhir playlist: ulangi dari awal
          playTrackByIndex(0);
        }
      }
    };

    // ── FITUR 5: MEDIASESSION API (LOCKSCREEN & NOTIFIKASI OS) ──
    function updateMediaSession(track) {
      if (!('mediaSession' in navigator) || !track) return;

      const coverSrc = track.cover || DEFAULT_NEU_COVER;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Lagu',
        artist: track.artist || 'Artis',
        album: track.origin ? `Viral Music (${track.origin})` : 'Viral Music Web',
        artwork: [
          { src: coverSrc, sizes: '96x96', type: 'image/jpeg' },
          { src: coverSrc, sizes: '128x128', type: 'image/jpeg' },
          { src: coverSrc, sizes: '192x192', type: 'image/jpeg' },
          { src: coverSrc, sizes: '256x256', type: 'image/jpeg' },
          { src: coverSrc, sizes: '384x384', type: 'image/jpeg' },
          { src: coverSrc, sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      try {
        navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
        navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrevTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack(true));
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details && typeof details.seekTime === 'number' && !isNaN(details.seekTime)) {
            audioEngine.currentTime = details.seekTime;
            updateMediaSessionPosition();
          }
        });
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          seekRelative(-(details?.seekOffset || 10));
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          seekRelative(details?.seekOffset || 10);
        });
      } catch (err) {
        console.warn('MediaSession action handler error:', err);
      }

      navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused';
      updateMediaSessionPosition();
    }

    function updateMediaSessionPosition() {
      if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
      try {
        if (audioEngine.duration && !isNaN(audioEngine.duration) && audioEngine.duration > 0) {
          navigator.mediaSession.setPositionState({
            duration: audioEngine.duration,
            playbackRate: audioEngine.playbackRate || 1,
            position: Math.min(audioEngine.currentTime || 0, audioEngine.duration)
          });
        }
      } catch (e) {}
    }

    window.togglePlayPause = function() {
      if (!state.currentTrack && state.tracks.length > 0) {
        playTrackByIndex(0);
        return;
      }
      try {
        audioEngine.muted = false;
        if (!audioEngine.volume || audioEngine.volume < 0.1) audioEngine.volume = 1;
      } catch (e) {}
      if (state.isPlaying) {
        audioEngine.pause();
      } else {
        audioEngine.play().catch(e => console.log('Play policy:', e));
      }
    };

    window.seekRelative = function(sec) {
      if (!audioEngine.src) return;
      const cur = audioEngine.currentTime || 0;
      const dur = audioEngine.duration || (state.currentTrack ? state.currentTrack.duration : 30);
      const target = Math.max(0, Math.min(dur, cur + sec));
      audioEngine.currentTime = target;
      savePlaybackSession();
    };

    window.openYouTubeFromCurrentTrack = function() {
      if (!state.currentTrack) return;
      window.openYouTubeModal(state.currentTrack.artist + ' ' + state.currentTrack.title, state.currentTrack.title);
    };

    // Full Player Scrubber Handler
    let isFullScrubbing = false;

    function handleFullScrub(e) {
      if (!audioEngine.duration) return 0;
      const bar = document.getElementById('fullProgressBar');
      if (!bar) return 0;
      const rect = bar.getBoundingClientRect();
      const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetSec = pct * audioEngine.duration;

      const fill = document.getElementById('fullProgressFill');
      const thumb = document.getElementById('fullProgressThumb');
      const curTxt = document.getElementById('fullCurrentTime');
      if (fill) fill.style.width = `${pct * 100}%`;
      if (thumb) thumb.style.left = `${pct * 100}%`;
      if (curTxt) curTxt.textContent = formatTime(targetSec);
      return pct;
    }

    if (fullProgressBarWrap) {
      fullProgressBarWrap.addEventListener('pointerdown', (e) => {
        if (!audioEngine.duration) return;
        isFullScrubbing = true;
        fullProgressBarWrap.classList.add('is-dragging');
        try { fullProgressBarWrap.setPointerCapture(e.pointerId); } catch(err) {}
        handleFullScrub(e);
      });

      fullProgressBarWrap.addEventListener('pointermove', (e) => {
        if (!isFullScrubbing) return;
        handleFullScrub(e);
      });

      fullProgressBarWrap.addEventListener('pointerup', (e) => {
        if (!isFullScrubbing) return;
        const pct = handleFullScrub(e);
        if (typeof pct === 'number' && !isNaN(pct) && audioEngine.duration) {
          audioEngine.currentTime = pct * audioEngine.duration;
        }
        isFullScrubbing = false;
        fullProgressBarWrap.classList.remove('is-dragging');
        try { fullProgressBarWrap.releasePointerCapture(e.pointerId); } catch(err) {}
      });

      fullProgressBarWrap.addEventListener('pointercancel', () => {
        isFullScrubbing = false;
        fullProgressBarWrap.classList.remove('is-dragging');
      });
    }

    // Play Track By Index
    window.playTrackByIndex = function(idx) {
      if (idx < 0 || idx >= state.tracks.length) return;

      const track = state.tracks[idx];

      // Tampilkan dock pemutar
      const playerDock = document.getElementById('playerDock');
      playerDock.style.display = 'flex';
      playerDock.classList.add('visible');
      document.body.classList.add('has-player');

      // Jika full player sedang aktif terbuka, update tampilannya
      if (spotifyFullPlayer && spotifyFullPlayer.classList.contains('is-open')) {
        updateFullPlayerDetails();
      }

      if (state.currentTrack && state.currentTrack.id === track.id) {
        if (state.isPlaying) {
          audioEngine.pause();
        } else {
          audioEngine.play().catch(e => console.log('Autoplay policy:', e));
        }
        return;
      }

      const thisToken = ++currentPlaybackToken;
      if (currentStreamAbortController) {
        try { currentStreamAbortController.abort(); } catch (e) {}
        currentStreamAbortController = null;
      }

      // 1. Matikan audio sebelumnya seketika dan kosongkan pipeline agar audio lama tidak bocor
      try {
        audioEngine.pause();
        audioEngine.currentTime = 0;
        audioEngine.removeAttribute('src');
        audioEngine.load();
      } catch (e) {}

      state.currentIndex = idx;
      state.currentTrack = track;
      state.isPlaying = true;
      addToHistory(track);

      // 2. Reset progress bar dan durasi segera agar tidak berkedip data lagu sebelumnya
      const neuProgressFill = document.getElementById('neuProgressFill');
      const currentTimeEl = document.getElementById('currentTime');
      const durationTimeEl = document.getElementById('durationTime');
      if (neuProgressFill) neuProgressFill.style.width = '0%';
      if (currentTimeEl) currentTimeEl.textContent = '0:00';
      if (durationTimeEl) durationTimeEl.textContent = formatTime(track.duration || 30);

      dockTitle.textContent = track.title;
      dockArtist.textContent = track.artist;
      dockCover.src = track.cover || DEFAULT_NEU_COVER;
      dockCover.onerror = () => { dockCover.src = DEFAULT_NEU_COVER; };

      // 3. Update status UI seketika
      updatePlayerUI();
      renderTracks();

      function setDownloadLink(url) {
        if (!dockDownloadBtn) return;
        if (url) {
          dockDownloadBtn.href = '/api/download?url=' + encodeURIComponent(url) + '&name=' + encodeURIComponent(track.artist + ' - ' + track.title);
        } else {
          dockDownloadBtn.href = '/api/download?artist=' + encodeURIComponent(track.artist) + '&title=' + encodeURIComponent(track.title) + '&name=' + encodeURIComponent(track.artist + ' - ' + track.title);
        }
        dockDownloadBtn.style.display = 'inline-flex';
        dockDownloadBtn.title = 'Download Audio MP3 (Gratis 320kbps)';

        if (fullDownloadBtn) {
          fullDownloadBtn.href = dockDownloadBtn.href;
        }
      }

      const initialAudio = track.fullStreamUrl || track.preview;
      setDownloadLink(initialAudio);

      // Pastikan audio native 100% aktif tanpa mute/fade
      try {
        audioEngine.muted = false;
        audioEngine.volume = 1;
      } catch (e) {}

      updateMediaSession(track);

      // Sinkronisasi Lirik Karaoke jika tab lirik sedang terbuka
      if (state.activePlayerTab === 'lyrics') {
        loadLyricsForTrack(track);
      }

      if (initialAudio) {
        audioEngine.src = initialAudio;
        audioEngine.play().catch(err => {
          console.warn('Playback error:', err);
        });
      }

      // Concurrently lookup verified clean stream (anti-karaoke & anti-race condition)
      if (!track.fullStreamUrl) {
        const abortCtrl = new AbortController();
        currentStreamAbortController = abortCtrl;

        fetch('/api/stream?artist=' + encodeURIComponent(track.artist) + '&title=' + encodeURIComponent(track.title), { signal: abortCtrl.signal })
          .then(r => r.json())
          .then(streamData => {
            // Guard: abaikan jika pengguna sudah beralih ke lagu lain
            if (thisToken !== currentPlaybackToken || !state.currentTrack || state.currentTrack.id !== track.id) {
              return;
            }
            if (streamData.found && streamData.streamUrl && streamData.isVerifiedOriginal) {
              track.fullStreamUrl = streamData.streamUrl;
              state.currentTrack.fullStreamUrl = streamData.streamUrl;
              setDownloadLink(streamData.streamUrl);
              if (fullPlayerQualityBadge) {
                fullPlayerQualityBadge.textContent = streamData.bitrate === '320kbps HD' ? '320 KBPS HI-FI' : 'ORIGINAL STUDIO';
              }
              // Jika sebelumnya tidak ada initialAudio, segera putar audio asli yang baru didapat
              if (!initialAudio) {
                audioEngine.src = streamData.streamUrl;
                audioEngine.currentTime = 0;
                audioEngine.play().then(() => {
                  state.isPlaying = true;
                  updatePlayerUI();
                  renderTracks();
                }).catch(() => {});
              }
              updateMediaSession(track);
            }
          })
          .catch(e => {
            if (e.name !== 'AbortError') console.warn('Stream scraper lookup:', e);
          });
      }
    };

    // Update Player UI
    function updatePlayerUI() {
      const playerDock = document.getElementById('playerDock');
      const mainPlayWrap = document.getElementById('mainPlayWrap');

      if (state.isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
        if (fullPlayIcon) fullPlayIcon.style.display = 'none';
        if (fullPauseIcon) fullPauseIcon.style.display = 'block';
        if (soundWave) soundWave.classList.add('is-playing');
        if (playerDock) playerDock.classList.add('is-playing');
        if (mainPlayWrap) mainPlayWrap.classList.add('is-playing');
        document.body.classList.add('is-audio-playing');
      } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        if (fullPlayIcon) fullPlayIcon.style.display = 'block';
        if (fullPauseIcon) fullPauseIcon.style.display = 'none';
        if (soundWave) soundWave.classList.remove('is-playing');
        if (playerDock) playerDock.classList.remove('is-playing');
        if (mainPlayWrap) mainPlayWrap.classList.remove('is-playing');
        document.body.classList.remove('is-audio-playing');
      }

      updateFullPlayerDetails();

      // Update Spotify-Style History Cards realtime playing state
      document.querySelectorAll('.history-card').forEach((card, i) => {
        const t = historyTracks[i];
        const isPlaying = t && state.currentTrack && (state.currentTrack.id === t.id || (state.currentTrack.title === t.title && state.currentTrack.artist === t.artist)) && state.isPlaying;
        card.classList.toggle('is-playing', !!isPlaying);
        const badge = card.querySelector('.history-play-badge');
        if (badge) {
          badge.innerHTML = isPlaying ? `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>` : `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21 6 3"></polygon>
            </svg>`;
        }
      });

      // Update Album in-place track list playing state jika sedang dibuka
      const albWrapper = document.getElementById('albumTrackListWrapper');
      if (albWrapper && currentAlbumData && currentAlbumData.tracks) {
        updateAlbumTrackListView();
      }
    }

    // ── Session State Persistence across Refresh / Reload ──
    const SESSION_STORAGE_KEY = 'kheir_viral_music_playback_session';

    function savePlaybackSession() {
      if (!state.currentTrack) return;
      try {
        const sessionData = {
          track: state.currentTrack,
          currentIndex: state.currentIndex,
          currentTime: audioEngine.currentTime || 0,
          duration: audioEngine.duration || state.currentTrack.duration || 30,
          isPlaying: !audioEngine.paused && !audioEngine.ended && (audioEngine.currentTime > 0 || state.isPlaying),
          timestamp: Date.now()
        };
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
      } catch (e) {}
    }

    let lastSessionSave = 0;
    function throttleSaveSession() {
      const now = Date.now();
      if (now - lastSessionSave > 600) {
        lastSessionSave = now;
        savePlaybackSession();
      }
    }

    function clearPlaybackSession() {
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch (e) {}
    }

    function restorePlaybackSession() {
      try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return;
        const session = JSON.parse(raw);
        if (!session || !session.track || !session.track.title) return;

        // Cek umur sesi (valid dalam 24 jam)
        if (Date.now() - (session.timestamp || 0) > 24 * 60 * 60 * 1000) {
          return;
        }

        const track = session.track;
        state.currentTrack = track;
        state.currentIndex = session.currentIndex ?? -1;

        // Tampilkan dock pemutar bawah
        const playerDock = document.getElementById('playerDock');
        if (playerDock) {
          playerDock.style.display = 'flex';
          playerDock.classList.add('visible');
          document.body.classList.add('has-player');
        }

        if (dockTitle) dockTitle.textContent = track.title;
        if (dockArtist) dockArtist.textContent = track.artist;
        if (dockCover) {
          dockCover.src = track.cover || DEFAULT_NEU_COVER;
          dockCover.onerror = () => { dockCover.src = DEFAULT_NEU_COVER; };
        }

        const initialAudio = track.fullStreamUrl || track.preview;
        if (dockDownloadBtn) {
          if (initialAudio) {
            dockDownloadBtn.href = '/api/download?url=' + encodeURIComponent(initialAudio) + '&name=' + encodeURIComponent(track.artist + ' - ' + track.title);
          } else {
            dockDownloadBtn.href = '/api/download?artist=' + encodeURIComponent(track.artist) + '&title=' + encodeURIComponent(track.title) + '&name=' + encodeURIComponent(track.artist + ' - ' + track.title);
          }
          dockDownloadBtn.style.display = 'inline-flex';
        }

        updateFullPlayerDetails();
        if (!initialAudio) return;

        audioEngine.src = initialAudio;

        const targetPos = Math.max(0, parseFloat(session.currentTime) || 0);
        const estDuration = parseFloat(session.duration) || track.duration || 30;

        if (estDuration > 0 && progressFill) {
          const pct = Math.min(100, Math.max(0, (targetPos / estDuration) * 100));
          progressFill.style.width = `${pct}%`;
          if (progressThumb) progressThumb.style.left = `${pct}%`;
          const fullFill = document.getElementById('fullProgressFill');
          const fullThumb = document.getElementById('fullProgressThumb');
          if (fullFill) fullFill.style.width = `${pct}%`;
          if (fullThumb) fullThumb.style.left = `${pct}%`;
        }

        let hasRestoredTime = false;
        const applySavedPosition = () => {
          if (hasRestoredTime) return;
          try {
            if (targetPos > 0) {
              audioEngine.currentTime = targetPos;
              hasRestoredTime = true;
            }
          } catch(e) {}
        };

        audioEngine.addEventListener('loadedmetadata', applySavedPosition, { once: true });
        audioEngine.addEventListener('canplay', applySavedPosition, { once: true });

        // Lanjutkan putar bila status sebelum refresh sedang berputar
        if (session.isPlaying) {
          state.isPlaying = true;
          updatePlayerUI();

          const resumePromise = audioEngine.play();
          if (resumePromise !== undefined) {
            resumePromise.then(() => {
              state.isPlaying = true;
              updatePlayerUI();
              if (targetPos > 0 && Math.abs(audioEngine.currentTime - targetPos) > 1) {
                try { audioEngine.currentTime = targetPos; } catch(e) {}
              }
            }).catch(err => {
              // Jika browser membatasi autoplay reload tanpa user gesture baru:
              const gestureResume = () => {
                applySavedPosition();
                audioEngine.play().then(() => {
                  state.isPlaying = true;
                  updatePlayerUI();
                }).catch(() => {});
                ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => {
                  window.removeEventListener(evt, gestureResume, true);
                });
              };
              ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => {
                window.addEventListener(evt, gestureResume, { once: true, capture: true });
              });
            });
          }
        } else {
          state.isPlaying = false;
          updatePlayerUI();
        }

        // Latar belakang: upgrade stream 320kbps jika belum ada
        if (!track.fullStreamUrl) {
          fetch('/api/stream?artist=' + encodeURIComponent(track.artist) + '&title=' + encodeURIComponent(track.title))
            .then(r => r.json())
            .then(streamData => {
              if (streamData.found && streamData.streamUrl && state.currentTrack && (state.currentTrack.id === track.id || state.currentTrack.title === track.title)) {
                state.currentTrack.fullStreamUrl = streamData.streamUrl;
                track.fullStreamUrl = streamData.streamUrl;
                if (dockDownloadBtn) {
                  dockDownloadBtn.href = '/api/download?url=' + encodeURIComponent(streamData.streamUrl) + '&name=' + encodeURIComponent(track.artist + ' - ' + track.title);
                }
                if (fullPlayerQualityBadge) fullPlayerQualityBadge.textContent = '320 KBPS HI-FI';
                savePlaybackSession();
              }
            }).catch(() => {});
        }
      } catch (e) {
        console.warn('Session restore error:', e);
      }
    }

    // Audio Engine Listeners
    const setPlayerBuffering = (isBuffering) => {
      const playerDock = document.getElementById('playerDock');
      if (playerDock) {
        playerDock.classList.toggle('is-buffering', isBuffering);
      }
    };

    audioEngine.addEventListener('waiting', () => setPlayerBuffering(true));
    audioEngine.addEventListener('loadstart', () => setPlayerBuffering(true));
    audioEngine.addEventListener('canplay', () => setPlayerBuffering(false));
    audioEngine.addEventListener('playing', () => setPlayerBuffering(false));
    audioEngine.addEventListener('error', () => setPlayerBuffering(false));

    audioEngine.addEventListener('play', () => {
      state.isPlaying = true;
      setPlayerBuffering(false);
      updatePlayerUI();
      savePlaybackSession();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      if (state.activePlayerTab === 'lyrics') {
        startLyricsRafLoop();
      }
      if (state.currentCategory === 'album-detail') {
        updateAlbumTrackListView();
      } else {
        renderTracks();
      }
    });

    audioEngine.addEventListener('pause', () => {
      state.isPlaying = false;
      setPlayerBuffering(false);
      updatePlayerUI();
      savePlaybackSession();
      stopLyricsRafLoop();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      if (state.currentCategory === 'album-detail') {
        updateAlbumTrackListView();
      } else {
        renderTracks();
      }
    });

    // Realtime Scrubber (Geser / Drag Durasi Realtime)
    let isScrubbing = false;

    function handleScrub(e) {
      if (!audioEngine.duration) return 0;
      const rect = progressBar.getBoundingClientRect();
      const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetSec = pct * audioEngine.duration;
      
      progressFill.style.width = `${pct * 100}%`;
      if (progressThumb) progressThumb.style.left = `${pct * 100}%`;
      currentTimeText.textContent = formatTime(targetSec);
      return pct;
    }

    progressBar.addEventListener('pointerdown', (e) => {
      if (!audioEngine.duration) return;
      isScrubbing = true;
      progressBar.classList.add('is-dragging');
      try { progressBar.setPointerCapture(e.pointerId); } catch(err) {}
      handleScrub(e);
    });

    progressBar.addEventListener('pointermove', (e) => {
      if (!isScrubbing) return;
      handleScrub(e);
    });

    progressBar.addEventListener('pointerup', (e) => {
      if (!isScrubbing) return;
      const pct = handleScrub(e);
      if (typeof pct === 'number' && !isNaN(pct) && audioEngine.duration) {
        audioEngine.currentTime = pct * audioEngine.duration;
      }
      isScrubbing = false;
      progressBar.classList.remove('is-dragging');
      try { progressBar.releasePointerCapture(e.pointerId); } catch(err) {}
    });

    progressBar.addEventListener('pointercancel', () => {
      isScrubbing = false;
      progressBar.classList.remove('is-dragging');
    });

    audioEngine.addEventListener('timeupdate', () => {
      if (!audioEngine.duration) return;
      const progress = (audioEngine.currentTime / audioEngine.duration) * 100;
      const curFormatted = formatTime(audioEngine.currentTime);
      const durFormatted = formatTime(audioEngine.duration);

      if (!isScrubbing) {
        progressFill.style.width = `${progress}%`;
        if (progressThumb) progressThumb.style.left = `${progress}%`;
        currentTimeText.textContent = curFormatted;
        totalDurationText.textContent = durFormatted;
      }

      if (!isFullScrubbing) {
        const fullFill = document.getElementById('fullProgressFill');
        const fullThumb = document.getElementById('fullProgressThumb');
        const fullCur = document.getElementById('fullCurrentTime');
        const fullDur = document.getElementById('fullTotalDuration');
        if (fullFill) fullFill.style.width = `${progress}%`;
        if (fullThumb) fullThumb.style.left = `${progress}%`;
        if (fullCur) fullCur.textContent = curFormatted;
        if (fullDur) fullDur.textContent = durFormatted;
      }

      // Sinkronisasi Lirik Karaoke Real-Time
      syncKaraokeLyrics(audioEngine.currentTime);

      // Sinkronisasi status posisi MediaSession OS
      updateMediaSessionPosition();

      throttleSaveSession();
    });

    audioEngine.addEventListener('ended', () => {
      // 1. Cek Sleep Timer: Selesai Lagu Ini
      if (state.sleepOnTrackEnd) {
        state.sleepOnTrackEnd = false;
        audioEngine.pause();
        const timerLbl = document.getElementById('timerStatusLabel');
        if (timerLbl) timerLbl.textContent = 'SLEEP TIMER';
        document.querySelectorAll('.timer-option-btn').forEach(b => {
          b.classList.toggle('active', b.id === 'timer-0');
        });
        clearPlaybackSession();
        return;
      }

      // 2. Mode Repeat One: ulangi lagu yang sama
      if (state.repeatMode === 'one') {
        audioEngine.currentTime = 0;
        audioEngine.play().catch(() => {});
        return;
      }

      // 3. Mode Repeat All: loop seluruh daftar lagu
      if (state.repeatMode === 'all') {
        clearPlaybackSession();
        playNextTrack(true);
        return;
      }

      // 4. Mode Normal / Shuffle
      if (state.isShuffle || state.currentIndex + 1 < state.tracks.length) {
        clearPlaybackSession();
        playNextTrack();
      } else {
        audioEngine.pause();
        audioEngine.currentTime = 0;
        state.isPlaying = false;
        updatePlayerUI();
        clearPlaybackSession();
      }
    });

    window.addEventListener('beforeunload', () => {
      savePlaybackSession();
    });

    window.addEventListener('pagehide', () => {
      savePlaybackSession();
    });

    // Controls
    mainPlayBtn.addEventListener('click', () => {
      togglePlayPause();
    });

    prevBtn.addEventListener('click', () => {
      playPrevTrack();
    });

    nextBtn.addEventListener('click', () => {
      playNextTrack();
    });

    // Close / Dismiss Player Dock
    const closeDockBtn = document.getElementById('closeDockBtn');
    if (closeDockBtn) {
      closeDockBtn.addEventListener('click', (e) => {
        if (e) e.stopPropagation();
        closeFullPlayer();
        clearPlaybackSession();
        audioEngine.pause();
        audioEngine.removeAttribute('src');
        state.isPlaying = false;
        state.currentTrack = null;
        const playerDock = document.getElementById('playerDock');
        playerDock.classList.remove('visible');
        playerDock.style.display = 'none';
        document.body.classList.remove('has-player');
        updatePlayerUI();
        
        // Hapus status is-playing langsung tanpa reflow layout massal
        document.querySelectorAll('.song-card.is-playing').forEach(c => {
          c.classList.remove('is-playing');
          const btn = c.querySelector('.card-actions button');
          if (btn) {
            btn.textContent = '▶ PUTAR';
            btn.className = 'tactile-btn play-btn-primary';
          }
        });
      });
    }

    // Filter Buttons
    filterTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.neu-tab-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      document.querySelectorAll('.neu-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      btn.blur(); // Remove focus to prevent mobile browser auto-centering viewport horizontally

      const cat = btn.dataset.cat;
      if (cat === 'loved') {
        openLovedView();
      } else {
        if (categoryHeading) categoryHeading.textContent = btn.textContent.trim().toUpperCase();
        loadTracks(cat);
      }

      // Smooth scroll ONLY the filterTabs container horizontally, NEVER the window!
      try {
        const tabLeft = btn.offsetLeft;
        const tabWidth = btn.offsetWidth;
        const containerWidth = filterTabs.clientWidth;
        filterTabs.scrollTo({
          left: Math.max(0, tabLeft - (containerWidth / 2) + (tabWidth / 2)),
          behavior: 'smooth'
        });
      } catch (err) {}

      // Hard-lock window scrollX to 0
      if (window.scrollX !== 0 || window.pageXOffset !== 0) {
        window.scrollTo(0, window.scrollY);
      }
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    });

    // Realtime Search Handlers
    let searchDebounceTimer = null;
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearTimeout(searchDebounceTimer);
      if (val.length >= 2) {
        searchDebounceTimer = setTimeout(() => {
          runSearch(val);
        }, 380);
      } else if (val.length === 0) {
        loadTracks(state.currentCategory);
      }
    });

    searchBtn.addEventListener('click', (e) => {
      if (e) e.preventDefault();
      clearTimeout(searchDebounceTimer);
      runSearch(searchInput.value);
      searchInput.blur();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchDebounceTimer);
        runSearch(searchInput.value);
        searchInput.blur();
      }
    });

    // Global Mobile Viewport Guard: Auto-close dropdown on scroll smoothly without canceling kinetic touch
    let isScrollChecking = false;
    window.addEventListener('scroll', () => {
      if (!isScrollChecking) {
        isScrollChecking = true;
        requestAnimationFrame(() => {
          const openDropdown = document.querySelector('.neu-dropdown-menu.show');
          if (openDropdown) {
            openDropdown.classList.remove('show');
            document.querySelectorAll('.song-card.has-dropdown-open').forEach(c => c.classList.remove('has-dropdown-open'));
          }
          isScrollChecking = false;
        });
      }
    }, { passive: true });

    window.addEventListener('resize', () => {
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    }, { passive: true });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        document.documentElement.scrollLeft = 0;
        document.body.scrollLeft = 0;
      }, 100);
    });

    // YouTube Modal Function
    window.openYouTubeModalByIndex = function(idx) {
      if (idx < 0 || idx >= state.tracks.length) return;
      const track = state.tracks[idx];
      window.openYouTubeModal(track.artist + ' ' + track.title, track.title);
    };

    // ── YouTube video ID lookup (Server-first direct search → Invidious fallback) ──
    const ytIdCache = {};
    const INVIDIOUS_INSTANCES = [
      'https://inv.nadeko.net',
      'https://invidious.privacyredirect.com',
      'https://yewtu.be',
      'https://iv.datura.network',
      'https://invidious.fdn.fr',
      'https://yt.artemislena.eu'
    ];

    async function getYtVideoId(query) {
      if (ytIdCache[query]) return ytIdCache[query];

      // Layer 1: Server-side Direct YouTube Engine (Super Cepat, Akurat, Tanpa Delay)
      try {
        const r = await fetch(`/api/yt-search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(6000) });
        if (r.ok) {
          const d = await r.json();
          if (d.videoId) {
            ytIdCache[query] = d.videoId;
            return d.videoId;
          }
        }
      } catch (e) {
        console.warn('Server yt-search error, falling back to Invidious:', e.message);
      }

      // Layer 2: Client-side Invidious Fallback jika server terhalang
      for (const inst of INVIDIOUS_INSTANCES) {
        try {
          const r = await fetch(
            `${inst}/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title&page=1`,
            { signal: AbortSignal.timeout(3000) }
          );
          if (!r.ok) continue;
          const data = await r.json();
          if (Array.isArray(data) && data[0]?.videoId) {
            ytIdCache[query] = data[0].videoId;
            return data[0].videoId;
          }
        } catch { continue; }
      }

      return null;
    }


    window.openYouTubeModal = async function(query, title) {
      const rawQuery = decodeURIComponent(String(query));
      const rawTitle = decodeURIComponent(String(title));

      modalSongTitle.textContent = rawTitle;
      videoFrameContainer.innerHTML = `
        <div class="skeleton-pulse-neu" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: var(--bg-surface); border-radius: 16px; box-sizing: border-box;">
          <div class="skeleton-shimmer-box" style="width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: var(--neu-extruded-sm);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--color-primary)" style="opacity: 0.6; margin-left: 2px;">
              <polygon points="6 3 20 12 6 21 6 3"></polygon>
            </svg>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; width: 65%;">
            <div class="skeleton-shimmer-box" style="width: 80%; height: 16px; border-radius: 6px;"></div>
            <div class="skeleton-shimmer-box" style="width: 48%; height: 12px; border-radius: 4px;"></div>
          </div>
        </div>`;

      // Kunci scroll background belakang sepenuhnya
      videoModal.classList.add('open');
      document.body.classList.add('modal-open');
      document.documentElement.classList.add('modal-open');
      audioEngine.pause();

      const videoId = await getYtVideoId(rawQuery) || await getYtVideoId(`${rawQuery} official mv`) || await getYtVideoId(`${rawQuery} official audio`);

      const embedSrc = videoId
        ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1&enablejsapi=1`
        : `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(rawQuery)}&autoplay=1`;

      const ytDirectLink = document.getElementById('modalYtDirectLink');
      if (ytDirectLink) {
        ytDirectLink.href = videoId ? `https://www.youtube.com/watch?v=${videoId}` : `https://www.youtube.com/results?search_query=${encodeURIComponent(rawQuery)}`;
      }

      const modalPlayAudioBtn = document.getElementById('modalPlayAudioBtn');
      if (modalPlayAudioBtn) {
        modalPlayAudioBtn.onclick = () => {
          window.closeYouTubeModal();
          const foundIdx = state.tracks.findIndex(t => 
            t.title.toLowerCase() === rawTitle.toLowerCase() ||
            (rawQuery.toLowerCase().includes(t.title.toLowerCase()) && rawQuery.toLowerCase().includes(t.artist.toLowerCase()))
          );
          if (foundIdx !== -1) {
            playTrackByIndex(foundIdx);
          } else if (state.currentTrack) {
            if (!state.isPlaying) togglePlayPause();
          }
        };
      }

      videoFrameContainer.innerHTML = `
        <iframe
          src="${embedSrc}"
          title="YouTube Music Player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen>
        </iframe>`;
    };

    window.closeYouTubeModal = function() {
      if (!videoModal) return;
      videoModal.classList.remove('open');
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      videoFrameContainer.innerHTML = '';
    };

    modalCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.closeYouTubeModal();
    });

    // Proteksi Modal: Layar melayang YouTube TIDAK BISA ditutup jika mengklik area luar/backdrop.
    // Modal HANYA keluar jika menekan tombol [X].
    videoModal.addEventListener('click', (e) => {
      if (e.target === videoModal) {
        e.preventDefault();
        e.stopPropagation();
        // Berikan feedback taktil pada tombol X agar pengguna tahu tombol keluar
        if (modalCloseBtn) {
          modalCloseBtn.style.transform = 'scale(1.2)';
          modalCloseBtn.style.color = '#FF2157';
          modalCloseBtn.style.boxShadow = '0 0 14px rgba(255, 33, 87, 0.6)';
          setTimeout(() => {
            modalCloseBtn.style.transform = '';
            modalCloseBtn.style.color = '';
            modalCloseBtn.style.boxShadow = '';
          }, 350);
        }
      }
    });

    // Mencegah scroll / swipe tembus ke background saat touch pada area backdrop
    videoModal.addEventListener('touchmove', (e) => {
      if (e.target === videoModal) {
        e.preventDefault();
      }
    }, { passive: false });

    // ── Trending Banner ──
    const bannerStrip = document.getElementById('bannerStrip');
    const bannerDots  = document.getElementById('bannerDots');

    let bannerSlides    = [];
    let bannerCurrent   = 0;
    let bannerTimer     = null;
    const BANNER_COUNT  = 8;
    const BANNER_DELAY  = 5000;

    const BADGE_MAP = {
      'TikTok':    'TikTok Viral',
      'Spotify':   'Spotify Top',
      'Billboard': 'Billboard',
      'UK Official': 'UK Charts',
      'K-Pop':     'K-Pop Radar',
      'J-Pop':     'Oricon',
      'Global':    'Global Viral',
      'Indo Hits': 'Indo Top',
      'Fresh Hits': 'Rilis Baru'
    };

     function initBanner(tracks) {
      clearInterval(bannerTimer);
      bannerSlides = tracks.slice(0, BANNER_COUNT);
      if (!bannerSlides.length) return;
      bannerCurrent = 0;

      bannerStrip.innerHTML = bannerSlides.map((t, i) => {
        const badge = BADGE_MAP[t.origin] || t.origin;
        const cover = t.cover || DEFAULT_NEU_COVER;
        const trackIdx = state.tracks.findIndex(x => x.id === t.id);
        return `
          <div class="banner-slide" data-idx="${i}">
            <div class="banner-cover-wrap">
              <img src="${cover}" alt="${escapeHtml(t.title)}" class="banner-cover-img" draggable="false" oncontextmenu="return false;" loading="eager" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=DEFAULT_NEU_COVER;">
            </div>
            <div class="banner-info">
              <div class="banner-top-badges">
                <span class="banner-rank">TRENDING</span>
                <span class="banner-badge">${badge}</span>
              </div>
              <div class="banner-song-title">${escapeHtml(t.title)}</div>
              <div class="banner-artist">${escapeHtml(t.artist)}</div>
              <button class="banner-play-btn" onclick="playTrackByIndex(${trackIdx})">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                PUTAR
              </button>
            </div>
          </div>`;
      }).join('');

      // Build dots
      bannerDots.innerHTML = bannerSlides.map((_, i) =>
        `<button class="banner-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Slide ${i+1}"></button>`
      ).join('');

      bannerDots.querySelectorAll('.banner-dot').forEach(d => {
        d.addEventListener('click', () => goToSlide(+d.dataset.i, true));
      });

      goToSlide(0, false);
      startBannerAutoplay();
    }


    function goToSlide(idx, resetTimer) {
      bannerCurrent = (idx + bannerSlides.length) % bannerSlides.length;
      bannerStrip.style.transform = `translateX(-${bannerCurrent * 100}%)`;
      bannerDots.querySelectorAll('.banner-dot').forEach((d, i) => {
        d.classList.toggle('active', i === bannerCurrent);
      });
      if (resetTimer) {
        clearInterval(bannerTimer);
        startBannerAutoplay();
      }
    }

    function startBannerAutoplay() {
      bannerTimer = setInterval(() => goToSlide(bannerCurrent + 1, false), BANNER_DELAY);
    }

    // Pause on hover
    document.getElementById('trendingBanner').addEventListener('mouseenter', () => clearInterval(bannerTimer));
    document.getElementById('trendingBanner').addEventListener('mouseleave', startBannerAutoplay);


    // Touch/swipe support with smart vertical gesture recognition
    let touchStartX = 0;
    let touchStartY = 0;
    const trendingBannerEl = document.getElementById('trendingBanner');
    if (trendingBannerEl) {
      trendingBannerEl.addEventListener('touchstart', e => {
        if (!e.touches || !e.touches[0]) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      trendingBannerEl.addEventListener('touchend', e => {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        const diffX = touchStartX - e.changedTouches[0].clientX;
        const diffY = touchStartY - e.changedTouches[0].clientY;
        // Hanya swipe banner jika gerakan jelas horizontal (>45px dan lebih dominan dari vertikal)
        if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.35) {
          goToSlide(bannerCurrent + (diffX > 0 ? 1 : -1), true);
        }
      }, { passive: true });
    }


    // Keydown listener untuk ESC (Tutup modal album, video, equalizer, sleep timer)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (typeof closeAlbumModal === 'function') closeAlbumModal();
        if (typeof window.closeYouTubeModal === 'function') window.closeYouTubeModal();
        if (typeof window.closeEqualizerModal === 'function') window.closeEqualizerModal();
        if (typeof window.closeSleepTimerModal === 'function') window.closeSleepTimerModal();
      }
    });

    // Backdrop click handlers untuk menutup modal saat klik di area luar kotak
    const eqModalEl = document.getElementById('eqModal');
    if (eqModalEl) {
      eqModalEl.addEventListener('click', (e) => {
        if (e.target === eqModalEl) window.closeEqualizerModal();
      });
    }

    const sleepTimerModalEl = document.getElementById('sleepTimerModal');
    if (sleepTimerModalEl) {
      sleepTimerModalEl.addEventListener('click', (e) => {
        if (e.target === sleepTimerModalEl) window.closeSleepTimerModal();
      });
    }

    // ── Proteksi Gambar Komprehensif: Cegah Klik Kanan / Tahan Lama (Long-Press Download), Drag & Drop, dan Salin Gambar ──
    function isImageTarget(t) {
      return t && (
        t.tagName === 'IMG' ||
        (typeof t.closest === 'function' && t.closest('img, .cover-img, .history-cover, .banner-cover-img, .dock-cover, .album-cover-img, .full-player-cover, .album-hero-cover'))
      );
    }

    document.addEventListener('contextmenu', (e) => {
      if (isImageTarget(e.target)) {
        e.preventDefault();
        return false;
      }
    }, { capture: true });

    document.addEventListener('dragstart', (e) => {
      if (isImageTarget(e.target)) {
        e.preventDefault();
        return false;
      }
    }, { capture: true });

    document.addEventListener('copy', (e) => {
      if (isImageTarget(e.target)) {
        e.preventDefault();
        return false;
      }
    }, { capture: true });

    // ── SpotiFlyer Integration Hooks ──
    window.playTrackDirectly = function(track) {
      if (!track) return;
      const existingIdx = state.tracks.findIndex(t => t.id === track.id || (t.title === track.title && t.artist === track.artist));
      if (existingIdx !== -1) {
        window.playTrackByIndex(existingIdx);
      } else {
        state.tracks.unshift(track);
        renderTracks();
        window.playTrackByIndex(0);
      }
    };

    window.setPlaylistAndPlay = function(trackList) {
      if (!trackList || trackList.length === 0) return;
      state.tracks = trackList;
      renderTracks();
      window.playTrackByIndex(0);
    };

    // Init: muat history, loved tracks, dan pulihkan sesi pemutaran audio
    loadLovedTracks();
    loadHistory();
    restorePlaybackSession();

    if (window.INITIAL_TRACKS && Array.isArray(window.INITIAL_TRACKS) && window.INITIAL_TRACKS.length > 0) {
      state.tracks = window.INITIAL_TRACKS;
      renderTracks();
      initBanner(window.INITIAL_TRACKS);
      if (trackCountBadge) trackCountBadge.textContent = `${state.tracks.length} Tracks`;
      if (syncTime) syncTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      loadTracks('global');
    }