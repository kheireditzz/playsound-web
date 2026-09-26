package id.my.kheireditz.playmusic;

import android.app.Dialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.ViewFlipper;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity implements MusicService.PlaybackListener {

    private static final String APP_VERSION = "2.4.6";
    private static final int APP_VERSION_CODE = 246;

    // UI Elements
    private ViewFlipper viewFlipper;
    private LinearLayout navTabHome, navTabSearch, navTabDownload, navTabSettings;
    private ImageView imgNavHome, imgNavSearch, imgNavDownload, imgNavSettings;
    private TextView tvNavHome, tvNavSearch, tvNavDownload, tvNavSettings;

    // Home Tab
    private SwipeRefreshLayout swipeRefreshHome;
    private RecyclerView rvHomeSongs;
    private ProgressBar pbHomeLoading;
    private TrackAdapter homeAdapter;
    private String currentCategory = "global";
    private final TextView[] categoryChips = new TextView[6];

    // Search Tab
    private EditText etSearchQuery;
    private ImageButton btnClearSearch;
    private RecyclerView rvSearchResults;
    private ProgressBar pbSearchLoading;
    private TrackAdapter searchAdapter;

    // Download Tab
    private EditText etDownloadUrl;
    private ImageButton btnPasteUrl;
    private Button btnTriggerDownload;
    private ProgressBar pbDownloadResolve;

    // Settings Tab
    private TextView tvSettingsVersionInfo;
    private Button btnCheckAppUpdate, btnDownloadLatestApk;

    // Sticky Bottom Mini Player
    private LinearLayout miniPlayerLayout;
    private ImageView imgMiniArtwork;
    private TextView tvMiniTitle, tvMiniArtist;
    private ImageButton btnMiniPlayPause, btnMiniNext;

    // Full Player Dialog Elements
    private Dialog fullPlayerDialog;
    private ImageView imgPlayerArtwork;
    private TextView tvPlayerTitle, tvPlayerArtist, tvPlayerLyrics;
    private TextView tvCurrentTime, tvTotalDuration;
    private SeekBar playerSeekBar;
    private ImageButton btnPlayPauseLarge, btnPrevious, btnNext, btnShuffle, btnRepeat, btnDownloadFromPlayer;
    private boolean isUserSeeking = false;

    // Background Service
    private MusicService musicService;
    private boolean isBound = false;
    private boolean doubleBackToExit = false;

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            MusicService.MusicBinder binder = (MusicService.MusicBinder) service;
            musicService = binder.getService();
            isBound = true;
            musicService.setPlaybackListener(MainActivity.this);
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            musicService = null;
            isBound = false;
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupNeumorphicBars();
        setContentView(R.layout.activity_main);

        bindPlaybackService();
        initViews();
        setupNavigation();
        setupHomeTab();
        setupSearchTab();
        setupDownloadTab();
        setupSettingsTab();
        setupMiniPlayer();
        setupBackNavigation();

        // Load Default Trends
        loadCategoryTrends("global");
    }

    private void setupNeumorphicBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        WindowInsetsControllerCompat insets = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insets != null) {
            insets.setAppearanceLightStatusBars(true);
            insets.setAppearanceLightNavigationBars(true);
        }
        getWindow().setStatusBarColor(ContextCompat.getColor(this, R.color.neu_bg));
        getWindow().setNavigationBarColor(ContextCompat.getColor(this, R.color.neu_bg));
    }

    private void bindPlaybackService() {
        Intent intent = new Intent(this, MusicService.class);
        startService(intent);
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
    }

    private void initViews() {
        viewFlipper = findViewById(R.id.viewFlipper);

        navTabHome = findViewById(R.id.navTabHome);
        navTabSearch = findViewById(R.id.navTabSearch);
        navTabDownload = findViewById(R.id.navTabDownload);
        navTabSettings = findViewById(R.id.navTabSettings);

        imgNavHome = findViewById(R.id.imgNavHome);
        imgNavSearch = findViewById(R.id.imgNavSearch);
        imgNavDownload = findViewById(R.id.imgNavDownload);
        imgNavSettings = findViewById(R.id.imgNavSettings);

        tvNavHome = findViewById(R.id.tvNavHome);
        tvNavSearch = findViewById(R.id.tvNavSearch);
        tvNavDownload = findViewById(R.id.tvNavDownload);
        tvNavSettings = findViewById(R.id.tvNavSettings);

        miniPlayerLayout = findViewById(R.id.miniPlayerLayout);
        imgMiniArtwork = findViewById(R.id.imgMiniArtwork);
        tvMiniTitle = findViewById(R.id.tvMiniTitle);
        tvMiniArtist = findViewById(R.id.tvMiniArtist);
        btnMiniPlayPause = findViewById(R.id.btnMiniPlayPause);
        btnMiniNext = findViewById(R.id.btnMiniNext);

        findViewById(R.id.btnTopRefresh).setOnClickListener(v -> switchTab(1));
    }

    private void setupNavigation() {
        navTabHome.setOnClickListener(v -> switchTab(0));
        navTabSearch.setOnClickListener(v -> switchTab(1));
        navTabDownload.setOnClickListener(v -> switchTab(2));
        navTabSettings.setOnClickListener(v -> switchTab(3));
    }

    private void switchTab(int tabIndex) {
        viewFlipper.setDisplayedChild(tabIndex);

        int activeColor = ContextCompat.getColor(this, R.color.primary_teal);
        int inactiveColor = ContextCompat.getColor(this, R.color.text_secondary);

        imgNavHome.setColorFilter(tabIndex == 0 ? activeColor : inactiveColor);
        tvNavHome.setTextColor(tabIndex == 0 ? activeColor : inactiveColor);

        imgNavSearch.setColorFilter(tabIndex == 1 ? activeColor : inactiveColor);
        tvNavSearch.setTextColor(tabIndex == 1 ? activeColor : inactiveColor);

        imgNavDownload.setColorFilter(tabIndex == 2 ? activeColor : inactiveColor);
        tvNavDownload.setTextColor(tabIndex == 2 ? activeColor : inactiveColor);

        imgNavSettings.setColorFilter(tabIndex == 3 ? activeColor : inactiveColor);
        tvNavSettings.setTextColor(tabIndex == 3 ? activeColor : inactiveColor);
    }

    // ── 1. HOME TAB ──
    private void setupHomeTab() {
        swipeRefreshHome = findViewById(R.id.swipeRefreshHome);
        rvHomeSongs = findViewById(R.id.rvHomeSongs);
        pbHomeLoading = findViewById(R.id.pbHomeLoading);

        rvHomeSongs.setLayoutManager(new LinearLayoutManager(this));
        homeAdapter = new TrackAdapter(new TrackAdapter.OnTrackActionListener() {
            @Override
            public void onPlay(Track track, int position) {
                if (musicService != null) {
                    musicService.setPlaylist(homeAdapter.getTracks(), position);
                }
            }

            @Override
            public void onDownload(Track track) {
                downloadTrackNative(track);
            }
        });
        rvHomeSongs.setAdapter(homeAdapter);

        swipeRefreshHome.setOnRefreshListener(() -> loadCategoryTrends(currentCategory));

        // Chips
        categoryChips[0] = findViewById(R.id.chipGlobal);
        categoryChips[1] = findViewById(R.id.chipIndo);
        categoryChips[2] = findViewById(R.id.chipTikTok);
        categoryChips[3] = findViewById(R.id.chipFresh);
        categoryChips[4] = findViewById(R.id.chipKpop);
        categoryChips[5] = findViewById(R.id.chipJapan);

        String[] cats = {"global", "indo", "tiktok", "fresh", "kpop", "japan"};
        for (int i = 0; i < categoryChips.length; i++) {
            final int index = i;
            categoryChips[i].setOnClickListener(v -> {
                updateActiveChip(index);
                loadCategoryTrends(cats[index]);
            });
        }
    }

    private void updateActiveChip(int activeIdx) {
        for (int i = 0; i < categoryChips.length; i++) {
            if (i == activeIdx) {
                categoryChips[i].setBackgroundResource(R.drawable.neu_chip_active);
                categoryChips[i].setTextColor(ContextCompat.getColor(this, R.color.white));
            } else {
                categoryChips[i].setBackgroundResource(R.drawable.neu_chip_inactive);
                categoryChips[i].setTextColor(ContextCompat.getColor(this, R.color.text_primary));
            }
        }
    }

    private void loadCategoryTrends(String category) {
        currentCategory = category;
        pbHomeLoading.setVisibility(View.VISIBLE);

        ApiClient.getTrends(category, new ApiClient.ApiCallback<List<Track>>() {
            @Override
            public void onSuccess(List<Track> result) {
                pbHomeLoading.setVisibility(View.GONE);
                swipeRefreshHome.setRefreshing(false);
                homeAdapter.setTracks(result);
            }

            @Override
            public void onError(Exception e) {
                pbHomeLoading.setVisibility(View.GONE);
                swipeRefreshHome.setRefreshing(false);
                Toast.makeText(MainActivity.this, "Gagal memuat tren musik: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    // ── 2. SEARCH TAB ──
    private void setupSearchTab() {
        etSearchQuery = findViewById(R.id.etSearchQuery);
        btnClearSearch = findViewById(R.id.btnClearSearch);
        rvSearchResults = findViewById(R.id.rvSearchResults);
        pbSearchLoading = findViewById(R.id.pbSearchLoading);

        rvSearchResults.setLayoutManager(new LinearLayoutManager(this));
        searchAdapter = new TrackAdapter(new TrackAdapter.OnTrackActionListener() {
            @Override
            public void onPlay(Track track, int position) {
                if (musicService != null) {
                    musicService.setPlaylist(searchAdapter.getTracks(), position);
                }
            }

            @Override
            public void onDownload(Track track) {
                downloadTrackNative(track);
            }
        });
        rvSearchResults.setAdapter(searchAdapter);

        etSearchQuery.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                performSearch(etSearchQuery.getText().toString().trim());
                return true;
            }
            return false;
        });

        btnClearSearch.setOnClickListener(v -> {
            etSearchQuery.setText("");
            searchAdapter.setTracks(new ArrayList<>());
            btnClearSearch.setVisibility(View.GONE);
        });

        etSearchQuery.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                btnClearSearch.setVisibility(s.length() > 0 ? View.VISIBLE : View.GONE);
            }

            @Override
            public void afterTextChanged(Editable s) {}
        });
    }

    private void performSearch(String query) {
        if (query.isEmpty()) return;
        pbSearchLoading.setVisibility(View.VISIBLE);

        ApiClient.search(query, new ApiClient.ApiCallback<List<Track>>() {
            @Override
            public void onSuccess(List<Track> result) {
                pbSearchLoading.setVisibility(View.GONE);
                searchAdapter.setTracks(result);
                if (result.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Tidak ada hasil untuk \"" + query + "\"", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onError(Exception e) {
                pbSearchLoading.setVisibility(View.GONE);
                Toast.makeText(MainActivity.this, "Pencarian gagal: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    // ── 3. DOWNLOAD TAB ──
    private void setupDownloadTab() {
        etDownloadUrl = findViewById(R.id.etDownloadUrl);
        btnPasteUrl = findViewById(R.id.btnPasteUrl);
        btnTriggerDownload = findViewById(R.id.btnTriggerDownload);
        pbDownloadResolve = findViewById(R.id.pbDownloadResolve);

        // Tombol Paste Otomatis dari Clipboard
        btnPasteUrl.setOnClickListener(v -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard != null && clipboard.hasPrimaryClip()) {
                ClipData.Item item = clipboard.getPrimaryClip().getItemAt(0);
                if (item != null && item.getText() != null) {
                    etDownloadUrl.setText(item.getText().toString().trim());
                    Toast.makeText(this, "URL berhasil ditempel!", Toast.LENGTH_SHORT).show();
                }
            }
        });

        btnTriggerDownload.setOnClickListener(v -> {
            String url = etDownloadUrl.getText().toString().trim();
            if (url.isEmpty()) {
                Toast.makeText(this, "Silakan masukkan link lagu terlebih dahulu.", Toast.LENGTH_SHORT).show();
                return;
            }

            pbDownloadResolve.setVisibility(View.VISIBLE);
            btnTriggerDownload.setEnabled(false);

            ApiClient.resolveLink(url, new ApiClient.ApiCallback<List<Track>>() {
                @Override
                public void onSuccess(List<Track> tracks) {
                    pbDownloadResolve.setVisibility(View.GONE);
                    btnTriggerDownload.setEnabled(true);
                    if (tracks != null && !tracks.isEmpty()) {
                        Track t = tracks.get(0);
                        downloadTrackNative(t);
                    } else {
                        // Fallback download langsung ke endpoint download backend
                        String directDownloadUrl = ApiClient.BASE_URL + "/api/download?url=" + Uri.encode(url);
                        enqueueDownload("playmusic_track.mp3", directDownloadUrl);
                    }
                }

                @Override
                public void onError(Exception e) {
                    pbDownloadResolve.setVisibility(View.GONE);
                    btnTriggerDownload.setEnabled(true);
                    String directDownloadUrl = ApiClient.BASE_URL + "/api/download?url=" + Uri.encode(url);
                    enqueueDownload("playmusic_track.mp3", directDownloadUrl);
                }
            });
        });
    }

    private void downloadTrackNative(Track track) {
        String cleanTitle = (track.getArtist() + " - " + track.getTitle())
                .replaceAll("[^a-zA-Z0-9 ._-]", "")
                .trim() + ".mp3";

        String downloadUrl = ApiClient.BASE_URL + "/api/download?artist=" + Uri.encode(track.getArtist())
                + "&title=" + Uri.encode(track.getTitle())
                + "&name=" + Uri.encode(cleanTitle);

        enqueueDownload(cleanTitle, downloadUrl);
    }

    private void enqueueDownload(String fileName, String url) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle(fileName);
            request.setDescription("Mengunduh audio kualitas 320 kbps");
            request.setMimeType("audio/mpeg");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(request);
                Toast.makeText(this, "Mulai mengunduh: " + fileName, Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "Gagal mengunduh: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    // ── 4. SETTINGS TAB ──
    private void setupSettingsTab() {
        tvSettingsVersionInfo = findViewById(R.id.tvSettingsVersionInfo);
        btnCheckAppUpdate = findViewById(R.id.btnCheckAppUpdate);
        btnDownloadLatestApk = findViewById(R.id.btnDownloadLatestApk);

        tvSettingsVersionInfo.setText("Versi Terpasang: v" + APP_VERSION + " (Build Produksi Resmi)");

        btnCheckAppUpdate.setOnClickListener(v -> checkAppUpdate(true));
        btnDownloadLatestApk.setOnClickListener(v -> downloadAndInstallApk(ApiClient.BASE_URL + "/download/apk"));
    }

    private void checkAppUpdate(boolean showToastIfLatest) {
        ApiClient.checkAppVersion(new ApiClient.ApiCallback<JSONObject>() {
            @Override
            public void onSuccess(JSONObject obj) {
                int latestCode = obj.optInt("versionCode", APP_VERSION_CODE);
                String latestName = obj.optString("versionName", APP_VERSION);
                String apkUrl = obj.optString("apkUrl", ApiClient.BASE_URL + "/download/apk");

                if (latestCode > APP_VERSION_CODE) {
                    Toast.makeText(MainActivity.this, "Versi baru tersedia: v" + latestName + "! Mengunduh...", Toast.LENGTH_LONG).show();
                    downloadAndInstallApk(apkUrl);
                } else {
                    if (showToastIfLatest) {
                        Toast.makeText(MainActivity.this, "Aplikasi Play Music sudah versi terbaru (v" + APP_VERSION + ")", Toast.LENGTH_SHORT).show();
                    }
                }
            }

            @Override
            public void onError(Exception e) {
                if (showToastIfLatest) {
                    Toast.makeText(MainActivity.this, "Aplikasi Play Music sudah versi terbaru.", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    private void downloadAndInstallApk(String apkUrl) {
        try {
            Toast.makeText(this, "Mengunduh file APK pembaruan...", Toast.LENGTH_LONG).show();

            String fileName = "playmusic-release.apk";
            File destinationFile = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
            if (destinationFile.exists()) {
                destinationFile.delete();
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
            request.setTitle("Play Music Update");
            request.setDescription("Mengunduh rilis produksi terbaru...");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            request.setDestinationUri(Uri.fromFile(destinationFile));

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) return;
            long downloadId = dm.enqueue(request);

            BroadcastReceiver onComplete = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctxt, Intent intent) {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id == downloadId) {
                        try {
                            unregisterReceiver(this);
                        } catch (Exception ignored) {}
                        installApkFile(destinationFile);
                    }
                }
            };

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(onComplete, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED);
            } else {
                registerReceiver(onComplete, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
            }
        } catch (Exception e) {
            Toast.makeText(this, "Gagal mengunduh pembaruan: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void installApkFile(File apkFile) {
        if (!apkFile.exists()) return;
        try {
            Uri apkUri = FileProvider.getUriForFile(
                    this,
                    getApplicationContext().getPackageName() + ".fileprovider",
                    apkFile
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(installIntent);
        } catch (Exception e) {
            Toast.makeText(this, "Gagal membuka installer APK: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    // ── 5. MINI PLAYER & FULL PLAYER ──
    private void setupMiniPlayer() {
        btnMiniPlayPause.setOnClickListener(v -> {
            if (musicService != null) musicService.togglePlayPause();
        });

        btnMiniNext.setOnClickListener(v -> {
            if (musicService != null) musicService.playNext();
        });

        miniPlayerLayout.setOnClickListener(v -> showFullPlayerDialog());
    }

    private void showFullPlayerDialog() {
        if (musicService == null || musicService.getCurrentTrack() == null) return;
        Track current = musicService.getCurrentTrack();

        if (fullPlayerDialog == null) {
            fullPlayerDialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
            fullPlayerDialog.setContentView(R.layout.dialog_full_player);

            imgPlayerArtwork = fullPlayerDialog.findViewById(R.id.imgPlayerArtwork);
            tvPlayerTitle = fullPlayerDialog.findViewById(R.id.tvPlayerTitle);
            tvPlayerArtist = fullPlayerDialog.findViewById(R.id.tvPlayerArtist);
            tvPlayerLyrics = fullPlayerDialog.findViewById(R.id.tvPlayerLyrics);
            tvCurrentTime = fullPlayerDialog.findViewById(R.id.tvCurrentTime);
            tvTotalDuration = fullPlayerDialog.findViewById(R.id.tvTotalDuration);
            playerSeekBar = fullPlayerDialog.findViewById(R.id.playerSeekBar);
            btnPlayPauseLarge = fullPlayerDialog.findViewById(R.id.btnPlayPauseLarge);
            btnPrevious = fullPlayerDialog.findViewById(R.id.btnPrevious);
            btnNext = fullPlayerDialog.findViewById(R.id.btnNext);
            btnShuffle = fullPlayerDialog.findViewById(R.id.btnShuffle);
            btnRepeat = fullPlayerDialog.findViewById(R.id.btnRepeat);
            btnDownloadFromPlayer = fullPlayerDialog.findViewById(R.id.btnDownloadFromPlayer);

            fullPlayerDialog.findViewById(R.id.btnClosePlayer).setOnClickListener(v -> fullPlayerDialog.dismiss());

            btnPlayPauseLarge.setOnClickListener(v -> {
                if (musicService != null) musicService.togglePlayPause();
            });

            btnPrevious.setOnClickListener(v -> {
                if (musicService != null) musicService.playPrevious();
            });

            btnNext.setOnClickListener(v -> {
                if (musicService != null) musicService.playNext();
            });

            btnDownloadFromPlayer.setOnClickListener(v -> {
                if (musicService != null && musicService.getCurrentTrack() != null) {
                    downloadTrackNative(musicService.getCurrentTrack());
                }
            });

            playerSeekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                    if (fromUser) {
                        tvCurrentTime.setText(formatTime(progress));
                    }
                }

                @Override
                public void onStartTrackingTouch(SeekBar seekBar) {
                    isUserSeeking = true;
                }

                @Override
                public void onStopTrackingTouch(SeekBar seekBar) {
                    isUserSeeking = false;
                    if (musicService != null) {
                        musicService.seekTo(seekBar.getProgress());
                    }
                }
            });
        }

        updateFullPlayerViews(current);
        fullPlayerDialog.show();
    }

    private void updateFullPlayerViews(Track track) {
        if (fullPlayerDialog == null || !fullPlayerDialog.isShowing()) return;

        tvPlayerTitle.setText(track.getTitle());
        tvPlayerArtist.setText(track.getArtist());
        tvPlayerLyrics.setText("Memuat lirik...");
        ImageLoader.getInstance().displayImage(track.getCover(), imgPlayerArtwork, R.drawable.ic_music_note);

        // Ambil lirik secara asinkron
        ApiClient.getLyrics(track.getTitle(), track.getArtist(), new ApiClient.ApiCallback<String>() {
            @Override
            public void onSuccess(String lyrics) {
                if (tvPlayerLyrics != null) {
                    tvPlayerLyrics.setText(lyrics);
                }
            }

            @Override
            public void onError(Exception e) {
                if (tvPlayerLyrics != null) {
                    tvPlayerLyrics.setText("Lirik belum tersedia untuk lagu ini.");
                }
            }
        });
    }

    // ── 6. PLAYBACK LISTENER CALLBACKS ──
    @Override
    public void onTrackChanged(Track track) {
        runOnUiThread(() -> {
            miniPlayerLayout.setVisibility(View.VISIBLE);
            tvMiniTitle.setText(track.getTitle());
            tvMiniArtist.setText(track.getArtist());
            ImageLoader.getInstance().displayImage(track.getCover(), imgMiniArtwork, R.drawable.ic_music_note);

            if (fullPlayerDialog != null && fullPlayerDialog.isShowing()) {
                updateFullPlayerViews(track);
            }
        });
    }

    @Override
    public void onPlaybackStateChanged(boolean isPlaying) {
        runOnUiThread(() -> {
            int icon = isPlaying ? R.drawable.ic_pause : R.drawable.ic_play_arrow;
            btnMiniPlayPause.setImageResource(icon);
            if (btnPlayPauseLarge != null) {
                btnPlayPauseLarge.setImageResource(icon);
            }
        });
    }

    @Override
    public void onProgressUpdated(int currentMs, int totalMs) {
        runOnUiThread(() -> {
            if (fullPlayerDialog != null && fullPlayerDialog.isShowing() && !isUserSeeking) {
                playerSeekBar.setMax(totalMs);
                playerSeekBar.setProgress(currentMs);
                tvCurrentTime.setText(formatTime(currentMs));
                tvTotalDuration.setText(formatTime(totalMs));
            }
        });
    }

    @Override
    public void onError(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_SHORT).show());
    }

    private String formatTime(int ms) {
        int totalSeconds = ms / 1000;
        int minutes = totalSeconds / 60;
        int seconds = totalSeconds % 60;
        return String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds);
    }

    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (fullPlayerDialog != null && fullPlayerDialog.isShowing()) {
                    fullPlayerDialog.dismiss();
                    return;
                }
                if (viewFlipper.getDisplayedChild() != 0) {
                    switchTab(0);
                    return;
                }
                if (doubleBackToExit) {
                    finish();
                    return;
                }
                doubleBackToExit = true;
                Toast.makeText(MainActivity.this, "Tekan sekali lagi untuk keluar dari Play Music", Toast.LENGTH_SHORT).show();
                new Handler(Looper.getMainLooper()).postDelayed(() -> doubleBackToExit = false, 2000);
            }
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (isBound) {
            unbindService(serviceConnection);
            isBound = false;
        }
    }
}
