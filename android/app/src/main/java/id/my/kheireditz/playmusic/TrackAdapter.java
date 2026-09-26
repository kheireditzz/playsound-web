package id.my.kheireditz.playmusic;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

public class TrackAdapter extends RecyclerView.Adapter<TrackAdapter.TrackViewHolder> {

    private final List<Track> tracks = new ArrayList<>();
    private final OnTrackActionListener listener;

    public interface OnTrackActionListener {
        void onPlay(Track track, int position);
        void onDownload(Track track);
    }

    public TrackAdapter(OnTrackActionListener listener) {
        this.listener = listener;
    }

    public void setTracks(List<Track> newTracks) {
        tracks.clear();
        if (newTracks != null) {
            tracks.addAll(newTracks);
        }
        notifyDataSetChanged();
    }

    public List<Track> getTracks() {
        return tracks;
    }

    @NonNull
    @Override
    public TrackViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_song, parent, false);
        return new TrackViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull TrackViewHolder holder, int position) {
        Track track = tracks.get(position);
        holder.tvTitle.setText(track.getTitle());
        holder.tvArtist.setText(track.getArtist());
        holder.tvDuration.setText(track.getDuration());
        holder.tvSource.setText(track.getSource());

        ImageLoader.getInstance().displayImage(track.getCover(), holder.imgCover, R.drawable.ic_music_note);

        holder.itemView.setOnClickListener(v -> {
            if (listener != null) listener.onPlay(track, position);
        });

        holder.btnPlay.setOnClickListener(v -> {
            if (listener != null) listener.onPlay(track, position);
        });

        holder.btnDownload.setOnClickListener(v -> {
            if (listener != null) listener.onDownload(track);
        });
    }

    @Override
    public int getItemCount() {
        return tracks.size();
    }

    public static class TrackViewHolder extends RecyclerView.ViewHolder {
        final ImageView imgCover;
        final TextView tvTitle;
        final TextView tvArtist;
        final TextView tvDuration;
        final TextView tvSource;
        final ImageButton btnPlay;
        final ImageButton btnDownload;

        public TrackViewHolder(@NonNull View itemView) {
            super(itemView);
            imgCover = itemView.findViewById(R.id.imgSongCover);
            tvTitle = itemView.findViewById(R.id.tvSongTitle);
            tvArtist = itemView.findViewById(R.id.tvSongArtist);
            tvDuration = itemView.findViewById(R.id.tvSongDuration);
            tvSource = itemView.findViewById(R.id.tvSongSource);
            btnPlay = itemView.findViewById(R.id.btnPlaySong);
            btnDownload = itemView.findViewById(R.id.btnDownloadSong);
        }
    }
}
