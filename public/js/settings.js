// ── PlayMusic Full Settings & Preferences Manager ──
(function() {
  const STORAGE_KEY = 'playmusic_settings_v3';

  const DEFAULT_SETTINGS = {
    // 1. Notifikasi (Semua Notifikasi Nonaktif/Mati secara Default)
    notifyMusicPlay: false,   // Notifikasi judul & artis saat lagu diputar (Nonaktif)
    notifyDownloads: false,   // Notifikasi unduhan (Nonaktif)
    notifyFavorites: false,   // Notifikasi favorit (Nonaktif)
    notifySystem: false,      // Notifikasi sistem / refresh (Nonaktif)

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
        const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('playmusic_settings_v2');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (!localStorage.getItem(STORAGE_KEY)) {
            // Migrasi: matikan semua notifikasi secara default
            parsed.notifyMusicPlay = false;
            parsed.notifyDownloads = false;
            parsed.notifyFavorites = false;
            parsed.notifySystem = false;
          }
          return Object.assign({}, DEFAULT_SETTINGS, parsed);
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
  window.clearDownloadHistoryFromSettings = async function() {
    Settings.triggerHaptic();
    const ok = await (window.showNeuConfirm ? window.showNeuConfirm({
      title: 'Hapus Riwayat Unduhan',
      badge: 'KONFIRMASI',
      message: 'Bersihkan seluruh riwayat unduhan musik?',
      type: 'warning',
      confirmText: 'Hapus Riwayat',
      cancelText: 'Batal',
      isDanger: true
    }) : Promise.resolve(confirm('Bersihkan seluruh riwayat unduhan musik?')));

    if (ok) {
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

  window.clearPlayHistoryFromSettings = async function() {
    Settings.triggerHaptic();
    const ok = await (window.showNeuConfirm ? window.showNeuConfirm({
      title: 'Hapus Riwayat Putar',
      badge: 'KONFIRMASI',
      message: 'Bersihkan riwayat lagu yang pernah diputar?',
      type: 'warning',
      confirmText: 'Hapus Riwayat',
      cancelText: 'Batal',
      isDanger: true
    }) : Promise.resolve(confirm('Bersihkan riwayat lagu yang pernah diputar?')));

    if (ok) {
      localStorage.removeItem('playmusic_history');
      const histSec = document.getElementById('historySection');
      if (histSec) histSec.style.display = 'none';
      Settings.updateStorageStats();
      if (window.shouldShowNotification('system')) {
        window.showToast?.('Riwayat putar musik berhasil dibersihkan', 'info', 'system');
      }
    }
  };

  window.clearFavoritesFromSettings = async function() {
    Settings.triggerHaptic();
    const ok = await (window.showNeuConfirm ? window.showNeuConfirm({
      title: 'Hapus Favorit',
      badge: 'KONFIRMASI',
      message: 'Hapus semua daftar lagu disukai (favorit)?',
      type: 'warning',
      confirmText: 'Hapus Semua',
      cancelText: 'Batal',
      isDanger: true
    }) : Promise.resolve(confirm('Hapus semua daftar lagu disukai (favorit)?')));

    if (ok) {
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

  window.resetSettingsToDefault = async function() {
    Settings.triggerHaptic();
    const ok = await (window.showNeuConfirm ? window.showNeuConfirm({
      title: 'Reset Setelan',
      badge: 'PERINGATAN',
      message: 'Kembalikan semua preferensi dan pengaturan ke setelan awal?',
      type: 'warning',
      confirmText: 'Reset Ulang',
      cancelText: 'Batal',
      isDanger: true
    }) : Promise.resolve(confirm('Kembalikan semua preferensi dan pengaturan ke setelan awal?')));

    if (ok) {
      Settings.reset();
      if (window.shouldShowNotification('system')) {
        window.showToast?.('Pengaturan dikembalikan ke setelan awal', 'info', 'system');
      }
    }
  };

  // ── Android APK Download & In-App Update Engine ──
  const CURRENT_APP_VERSION = '2.5.0';
  const CURRENT_VERSION_CODE = 250;

  window.downloadAndroidApk = function() {
    Settings.triggerHaptic();
    const downloadUrl = 'https://github.com/kheireditzz/playsound-web/releases/latest/download/playmusic-release.apk';

    if (window.AndroidApp && typeof window.AndroidApp.downloadAndInstallUpdate === 'function') {
      window.AndroidApp.downloadAndInstallUpdate(downloadUrl);
    } else {
      window.location.href = '/download/apk';
    }
  };

  window.checkAppUpdate = async function(isManual = true) {
    Settings.triggerHaptic();
    try {
      const res = await fetch('/api/app-version', { cache: 'no-store' });
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();

      const serverVersionCode = data.versionCode || 250;
      const serverVersionName = data.version || '2.5.0';

      const localVersionCode = (window.AndroidApp && typeof window.AndroidApp.getAppVersionCode === 'function')
        ? window.AndroidApp.getAppVersionCode()
        : CURRENT_VERSION_CODE;

      if (serverVersionCode > localVersionCode) {
        const changelogList = (data.changelog || []).map(c => `• ${c}`).join('\n');
        const proceed = await (window.showNeuConfirm ? window.showNeuConfirm({
          title: `Pembaruan Tersedia`,
          badge: `VERSI BARU v${serverVersionName}`,
          message: `Tersedia rilis pembaruan v${serverVersionName}.\n\nCatatan Rilis:\n${changelogList}\n\nAplikasi ditandatangani dengan keystore tetap sehingga pembaruan dapat langsung dipasang tanpa perlu uninstal.\n\nUnduh dan pasang pembaruan sekarang?`,
          type: 'info',
          confirmText: 'Unduh Pembaruan',
          cancelText: 'Nanti'
        }) : Promise.resolve(confirm(`Pembaruan Tersedia: v${serverVersionName}!\n\nUnduh sekarang?`)));

        if (proceed) {
          window.downloadAndroidApk();
        }
      } else {
        if (isManual) {
          if (window.showNeuAlert) {
            await window.showNeuAlert({
              title: 'Versi Terkini',
              badge: `VERSI v${serverVersionName}`,
              message: `Aplikasi Anda sudah versi terbaru (v${serverVersionName})!\n\nTanda tangan keystore tetap aktif sehingga update berikutnya dapat langsung dipasang tanpa perlu uninstal.`,
              type: 'success',
              confirmText: 'Mengerti'
            });
          } else {
            alert(`Aplikasi Anda sudah versi terbaru (v${serverVersionName})!`);
          }
        }
      }
    } catch (e) {
      if (isManual) {
        if (window.showNeuAlert) {
          await window.showNeuAlert({
            title: 'Koneksi Terganggu',
            badge: 'PERIKSA KONEKSI',
            message: 'Gagal memeriksa pembaruan server. Pastikan koneksi internet aktif.',
            type: 'error',
            confirmText: 'Tutup'
          });
        } else {
          alert('Gagal memeriksa pembaruan server. Pastikan koneksi internet aktif.');
        }
      }
    }
  };

  // Bind Listeners on DOM Ready
  document.addEventListener('DOMContentLoaded', () => {
    Settings.initTheme();

    // Deteksi Lingkungan Aplikasi
    const envBadge = document.getElementById('appEnvironmentBadge');
    if (envBadge) {
      if (window.AndroidApp && typeof window.AndroidApp.isAndroidApp === 'function') {
        const v = window.AndroidApp.getAppVersionName ? window.AndroidApp.getAppVersionName() : '2.5.0';
        envBadge.textContent = `v${v}`;
        envBadge.style.color = '#00A63D';
      } else {
        envBadge.textContent = 'Pro Edition';
      }
    }

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
