-- Penanda akun yang password awalnya sudah disetel (siswa: tanggal lahir DDMMYYYY, guru: NPSN).
alter table public.profil_pengguna add column if not exists sandi_awal_diatur boolean not null default false;
