-- Modul Hubungan Industri dan Humas, bagian A: jabatan, izin, profil sekolah, profil jurusan.
-- Waka Hubinmas memegang semua izin hubin.*. Staf Hubin memegang data mitra, tracer study, dan penulisan berita.
-- Menerbitkan berita tetap izin hubin.kelola_humas (Waka). Bila nanti staf boleh menerbitkan, cukup tambah satu baris di jabatan_izin.

insert into public.izin (kode, nama, bidang) values
  ('hubin.kelola_profil', 'Mengelola profil sekolah dan profil jurusan', 'Hubungan industri'),
  ('hubin.tulis_berita', 'Menulis dan mengajukan berita', 'Hubungan industri'),
  ('hubin.tracer', 'Mengelola tracer study alumni', 'Hubungan industri')
on conflict (kode) do nothing;

insert into public.jabatan (kode, nama, kelompok, lingkup, induk_kode, urutan, tampil_publik, satu_pemegang, bagan, keterangan)
values ('staf_hubin', 'Staf Hubungan Industri dan Humas', 'Hubungan industri', 'sekolah', 'waka_hubin', 41, true, false, true,
        'Membantu Waka Hubinmas: data mitra industri, tracer study, dan penulisan berita.')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_hubin', 'hubin.kelola_profil'),
  ('waka_hubin', 'hubin.tulis_berita'),
  ('waka_hubin', 'hubin.tracer'),
  ('staf_hubin', 'hubin.kelola_dudi'),
  ('staf_hubin', 'hubin.tulis_berita'),
  ('staf_hubin', 'hubin.tracer'),
  ('staf_hubin', 'kegiatan.kelola')
on conflict do nothing;

-- Izin hubin yang dimiliki pengguna saat ini. Admin TU ikut memegang dudi dan tracer, selaras dengan kebijakan tabel dudi.
create or replace function public.hubin_izin() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(k order by k), array[]::text[])
    from unnest(array['hubin.kelola_dudi','hubin.kelola_humas','hubin.kelola_profil','hubin.tulis_berita','hubin.tracer']) k
   where auth.uid() is not null
     and (private.punya_izin(k, null)
          or (k in ('hubin.kelola_dudi','hubin.tracer') and private.peran_saya() = 'admin_tu'))
$$;
revoke all on function public.hubin_izin() from public, anon;
grant execute on function public.hubin_izin() to authenticated;

-- Profil sekolah: selain super admin, pemegang izin hubin.kelola_profil di sekolahnya.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profil_sekolah_manual' and policyname = 'profil_sekolah_hubin') then
    create policy profil_sekolah_hubin on public.profil_sekolah_manual for all to authenticated
      using ((select private.punya_izin('hubin.kelola_profil', null)) and npsn = (select private.npsn_saya()))
      with check ((select private.punya_izin('hubin.kelola_profil', null)) and npsn = (select private.npsn_saya()));
  end if;
end $$;

-- Profil jurusan. Kode singkat mengikuti nama rombel di Dapodik ("X TE 1" berarti TE), dipakai untuk menghitung siswa aktif.
create table if not exists public.jurusan_profil (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  kode text not null check (kode ~ '^[A-Z0-9]{2,8}$'),
  nama text not null check (char_length(btrim(nama)) between 3 and 120),
  bidang text check (char_length(bidang) <= 120),
  program text check (char_length(program) <= 120),
  ringkas text check (char_length(ringkas) <= 300),
  deskripsi text check (char_length(deskripsi) <= 5000),
  kompetensi_lulusan text check (char_length(kompetensi_lulusan) <= 3000),
  mapel_kejuruan text check (char_length(mapel_kejuruan) <= 2000),
  fasilitas text check (char_length(fasilitas) <= 2000),
  prospek text[] not null default '{}',
  kepala_program text check (char_length(kepala_program) <= 120),
  tampil boolean not null default true,
  urutan int not null default 100,
  diperbarui_oleh uuid,
  diperbarui_pada timestamptz not null default now(),
  unique (npsn, kode)
);
alter table public.jurusan_profil enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jurusan_profil' and policyname = 'jurusan_profil_kelola') then
    create policy jurusan_profil_kelola on public.jurusan_profil for all to authenticated
      using ((select private.punya_izin('hubin.kelola_profil', null)) and npsn = (select private.npsn_saya()))
      with check ((select private.punya_izin('hubin.kelola_profil', null)) and npsn = (select private.npsn_saya()));
  end if;
end $$;

create or replace function private.jejak_jurusan_profil() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.diperbarui_pada := now();
  new.diperbarui_oleh := auth.uid();
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'jejak_jurusan_profil') then
    create trigger jejak_jurusan_profil before insert or update on public.jurusan_profil
      for each row execute function private.jejak_jurusan_profil();
  end if;
end $$;

-- Isi awal dari teks lama di situs. Perlu ditinjau Waka Hubinmas.
insert into public.jurusan_profil (npsn, kode, nama, bidang, program, ringkas, prospek, urutan)
select s.npsn, v.kode, v.nama, v.bidang, v.program, v.ringkas, v.prospek, v.urutan
  from (select npsn from public.sekolah order by diperbarui_pada desc nulls last limit 1) s
 cross join (values
  ('TO', 'Teknik Kendaraan Ringan', 'Teknologi Manufaktur dan Rekayasa', 'Teknik Otomotif',
     'Perawatan, perbaikan, dan diagnosis kendaraan ringan.',
     array['Teknisi bengkel resmi','Wirausaha bengkel','Industri komponen otomotif'], 10),
  ('TP', 'Teknik Pemesinan', 'Teknologi Manufaktur dan Rekayasa', 'Teknik Mesin',
     'Pengoperasian mesin bubut, frais, dan dasar CNC untuk pembuatan komponen.',
     array['Operator mesin CNC','Quality control','Industri manufaktur'], 20),
  ('TE', 'Teknik Elektronika Industri', 'Teknologi Manufaktur dan Rekayasa', 'Teknik Elektronika',
     'Instalasi, kontrol, dan perawatan sistem elektronika dan otomasi industri.',
     array['Teknisi otomasi','Teknisi instrumentasi','Industri elektronik'], 30),
  ('TJKT', 'Teknik Jaringan Komputer dan Telekomunikasi', 'Teknologi Informasi', 'Teknik Jaringan Komputer dan Telekomunikasi',
     'Perakitan komputer, jaringan, server, dan keamanan jaringan.',
     array['Teknisi jaringan','Administrator sistem','Penyedia layanan internet'], 40),
  ('BP', 'Produksi Film', 'Seni dan Ekonomi Kreatif', 'Broadcasting dan Perfilman',
     'Praproduksi, produksi, dan pascaproduksi film serta konten siaran.',
     array['Kamerawan dan editor','Produksi konten digital','Rumah produksi dan stasiun siaran'], 50)
 ) as v (kode, nama, bidang, program, ringkas, prospek, urutan)
on conflict (npsn, kode) do nothing;

-- Daftar jurusan untuk situs publik, lengkap dengan jumlah siswa aktif (agregat, tanpa data pribadi).
create or replace function public.jurusan_profil_publik() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kode', j.kode, 'nama', j.nama, 'bidang', nullif(j.bidang, ''), 'program', nullif(j.program, ''),
    'ringkas', nullif(j.ringkas, ''), 'deskripsi', nullif(j.deskripsi, ''),
    'kompetensi_lulusan', nullif(j.kompetensi_lulusan, ''), 'mapel_kejuruan', nullif(j.mapel_kejuruan, ''),
    'fasilitas', nullif(j.fasilitas, ''), 'prospek', to_jsonb(j.prospek), 'kepala_program', nullif(j.kepala_program, ''),
    'jumlah_siswa', (
      select count(distinct kr.peserta_didik_id)
        from public.rombel r
        join public.keanggotaan_rombel kr on kr.rombel_id = r.id
        join public.peserta_didik pd on pd.id = kr.peserta_didik_id and pd.status_peserta_didik = 'aktif'
       where r.jenis_rombel = 'Kelas Utama'
         and r.npsn = j.npsn
         and r.semester_id = (select max(semester_id) from public.rombel where jenis_rombel = 'Kelas Utama')
         and split_part(r.nama, ' ', 2) = j.kode)
  ) order by j.urutan, j.nama), '[]'::jsonb)
  from public.jurusan_profil j
  where j.tampil
$$;
revoke all on function public.jurusan_profil_publik() from public;
grant execute on function public.jurusan_profil_publik() to anon, authenticated;
