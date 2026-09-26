// ── Pusat Unduhan Musik (Full-Page Client Module & Realtime Download History) ──
import { API } from './api.js';

const STORAGE_KEY = 'playmusic_download_history_v1';
let currentResolvedData = null;
let isDownloadingBatch = false;

// ── Realtime Download History Manager ──
export const DownloadHistory = {
  items: [],

  init() {
    this.load();
    this.render();
  },

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.items = JSON.parse(raw);
        if (!Array.isArray(this.items)) this.items = [];
      } else {
        this.items = [];
      }
    } catch {
      this.items = [];
    }
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch {}
  },

  add(track) {
    if (!track || !track.title) return;
    const existingIdx = this.items.findIndex(it => it.id === track.id || (it.title === track.title && it.artist === track.artist));
    if (existingIdx !== -1) {
      this.items.splice(existingIdx, 1);
    }
    const newItem = {
      id: track.id || `dl-${Date.now()}`,
      title: track.title,
      artist: track.artist || 'Artis',
      album: track.album || 'Single',
      cover: track.cover || '/favicon.svg',
      fullStreamUrl: track.fullStreamUrl || track.preview || '',
      provider: track.origin || track.provider || 'Universal',
      timestamp: Date.now()
    };
    this.items.unshift(newItem);
    if (this.items.length > 50) this.items = this.items.slice(0, 50);
    this.save();
    this.render();
  },

  remove(id) {
    this.items = this.items.filter(it => it.id !== id);
    this.save();
    this.render();
    window.showToast?.('Item riwayat unduhan dihapus.', 'info', 'download');
  },

  clear() {
    if (this.items.length === 0) return;
    if (confirm('Yakin ingin membersihkan semua riwayat unduhan musik?')) {
      this.items = [];
      this.save();
      this.render();
      window.showToast?.('Riwayat unduhan berhasil dibersihkan.', 'success', 'download');
    }
  },

  formatTimeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    return `${Math.floor(diff / 86400)} hari lalu`;
  },

  render() {
    const listEl = document.getElementById('downloadHistoryList');
    const badgeEl = document.getElementById('downloadHistoryCountBadge');
    if (badgeEl) badgeEl.textContent = `${this.items.length} Lagu`;

    if (!listEl) return;

    if (this.items.length === 0) {
      listEl.innerHTML = `
        <div class="download-history-empty">
          <div class="download-history-empty-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>
          <div>Belum ada riwayat unduhan musik.</div>
          <div style="font-size:0.75rem; margin-top:4px; opacity:0.8;">Lagu yang Anda unduh akan tercatat otomatis di sini.</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.items.map(item => {
      const timeText = this.formatTimeAgo(item.timestamp);
      const dlUrl = API.getDownloadUrl(item.fullStreamUrl, item.artist, item.title, `${item.artist} - ${item.title}`);
      return `
        <div class="download-history-item" id="dl-hist-${item.id}">
          <div class="download-history-item-left">
            <img src="${item.cover || '/favicon.svg'}" alt="Cover" class="download-history-cover" onerror="this.src='/favicon.svg';">
            <div class="download-history-meta">
              <div class="download-history-track-title">${item.title}</div>
              <div class="download-history-track-sub">
                <span class="download-history-track-tag">${item.provider}</span>
                <span>${item.artist} • ${timeText}</span>
              </div>
            </div>
          </div>
          <div class="download-history-item-actions">
            <button type="button" class="download-icon-action-btn" title="Putar Lagu Ini" onclick="window.playHistoryItem('${item.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </button>
            <a href="${dlUrl}" download class="download-icon-action-btn" title="Unduh Ulang" onclick="window.recordHistoryRedownload('${item.id}')" style="text-decoration:none;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </a>
            <button type="button" class="download-icon-action-btn" title="Hapus Dari Riwayat" onclick="window.deleteHistoryItem('${item.id}')" style="color:var(--color-danger);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
};

// ── Full-Page Download Center Controller ──
export const DownloadCenter = {
  viewContainer: null,
  input: null,
  submitBtn: null,
  resultCard: null,
  metaTitle: null,
  metaArtist: null,
  metaBadge: null,
  coverImg: null,
  actionsRow: null,
  tracklistContainer: null,
  progressBarWrap: null,
  progressBar: null,

  init() {
    this.viewContainer = document.getElementById('downloadViewContainer');
    this.input = document.getElementById('downloadMainInput');
    this.submitBtn = document.getElementById('downloadSubmitBtn');
    this.resultCard = document.getElementById('downloadResultCard');
    this.metaTitle = document.getElementById('downloadResultTitle');
    this.metaArtist = document.getElementById('downloadResultArtist');
    this.metaBadge = document.getElementById('downloadResultBadge');
    this.coverImg = document.getElementById('downloadResultCover');
    this.actionsRow = document.getElementById('downloadActionsRow');
    this.tracklistContainer = document.getElementById('downloadTracklistContainer');
    this.progressBarWrap = document.getElementById('downloadProgressWrap');
    this.progressBar = document.getElementById('downloadProgressBar');

    if (this.submitBtn) {
      this.submitBtn.addEventListener('click', () => this.analyzeCurrentInput());
    }

    if (this.input) {
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.analyzeCurrentInput();
        }
      });
    }

    // Platform selector chips
    const chips = document.querySelectorAll('.download-platform-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const p = chip.dataset.platform;
        this.setPlatformPlaceholder(p);
      });
    });

    DownloadHistory.init();
  },

  setPlatformPlaceholder(platform) {
    if (!this.input) return;
    const map = {
      spotify: 'Tempel link Spotify (Lagu, Album, atau Playlist)...',
      youtube: 'Tempel link YouTube atau YouTube Music...',
      saavn: 'Tempel link JioSaavn 320kbps...',
      soundcloud: 'Tempel link SoundCloud...',
      gaana: 'Tempel link Gaana...'
    };
    this.input.placeholder = map[platform] || 'Tempel link musik apa saja...';
  },

  open(prefillUrl = '') {
    if (window.toggleSettingsMenu) window.toggleSettingsMenu(false);
    if (!this.viewContainer) this.init();

    // Sembunyikan Tombol Unduh Musik di Header saat sudah masuk ke dalam
    const headerDownloadBtn = document.getElementById('headerDownloadBtn');
    if (headerDownloadBtn) headerDownloadBtn.style.display = 'none';

    // 1. Sembunyikan Dashboard Utama
    const banner = document.getElementById('trendingBanner');
    if (banner) banner.style.display = 'none';

    const historySection = document.getElementById('historySection');
    if (historySection) historySection.style.display = 'none';

    const controls = document.querySelector('.controls-wrapper');
    if (controls) controls.style.display = 'none';

    const sectionMeta = document.querySelector('.section-meta');
    if (sectionMeta) sectionMeta.style.display = 'none';

    const grid = document.getElementById('tracksGrid');
    if (grid) grid.style.display = 'none';

    const lovedBar = document.getElementById('lovedPageBar');
    if (lovedBar) lovedBar.style.display = 'none';

    // 2. Tampilkan Halaman Penuh Unduhan
    if (this.viewContainer) {
      this.viewContainer.style.display = 'block';
    }

    // 3. Render Riwayat Unduhan Realtime
    DownloadHistory.render();

    // 4. Scroll ke Atas secara instan agar tidak terpotong
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (prefillUrl && this.input) {
      this.input.value = prefillUrl;
      this.analyzeCurrentInput();
    } else if (this.input) {
      setTimeout(() => this.input.focus(), 150);
    }
  },

  exit() {
    // 1. Sembunyikan Halaman Unduhan
    if (this.viewContainer) {
      this.viewContainer.style.display = 'none';
    }

    // 2. Tampilkan kembali Tombol Unduh Musik di Header
    const headerDownloadBtn = document.getElementById('headerDownloadBtn');
    if (headerDownloadBtn) headerDownloadBtn.style.display = 'inline-flex';

    // 3. Tampilkan kembali Dashboard Utama
    const banner = document.getElementById('trendingBanner');
    if (banner) banner.style.display = 'block';

    const historySection = document.getElementById('historySection');
    if (historySection) historySection.style.display = 'block';

    const controls = document.querySelector('.controls-wrapper');
    if (controls) controls.style.display = 'flex';

    const sectionMeta = document.querySelector('.section-meta');
    if (sectionMeta) sectionMeta.style.display = 'flex';

    const grid = document.getElementById('tracksGrid');
    if (grid) grid.style.display = 'grid';

    // 4. Reset Active Tab ke 'global'
    document.querySelectorAll('.neu-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === 'global');
    });

    if (window.loadTracks) {
      window.loadTracks('global');
    }

    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  },

  async pasteAndAnalyze() {
    if (window.Settings && window.Settings.triggerHaptic) {
      window.Settings.triggerHaptic();
    }
    if (!this.input) this.input = document.getElementById('downloadMainInput');

    let text = '';
    // Prioritaskan clipboard native Android dari jembatan Java
    if (window.AndroidApp && typeof window.AndroidApp.getClipboardText === 'function') {
      try {
        text = window.AndroidApp.getClipboardText();
      } catch (e) {
        console.warn('AndroidApp clipboard error:', e);
      }
    }

    if (!text && navigator.clipboard && navigator.clipboard.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (e) {
        console.warn('Navigator clipboard error:', e);
      }
    }

    if (text && text.trim()) {
      if (!this.input) this.input = document.getElementById('downloadMainInput');
      if (this.input) {
        this.input.value = text.trim();
        this.input.focus();
      }
      window.showToast?.('Link musik berhasil ditempel dari papan klip!', 'success', 'download');
      this.analyzeCurrentInput();
    } else {
      if (!this.input) this.input = document.getElementById('downloadMainInput');
      if (this.input) {
        this.input.focus();
        this.input.select?.();
      }
      window.showToast?.('Papan klip kosong. Silakan ketik atau tempel link musik pada kolom input.', 'info', 'download');
    }
  },

  async analyzeCurrentInput() {
    const url = (this.input?.value || '').trim();
    if (!url) {
      window.showToast?.('Silakan masukkan atau tempel link musik terlebih dahulu!', 'warning', 'download');
      return;
    }

    if (this.submitBtn) {
      this.submitBtn.disabled = true;
      this.submitBtn.innerHTML = `
        <svg class="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25" stroke="currentColor"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path>
        </svg> Menganalisa...
      `;
    }

    try {
      const data = await API.resolveLink(url);
      currentResolvedData = data;
      this.renderResults(data);
      window.showToast?.(`Berhasil memuat ${data.count || 1} lagu dari ${data.provider?.toUpperCase()}!`, 'success', 'download');
    } catch (err) {
      console.error('Download resolve error:', err);
      window.showToast?.(err.message || 'Gagal mengambil audio dari link tersebut.', 'danger', 'download');
      if (this.resultCard) this.resultCard.classList.remove('active');
    } finally {
      if (this.submitBtn) {
        this.submitBtn.disabled = false;
        this.submitBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg> Analisa & Ambil Lagu
        `;
      }
    }
  },

  renderResults(data) {
    if (!this.resultCard) return;

    this.resultCard.classList.add('active');

    const tracks = data.data || [];
    const isSingle = data.importType === 'track' || tracks.length <= 1;
    const firstTrack = tracks[0] || {};

    if (this.metaTitle) {
      this.metaTitle.textContent = data.title || firstTrack.title || 'Musik';
    }
    if (this.metaArtist) {
      this.metaArtist.textContent = data.subtitle || firstTrack.artist || 'Artis';
    }
    if (this.metaBadge) {
      this.metaBadge.textContent = `${(data.provider || 'Audio').toUpperCase()} • ${data.importType?.toUpperCase()} (${tracks.length} Lagu)`;
    }
    if (this.coverImg) {
      this.coverImg.src = data.cover || firstTrack.cover || '/favicon.svg';
    }

    // Actions
    if (this.actionsRow) {
      if (isSingle) {
        const dlUrl = API.getDownloadUrl(firstTrack.fullStreamUrl || firstTrack.preview, firstTrack.artist, firstTrack.title, `${firstTrack.artist} - ${firstTrack.title}`);
        this.actionsRow.innerHTML = `
          <button type="button" class="download-action-btn primary" onclick="window.playDownloadTrack(0)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Putar Lagu Ini
          </button>
          <a href="${dlUrl}" download class="download-action-btn" onclick="window.recordSingleDownload(0)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Unduh Audio (320kbps MP3)
          </a>
        `;
      } else {
        this.actionsRow.innerHTML = `
          <button type="button" class="download-action-btn primary" onclick="window.playAllDownloadTracks()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Putar Semua Lagu
          </button>
          <button type="button" class="download-action-btn" onclick="window.downloadBatchAll()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Unduh Semua (${tracks.length} Lagu Sekaligus)
          </button>
        `;
      }
    }

    // Tracklist
    if (this.tracklistContainer) {
      if (tracks.length === 0) {
        this.tracklistContainer.innerHTML = '<div style="font-size:13px; color:var(--color-text-muted); text-align:center; padding:12px;">Tidak ada trek audio ditemukan.</div>';
        return;
      }

      this.tracklistContainer.innerHTML = tracks.map((t, idx) => {
        const dlUrl = API.getDownloadUrl(t.fullStreamUrl || t.preview, t.artist, t.title, `${t.artist} - ${t.title}`);
        return `
          <div class="download-track-item" id="dl-track-row-${idx}">
            <div class="download-track-left">
              <div class="download-track-index">${String(idx + 1).padStart(2, '0')}</div>
              <div class="download-track-meta">
                <div class="download-track-name">${t.title}</div>
                <div class="download-track-sub">${t.artist} • ${t.album || 'Single'}</div>
              </div>
            </div>
            <div class="download-track-actions">
              <button type="button" class="download-icon-action-btn" title="Putar Lagu" onclick="window.playDownloadTrack(${idx})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </button>
              <a href="${dlUrl}" download class="download-icon-action-btn" title="Unduh Lagu Ini" onclick="window.recordSingleDownload(${idx})" style="text-decoration:none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              </a>
            </div>
          </div>
        `;
      }).join('');
    }
  },

  async downloadBatch() {
    if (!currentResolvedData || !currentResolvedData.data || currentResolvedData.data.length === 0) return;
    if (isDownloadingBatch) {
      window.showToast?.('Unduhan batch sedang berjalan...', 'warning', 'download');
      return;
    }

    const tracks = currentResolvedData.data;
    isDownloadingBatch = true;

    if (this.progressBarWrap) this.progressBarWrap.classList.add('active');
    window.showToast?.(`Memulai unduhan ${tracks.length} lagu secara berurutan...`, 'info', 'download');

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const percent = Math.round(((i + 1) / tracks.length) * 100);
      if (this.progressBar) this.progressBar.style.width = `${percent}%`;

      const rowEl = document.getElementById(`dl-track-row-${i}`);
      if (rowEl) rowEl.style.borderLeft = '3px solid var(--color-primary)';

      const dlUrl = API.getDownloadUrl(t.fullStreamUrl || t.preview, t.artist, t.title, `${t.artist} - ${t.title}`);

      // Trigger download
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${t.artist} - ${t.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Record in Realtime History
      DownloadHistory.add(t);

      await new Promise(r => setTimeout(r, 1400));
    }

    isDownloadingBatch = false;
    window.showToast?.(`Selesai mengunduh ${tracks.length} lagu! Tersimpan di riwayat.`, 'success', 'download');

    setTimeout(() => {
      if (this.progressBarWrap) this.progressBarWrap.classList.remove('active');
      if (this.progressBar) this.progressBar.style.width = '0%';
    }, 2000);
  }
};

// ── Global Window Bindings ──
window.openDownloadCenter = (url = '') => DownloadCenter.open(url);
window.exitDownloadCenter = () => DownloadCenter.exit();
window.pasteAndAnalyzeDownload = () => DownloadCenter.pasteAndAnalyze();

window.playDownloadTrack = (idx) => {
  if (!currentResolvedData?.data?.[idx]) return;
  const track = currentResolvedData.data[idx];
  if (window.playTrackDirectly) {
    window.playTrackDirectly(track);
  }
};

window.playAllDownloadTracks = () => {
  if (!currentResolvedData?.data || currentResolvedData.data.length === 0) return;
  if (window.setPlaylistAndPlay) {
    window.setPlaylistAndPlay(currentResolvedData.data);
  }
};

window.recordSingleDownload = (idx) => {
  if (!currentResolvedData?.data?.[idx]) return;
  const track = currentResolvedData.data[idx];
  DownloadHistory.add(track);
  window.showToast?.(`Mengunduh "${track.title}"...`, 'info', 'download');
};

window.downloadBatchAll = () => DownloadCenter.downloadBatch();

window.playHistoryItem = (id) => {
  const item = DownloadHistory.items.find(it => it.id === id);
  if (item && window.playTrackDirectly) {
    window.playTrackDirectly(item);
  }
};

window.recordHistoryRedownload = (id) => {
  const item = DownloadHistory.items.find(it => it.id === id);
  if (item) {
    DownloadHistory.add(item);
    window.showToast?.(`Mengunduh ulang "${item.title}"...`, 'info', 'download');
  }
};

window.deleteHistoryItem = (id) => DownloadHistory.remove(id);
window.clearAllDownloadHistory = () => DownloadHistory.clear();

document.addEventListener('DOMContentLoaded', () => {
  DownloadCenter.init();
});
