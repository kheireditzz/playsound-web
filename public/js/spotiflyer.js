// ── SpotiFlyer Multi-platform Music Downloader Engine (Client) ──
import { API } from './api.js';

let currentResolvedData = null;
let isDownloadingBatch = false;

export const SpotiFlyer = {
  // Modal Elements
  backdrop: null,
  input: null,
  analyzeBtn: null,
  resultCard: null,
  metaTitle: null,
  metaSubtitle: null,
  metaBadge: null,
  albumArt: null,
  tracklist: null,
  batchActions: null,
  progressBarWrap: null,
  progressBarFill: null,

  init() {
    this.backdrop = document.getElementById('spotiflyerModalBackdrop');
    this.input = document.getElementById('spotiflyerInput');
    this.analyzeBtn = document.getElementById('spotiflyerAnalyzeBtn');
    this.resultCard = document.getElementById('spotiflyerResultCard');
    this.metaTitle = document.getElementById('spotiflyerMetaTitle');
    this.metaSubtitle = document.getElementById('spotiflyerMetaSubtitle');
    this.metaBadge = document.getElementById('spotiflyerMetaBadge');
    this.albumArt = document.getElementById('spotiflyerAlbumArt');
    this.tracklist = document.getElementById('spotiflyerTracklist');
    this.batchActions = document.getElementById('spotiflyerBatchActions');
    this.progressBarWrap = document.getElementById('spotiflyerProgressBarWrap');
    this.progressBarFill = document.getElementById('spotiflyerProgressBarFill');

    // Attach listeners
    if (this.analyzeBtn) {
      this.analyzeBtn.addEventListener('click', () => this.analyzeCurrentInput());
    }

    if (this.input) {
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.analyzeCurrentInput();
        }
      });
    }

    // Platform pills
    const pills = document.querySelectorAll('.platform-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const platform = pill.dataset.platform;
        this.setPlatformPlaceholder(platform);
      });
    });
  },

  open(prefillUrl = '') {
    if (!this.backdrop) this.init();
    if (this.backdrop) {
      this.backdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
      if (prefillUrl && this.input) {
        this.input.value = prefillUrl;
        this.analyzeCurrentInput();
      } else if (this.input) {
        this.input.focus();
      }
    }
  },

  close() {
    if (this.backdrop) {
      this.backdrop.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

  setPlatformPlaceholder(platform) {
    if (!this.input) return;
    const placeholders = {
      spotify: 'Tempel link Spotify (Track, Album, atau Playlist)...',
      youtube: 'Tempel link YouTube atau YouTube Music...',
      saavn: 'Tempel link JioSaavn (Lagu atau Album)...',
      soundcloud: 'Tempel link SoundCloud...',
      gaana: 'Tempel link Gaana...'
    };
    this.input.placeholder = placeholders[platform] || 'Tempel link musik apa saja...';
  },

  async analyzeCurrentInput() {
    const url = (this.input?.value || '').trim();
    if (!url) {
      window.showToast?.('Silakan tempel URL link musik terlebih dahulu!', 'warning');
      return;
    }

    if (this.analyzeBtn) {
      this.analyzeBtn.disabled = true;
      this.analyzeBtn.innerHTML = `
        <svg class="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25" stroke="currentColor"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"></path>
        </svg> Menganalisa...
      `;
    }

    try {
      const data = await API.resolveSpotiFlyerLink(url);
      currentResolvedData = data;
      this.renderResults(data);
      window.showToast?.(`Berhasil memuat ${data.count || 1} lagu dari ${data.provider?.toUpperCase()}!`, 'success');
    } catch (err) {
      console.error('SpotiFlyer resolve error:', err);
      window.showToast?.(err.message || 'Gagal mengenali link musik ini.', 'danger');
      if (this.resultCard) this.resultCard.classList.remove('active');
    } finally {
      if (this.analyzeBtn) {
        this.analyzeBtn.disabled = false;
        this.analyzeBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg> Analisa & Download
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
      this.metaTitle.textContent = data.title || firstTrack.title || 'Musik SpotiFlyer';
    }
    if (this.metaSubtitle) {
      this.metaSubtitle.textContent = data.subtitle || firstTrack.artist || 'Artis Musik';
    }
    if (this.metaBadge) {
      this.metaBadge.textContent = `${(data.provider || 'SpotiFlyer').toUpperCase()} • ${data.importType?.toUpperCase()} (${tracks.length} Lagu)`;
    }
    if (this.albumArt) {
      this.albumArt.src = data.cover || firstTrack.cover || '/favicon.svg';
    }

    // Render Batch Actions
    if (this.batchActions) {
      if (isSingle) {
        const dlUrl = API.getDownloadUrl(firstTrack.fullStreamUrl || firstTrack.preview, firstTrack.artist, firstTrack.title, `${firstTrack.artist} - ${firstTrack.title}`);
        this.batchActions.innerHTML = `
          <button type="button" class="spotiflyer-btn primary" onclick="window.playSpotiFlyerTrack(0)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Putar Sekarang
          </button>
          <a href="${dlUrl}" download class="spotiflyer-btn" style="text-decoration:none;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download MP3 320k
          </a>
        `;
      } else {
        this.batchActions.innerHTML = `
          <button type="button" class="spotiflyer-btn primary" onclick="window.playSpotiFlyerAll()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Putar Semua Album
          </button>
          <button type="button" class="spotiflyer-btn" onclick="window.downloadSpotiFlyerBatch()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download Semua (${tracks.length} Lagu)
          </button>
        `;
      }
    }

    // Render Tracklist
    if (this.tracklist) {
      if (tracks.length === 0) {
        this.tracklist.innerHTML = '<div style="font-size:13px; color:var(--color-text-muted); text-align:center; padding:10px;">Tidak ada trek audio ditemukan.</div>';
        return;
      }

      this.tracklist.innerHTML = tracks.map((t, idx) => {
        const dlUrl = API.getDownloadUrl(t.fullStreamUrl || t.preview, t.artist, t.title, `${t.artist} - ${t.title}`);
        return `
          <div class="spotiflyer-track-item" id="spotiflyerTrackItem_${idx}">
            <div class="spotiflyer-track-left">
              <div class="spotiflyer-track-num">${idx + 1}</div>
              <div class="spotiflyer-track-text">
                <div class="spotiflyer-track-name">${t.title}</div>
                <div class="spotiflyer-track-sub">${t.artist} • ${t.album || 'Single'}</div>
              </div>
            </div>
            <div class="spotiflyer-track-btns">
              <button type="button" class="spotiflyer-icon-btn" title="Putar Lagu" onclick="window.playSpotiFlyerTrack(${idx})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </button>
              <a href="${dlUrl}" download class="spotiflyer-icon-btn" title="Download Lagu Ini" style="text-decoration:none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
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
      window.showToast?.('Proses unduhan batch sedang berjalan...', 'warning');
      return;
    }

    const tracks = currentResolvedData.data;
    isDownloadingBatch = true;

    if (this.progressBarWrap) this.progressBarWrap.classList.add('active');

    window.showToast?.(`Memulai unduhan batch ${tracks.length} lagu secara berurutan...`, 'info');

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const percent = Math.round(((i + 1) / tracks.length) * 100);
      if (this.progressBarFill) this.progressBarFill.style.width = `${percent}%`;

      const itemEl = document.getElementById(`spotiflyerTrackItem_${i}`);
      if (itemEl) itemEl.style.borderLeft = '3px solid var(--color-primary)';

      const dlUrl = API.getDownloadUrl(t.fullStreamUrl || t.preview, t.artist, t.title, `${t.artist} - ${t.title}`);

      // Trigger download anchor
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${t.artist} - ${t.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Delay 1.5 seconds between downloads to avoid browser throttling
      await new Promise(r => setTimeout(r, 1500));
    }

    isDownloadingBatch = false;
    window.showToast?.(`Selesai mengunduh ${tracks.length} lagu!`, 'success');
    setTimeout(() => {
      if (this.progressBarWrap) this.progressBarWrap.classList.remove('active');
      if (this.progressBarFill) this.progressBarFill.style.width = '0%';
    }, 2000);
  }
};

// Global hooks for inline event handlers
window.openSpotiFlyer = (url = '') => SpotiFlyer.open(url);
window.closeSpotiFlyer = () => SpotiFlyer.close();
window.downloadSpotiFlyerBatch = () => SpotiFlyer.downloadBatch();

window.playSpotiFlyerTrack = (idx) => {
  if (!currentResolvedData?.data?.[idx]) return;
  const track = currentResolvedData.data[idx];
  if (window.playTrackDirectly) {
    window.playTrackDirectly(track);
    SpotiFlyer.close();
  }
};

window.playSpotiFlyerAll = () => {
  if (!currentResolvedData?.data || currentResolvedData.data.length === 0) return;
  if (window.setPlaylistAndPlay) {
    window.setPlaylistAndPlay(currentResolvedData.data);
    SpotiFlyer.close();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SpotiFlyer.init();
});
