-- Modul Kesiswaan, bagian E: indeks untuk kunci asing yang dipakai penyaringan dan penghapusan.
create index if not exists izin_rombel_idx on public.izin_siswa (rombel_id, status);
create index if not exists kehadiran_rombel_idx on public.kehadiran_harian (rombel_id);
create index if not exists ekskul_kehadiran_anggota_idx on public.ekskul_kehadiran (anggota_id);
