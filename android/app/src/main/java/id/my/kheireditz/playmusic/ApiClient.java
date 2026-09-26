package id.my.kheireditz.playmusic;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ApiClient {

    public static final String BASE_URL = "https://playmusic.kheireditz.my.id";
    private static final ExecutorService executor = Executors.newFixedThreadPool(4);
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    public interface ApiCallback<T> {
        void onSuccess(T result);
        void onError(Exception e);
    }

    private static String httpGet(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(15000);
        conn.setRequestProperty("User-Agent", "PlayMusicApp/2.4.6 (Android Native)");
        conn.setRequestProperty("Accept", "application/json");

        int code = conn.getResponseCode();
        InputStream is = (code >= 200 && code < 400) ? conn.getInputStream() : conn.getErrorStream();
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line);
        }
        reader.close();
        conn.disconnect();

        if (code >= 400) {
            throw new Exception("HTTP error code: " + code);
        }
        return sb.toString();
    }

    public static void getTrends(String category, ApiCallback<List<Track>> callback) {
        executor.execute(() -> {
            try {
                String endpoint = BASE_URL + "/api/trends?category=" + URLEncoder.encode(category, "UTF-8");
                String jsonStr = httpGet(endpoint);
                JSONObject root = new JSONObject(jsonStr);
                JSONArray data = root.optJSONArray("data");
                List<Track> list = parseTrackArray(data);
                mainHandler.post(() -> callback.onSuccess(list));
            } catch (Exception e) {
                mainHandler.post(() -> callback.onError(e));
            }
        });
    }

    public static void search(String query, ApiCallback<List<Track>> callback) {
        executor.execute(() -> {
            try {
                String endpoint = BASE_URL + "/api/search?q=" + URLEncoder.encode(query, "UTF-8");
                String jsonStr = httpGet(endpoint);
                JSONObject root = new JSONObject(jsonStr);
                JSONArray data = root.optJSONArray("data");
                if (data == null && root.has("results")) {
                    data = root.optJSONArray("results");
                }
                List<Track> list = parseTrackArray(data);
                mainHandler.post(() -> callback.onSuccess(list));
            } catch (Exception e) {
                mainHandler.post(() -> callback.onError(e));
            }
        });
    }

    public static void resolveLink(String songUrl, ApiCallback<List<Track>> callback) {
        executor.execute(() -> {
            try {
                String endpoint = BASE_URL + "/api/spotiflyer/resolve?url=" + URLEncoder.encode(songUrl, "UTF-8");
                String jsonStr = httpGet(endpoint);
                JSONObject root = new JSONObject(jsonStr);
                JSONArray data = root.optJSONArray("data");
                List<Track> list = parseTrackArray(data);
                mainHandler.post(() -> callback.onSuccess(list));
            } catch (Exception e) {
                mainHandler.post(() -> callback.onError(e));
            }
        });
    }

    public static void fetchFullAudioUrl(String title, String artist, ApiCallback<String> callback) {
        executor.execute(() -> {
            try {
                String q = (artist + " " + title).trim();
                String endpoint = BASE_URL + "/api/scrape-full-audio?title=" + URLEncoder.encode(title, "UTF-8")
                        + "&artist=" + URLEncoder.encode(artist, "UTF-8");
                String jsonStr = httpGet(endpoint);
                JSONObject root = new JSONObject(jsonStr);
                String streamUrl = root.optString("streamUrl", "");
                if (streamUrl.isEmpty()) {
                    streamUrl = root.optString("directUrl", "");
                }
                final String finalUrl = streamUrl;
                mainHandler.post(() -> callback.onSuccess(finalUrl));
            } catch (Exception e) {
                mainHandler.post(() -> callback.onError(e));
            }
        });
    }

    public static void getLyrics(String title, String artist, ApiCallback<String> callback) {
        executor.execute(() -> {
            try {
                String endpoint = BASE_URL + "/api/lyrics?title=" + URLEncoder.encode(title, "UTF-8")
                        + "&artist=" + URLEncoder.encode(artist, "UTF-8");
                String jsonStr = httpGet(endpoint);
                JSONObject root = new JSONObject(jsonStr);
                String lyrics = root.optString("lyrics", "Lirik lagu belum tersedia.");
                mainHandler.post(() -> callback.onSuccess(lyrics));
            } catch (Exception e) {
                mainHandler.post(() -> callback.onSuccess("Lirik lagu tidak ditemukan."));
            }
        });
    }

    public static void checkAppVersion(ApiCallback<JSONObject> callback) {
        executor.execute(() -> {
            try {
                String endpoint = BASE_URL + "/api/app-version";
                String jsonStr = httpGet(endpoint);
                JSONObject root = new JSONObject(jsonStr);
                mainHandler.post(() -> callback.onSuccess(root));
            } catch (Exception e) {
                mainHandler.post(() -> callback.onError(e));
            }
        });
    }

    private static List<Track> parseTrackArray(JSONArray data) {
        List<Track> list = new ArrayList<>();
        if (data == null) return list;

        for (int i = 0; i < data.length(); i++) {
            JSONObject obj = data.optJSONObject(i);
            if (obj == null) continue;
            Track track = new Track();
            track.setId(obj.optString("id", String.valueOf(i)));
            track.setTitle(obj.optString("title", obj.optString("name", "Unknown")));
            track.setArtist(obj.optString("artist", obj.optString("artists", "Unknown Artist")));
            track.setCover(obj.optString("cover", obj.optString("image", obj.optString("thumbnail", ""))));
            track.setPreview(obj.optString("preview", obj.optString("preview_url", "")));
            track.setStreamUrl(obj.optString("streamUrl", obj.optString("fullStreamUrl", track.getPreview())));
            track.setDuration(obj.optString("duration", "Full Hi-Fi"));
            track.setSource(obj.optString("source", "320 kbps"));
            list.add(track);
        }
        return list;
    }
}
