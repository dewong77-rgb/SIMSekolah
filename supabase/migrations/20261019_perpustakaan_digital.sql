-- Perpustakaan digital: koleksi buku PDF yang dibeli sekolah, dibaca siswa dan guru langsung di aplikasi,
-- dirujuk guru pada pertemuan dan tugas, dikelola penanggung jawab perpustakaan atau super admin.
--
-- Penyimpanan: bucket privat "perpustakaan" (hanya lewat tautan bertanda tangan, tidak pernah publik).
--   buku/{npsn}/{kode}.pdf       berkas buku
--   sampul/{npsn}/{kode}.webp    sampul (dibuat dari halaman pertama saat unggah)
-- Tabel tanpa policy: semua akses lewat fungsi security definer (pola persuratan dan LMS).
--
-- Kewenangan kelola: super admin, atau terdaftar di perpus_pengelola (tetap berlaku lintas tahun ajaran),
-- atau memegang izin penugasan perpus.kelola (Kepala Perpustakaan).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('perpustakaan', 'perpustakaan', false, 52428800, array['application/pdf', 'image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- tabel
create table if not exists public.perpus_pengelola (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  ptk_id uuid not null references public.ptk (id) on delete cascade,
  peran text not null default 'penanggung_jawab' check (peran in ('penanggung_jawab', 'petugas')),
  aktif boolean not null default true,
  sumber text not null default 'manual' check (sumber in ('manual', 'otomatis')),
  dibuat_pada timestamptz not null default now(),
  unique (ptk_id)
);

-- Aturan penunjukan otomatis: PTK dengan nama ini langsung menjadi pengelola, juga saat datanya masuk belakangan lewat Dapodik.
create table if not exists public.perpus_penunjukan_otomatis (
  nama_norm text primary key,
  peran text not null default 'penanggung_jawab' check (peran in ('penanggung_jawab', 'petugas'))
);

create table if not exists public.perpus_buku (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  judul text not null check (char_length(btrim(judul)) between 3 and 200),
  penulis text check (char_length(penulis) <= 200),
  penerbit text check (char_length(penerbit) <= 200),
  tahun_terbit int check (tahun_terbit is null or tahun_terbit between 1900 and 2100),
  isbn text check (char_length(isbn) <= 30),
  kategori text not null default 'Umum' check (char_length(btrim(kategori)) between 2 and 60),
  jenis_buku text not null default 'buku_teks' check (jenis_buku in ('buku_teks', 'pengayaan', 'referensi', 'fiksi', 'panduan_guru', 'periodikal', 'lainnya')),
  nomor_induk text check (char_length(nomor_induk) <= 40),
  klasifikasi text check (klasifikasi is null or klasifikasi ~ '^[0-9]{3}(\.[0-9]{1,8})?$'),
  nomor_panggil text check (char_length(nomor_panggil) <= 60),
  edisi text check (char_length(edisi) <= 60),
  kota_terbit text check (char_length(kota_terbit) <= 80),
  bahasa text not null default 'Indonesia' check (char_length(bahasa) <= 40),
  subjek text check (char_length(subjek) <= 300),
  harga numeric(14, 2) check (harga is null or harga >= 0),
  jumlah_lisensi int check (jumlah_lisensi is null or jumlah_lisensi >= 1),
  mapel text check (char_length(mapel) <= 80),
  tingkat text check (tingkat is null or tingkat in ('X', 'XI', 'XII', 'Semua')),
  deskripsi text check (char_length(deskripsi) <= 2000),
  jumlah_halaman int check (jumlah_halaman is null or jumlah_halaman between 1 and 5000),
  berkas_path text not null unique check (berkas_path ~ '^buku/[0-9]+/[A-Za-z0-9._-]+\.pdf$'),
  ukuran_byte bigint check (ukuran_byte is null or ukuran_byte > 0),
  sampul_path text unique check (sampul_path is null or sampul_path ~ '^sampul/[0-9]+/[A-Za-z0-9._-]+$'),
  sumber_perolehan text not null default 'beli' check (sumber_perolehan in ('beli', 'hibah', 'bos', 'lainnya')),
  nomor_lisensi text check (char_length(nomor_lisensi) <= 100),
  tanggal_perolehan date,
  lisensi_berakhir date,
  status text not null default 'draf' check (status in ('draf', 'terbit', 'arsip')),
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now()
);
create index if not exists perpus_buku_npsn_status_idx on public.perpus_buku (npsn, status);
create unique index if not exists perpus_buku_nomor_induk_uq on public.perpus_buku (npsn, nomor_induk) where nomor_induk is not null;

create table if not exists public.perpus_progres (
  buku_id uuid not null references public.perpus_buku (id) on delete cascade,
  user_id uuid not null,
  halaman int not null default 1 check (halaman >= 1),
  halaman_terjauh int not null default 1 check (halaman_terjauh >= 1),
  terakhir_dibuka timestamptz not null default now(),
  primary key (buku_id, user_id)
);

-- Satu baris per kunjungan baca. detik_aktif hanya menghitung waktu layar terbuka dan pengguna beraktivitas.
create table if not exists public.perpus_sesi (
  id uuid primary key default gen_random_uuid(),
  buku_id uuid not null references public.perpus_buku (id) on delete cascade,
  user_id uuid not null,
  mulai timestamptz not null default now(),
  terakhir_aktif timestamptz not null default now(),
  detik_aktif int not null default 0 check (detik_aktif >= 0),
  halaman_awal int not null default 1,
  halaman_akhir int not null default 1,
  halaman_dilihat int[] not null default '{}',
  asal text not null default 'katalog' check (asal in ('katalog', 'pertemuan', 'tugas')),
  asal_id uuid
);
create index if not exists perpus_sesi_buku_idx on public.perpus_sesi (buku_id, mulai desc);
create index if not exists perpus_sesi_user_idx on public.perpus_sesi (user_id, mulai desc);
create index if not exists perpus_sesi_mulai_idx on public.perpus_sesi (mulai desc);

-- Jejak pengambilan rujukan: menyisipkan kutipan ke jawaban tugas atau menyalin rujukan dan tautan dari pembaca.
create table if not exists public.perpus_kutipan (
  id uuid primary key default gen_random_uuid(),
  buku_id uuid not null references public.perpus_buku (id) on delete cascade,
  user_id uuid not null,
  cara text not null check (cara in ('sisip_tugas', 'salin_rujukan', 'salin_tautan')),
  tugas_id uuid references public.tugas (id) on delete set null,
  halaman text check (char_length(halaman) <= 20),
  waktu timestamptz not null default now()
);
create index if not exists perpus_kutipan_buku_idx on public.perpus_kutipan (buku_id, waktu desc);
create index if not exists perpus_kutipan_waktu_idx on public.perpus_kutipan (waktu desc);

create table if not exists public.perpus_rujukan (
  id uuid primary key default gen_random_uuid(),
  buku_id uuid not null references public.perpus_buku (id) on delete cascade,
  pertemuan_id uuid references public.pertemuan (id) on delete cascade,
  tugas_id uuid references public.tugas (id) on delete cascade,
  hal_mulai int check (hal_mulai is null or hal_mulai >= 1),
  hal_akhir int check (hal_akhir is null or hal_akhir >= 1),
  catatan text check (char_length(catatan) <= 300),
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  check ((pertemuan_id is null) <> (tugas_id is null)),
  check (hal_akhir is null or hal_mulai is null or hal_akhir >= hal_mulai)
);
create index if not exists perpus_rujukan_pertemuan_idx on public.perpus_rujukan (pertemuan_id);
create index if not exists perpus_rujukan_tugas_idx on public.perpus_rujukan (tugas_id);
create index if not exists perpus_rujukan_buku_idx on public.perpus_rujukan (buku_id);

alter table public.perpus_pengelola enable row level security;
alter table public.perpus_penunjukan_otomatis enable row level security;
alter table public.perpus_buku enable row level security;
alter table public.perpus_progres enable row level security;
alter table public.perpus_sesi enable row level security;
alter table public.perpus_kutipan enable row level security;
alter table public.perpus_rujukan enable row level security;
revoke all on table public.perpus_pengelola, public.perpus_penunjukan_otomatis, public.perpus_buku, public.perpus_progres, public.perpus_sesi, public.perpus_kutipan, public.perpus_rujukan from anon, authenticated;

-- ---------------------------------------------------------------- pembantu hak akses
create or replace function private.perpus_peran_saya() returns text
language sql stable security definer set search_path = '' as $$
  select case when private.adalah_super() then 'super' else
    (select pp.peran from public.perpus_pengelola pp where pp.ptk_id = private.ptk_id_saya() and pp.aktif limit 1) end
$$;

create or replace function private.boleh_kelola_perpus() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (private.perpus_peran_saya() is not null or private.punya_izin('perpus.kelola', null))
$$;

create or replace function private.boleh_atur_pengelola_perpus() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and coalesce(private.perpus_peran_saya() in ('super', 'penanggung_jawab'), false)
$$;

create or replace function private.boleh_baca_perpus() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (private.adalah_super() or private.peran_saya() in ('siswa', 'guru', 'staf', 'admin_tu', 'admin_ujian'))
$$;

-- Buku yang boleh dibaca pembaca biasa: terbit dan lisensinya belum berakhir.
create or replace function private.perpus_buku_terbuka(b public.perpus_buku) returns boolean
language sql stable set search_path = '' as $$
  select b.status = 'terbit' and (b.lisensi_berakhir is null or b.lisensi_berakhir >= (now() at time zone 'Asia/Jakarta')::date)
$$;

create or replace function private.boleh_baca_berkas_perpus(p_nama text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.boleh_kelola_perpus() or (
    private.boleh_baca_perpus() and exists (
      select 1 from public.perpus_buku b
       where (b.berkas_path = p_nama or b.sampul_path = p_nama) and b.npsn = private.npsn_saya() and private.perpus_buku_terbuka(b)))
$$;

-- ---------------------------------------------------------------- kebijakan penyimpanan
drop policy if exists perpustakaan_baca on storage.objects;
create policy perpustakaan_baca on storage.objects for select to authenticated
  using (bucket_id = 'perpustakaan' and private.boleh_baca_berkas_perpus(name));

drop policy if exists perpustakaan_kelola on storage.objects;
create policy perpustakaan_kelola on storage.objects for all to authenticated
  using (bucket_id = 'perpustakaan' and (storage.foldername(name))[1] in ('buku', 'sampul')
         and (storage.foldername(name))[2] = (select private.npsn_saya()) and (select private.boleh_kelola_perpus()))
  with check (bucket_id = 'perpustakaan' and (storage.foldername(name))[1] in ('buku', 'sampul')
         and (storage.foldername(name))[2] = (select private.npsn_saya()) and (select private.boleh_kelola_perpus()));

-- ---------------------------------------------------------------- penunjukan otomatis
create or replace function private.perpus_nama_norm(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')))
$$;

insert into public.perpus_penunjukan_otomatis (nama_norm, peran) values
  ('siti jamilah', 'penanggung_jawab'),
  ('meiliana triani', 'penanggung_jawab')
on conflict (nama_norm) do nothing;

-- Mendaftarkan PTK yang namanya cocok dengan aturan. Nama ganda dilewati dan dilaporkan.
create or replace function private.perpus_tetapkan_otomatis(p_npsn text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; n int; v_baru int := 0; v_lewati jsonb := '[]'::jsonb; v_id uuid;
begin
  for r in select * from public.perpus_penunjukan_otomatis loop
    select count(*) into n from public.ptk where npsn = p_npsn and private.perpus_nama_norm(nama) = r.nama_norm;
    if n = 1 then
      select id into v_id from public.ptk where npsn = p_npsn and private.perpus_nama_norm(nama) = r.nama_norm;
      insert into public.perpus_pengelola (npsn, ptk_id, peran, sumber) values (p_npsn, v_id, r.peran, 'otomatis')
      on conflict (ptk_id) do nothing;
      get diagnostics n = row_count; v_baru := v_baru + n;
    else
      v_lewati := v_lewati || jsonb_build_object('nama', r.nama_norm, 'alasan', case when n = 0 then 'tidak ditemukan di data PTK' else 'ada lebih dari satu PTK bernama sama' end);
    end if;
  end loop;
  return jsonb_build_object('ditambah', v_baru, 'dilewati', v_lewati);
end $$;

create or replace function private.perpus_pemicu_ptk() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.perpus_penunjukan_otomatis%rowtype;
begin
  select * into r from public.perpus_penunjukan_otomatis where nama_norm = private.perpus_nama_norm(new.nama);
  if found and (select count(*) from public.ptk where npsn = new.npsn and private.perpus_nama_norm(nama) = r.nama_norm) = 1 then
    insert into public.perpus_pengelola (npsn, ptk_id, peran, sumber) values (new.npsn, new.id, r.peran, 'otomatis') on conflict (ptk_id) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists perpus_ptk_otomatis on public.ptk;
create trigger perpus_ptk_otomatis after insert on public.ptk for each row execute function private.perpus_pemicu_ptk();

do $$
declare s record;
begin
  for s in select npsn from public.sekolah loop
    perform private.perpus_tetapkan_otomatis(s.npsn);
  end loop;
end $$;

-- ---------------------------------------------------------------- fungsi untuk aplikasi
create or replace function public.perpus_izin() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'baca', private.boleh_baca_perpus(),
    'kelola', private.boleh_kelola_perpus(),
    'atur_pengelola', private.boleh_atur_pengelola_perpus(),
    'peran', private.perpus_peran_saya())
$$;

create or replace function private.perpus_buku_json(b public.perpus_buku, v_kelola boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'judul', b.judul, 'penulis', b.penulis, 'penerbit', b.penerbit, 'tahun_terbit', b.tahun_terbit,
    'kategori', b.kategori, 'jenis_buku', b.jenis_buku, 'klasifikasi', b.klasifikasi, 'nomor_panggil', b.nomor_panggil,
    'edisi', b.edisi, 'kota_terbit', b.kota_terbit, 'bahasa', b.bahasa, 'subjek', b.subjek,
    'mapel', b.mapel, 'tingkat', b.tingkat, 'deskripsi', b.deskripsi, 'isbn', b.isbn,
    'jumlah_halaman', b.jumlah_halaman, 'sampul_path', b.sampul_path, 'status', b.status, 'lisensi_berakhir', b.lisensi_berakhir,
    'ukuran_byte', b.ukuran_byte, 'sumber_perolehan', b.sumber_perolehan, 'nomor_lisensi', b.nomor_lisensi,
    'tanggal_perolehan', b.tanggal_perolehan,
    'nomor_induk', case when v_kelola then b.nomor_induk end, 'harga', case when v_kelola then b.harga end,
    'jumlah_lisensi', case when v_kelola then b.jumlah_lisensi end, 'berkas_path', case when v_kelola then b.berkas_path end)
$$;

create or replace function public.perpus_buku_daftar(p_q text default null, p_kategori text default null, p_semua boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_kelola boolean := private.boleh_kelola_perpus(); v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not private.boleh_baca_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(private.perpus_buku_json(b, v_kelola) || jsonb_build_object(
      'halaman_terakhir', pr.halaman, 'halaman_terjauh', pr.halaman_terjauh,
      'pembaca', case when v_kelola then (select count(distinct x.user_id) from public.perpus_sesi x where x.buku_id = b.id) end,
      'dirujuk', case when v_kelola then (select count(*) from public.perpus_rujukan x where x.buku_id = b.id) end
    ) order by b.judul)
    from public.perpus_buku b
    left join public.perpus_progres pr on pr.buku_id = b.id and pr.user_id = auth.uid()
    where b.npsn = private.npsn_saya()
      and ((v_kelola and p_semua) or private.perpus_buku_terbuka(b))
      and (p_kategori is null or p_kategori = '' or b.kategori = p_kategori)
      and (v_q is null or b.judul ilike '%' || v_q || '%' or b.penulis ilike '%' || v_q || '%'
           or b.penerbit ilike '%' || v_q || '%' or b.mapel ilike '%' || v_q || '%' or b.isbn ilike '%' || v_q || '%'
           or b.subjek ilike '%' || v_q || '%' or b.nomor_panggil ilike '%' || v_q || '%' or b.klasifikasi like v_q || '%'
           or (v_kelola and b.nomor_induk ilike '%' || v_q || '%'))
  ), '[]'::jsonb);
end $$;

-- Satu buku untuk dibaca: membawa lokasi berkas dan posisi baca terakhir pengguna.
create or replace function public.perpus_buku_buka(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.perpus_buku%rowtype; pr public.perpus_progres%rowtype;
begin
  if not private.boleh_baca_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select * into b from public.perpus_buku where id = p_id and npsn = private.npsn_saya();
  if not found or not (private.boleh_kelola_perpus() or private.perpus_buku_terbuka(b)) then
    raise exception 'Buku tidak ditemukan atau belum tersedia.' using errcode = 'P0002';
  end if;
  select * into pr from public.perpus_progres where buku_id = p_id and user_id = auth.uid();
  return jsonb_build_object('id', b.id, 'judul', b.judul, 'penulis', b.penulis, 'penerbit', b.penerbit, 'tahun_terbit', b.tahun_terbit,
    'kategori', b.kategori, 'jumlah_halaman', b.jumlah_halaman, 'berkas_path', b.berkas_path,
    'halaman_terakhir', coalesce(pr.halaman, 1));
end $$;

-- Nomor induk otomatis: DIG/{tahun}/{urut 4 digit}, dilanjutkan dari nomor tertinggi tahun itu.
create or replace function private.perpus_nomor_induk_baru(p_npsn text) returns text
language sql stable set search_path = '' as $$
  select 'DIG/' || extract(year from (now() at time zone 'Asia/Jakarta'))::int || '/' ||
         lpad((coalesce(max(substring(nomor_induk from '^DIG/[0-9]{4}/([0-9]+)$')::int), 0) + 1)::text, 4, '0')
    from public.perpus_buku
   where npsn = p_npsn and nomor_induk like 'DIG/' || extract(year from (now() at time zone 'Asia/Jakarta'))::int || '/%'
$$;

create or replace function public.perpus_buku_simpan(p_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_npsn text := private.npsn_saya(); v_status text := coalesce(nullif(p_data ->> 'status', ''), 'draf');
        v_berkas text := btrim(coalesce(p_data ->> 'berkas_path', '')); v_sampul text := nullif(btrim(coalesce(p_data ->> 'sampul_path', '')), '');
        v_induk text := nullif(btrim(coalesce(p_data ->> 'nomor_induk', '')), '');
begin
  if not private.boleh_kelola_perpus() then raise exception 'Hanya pengelola perpustakaan yang dapat mengubah koleksi.' using errcode = '42501'; end if;
  if v_status not in ('draf', 'terbit', 'arsip') then raise exception 'Status buku tidak dikenal.' using errcode = '22023'; end if;
  if v_berkas !~ ('^buku/' || v_npsn || '/[A-Za-z0-9._-]+\.pdf$') then raise exception 'Berkas buku belum diunggah atau lokasinya tidak valid.' using errcode = '22023'; end if;
  if v_sampul is not null and v_sampul !~ ('^sampul/' || v_npsn || '/[A-Za-z0-9._-]+$') then raise exception 'Lokasi sampul tidak valid.' using errcode = '22023'; end if;
  if p_id is not null and not exists (select 1 from public.perpus_buku where id = p_id and npsn = v_npsn) then
    raise exception 'Buku tidak ditemukan.' using errcode = 'P0002';
  end if;
  if p_id is null then v_id := gen_random_uuid(); end if;
  if v_induk is null then
    v_induk := coalesce((select nomor_induk from public.perpus_buku where id = p_id), private.perpus_nomor_induk_baru(v_npsn));
  end if;
  begin
    insert into public.perpus_buku (id, npsn, judul, penulis, penerbit, tahun_terbit, isbn, kategori, jenis_buku, nomor_induk, klasifikasi, nomor_panggil,
      edisi, kota_terbit, bahasa, subjek, harga, jumlah_lisensi, mapel, tingkat, deskripsi, jumlah_halaman,
      berkas_path, ukuran_byte, sampul_path, sumber_perolehan, nomor_lisensi, tanggal_perolehan, lisensi_berakhir, status, dibuat_oleh)
    values (v_id, v_npsn, btrim(coalesce(p_data ->> 'judul', '')), nullif(btrim(p_data ->> 'penulis'), ''), nullif(btrim(p_data ->> 'penerbit'), ''),
      nullif(p_data ->> 'tahun_terbit', '')::int, nullif(btrim(p_data ->> 'isbn'), ''), coalesce(nullif(btrim(p_data ->> 'kategori'), ''), 'Umum'),
      coalesce(nullif(p_data ->> 'jenis_buku', ''), 'buku_teks'), v_induk, nullif(btrim(p_data ->> 'klasifikasi'), ''), nullif(btrim(p_data ->> 'nomor_panggil'), ''),
      nullif(btrim(p_data ->> 'edisi'), ''), nullif(btrim(p_data ->> 'kota_terbit'), ''), coalesce(nullif(btrim(p_data ->> 'bahasa'), ''), 'Indonesia'),
      nullif(btrim(p_data ->> 'subjek'), ''), nullif(p_data ->> 'harga', '')::numeric, nullif(p_data ->> 'jumlah_lisensi', '')::int,
      nullif(btrim(p_data ->> 'mapel'), ''), nullif(p_data ->> 'tingkat', ''), nullif(btrim(p_data ->> 'deskripsi'), ''),
      nullif(p_data ->> 'jumlah_halaman', '')::int, v_berkas, nullif(p_data ->> 'ukuran_byte', '')::bigint, v_sampul,
      coalesce(nullif(p_data ->> 'sumber_perolehan', ''), 'beli'), nullif(btrim(p_data ->> 'nomor_lisensi'), ''),
      nullif(p_data ->> 'tanggal_perolehan', '')::date, nullif(p_data ->> 'lisensi_berakhir', '')::date, v_status, auth.uid())
    on conflict (id) do update set
      judul = excluded.judul, penulis = excluded.penulis, penerbit = excluded.penerbit, tahun_terbit = excluded.tahun_terbit, isbn = excluded.isbn,
      kategori = excluded.kategori, jenis_buku = excluded.jenis_buku, nomor_induk = excluded.nomor_induk, klasifikasi = excluded.klasifikasi,
      nomor_panggil = excluded.nomor_panggil, edisi = excluded.edisi, kota_terbit = excluded.kota_terbit, bahasa = excluded.bahasa,
      subjek = excluded.subjek, harga = excluded.harga, jumlah_lisensi = excluded.jumlah_lisensi,
      mapel = excluded.mapel, tingkat = excluded.tingkat, deskripsi = excluded.deskripsi,
      jumlah_halaman = excluded.jumlah_halaman, berkas_path = excluded.berkas_path, ukuran_byte = excluded.ukuran_byte,
      sampul_path = excluded.sampul_path, sumber_perolehan = excluded.sumber_perolehan, nomor_lisensi = excluded.nomor_lisensi,
      tanggal_perolehan = excluded.tanggal_perolehan, lisensi_berakhir = excluded.lisensi_berakhir, status = excluded.status, diubah_pada = now();
  exception
    when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
      raise exception 'Isian belum valid. Judul 3 sampai 200 huruf, klasifikasi berbentuk 005 atau 005.133, tahun 1900 sampai 2100, tanggal berformat benar.' using errcode = '22023';
    when unique_violation then
      raise exception 'Nomor induk atau berkas ini sudah dipakai buku lain.' using errcode = '23505';
  end;
  return v_id;
end $$;

create or replace function public.perpus_buku_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_status not in ('draf', 'terbit', 'arsip') then raise exception 'Status buku tidak dikenal.' using errcode = '22023'; end if;
  update public.perpus_buku set status = p_status, diubah_pada = now() where id = p_id and npsn = private.npsn_saya();
  if not found then raise exception 'Buku tidak ditemukan.' using errcode = 'P0002'; end if;
end $$;

-- Menghapus buku dan seluruh rujukannya. Mengembalikan lokasi berkas agar aplikasi ikut membersihkan penyimpanan.
create or replace function public.perpus_buku_hapus(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.perpus_buku%rowtype;
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  delete from public.perpus_buku where id = p_id and npsn = private.npsn_saya() returning * into b;
  if not found then raise exception 'Buku tidak ditemukan.' using errcode = 'P0002'; end if;
  return jsonb_build_object('berkas_path', b.berkas_path, 'sampul_path', b.sampul_path);
end $$;

create or replace function public.perpus_progres_simpan(p_buku uuid, p_halaman int) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.perpus_buku%rowtype; v_h int := greatest(coalesce(p_halaman, 1), 1);
begin
  if not private.boleh_baca_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select * into b from public.perpus_buku where id = p_buku and npsn = private.npsn_saya();
  if not found or not (private.boleh_kelola_perpus() or private.perpus_buku_terbuka(b)) then return; end if;
  if b.jumlah_halaman is not null then v_h := least(v_h, b.jumlah_halaman); end if;
  insert into public.perpus_progres (buku_id, user_id, halaman, halaman_terjauh) values (p_buku, auth.uid(), v_h, v_h)
  on conflict (buku_id, user_id) do update set halaman = excluded.halaman,
    halaman_terjauh = greatest(public.perpus_progres.halaman_terjauh, excluded.halaman), terakhir_dibuka = now();
end $$;

-- Rujukan buku pada pertemuan atau tugas.
create or replace function public.perpus_rujukan_daftar(p_jenis text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_kelola boolean := private.boleh_kelola_perpus();
begin
  if not private.boleh_baca_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_jenis not in ('pertemuan', 'tugas') then raise exception 'Jenis rujukan tidak valid.' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'buku_id', b.id, 'judul', b.judul, 'penulis', b.penulis, 'tahun_terbit', b.tahun_terbit, 'sampul_path', b.sampul_path,
      'hal_mulai', r.hal_mulai, 'hal_akhir', r.hal_akhir, 'catatan', r.catatan) order by r.dibuat_pada)
    from public.perpus_rujukan r join public.perpus_buku b on b.id = r.buku_id
    where b.npsn = private.npsn_saya()
      and ((p_jenis = 'pertemuan' and r.pertemuan_id = p_id) or (p_jenis = 'tugas' and r.tugas_id = p_id))
      and (v_kelola or private.perpus_buku_terbuka(b))
  ), '[]'::jsonb);
end $$;

create or replace function private.perpus_kelas_rujukan(p_jenis text, p_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when p_jenis = 'pertemuan' then (select kelas_ajar_id from public.pertemuan where id = p_id)
              when p_jenis = 'tugas' then (select kelas_ajar_id from public.tugas where id = p_id and not dihapus) end
$$;

create or replace function public.perpus_rujukan_simpan(p_jenis text, p_id uuid, p_buku uuid, p_mulai int, p_akhir int, p_catatan text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_kelas uuid; v_rid uuid;
begin
  if p_jenis not in ('pertemuan', 'tugas') then raise exception 'Jenis rujukan tidak valid.' using errcode = '22023'; end if;
  v_kelas := private.perpus_kelas_rujukan(p_jenis, p_id);
  if v_kelas is null or not private.lms_kelola(v_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if not exists (select 1 from public.perpus_buku b where b.id = p_buku and b.npsn = private.npsn_saya() and b.status = 'terbit') then
    raise exception 'Buku belum diterbitkan di perpustakaan.' using errcode = '22023';
  end if;
  begin
    insert into public.perpus_rujukan (buku_id, pertemuan_id, tugas_id, hal_mulai, hal_akhir, catatan, dibuat_oleh)
    values (p_buku, case when p_jenis = 'pertemuan' then p_id end, case when p_jenis = 'tugas' then p_id end,
            p_mulai, p_akhir, nullif(btrim(coalesce(p_catatan, '')), ''), auth.uid())
    returning id into v_rid;
  exception when check_violation then
    raise exception 'Halaman tidak valid. Halaman akhir tidak boleh lebih kecil dari halaman awal.' using errcode = '22023';
  end;
  return v_rid;
end $$;

create or replace function public.perpus_rujukan_hapus(p_rujukan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.perpus_rujukan%rowtype; v_kelas uuid;
begin
  select * into r from public.perpus_rujukan where id = p_rujukan;
  if not found then return; end if;
  v_kelas := private.perpus_kelas_rujukan(case when r.pertemuan_id is not null then 'pertemuan' else 'tugas' end, coalesce(r.pertemuan_id, r.tugas_id));
  if v_kelas is null or not private.lms_kelola(v_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  delete from public.perpus_rujukan where id = p_rujukan;
end $$;

-- Pengelola perpustakaan.
create or replace function public.perpus_pengelola_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', pp.id, 'ptk_id', pp.ptk_id, 'nama', t.nama, 'peran', pp.peran, 'aktif', pp.aktif, 'sumber', pp.sumber) order by pp.aktif desc, t.nama)
    from public.perpus_pengelola pp join public.ptk t on t.id = pp.ptk_id where pp.npsn = private.npsn_saya()
  ), '[]'::jsonb);
end $$;

create or replace function public.perpus_ptk_cari(p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := btrim(coalesce(p_q, ''));
begin
  if not private.boleh_atur_pengelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if char_length(v_q) < 3 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama))
    from (select id, nama from public.ptk where npsn = private.npsn_saya() and nama ilike '%' || v_q || '%' order by nama limit 15) x
  ), '[]'::jsonb);
end $$;

create or replace function public.perpus_pengelola_atur(p_ptk uuid, p_peran text, p_aktif boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.boleh_atur_pengelola_perpus() then raise exception 'Hanya penanggung jawab perpustakaan atau super admin yang dapat mengatur pengelola.' using errcode = '42501'; end if;
  if p_peran not in ('penanggung_jawab', 'petugas') then raise exception 'Peran tidak valid.' using errcode = '22023'; end if;
  if not exists (select 1 from public.ptk where id = p_ptk and npsn = private.npsn_saya()) then raise exception 'PTK tidak ditemukan.' using errcode = 'P0002'; end if;
  insert into public.perpus_pengelola (npsn, ptk_id, peran, aktif, sumber) values (private.npsn_saya(), p_ptk, p_peran, coalesce(p_aktif, true), 'manual')
  on conflict (ptk_id) do update set peran = excluded.peran, aktif = excluded.aktif;
end $$;

create or replace function public.perpus_pengelola_otomatis() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.boleh_atur_pengelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return private.perpus_tetapkan_otomatis(private.npsn_saya());
end $$;


-- ---------------------------------------------------------------- pelacakan baca
create or replace function private.perpus_nama_user(p_uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select t.nama from public.profil_pengguna pp join public.ptk t on t.id = pp.ptk_id where pp.user_id = p_uid),
    (select d.nama from public.profil_pengguna pp join public.peserta_didik d on d.id = pp.peserta_didik_id where pp.user_id = p_uid),
    case when exists (select 1 from public.super_admin where user_id = p_uid) then 'Super admin' end,
    'Pengguna')
$$;

create or replace function private.perpus_kelas_user(p_uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select private.kes_rombel_nama(pp.peserta_didik_id) from public.profil_pengguna pp where pp.user_id = p_uid and pp.peserta_didik_id is not null
$$;

-- Denyut baca dari pembaca. Detik yang ditambahkan dibatasi: paling banyak 65 per denyut dan tidak melebihi waktu nyata sejak denyut terakhir,
-- sehingga durasi tidak bisa digelembungkan dari browser. Sesi yang diam lebih dari 30 menit ditutup dan sesi baru dibuka.
create or replace function public.perpus_sesi_denyut(p_sesi uuid, p_buku uuid, p_halaman int, p_detik int, p_asal text default 'katalog', p_asal_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare b public.perpus_buku%rowtype; s public.perpus_sesi%rowtype; v_h int := greatest(coalesce(p_halaman, 1), 1);
        v_tambah int; v_asal text := case when p_asal in ('pertemuan', 'tugas') then p_asal else 'katalog' end;
begin
  if not private.boleh_baca_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select * into b from public.perpus_buku where id = p_buku and npsn = private.npsn_saya();
  if not found or not (private.boleh_kelola_perpus() or private.perpus_buku_terbuka(b)) then return null; end if;
  if b.jumlah_halaman is not null then v_h := least(v_h, b.jumlah_halaman); end if;
  if p_sesi is not null then
    select * into s from public.perpus_sesi where id = p_sesi and user_id = auth.uid() and buku_id = p_buku;
  end if;
  if s.id is null or s.terakhir_aktif < now() - interval '30 minutes' then
    insert into public.perpus_sesi (buku_id, user_id, halaman_awal, halaman_akhir, halaman_dilihat, asal, asal_id)
    values (p_buku, auth.uid(), v_h, v_h, array[v_h], v_asal, case when v_asal <> 'katalog' then p_asal_id end)
    returning * into s;
    return s.id;
  end if;
  v_tambah := least(greatest(coalesce(p_detik, 0), 0), 65, ceil(extract(epoch from (now() - s.terakhir_aktif)))::int + 5);
  update public.perpus_sesi set
    detik_aktif = detik_aktif + v_tambah, terakhir_aktif = now(), halaman_akhir = v_h,
    halaman_dilihat = case when v_h = any (halaman_dilihat) then halaman_dilihat else halaman_dilihat || v_h end
  where id = s.id;
  return s.id;
end $$;

create or replace function public.perpus_kutipan_catat(p_buku uuid, p_cara text, p_tugas uuid default null, p_halaman text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.perpus_buku%rowtype;
begin
  if not private.boleh_baca_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_cara not in ('sisip_tugas', 'salin_rujukan', 'salin_tautan') then raise exception 'Cara tidak valid.' using errcode = '22023'; end if;
  select * into b from public.perpus_buku where id = p_buku and npsn = private.npsn_saya();
  if not found or not (private.boleh_kelola_perpus() or private.perpus_buku_terbuka(b)) then return; end if;
  insert into public.perpus_kutipan (buku_id, user_id, cara, tugas_id, halaman)
  values (p_buku, auth.uid(), p_cara, (select id from public.tugas where id = p_tugas), left(nullif(btrim(coalesce(p_halaman, '')), ''), 20));
end $$;

-- Laporan untuk pengelola: siapa membaca apa, berapa lama, dan siapa mengambil rujukan. p_hari = 0 berarti seluruh waktu.
create or replace function public.perpus_laporan(p_hari int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_dari timestamptz := case when coalesce(p_hari, 30) <= 0 then '-infinity'::timestamptz else now() - (p_hari || ' days')::interval end;
        v_npsn text := private.npsn_saya(); r jsonb;
begin
  if not private.boleh_kelola_perpus() then raise exception 'Hanya pengelola perpustakaan yang dapat melihat laporan.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'ringkasan', (select jsonb_build_object(
        'judul_terbit', (select count(*) from public.perpus_buku where npsn = v_npsn and status = 'terbit'),
        'pembaca', count(distinct s.user_id), 'sesi', count(*), 'detik', coalesce(sum(s.detik_aktif), 0),
        'kutipan', (select count(*) from public.perpus_kutipan k join public.perpus_buku bk on bk.id = k.buku_id where bk.npsn = v_npsn and k.waktu >= v_dari))
      from public.perpus_sesi s join public.perpus_buku b on b.id = s.buku_id where b.npsn = v_npsn and s.mulai >= v_dari),
    'per_buku', coalesce((select jsonb_agg(x order by x.detik desc, x.judul) from (
        select b.id, b.judul, b.nomor_induk, b.status,
          count(distinct s.user_id) as pembaca, count(s.id) as sesi, coalesce(sum(s.detik_aktif), 0) as detik, max(s.mulai) as terakhir,
          (select count(*) from public.perpus_kutipan k where k.buku_id = b.id and k.waktu >= v_dari) as kutipan,
          (select count(*) from public.perpus_rujukan rj where rj.buku_id = b.id) as dirujuk
        from public.perpus_buku b left join public.perpus_sesi s on s.buku_id = b.id and s.mulai >= v_dari
        where b.npsn = v_npsn group by b.id) x), '[]'::jsonb),
    'per_pembaca', coalesce((select jsonb_agg(x order by x.detik desc) from (
        select s.user_id, private.perpus_nama_user(s.user_id) as nama, private.perpus_kelas_user(s.user_id) as kelas,
          (select pp.peran from public.profil_pengguna pp where pp.user_id = s.user_id) as peran,
          count(*) as sesi, sum(s.detik_aktif) as detik, count(distinct s.buku_id) as buku, max(s.mulai) as terakhir
        from public.perpus_sesi s join public.perpus_buku b on b.id = s.buku_id
        where b.npsn = v_npsn and s.mulai >= v_dari group by s.user_id order by sum(s.detik_aktif) desc limit 300) x), '[]'::jsonb),
    'sesi_terbaru', coalesce((select jsonb_agg(x order by x.mulai desc) from (
        select private.perpus_nama_user(s.user_id) as nama, private.perpus_kelas_user(s.user_id) as kelas, b.judul, s.mulai, s.detik_aktif as detik,
          s.halaman_awal, s.halaman_akhir, cardinality(s.halaman_dilihat) as halaman_dilihat, s.asal,
          case s.asal when 'tugas' then (select t.judul from public.tugas t where t.id = s.asal_id)
                      when 'pertemuan' then (select p.judul from public.pertemuan p where p.id = s.asal_id) end as asal_judul
        from public.perpus_sesi s join public.perpus_buku b on b.id = s.buku_id
        where b.npsn = v_npsn and s.mulai >= v_dari order by s.mulai desc limit 200) x), '[]'::jsonb),
    'kutipan_terbaru', coalesce((select jsonb_agg(x order by x.waktu desc) from (
        select private.perpus_nama_user(k.user_id) as nama, private.perpus_kelas_user(k.user_id) as kelas, b.judul, k.halaman, k.cara, k.waktu,
          (select t.judul from public.tugas t where t.id = k.tugas_id) as tugas_judul
        from public.perpus_kutipan k join public.perpus_buku b on b.id = k.buku_id
        where b.npsn = v_npsn and k.waktu >= v_dari order by k.waktu desc limit 200) x), '[]'::jsonb),
    'lampiran_guru', coalesce((select jsonb_agg(x order by x.waktu desc) from (
        select private.perpus_nama_user(rj.dibuat_oleh) as guru, b.judul, rj.hal_mulai, rj.hal_akhir, rj.dibuat_pada as waktu,
          case when rj.tugas_id is not null then 'Tugas' else 'Pertemuan' end as jenis,
          coalesce((select t.judul from public.tugas t where t.id = rj.tugas_id), (select p.judul from public.pertemuan p where p.id = rj.pertemuan_id)) as target
        from public.perpus_rujukan rj join public.perpus_buku b on b.id = rj.buku_id
        where b.npsn = v_npsn order by rj.dibuat_pada desc limit 200) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'public.perpus_izin()', 'public.perpus_buku_daftar(text,text,boolean)', 'public.perpus_buku_buka(uuid)',
    'public.perpus_buku_simpan(uuid,jsonb)', 'public.perpus_buku_status(uuid,text)', 'public.perpus_buku_hapus(uuid)',
    'public.perpus_progres_simpan(uuid,int)', 'public.perpus_sesi_denyut(uuid,uuid,int,int,text,uuid)',
    'public.perpus_kutipan_catat(uuid,text,uuid,text)', 'public.perpus_laporan(int)', 'public.perpus_rujukan_daftar(text,uuid)',
    'public.perpus_rujukan_simpan(text,uuid,uuid,int,int,text)', 'public.perpus_rujukan_hapus(uuid)',
    'public.perpus_pengelola_daftar()', 'public.perpus_ptk_cari(text)', 'public.perpus_pengelola_atur(uuid,text,boolean)',
    'public.perpus_pengelola_otomatis()']) loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke all on function private.perpus_tetapkan_otomatis(text) from public, anon, authenticated;
  revoke all on function private.perpus_pemicu_ptk() from public, anon, authenticated;
  revoke all on function private.perpus_nama_user(uuid), private.perpus_kelas_user(uuid), private.perpus_nomor_induk_baru(text) from public, anon, authenticated;
end $$;
