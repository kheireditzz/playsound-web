# Play Music by Kheireditz

Platform web pemutar musik dan radar chart musik viral mancanegara & lokal secara real-time (TikTok Sounds, Spotify Viral 50, Billboard Top 100, UK Official, K-Pop Radar, dan Oricon Japan).

## 🚀 Fitur Unggulan
- **Agregasi Multi-Platform Real-time:** Menarik otomatis metadata dan preview audio resmi dari chart global (Deezer API & Apple iTunes RSS API).
- **Tactile Neumorphism Design System:** Permukaan taktil warm-gray (`#E7E5E4`), shadow timbul/cekung presisi, aksen Deep Teal (`#006666`), tipografi Space Mono & Plus Jakarta Sans, serta fixed header.
- **Universal Player Dock:** Pemutar audio terintegrasi di bagian bawah dengan kontrol Play/Pause, Seekbar responsif, sound-wave audio visualizer, serta tombol langsung putar lagu utuh via YouTube.
- **Instant Search & Kategori:** Navigasi cepat antar wilayah (Global, TikTok, US, UK, Korea, Jepang) atau pencarian langsung artis/judul lagu.

## 🛠️ Cara Menjalankan
Server saat ini sudah aktif via PM2:
```bash
# Cek status server
pm2 status

# Melihat log aktivitas
pm2 logs viral-music

# Restart / Stop
pm2 restart viral-music
pm2 stop viral-music
```

Akses web langsung melalui browser di: `http://localhost:3000` (atau IP lokal perangkat jika diakses dari jaringan Wi-Fi yang sama).
