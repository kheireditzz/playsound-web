package id.my.kheireditz.playmusic;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.File;

public class MainActivity extends AppCompatActivity {

    private static final String APP_URL = "https://playmusic.kheireditz.my.id";
    private WebView webView;
    private ValueCallback<Uri[]> fileUploadCallback;
    private boolean doubleBackToExitPressedOnce = false;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Styling status bar & navigation bar sesuai estetika Neumorphism (#E7E5E4)
        setupNeumorphicBars();

        // Container Layout
        FrameLayout rootLayout = new FrameLayout(this);
        rootLayout.setBackgroundColor(0xFFE7E5E4);

        webView = new WebView(this);
        rootLayout.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(rootLayout);

        // Konfigurasi WebSettings Tingkat Produksi
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false); // Memungkinkan transisi pemutaran audio mulus
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " PlayMusicApp/2.4.6 (Android)");

        // Cookie & Session Persistence
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // Native Download Listener untuk Audio & File APK
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                handleDownload(url, contentDisposition, mimeType);
            }
        });

        // Jembatan JavaScript Native
        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidApp");

        // WebChromeClient (Handle Fullscreen, Dialog, & File Chooser)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
                fileUploadCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, 1001);
                } catch (Exception e) {
                    fileUploadCallback = null;
                    return false;
                }
                return true;
            }
        });

        // WebViewClient (Internal Navigation & Error Handling)
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false; // Tetap di dalam WebView
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return true;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    loadOfflineErrorPage();
                }
            }
        });

        // Tangani Tombol Kembali (Back Navigation)
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    if (doubleBackToExitPressedOnce) {
                        finish();
                        return;
                    }
                    doubleBackToExitPressedOnce = true;
                    Toast.makeText(MainActivity.this, "Tekan sekali lagi untuk keluar dari Play Music", Toast.LENGTH_SHORT).show();
                    new Handler(Looper.getMainLooper()).postDelayed(() -> doubleBackToExitPressedOnce = false, 2000);
                }
            }
        });

        // Muat URL Aplikasi
        webView.loadUrl(APP_URL);
    }

    private void setupNeumorphicBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(true);
            insetsController.setAppearanceLightNavigationBars(true);
        }
        getWindow().setStatusBarColor(0xFFE7E5E4);
        getWindow().setNavigationBarColor(0xFFE7E5E4);
    }

    private void loadOfflineErrorPage() {
        String offlineHtml = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'>" +
                "<style>body{margin:0;padding:24px;background:#E7E5E4;color:#1E2938;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:85vh;text-align:center;}" +
                ".card{background:#E7E5E4;box-shadow:6px 6px 14px rgba(166,163,160,0.5),-6px -6px 14px #FFFFFF;border-radius:20px;padding:32px;max-width:320px;}" +
                ".btn{margin-top:20px;background:#E7E5E4;box-shadow:4px 4px 10px rgba(166,163,160,0.5),-4px -4px 10px #FFFFFF;border:none;border-radius:12px;padding:12px 24px;color:#006666;font-weight:700;font-size:15px;cursor:pointer;}" +
                ".btn:active{box-shadow:inset 3px 3px 6px rgba(166,163,160,0.6),inset -3px -3px 6px #FFFFFF;}</style></head>" +
                "<body><div class='card'><h2>Koneksi Terputus</h2><p style='color:#555;'>Tidak dapat tersambung ke server Play Music. Pastikan perangkat Anda terhubung ke internet.</p>" +
                "<button class='btn' onclick='location.reload()'>Coba Lagi</button></div></body></html>";
        webView.loadDataWithBaseURL(null, offlineHtml, "text/html", "UTF-8", null);
    }

    private void handleDownload(String url, String contentDisposition, String mimeType) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            if (fileName == null || fileName.isEmpty()) {
                fileName = "playmusic_download.mp3";
            }

            request.setMimeType(mimeType != null ? mimeType : "audio/mpeg");
            request.addRequestHeader("User-Agent", webView.getSettings().getUserAgentString());
            request.setDescription("Mengunduh " + fileName);
            request.setTitle(fileName);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(request);
                Toast.makeText(this, "Mulai mengunduh: " + fileName, Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            try {
                startActivity(intent);
            } catch (Exception ex) {
                Toast.makeText(this, "Gagal mengunduh: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1001 && fileUploadCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getDataString() != null) {
                    results = new Uri[]{Uri.parse(data.getDataString())};
                } else if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            fileUploadCallback.onReceiveValue(results);
            fileUploadCallback = null;
        }
    }

    // ── Jembatan JavaScript Antara Web dan Android Native ──
    public class WebAppInterface {
        private final Context context;

        WebAppInterface(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean isAndroidApp() {
            return true;
        }

        @JavascriptInterface
        public int getAppVersionCode() {
            return 246;
        }

        @JavascriptInterface
        public String getAppVersionName() {
            return "2.4.6";
        }

        @JavascriptInterface
        public void downloadAudio(String url, String fileName) {
            runOnUiThread(() -> handleDownload(url, null, "audio/mpeg"));
        }

        @JavascriptInterface
        public void downloadAndInstallUpdate(String apkUrl) {
            runOnUiThread(() -> startInAppUpdate(apkUrl));
        }
    }

    private void startInAppUpdate(String apkUrl) {
        try {
            Toast.makeText(this, "Mengunduh pembaruan APK Play Music...", Toast.LENGTH_LONG).show();

            String fileName = "playmusic-update.apk";
            File destinationFile = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
            if (destinationFile.exists()) {
                destinationFile.delete();
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
            request.setTitle("Pembaruan Play Music");
            request.setDescription("Mengunduh versi terbaru...");
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

                        // Picu PackageInstaller Android tanpa perlu uninstal aplikasi sebelumnya!
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
            Toast.makeText(this, "Gagal memulai unduhan pembaruan: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            // Fallback buka URL di browser
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl));
            startActivity(browserIntent);
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
}
