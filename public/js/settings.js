// ── PlayMusic Full Settings & Preferences Manager ──
(function() {
  const STORAGE_KEY = 'playmusic_settings_v2';

  const DEFAULT_SETTINGS = {
    // 1. Notifikasi (Hanya Notifikasi Putar Musik yang Aktif secara Default)
    notifyMusicPlay: true,    // Notifikasi judul & artis saat lagu diputar (Aktif)
    notifyDownloads: false,   // Notifikasi unduhan (Mati sesuai permintaan)
    notifyFavorites: false,   // Notifikasi favorit (Mati)
    notifySystem: false,      // Notifikasi sistem / refresh (Mati)

    // 2. Audio & Pemutaran
    audioQuality: '320k',     // '320k', '192k', 'auto'
    autoplayNext: true,       // Putar otomatis lagu berikutnya
    crossfade: true,          // Transisi halus
    defaultVolume: 90,        // Volume default (%)

    // 3. Tampilan & Neumorphism
    theme: 'default',         // 'default', 'dark', 'midnight'
    hapticFeedback: true      // Efek getaran taktil mobile
  };

  class SettingsManager {
    constructor() {
      this.state = this.load();
      this.initTheme();
    }

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
        }
      } catch (e) {
        console.warn('Gagal membaca preferensi pengguna:', e);
      }
      return Object.assign({}, DEFAULT_SETTINGS);
    }

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (e) {
        console.warn('Gagal menyimpan preferensi:', e);
      }
    }

    get(key) {
      if (this.state[key] !== undefined) return this.state[key];
      return DEFAULT_SETTINGS[key];
    }

    set(key, val) {
      this.state[key] = val;
      this.save();
      this.triggerHaptic();

      if (key === 'theme') {
        this.applyTheme(val);
      }
      if (key === 'defaultVolume' && window.audioEngine) {
        try {
          window.audioEngine.volume = Math.max(0, Math.min(1, val / 100));
        } catch (e) {}
      }
    }

    initTheme() {
      const activeTheme = this.get('theme');
      this.applyTheme(activeTheme);
    }

    applyTheme(themeName) {
      document.documentElement.classList.remove('theme-dark', 'theme-midnight');
      if (themeName === 'dark') {
        document.documentElement.classList.add('theme-dark');
      } else if (themeName === 'midnight') {
        document.documentElement.classList.add('theme-midnight');
      }
    }

    triggerHaptic() {
      if (this.get('hapticFeedback') && navigator.vibrate) {
        try { navigator.vibrate(10); } catch (e) {}
      }
    }

    reset() {
      this.state = Object.assign({}, DEFAULT_SETTINGS);
      this.save();
      this.applyTheme(this.state.theme);
      this.syncUI();
    }

    syncUI() {
      // Sync Switches
      const switchMap = {
        'settingNotifyMusic': 'notifyMusicPlay',
        'settingNotifyDownload': 'notifyDownloads',
        'settingNotifyFavorite': 'notifyFavorites',
        'settingNotifySystem': 'notifySystem',
        'settingAutoplay': 'autoplayNext',
        'settingCrossfade': 'crossfade',
        'settingHaptic': 'hapticFeedback'
      };

      Object.entries(switchMap).forEach(([elemId, stateKey]) => {
        const el = document.getElementById(elemId);
        if (el) {
          el.checked = Boolean(this.get(stateKey));
        }
      });

      // Sync Audio Quality Select
      const qSelect = document.getElementById('settingAudioQuality');
      if (qSelect) {
        qSelect.value = this.get('audioQuality') || '320k';
      }

      // Sync Volume Range
      const volRange = document.getElementById('settingDefaultVolume');
      const volVal = document.getElementById('settingVolumeVal');
      if (volRange) {
        volRange.value = this.get('defaultVolume') ?? 90;
        if (volVal) volVal.textContent = `${volRange.value}%`;
      }

      // Sync Theme Cards
      const curTheme = this.get('theme') || 'default';
      document.querySelectorAll('.theme-option-card').forEach(card => {
        card.classList.toggle('active', card.dataset.theme === curTheme);
      });

      // Update Storage Badges
      this.updateStorageStats();
    }

    updateStorageStats() {
      try {
        const histRaw = localStorage.getItem('playmusic_history');
        const dlRaw = localStorage.getItem('playmusic_download_history_v1');
        const lovedRaw = localStorage.getItem('playmusic_loved_tracks');

        const histCount = histRaw ? (JSON.parse(histRaw).length || 0) : 0;
        const dlCount = dlRaw ? (JSON.parse(dlRaw).length || 0) : 0;
        const lovedCount = lovedRaw ? (JSON.parse(lovedRaw).length || 0) : 0;

        const statDl = document.getElementById('statDlCount');
        const statHist = document.getElementById('statHistCount');
        const statLoved = document.getElementById('statLovedCount');

        if (statDl) statDl.textContent = `${dlCount} Lagu`;
        if (statHist) statHist.textContent = `${histCount} Lagu`;
        if (statLoved) statLoved.textContent = `${lovedCount} Disimpan`;
      } catch (e) {}
    }
  }

  const Settings = new SettingsManager();
  window.Settings = Settings;

  // ── Global Notification Filter Gate ──
  // Menjamin hanya jenis notifikasi yang diizinkan yang akan muncul
  window.shouldShowNotification = function(category = 'system') {
    switch (category) {
      case 'music_play':
        return Boolean(Settings.get('notifyMusicPlay'));
      case 'download':
        return Boolean(Settings.get('notifyDownloads'));
      case 'favorite':
        return Boolean(Settings.get('notifyFavorites'));
      case 'system':
        return Boolean(Settings.get('notifySystem'));
      default:
        // Default kategori lain-lain dicek ke notifySystem (default FALSE)
        return Boolean(Settings.get('notifySystem'));
    }
  };

  // ── Modal & Drawer Controller ──
  window.toggleSettingsMenu = function(forcedState) {
    const backdrop = document.getElementById('settingsBackdrop');
    const menuBtn = document.getElementById('headerMenuBtn');
    if (!backdrop) return;

    Settings.triggerHaptic();
    const shouldOpen = (forcedState !== undefined) ? forcedState : !backdrop.classList.contains('is-open');

    if (shouldOpen) {
      Settings.syncUI();
      backdrop.classList.add('is-open');
      if (menuBtn) menuBtn.classList.add('is-active');
      document.body.classList.add('menu-open');
      document.body.style.overflow = 'hidden';
    } else {
      backdrop.classList.remove('is-open');
      if (menuBtn) menuBtn.classList.remove('is-active');
      document.body.classList.remove('menu-open');
      document.body.style.overflow = '';
    }
  };

  window.switchSettingsTab = function(tabName) {
    Settings.triggerHaptic();
    document.querySelectorAll('.settings-tab-btn, .settings-category-card').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.settings-section').forEach(sec => {
      sec.classList.toggle('active', sec.dataset.tab === tabName);
    });
  };

  window.selectTheme = function(themeName) {
    Settings.set('theme', themeName);
    document.querySelectorAll('.theme-option-card').forEach(card => {
      card.classList.toggle('active', card.dataset.theme === themeName);
    });
  };

  // ── Clear Data Handlers ──
  window.clearDownloadHistoryFromSettings = function() {
    if (confirm('Bersihkan seluruh riwayat unduhan musik?')) {
      if (window.clearAllDownloadHistory) {
        window.clearAllDownloadHistory();
      } else {
        localStorage.removeItem('playmusic_download_history_v1');
      }
      Settings.updateStorageStats();
      if (window.shouldShowNotification('system')) {
        window.showToast?.('Riwayat unduhan berhasil dibersihkan', 'info', 'system');
      }
    }
  };

  window.clearPlayHistoryFromSettings = function() {
    if (confirm('Bersihkan riwayat lagu yang pernah diputar?')) {
      localStorage.removeItem('playmusic_history');
      const histSec = document.getElementById('historySection');
      if (histSec) histSec.style.display = 'none';
      Settings.updateStorageStats();
      if (window.shouldShowNotification('system')) {
        window.showToast?.('Riwayat putar musik berhasil dibersihkan', 'info', 'system');
      }
    }
  };

  window.clearFavoritesFromSettings = function() {
    if (confirm('Hapus semua daftar lagu disukai (favorit)?')) {
      localStorage.removeItem('playmusic_loved_tracks');
      if (window.loadLovedTracks) window.loadLovedTracks();
      const badge = document.getElementById('headerLovedBadge');
      if (badge) badge.textContent = '0';
      Settings.updateStorageStats();
      if (window.shouldShowNotification('system')) {
        window.showToast?.('Daftar favorit dibersihkan', 'info', 'system');
      }
    }
  };

  window.resetSettingsToDefault = function() {
    if (confirm('Kembalikan semua preferensi dan pengaturan ke setelan awal?')) {
      Settings.reset();
      if (window.shouldShowNotification('system')) {
        window.showToast?.('Pengaturan dikembalikan ke setelan awal', 'info', 'system');
      }
    }
  };

  // Bind Listeners on DOM Ready
  document.addEventListener('DOMContentLoaded', () => {
    Settings.initTheme();

    // Backdrop Click to close
    const backdrop = document.getElementById('settingsBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) window.toggleSettingsMenu(false);
      });
    }

    // Escape Key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.toggleSettingsMenu(false);
    });

    // Volume Slider Handler
    const volSlider = document.getElementById('settingDefaultVolume');
    const volVal = document.getElementById('settingVolumeVal');
    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (volVal) volVal.textContent = `${val}%`;
        Settings.set('defaultVolume', val);
      });
    }
  });
})();
