package id.my.kheireditz.playmusic;

import java.io.Serializable;

public class Track implements Serializable {
    private String id;
    private String title;
    private String artist;
    private String cover;
    private String preview;
    private String streamUrl;
    private String duration;
    private String source;

    public Track() {
    }

    public Track(String id, String title, String artist, String cover, String streamUrl, String duration) {
        this.id = id;
        this.title = title;
        this.artist = artist;
        this.cover = cover;
        this.streamUrl = streamUrl;
        this.duration = duration;
    }

    public String getId() { return id != null ? id : ""; }
    public void setId(String id) { this.id = id; }

    public String getTitle() { return title != null && !title.isEmpty() ? title : "Unknown Title"; }
    public void setTitle(String title) { this.title = title; }

    public String getArtist() { return artist != null && !artist.isEmpty() ? artist : "Unknown Artist"; }
    public void setArtist(String artist) { this.artist = artist; }

    public String getCover() { return cover != null ? cover : ""; }
    public void setCover(String cover) { this.cover = cover; }

    public String getPreview() { return preview != null ? preview : ""; }
    public void setPreview(String preview) { this.preview = preview; }

    public String getStreamUrl() { return streamUrl != null ? streamUrl : ""; }
    public void setStreamUrl(String streamUrl) { this.streamUrl = streamUrl; }

    public String getDuration() { return duration != null ? duration : "03:30"; }
    public void setDuration(String duration) { this.duration = duration; }

    public String getSource() { return source != null ? source : "Hi-Fi"; }
    public void setSource(String source) { this.source = source; }
}
