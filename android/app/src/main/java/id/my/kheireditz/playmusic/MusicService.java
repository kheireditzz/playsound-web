package id.my.kheireditz.playmusic;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.core.app.NotificationCompat;

import java.util.ArrayList;
import java.util.List;

public class MusicService extends Service implements MediaPlayer.OnPreparedListener,
        MediaPlayer.OnCompletionListener, MediaPlayer.OnErrorListener {

    private static final String CHANNEL_ID = "playmusic_playback_channel";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_PLAY = "id.my.kheireditz.playmusic.ACTION_PLAY";
    public static final String ACTION_PAUSE = "id.my.kheireditz.playmusic.ACTION_PAUSE";
    public static final String ACTION_NEXT = "id.my.kheireditz.playmusic.ACTION_NEXT";
    public static final String ACTION_PREV = "id.my.kheireditz.playmusic.ACTION_PREV";

    private final IBinder binder = new MusicBinder();
    private MediaPlayer mediaPlayer;
    private MediaSessionCompat mediaSession;

    private final List<Track> playlist = new ArrayList<>();
    private int currentIndex = -1;
    private Track currentTrack;

    private boolean isPreparing = false;
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private PlaybackListener playbackListener;

    public interface PlaybackListener {
        void onTrackChanged(Track track);
        void onPlaybackStateChanged(boolean isPlaying);
        void onProgressUpdated(int currentMs, int totalMs);
        void onError(String message);
    }

    public class MusicBinder extends Binder {
        public MusicService getService() {
            return MusicService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        initMediaPlayer();
        initMediaSession();
        createNotificationChannel();
        startProgressUpdater();

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PLAY);
        filter.addAction(ACTION_PAUSE);
        filter.addAction(ACTION_NEXT);
        filter.addAction(ACTION_PREV);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(notificationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(notificationReceiver, filter);
        }
    }

    private final BroadcastReceiver notificationReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (ACTION_PLAY.equals(action)) {
                resume();
            } else if (ACTION_PAUSE.equals(action)) {
                pause();
            } else if (ACTION_NEXT.equals(action)) {
                playNext();
            } else if (ACTION_PREV.equals(action)) {
                playPrevious();
            }
        }
    };

    private void initMediaPlayer() {
        mediaPlayer = new MediaPlayer();
        mediaPlayer.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
        mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .build());
        mediaPlayer.setOnPreparedListener(this);
        mediaPlayer.setOnCompletionListener(this);
        mediaPlayer.setOnErrorListener(this);
    }

    private void initMediaSession() {
        mediaSession = new MediaSessionCompat(this, "PlayMusicSession");
        mediaSession.setActive(true);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Play Music Playback",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Notifikasi kontrol pemutaran musik di latar belakang");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    public void setPlaybackListener(PlaybackListener listener) {
        this.playbackListener = listener;
        if (currentTrack != null && listener != null) {
            listener.onTrackChanged(currentTrack);
            listener.onPlaybackStateChanged(isPlaying());
        }
    }

    public void setPlaylist(List<Track> tracks, int startIndex) {
        playlist.clear();
        if (tracks != null) {
            playlist.addAll(tracks);
        }
        if (startIndex >= 0 && startIndex < playlist.size()) {
            playTrack(startIndex);
        }
    }

    public void playTrack(int index) {
        if (index < 0 || index >= playlist.size()) return;
        currentIndex = index;
        Track track = playlist.get(index);
        currentTrack = track;

        if (playbackListener != null) {
            playbackListener.onTrackChanged(track);
            playbackListener.onPlaybackStateChanged(false);
        }

        // Resolusi stream URL
        String streamUrl = track.getStreamUrl();
        if (streamUrl != null && !streamUrl.isEmpty()) {
            startStreamAudio(streamUrl);
        } else {
            // Scrape stream url di backend
            ApiClient.fetchFullAudioUrl(track.getTitle(), track.getArtist(), new ApiClient.ApiCallback<String>() {
                @Override
                public void onSuccess(String resolvedUrl) {
                    if (resolvedUrl != null && !resolvedUrl.isEmpty()) {
                        track.setStreamUrl(resolvedUrl);
                        startStreamAudio(resolvedUrl);
                    } else if (track.getPreview() != null && !track.getPreview().isEmpty()) {
                        startStreamAudio(track.getPreview());
                    } else {
                        if (playbackListener != null) {
                            playbackListener.onError("Gagal memuat stream audio untuk " + track.getTitle());
                        }
                    }
                }

                @Override
                public void onError(Exception e) {
                    if (track.getPreview() != null && !track.getPreview().isEmpty()) {
                        startStreamAudio(track.getPreview());
                    } else if (playbackListener != null) {
                        playbackListener.onError("Koneksi gagal saat memuat audio: " + e.getMessage());
                    }
                }
            });
        }
    }

    private void startStreamAudio(String url) {
        try {
            isPreparing = true;
            mediaPlayer.reset();
            mediaPlayer.setDataSource(url);
            mediaPlayer.prepareAsync();
            updateNotification();
        } catch (Exception e) {
            isPreparing = false;
            if (playbackListener != null) {
                playbackListener.onError("Gagal memutar audio: " + e.getMessage());
            }
        }
    }

    @Override
    public void onPrepared(MediaPlayer mp) {
        isPreparing = false;
        mp.start();
        updateNotification();
        if (playbackListener != null) {
            playbackListener.onPlaybackStateChanged(true);
        }
    }

    @Override
    public void onCompletion(MediaPlayer mp) {
        playNext();
    }

    @Override
    public boolean onError(MediaPlayer mp, int what, int extra) {
        isPreparing = false;
        if (playbackListener != null) {
            playbackListener.onError("Terjadi kesalahan pada pemutar media.");
        }
        return true;
    }

    public void pause() {
        if (mediaPlayer != null && mediaPlayer.isPlaying()) {
            mediaPlayer.pause();
            updateNotification();
            if (playbackListener != null) {
                playbackListener.onPlaybackStateChanged(false);
            }
        }
    }

    public void resume() {
        if (mediaPlayer != null && !mediaPlayer.isPlaying() && !isPreparing) {
            mediaPlayer.start();
            updateNotification();
            if (playbackListener != null) {
                playbackListener.onPlaybackStateChanged(true);
            }
        }
    }

    public void togglePlayPause() {
        if (isPlaying()) {
            pause();
        } else {
            resume();
        }
    }

    public void playNext() {
        if (playlist.isEmpty()) return;
        int nextIndex = (currentIndex + 1) % playlist.size();
        playTrack(nextIndex);
    }

    public void playPrevious() {
        if (playlist.isEmpty()) return;
        int prevIndex = currentIndex - 1;
        if (prevIndex < 0) prevIndex = playlist.size() - 1;
        playTrack(prevIndex);
    }

    public void seekTo(int positionMs) {
        if (mediaPlayer != null && !isPreparing) {
            mediaPlayer.seekTo(positionMs);
        }
    }

    public boolean isPlaying() {
        return mediaPlayer != null && !isPreparing && mediaPlayer.isPlaying();
    }

    public int getCurrentPosition() {
        if (mediaPlayer != null && !isPreparing) {
            try {
                return mediaPlayer.getCurrentPosition();
            } catch (Exception ignored) {}
        }
        return 0;
    }

    public int getDuration() {
        if (mediaPlayer != null && !isPreparing) {
            try {
                return mediaPlayer.getDuration();
            } catch (Exception ignored) {}
        }
        return 0;
    }

    public Track getCurrentTrack() {
        return currentTrack;
    }

    private void startProgressUpdater() {
        progressHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (isPlaying() && playbackListener != null) {
                    playbackListener.onProgressUpdated(getCurrentPosition(), getDuration());
                }
                progressHandler.postDelayed(this, 500);
            }
        }, 500);
    }

    private void updateNotification() {
        if (currentTrack == null) return;

        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, contentIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        PendingIntent pPlay = PendingIntent.getBroadcast(this, 1, new Intent(ACTION_PLAY), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent pPause = PendingIntent.getBroadcast(this, 2, new Intent(ACTION_PAUSE), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent pNext = PendingIntent.getBroadcast(this, 3, new Intent(ACTION_NEXT), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent pPrev = PendingIntent.getBroadcast(this, 4, new Intent(ACTION_PREV), PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(currentTrack.getTitle())
                .setContentText(currentTrack.getArtist())
                .setSubText("Play Music v2.4.6")
                .setContentIntent(pendingIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(isPlaying())
                .addAction(R.drawable.ic_skip_previous, "Previous", pPrev);

        if (isPlaying()) {
            builder.addAction(R.drawable.ic_pause, "Pause", pPause);
        } else {
            builder.addAction(R.drawable.ic_play_arrow, "Play", pPlay);
        }

        builder.addAction(R.drawable.ic_skip_next, "Next", pNext);

        androidx.media.app.NotificationCompat.MediaStyle mediaStyle =
                new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2);

        builder.setStyle(mediaStyle);
        Notification notification = builder.build();
        startForeground(NOTIFICATION_ID, notification);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try {
            unregisterReceiver(notificationReceiver);
        } catch (Exception ignored) {}
        progressHandler.removeCallbacksAndMessages(null);
        if (mediaPlayer != null) {
            mediaPlayer.release();
            mediaPlayer = null;
        }
        if (mediaSession != null) {
            mediaSession.release();
        }
        stopForeground(true);
    }
}
