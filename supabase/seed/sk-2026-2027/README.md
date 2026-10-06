# Data awal dari SK pembagian tugas 2026/2027

Sumber: SK 390 (pembagian tugas guru dalam pembelajaran) dan SK 391 (tugas tambahan guru), SMKN 1 Gunung Sindur, 15 Juli 2026.
Bukan migrasi: dijalankan sekali, secara manual, setelah migrasi `20261008_kurikulum_*` terpasang.

Urutan:
1. `01_mapel.sql` nama mapel disesuaikan dengan SK, kata kunci bidang linier.
2. `02_struktur.sql` struktur kurikulum per tingkat dan program (43 baris). Bila struktur contoh lama masih ada, nonaktifkan dulu (`update public.kur_struktur set aktif=false where tahun_ajaran='2026/2027'`) dan pakai `on conflict ... do update`.
3. `03_beban_x.sql`, `03_beban_xi.sql`, `03_beban_xii.sql` pembagian guru (403 baris, total 1.608 JP, sama dengan SK).
4. Wali kelas dari SK 391 (34 rombel) dimuat ke `kur_wali` berstatus `disetujui`.
5. `05_jadwal_draf.sql` DRAF jadwal hasil pencarian lokal (bukan bagian SK): nol bentrok guru, jam satu mapel dikelompokkan berurutan.
   Jam bel sekolah (migrasi `20261008_kurikulum_g_jam_bel_tiga_kelompok.sql`): mulai 07.10, istirahat 09.50 sampai 10.10 dan 12.10 sampai 12.50, 40 menit per JP.
   Senin 11 JP (pulang 15.30), Selasa sampai Kamis 10 JP (pulang 14.50), Jumat 6 JP sampai 11.30 lalu salat Jumat dan kegiatan sampai 13.00. Total 47 slot per minggu.
   Kelas X dan XI di SK 390 berjumlah 48 JP per minggu, satu JP lebih banyak dari slot: 22 JP (satu per kelas, dari mapel kejuruan terbesar) belum terjadwal dan perlu diputuskan Waka Kurikulum.

`sk_data.py` adalah transkripsi lampiran SK 390 yang dipakai untuk menghitung dan memeriksa data (total 1.608 JP; tiap rombel 48 JP untuk X dan XI, 46 JP untuk XII).
