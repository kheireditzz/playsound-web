export const PORT = process.env.PORT || 3000;

export const CACHE_TTL_MS = 3 * 60 * 1000; // 3 menit untuk chart realtime

export const BAD_TRACK_KEYWORDS = [
  'karaoke', 'instrumental', 'piano version', 'piano cover', 'backing track',
  'tribute to', 'tribute band', 'tribute', 'acoustic guitar', 'guitar version',
  'relaxing piano', 'relaxing', 'lullaby', '8-bit', 'ringtone', 'remake',
  'cover version', 'originally performed', 'sing2guitar', 'hit the button karaoke',
  'karaoke sesh', 'guitar backing', 'piano accompaniment'
];

export const SPOTIFY_PLAYLIST_IDS = {
  global: '37i9dQZEVXbMDoHDwVN2tF', // Top 50 Global
  fresh: '37i9dQZF1DXcBWIGoYBM5M',  // Today's Top Hits
  tiktok: '37i9dQZF1DX2L0iB23Enbq', // Viral Hits
  indo: '37i9dQZF1DX4vthAhgZ1T4'    // Puncak Klasemen Indo
};

export const USER_AGENTS = {
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
};
