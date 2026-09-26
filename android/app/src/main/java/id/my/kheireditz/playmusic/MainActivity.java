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
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
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

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity implements MusicService.PlaybackListener {

    private static final String APP_VERSION = "2.5.0";
    private static final int APP_VERSION_CODE = 250;
    private static final String PREF_NAME = "playmusic_prefs";
    private static final String KEY_SEARCH_HISTORY = "search_history";
    private static final String KEY_AUDIO_BITRATE = "audio_bitrate";
    private static final String KEY_EQ_PRESET = "eq_preset";

    // UI Elements
    private ViewFlipper viewFlipper;
    private LinearLayout navTabHome, navTabSearch, navTabCenter, navTabDownload, navTabSettings;
    private ImageView imgNavHome, imgNavSearch, imgNavDownload, imgNavSettings;
    private TextView tvNavHome, tvNavSearch, tvNavDownload, tvNavSettings;

    // Home Tab
    private SwipeRefreshLayout swipeRefreshHome;
    private RecyclerView rvHomeSongs;
    private LinearLayout layoutHomeLoading;
    private ProgressBar pbHomeLoading;
    private TrackAdapter homeAdapter;
    private String currentCategory = "global";
    private final TextView[] categoryChips = new TextView[6];

    // Search Tab
    private EditText etSearchQuery;
    private ImageButton btnClearSearch;
    private ScrollView scrollSearchHistory;
    private LinearLayout layoutHistoryItems;
    private TextView tvClearAllHistory, tvNoHistory;
    private LinearLayout layoutSearchLoading;
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
    private TextView tvActiveQualityDesc, tvActiveEqDesc, tvSleepTimerStatus, tvAudioCacheSize;
    private TextView chipQuality320, chipQuality256, chipQuality128, chipQualitySaver;
    private TextView chipEqBass, chipEqVocal, chipEqTreble, chipEqSpatial, chipEqFlat;
    private TextView chipTimerOff, chipTimer15, chipTimer30, chipTimer45, chipTimer60;
    private Button btnClearAudioCache;

    // Sleep Timer Handler
    private final Handler sleepTimerHandler = new Handler(Looper.getMainLooper());
    private Runnable sleepTimerRunnable;
    private long sleepTimerEndTime = 0;

    // Sticky Bottom Mini Player (With Close 'X' Button)
    private LinearLayout miniPlayerLayout;
    private ImageView imgMiniArtwork;
    private TextView tvMiniTitle, tvMiniArtist;
    private ImageButton btnMiniPlayPause, btnMiniNext, btnMiniClose;

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

            if (musicService.getCurrentTrack() != null) {
                onTrackChanged(musicService.getCurrentTrack());
                onPlaybackStateChanged(musicService.isPlaying());
            }
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
        navTabCenter = findViewById(R.id.navTabCenter);
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
        btnMiniClose = findViewById(R.id.btnMiniClose);

        findViewById(R.id.btnTopRefresh).setOnClickListener(v -> switchTab(1));
    }

    private void setupNavigation() {
        navTabHome.setOnClickListener(v -> switchTab(0));
        navTabSearch.setOnClickListener(v -> switchTab(1));

        // Raised Center Feature: Now Playing / Quick Vibe
        if (navTabCenter != null) {
            navTabCenter.setOnClickListener(v -> {
                if (musicService != null && musicService.getCurrentTrack() != null) {
                    showFullPlayerDialog();
                } else if (homeAdapter != null && !homeAdapter.getTracks().isEmpty()) {
                    musicService.setPlaylist(homeAdapter.getTracks(), 0);
                    Toast.makeText(this, "Quick Vibe: Memutar " + homeAdapter.getTracks().get(0).getTitle(), Toast.LENGTH_SHORT).show();
                } else {
                    switchTab(0);
                }
            });
        }

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
        layoutHomeLoading = findViewById(R.id.layoutHomeLoading);
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

        if (layoutHomeLoading != null) layoutHomeLoading.setVisibility(View.VISIBLE);
        if (rvHomeSongs != null) rvHomeSongs.setVisibility(View.GONE);
        if (pbHomeLoading != null) pbHomeLoading.setVisibility(View.GONE);

        ApiClient.getTrends(category, new ApiClient.ApiCallback<List<Track>>() {
            @Override
            public void onSuccess(List<Track> result) {
                if (layoutHomeLoading != null) layoutHomeLoading.setVisibility(View.GONE);
                if (rvHomeSongs != null) rvHomeSongs.setVisibility(View.VISIBLE);
                swipeRefreshHome.setRefreshing(false);
                homeAdapter.setTracks(result);
            }

            @Override
            public void onError(Exception e) {
                if (layoutHomeLoading != null) layoutHomeLoading.setVisibility(View.GONE);
                if (rvHomeSongs != null) rvHomeSongs.setVisibility(View.VISIBLE);
                swipeRefreshHome.setRefreshing(false);
                Toast.makeText(MainActivity.this, "Gagal memuat tren musik: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    // ── 2. SEARCH TAB & RIWAYAT PENCAHARIAN ──
    private void setupSearchTab() {
        etSearchQuery = findViewById(R.id.etSearchQuery);
        btnClearSearch = findViewById(R.id.btnClearSearch);
        scrollSearchHistory = findViewById(R.id.scrollSearchHistory);
        layoutHistoryItems = findViewById(R.id.layoutHistoryItems);
        tvClearAllHistory = findViewById(R.id.tvClearAllHistory);
        tvNoHistory = findViewById(R.id.tvNoHistory);
        layoutSearchLoading = findViewById(R.id.layoutSearchLoading);
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

        // Load History Initially
        loadSearchHistory();

        tvClearAllHistory.setOnClickListener(v -> clearAllHistory());

        etSearchQuery.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                String q = etSearchQuery.getText().toString().trim();
                if (!q.isEmpty()) {
                    performSearch(q);
                }
                return true;
            }
            return false;
        });

        btnClearSearch.setOnClickListener(v -> {
            etSearchQuery.setText("");
            searchAdapter.setTracks(new ArrayList<>());
            btnClearSearch.setVisibility(View.GONE);
            rvSearchResults.setVisibility(View.GONE);
            if (layoutSearchLoading != null) layoutSearchLoading.setVisibility(View.GONE);
            scrollSearchHistory.setVisibility(View.VISIBLE);
            loadSearchHistory();
        });

        etSearchQuery.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                boolean hasText = s.length() > 0;
                btnClearSearch.setVisibility(hasText ? View.VISIBLE : View.GONE);
                if (!hasText) {
                    rvSearchResults.setVisibility(View.GONE);
                    if (layoutSearchLoading != null) layoutSearchLoading.setVisibility(View.GONE);
                    scrollSearchHistory.setVisibility(View.VISIBLE);
                    loadSearchHistory();
                }
            }

            @Override
            public void afterTextChanged(Editable s) {}
        });

        // Setup Trending Tags Listeners
        setupTrendingChips();
    }

    private void setupTrendingChips() {
        int[] trendIds = {R.id.chipTrend1, R.id.chipTrend2, R.id.chipTrend3, R.id.chipTrend4, R.id.chipTrend5};
        for (int id : trendIds) {
            TextView chip = findViewById(id);
            if (chip != null) {
                chip.setOnClickListener(v -> {
                    String text = chip.getText().toString();
                    // Hilangkan emoji di awal kata untuk query pencarian bersih
                    String cleanQuery = text.replaceAll("^[\\p{So}\\p{Cn}\\s]+", "").trim();
                    etSearchQuery.setText(cleanQuery);
                    etSearchQuery.setSelection(cleanQuery.length());
                    performSearch(cleanQuery);
                });
            }
        }
    }

    private void loadSearchHistory() {
        if (layoutHistoryItems == null) return;
        layoutHistoryItems.removeAllViews();

        SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        String historyJson = prefs.getString(KEY_SEARCH_HISTORY, "[]");

        List<String> historyList = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(historyJson);
            for (int i = 0; i < arr.length(); i++) {
                historyList.add(arr.getString(i));
            }
        } catch (JSONException ignored) {}

        if (historyList.isEmpty()) {
            tvNoHistory.setVisibility(View.VISIBLE);
            tvClearAllHistory.setVisibility(View.GONE);
            return;
        }

        tvNoHistory.setVisibility(View.GONE);
        tvClearAllHistory.setVisibility(View.VISIBLE);

        for (String query : historyList) {
            View itemView = createHistoryItemView(query);
            layoutHistoryItems.addView(itemView);
        }
    }

    private View createHistoryItemView(final String query) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setBackgroundResource(R.drawable.neu_history_chip);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dpToPx(42)
        );
        params.setMargins(0, dpToPx(4), 0, dpToPx(4));
        row.setLayoutParams(params);
        row.setPadding(dpToPx(12), dpToPx(6), dpToPx(10), dpToPx(6));

        // Icon History
        ImageView iconHistory = new ImageView(this);
        iconHistory.setImageResource(R.drawable.ic_history);
        iconHistory.setColorFilter(ContextCompat.getColor(this, R.color.primary_teal));
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dpToPx(18), dpToPx(18));
        row.addView(iconHistory, iconParams);

        // Text Query
        TextView tvQuery = new TextView(this);
        tvQuery.setText(query);
        tvQuery.setTextColor(ContextCompat.getColor(this, R.color.text_primary));
        tvQuery.setTextSize(13);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
        textParams.setMargins(dpToPx(10), 0, dpToPx(6), 0);
        row.addView(tvQuery, textParams);

        // Row Click: Run search
        row.setOnClickListener(v -> {
            etSearchQuery.setText(query);
            etSearchQuery.setSelection(query.length());
            performSearch(query);
        });

        // Delete 'X' Button
        ImageView btnDelete = new ImageView(this);
        btnDelete.setImageResource(R.drawable.ic_close);
        btnDelete.setColorFilter(ContextCompat.getColor(this, R.color.text_secondary));
        LinearLayout.LayoutParams delParams = new LinearLayout.LayoutParams(dpToPx(24), dpToPx(24));
        btnDelete.setPadding(dpToPx(3), dpToPx(3), dpToPx(3), dpToPx(3));
        btnDelete.setOnClickListener(v -> removeHistoryItem(query));
        row.addView(btnDelete, delParams);

        return row;
    }

    private void saveQueryToHistory(String query) {
        if (query == null || query.trim().isEmpty()) return;
        query = query.trim();

        SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        String historyJson = prefs.getString(KEY_SEARCH_HISTORY, "[]");

        List<String> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(historyJson);
            for (int i = 0; i < arr.length(); i++) {
                String item = arr.getString(i);
                if (!item.equalsIgnoreCase(query)) {
                    list.add(item);
                }
            }
        } catch (JSONException ignored) {}

        list.add(0, query);
        if (list.size() > 12) list = list.subList(0, 12);

        JSONArray newArr = new JSONArray(list);
        prefs.edit().putString(KEY_SEARCH_HISTORY, newArr.toString()).apply();
    }

    private void removeHistoryItem(String query) {
        SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        String historyJson = prefs.getString(KEY_SEARCH_HISTORY, "[]");

        List<String> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(historyJson);
            for (int i = 0; i < arr.length(); i++) {
                String item = arr.getString(i);
                if (!item.equalsIgnoreCase(query)) {
                    list.add(item);
                }
            }
        } catch (JSONException ignored) {}

        JSONArray newArr = new JSONArray(list);
        prefs.edit().putString(KEY_SEARCH_HISTORY, newArr.toString()).apply();
        loadSearchHistory();
    }

    private void clearAllHistory() {
        SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(KEY_SEARCH_HISTORY).apply();
        loadSearchHistory();
        Toast.makeText(this, "Semua riwayat pencarian dihapus", Toast.LENGTH_SHORT).show();
    }

    private void performSearch(String query) {
        if (query.isEmpty()) return;
        saveQueryToHistory(query);

        scrollSearchHistory.setVisibility(View.GONE);
        if (layoutSearchLoading != null) layoutSearchLoading.setVisibility(View.VISIBLE);
        rvSearchResults.setVisibility(View.GONE);

        ApiClient.search(query, new ApiClient.ApiCallback<List<Track>>() {
            @Override
            public void onSuccess(List<Track> result) {
                if (layoutSearchLoading != null) layoutSearchLoading.setVisibility(View.GONE);
                rvSearchResults.setVisibility(View.VISIBLE);
                searchAdapter.setTracks(result);
                if (result.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Tidak ada hasil untuk \"" + query + "\"", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onError(Exception e) {
                if (layoutSearchLoading != null) layoutSearchLoading.setVisibility(View.GONE);
                rvSearchResults.setVisibility(View.VISIBLE);
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

    // ── 4. SETTINGS TAB (LENGKAP & MEWAH) ──
    private void setupSettingsTab() {
        tvSettingsVersionInfo = findViewById(R.id.tvSettingsVersionInfo);
        btnCheckAppUpdate = findViewById(R.id.btnCheckAppUpdate);
        btnDownloadLatestApk = findViewById(R.id.btnDownloadLatestApk);

        tvActiveQualityDesc = findViewById(R.id.tvActiveQualityDesc);
        tvActiveEqDesc = findViewById(R.id.tvActiveEqDesc);
        tvSleepTimerStatus = findViewById(R.id.tvSleepTimerStatus);
        tvAudioCacheSize = findViewById(R.id.tvAudioCacheSize);
        btnClearAudioCache = findViewById(R.id.btnClearAudioCache);

        chipQuality320 = findViewById(R.id.chipQuality320);
        chipQuality256 = findViewById(R.id.chipQuality256);
        chipQuality128 = findViewById(R.id.chipQuality128);
        chipQualitySaver = findViewById(R.id.chipQualitySaver);

        chipEqBass = findViewById(R.id.chipEqBass);
        chipEqVocal = findViewById(R.id.chipEqVocal);
        chipEqTreble = findViewById(R.id.chipEqTreble);
        chipEqSpatial = findViewById(R.id.chipEqSpatial);
        chipEqFlat = findViewById(R.id.chipEqFlat);

        chipTimerOff = findViewById(R.id.chipTimerOff);
        chipTimer15 = findViewById(R.id.chipTimer15);
        chipTimer30 = findViewById(R.id.chipTimer30);
        chipTimer45 = findViewById(R.id.chipTimer45);
        chipTimer60 = findViewById(R.id.chipTimer60);

        tvSettingsVersionInfo.setText("Versi APK: v" + APP_VERSION + " Pro (Real Native Edition)");

        btnCheckAppUpdate.setOnClickListener(v -> checkAppUpdate(true));
        btnDownloadLatestApk.setOnClickListener(v -> downloadAndInstallApk(ApiClient.BASE_URL + "/download/apk"));

        setupQualitySettings();
        setupEqSettings();
        setupSleepTimer();
        setupCacheManagement();
    }

    private void setupQualitySettings() {
        TextView[] qChips = {chipQuality320, chipQuality256, chipQuality128, chipQualitySaver};
        String[] qNames = {"320 kbps Hi-Fi", "256 kbps Studio", "128 kbps Standard", "Data Saver"};
        String[] qDescs = {
                "Aktif: 320 kbps Ultra Hi-Fi (Bitrate Penuh & Lossless)",
                "Aktif: 256 kbps Studio (Detail Seimbang)",
                "Aktif: 128 kbps Standard (Cepat & Ringan)",
                "Aktif: Data Saver 96 kbps (Hemat Kuota)"
        };

        SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        int savedIdx = prefs.getInt(KEY_AUDIO_BITRATE, 0);

        for (int i = 0; i < qChips.length; i++) {
            final int idx = i;
            if (qChips[i] != null) {
                qChips[i].setOnClickListener(v -> {
                    prefs.edit().putInt(KEY_AUDIO_BITRATE, idx).apply();
                    for (int j = 0; j < qChips.length; j++) {
                        if (qChips[j] != null) {
                            boolean isSel = (j == idx);
                            qChips[j].setBackgroundResource(isSel ? R.drawable.neu_chip_active : R.drawable.neu_chip_inactive);
                            qChips[j].setTextColor(ContextCompat.getColor(MainActivity.this, isSel ? R.color.white : R.color.text_primary));
                        }
                    }
                    if (tvActiveQualityDesc != null) tvActiveQualityDesc.setText(qDescs[idx]);
                    Toast.makeText(MainActivity.this, "Kualitas audio disetel ke " + qNames[idx], Toast.LENGTH_SHORT).show();
                });
            }
        }
    }

    private void setupEqSettings() {
        TextView[] eqChips = {chipEqBass, chipEqVocal, chipEqTreble, chipEqSpatial, chipEqFlat};
        String[] eqNames = {"Bass Boost", "Vocal Clarity", "Treble Booster", "3D Spatial", "Flat Studio"};

        SharedPreferences prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        int savedEq = prefs.getInt(KEY_EQ_PRESET, 0);

        for (int i = 0; i < eqChips.length; i++) {
            final int idx = i;
            if (eqChips[i] != null) {
                eqChips[i].setOnClickListener(v -> {
                    prefs.edit().putInt(KEY_EQ_PRESET, idx).apply();
                    for (int j = 0; j < eqChips.length; j++) {
                        if (eqChips[j] != null) {
                            boolean isSel = (j == idx);
                            eqChips[j].setBackgroundResource(isSel ? R.drawable.neu_chip_active : R.drawable.neu_chip_inactive);
                            eqChips[j].setTextColor(ContextCompat.getColor(MainActivity.this, isSel ? R.color.white : R.color.text_primary));
                        }
                    }
                    if (tvActiveEqDesc != null) tvActiveEqDesc.setText("Preset: " + eqNames[idx]);
                    Toast.makeText(MainActivity.this, "Preset Equalizer: " + eqNames[idx], Toast.LENGTH_SHORT).show();
                });
            }
        }
    }

    private void setupSleepTimer() {
        TextView[] timerChips = {chipTimerOff, chipTimer15, chipTimer30, chipTimer45, chipTimer60};
        int[] minutes = {0, 15, 30, 45, 60};

        for (int i = 0; i < timerChips.length; i++) {
            final int idx = i;
            final int min = minutes[i];
            if (timerChips[i] != null) {
                timerChips[i].setOnClickListener(v -> {
                    for (int j = 0; j < timerChips.length; j++) {
                        if (timerChips[j] != null) {
                            boolean isSel = (j == idx);
                            timerChips[j].setBackgroundResource(isSel ? R.drawable.neu_chip_active : R.drawable.neu_chip_inactive);
                            timerChips[j].setTextColor(ContextCompat.getColor(MainActivity.this, isSel ? R.color.white : R.color.text_primary));
                        }
                    }

                    if (sleepTimerRunnable != null) {
                        sleepTimerHandler.removeCallbacks(sleepTimerRunnable);
                        sleepTimerRunnable = null;
                    }

                    if (min == 0) {
                        tvSleepTimerStatus.setText("Status: Nonaktif");
                        Toast.makeText(MainActivity.this, "Sleep timer dinonaktifkan", Toast.LENGTH_SHORT).show();
                    } else {
                        sleepTimerEndTime = System.currentTimeMillis() + (min * 60 * 1000L);
                        tvSleepTimerStatus.setText("Status: Musik akan berhenti dalam " + min + " menit");
                        Toast.makeText(MainActivity.this, "Sleep timer disetel: " + min + " menit", Toast.LENGTH_SHORT).show();

                        sleepTimerRunnable = () -> {
                            if (musicService != null) {
                                musicService.pause();
                            }
                            tvSleepTimerStatus.setText("Status: Nonaktif (Waktu habis)");
                            Toast.makeText(MainActivity.this, "Sleep timer: Musik otomatis dijeda.", Toast.LENGTH_LONG).show();
                            // Reset Chip to Off
                            for (int k = 0; k < timerChips.length; k++) {
                                if (timerChips[k] != null) {
                                    boolean isOff = (k == 0);
                                    timerChips[k].setBackgroundResource(isOff ? R.drawable.neu_chip_active : R.drawable.neu_chip_inactive);
                                    timerChips[k].setTextColor(ContextCompat.getColor(MainActivity.this, isOff ? R.color.white : R.color.text_primary));
                                }
                            }
                        };
                        sleepTimerHandler.postDelayed(sleepTimerRunnable, min * 60 * 1000L);
                    }
                });
            }
        }
    }

    private void setupCacheManagement() {
        calculateCacheSize();

        if (btnClearAudioCache != null) {
            btnClearAudioCache.setOnClickListener(v -> {
                clearAppCache();
                calculateCacheSize();
                Toast.makeText(this, "Cache audio berhasil dibersihkan!", Toast.LENGTH_SHORT).show();
            });
        }
    }

    private void calculateCacheSize() {
        try {
            long size = getDirSize(getCacheDir()) + (getExternalCacheDir() != null ? getDirSize(getExternalCacheDir()) : 0);
            double mb = size / (1024.0 * 1024.0);
            if (tvAudioCacheSize != null) {
                if (mb < 0.1) {
                    tvAudioCacheSize.setText("Cache Sementara: Bersih (0 KB)");
                } else {
                    tvAudioCacheSize.setText(String.format(Locale.getDefault(), "Cache Sementara: %.1f MB", mb));
                }
            }
        } catch (Exception ignored) {}
    }

    private long getDirSize(File dir) {
        if (dir == null || !dir.exists()) return 0;
        long bytes = 0;
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (f.isDirectory()) {
                    bytes += getDirSize(f);
                } else {
                    bytes += f.length();
                }
            }
        }
        return bytes;
    }

    private void clearAppCache() {
        try {
            deleteDir(getCacheDir());
            if (getExternalCacheDir() != null) deleteDir(getExternalCacheDir());
        } catch (Exception ignored) {}
    }

    private boolean deleteDir(File dir) {
        if (dir != null && dir.isDirectory()) {
            String[] children = dir.list();
            if (children != null) {
                for (String child : children) {
                    boolean success = deleteDir(new File(dir, child));
                    if (!success) return false;
                }
            }
            return dir.delete();
        } else if (dir != null && dir.isFile()) {
            return dir.delete();
        }
        return false;
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

        // Close 'X' Button on Mini Player
        if (btnMiniClose != null) {
            btnMiniClose.setOnClickListener(v -> {
                if (musicService != null) {
                    musicService.pause();
                }
                miniPlayerLayout.setVisibility(View.GONE);
            });
        }

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

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
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
        if (sleepTimerRunnable != null) {
            sleepTimerHandler.removeCallbacks(sleepTimerRunnable);
        }
        if (isBound) {
            unbindService(serviceConnection);
            isBound = false;
        }
    }
}
