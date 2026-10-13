-- Perpustakaan fisik: koleksi buku cetak. Satu judul memiliki banyak eksemplar (salinan), masing-masing bernomor induk sendiri.
-- Jumlah dan ketersediaan dihitung dari status eksemplar. Peminjaman dan pengembalian dicatat petugas, sehingga "tersedia" selalu mutakhir.
-- Pola akses sama dengan perpustakaan digital: tabel tanpa policy, semua lewat fungsi security definer.
-- Kewenangan kelola: private.boleh_kelola_perpus() (super admin, penanggung jawab, petugas, atau izin perpus.kelola).
-- Judul tidak dihapus, hanya dinonaktifkan; eksemplar yang keluar dari koleksi diberi status "dihapusbukukan".

create table if not exists public.perpus_fisik (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  judul text not null check (char_length(btrim(judul)) between 3 and 200),
  penulis text check (char_length(penulis) <= 200),
  penerbit text check (char_length(penerbit) <= 200),
  tahun_terbit int check (tahun_terbit is null or tahun_terbit between 1900 and 2100),
  isbn text check (char_length(isbn) <= 30),
  kategori text not null default 'Umum' check (char_length(btrim(kategori)) between 2 and 60),
  jenis_buku text not null default 'buku_teks' check (jenis_buku in ('buku_teks', 'pengayaan', 'referensi', 'fiksi', 'panduan_guru', 'periodikal', 'lainnya')),
  klasifikasi text check (klasifikasi is null or klasifikasi ~ '^[0-9]{3}(\.[0-9]{1,8})?$'),
  nomor_panggil text check (char_length(nomor_panggil) <= 60),
  edisi text check (char_length(edisi) <= 60),
  kota_terbit text check (char_length(kota_terbit) <= 80),
  bahasa text not null default 'Indonesia' check (char_length(bahasa) <= 40),
  subjek text check (char_length(subjek) <= 300),
  mapel text check (char_length(mapel) <= 80),
  tingkat text check (tingkat is null or tingkat in ('X', 'XI', 'XII', 'Semua')),
  deskripsi text check (char_length(deskripsi) <= 2000),
  rak text check (char_length(rak) <= 60),
  aktif boolean not null default true,
  dibuat_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now()
);
create index if not exists perpus_fisik_npsn_idx on public.perpus_fisik (npsn, aktif);

create table if not exists public.perpus_eksemplar (
  id uuid primary key default gen_random_uuid(),
  fisik_id uuid not null references public.perpus_fisik (id) on delete cascade,
  npsn text not null references public.sekolah (npsn),
  nomor_induk text not null check (char_length(nomor_induk) between 3 and 40),
  kondisi text not null default 'baik' check (kondisi in ('baik', 'rusak_ringan', 'rusak_berat')),
  status text not null default 'tersedia' check (status in ('tersedia', 'dipinjam', 'rusak', 'hilang', 'dihapusbukukan')),
  sumber_perolehan text not null default 'beli' check (sumber_perolehan in ('beli', 'hibah', 'bos', 'lainnya')),
  tanggal_perolehan date,
  harga numeric(14, 2) check (harga is null or harga >= 0),
  catatan text check (char_length(catatan) <= 300),
  dibuat_pada timestamptz not null default now(),
  unique (npsn, nomor_induk)
);
create index if not exists perpus_eksemplar_fisik_idx on public.perpus_eksemplar (fisik_id, status);

create table if not exists public.perpus_pinjam (
  id uuid primary key default gen_random_uuid(),
  eksemplar_id uuid not null references public.perpus_eksemplar (id) on delete cascade,
  npsn text not null references public.sekolah (npsn),
  peminjam_tipe text not null check (peminjam_tipe in ('siswa', 'ptk')),
  peserta_didik_id uuid references public.peserta_didik (id),
  ptk_id uuid references public.ptk (id),
  pinjam_pada date not null default ((now() at time zone 'Asia/Jakarta')::date),
  jatuh_tempo date not null,
  kembali_pada date,
  kondisi_kembali text check (kondisi_kembali is null or kondisi_kembali in ('baik', 'rusak_ringan', 'rusak_berat', 'hilang')),
  dicatat_oleh uuid,
  catatan text check (char_length(catatan) <= 300),
  check ((peminjam_tipe = 'siswa' and peserta_didik_id is not null and ptk_id is null) or (peminjam_tipe = 'ptk' and ptk_id is not null and peserta_didik_id is null)),
  check (jatuh_tempo >= pinjam_pada)
);
create unique index if not exists perpus_pinjam_terbuka_uq on public.perpus_pinjam (eksemplar_id) where kembali_pada is null;
create index if not exists perpus_pinjam_pd_idx on public.perpus_pinjam (peserta_didik_id) where kembali_pada is null;
create index if not exists perpus_pinjam_ptk_idx on public.perpus_pinjam (ptk_id) where kembali_pada is null;
create index if not exists perpus_pinjam_waktu_idx on public.perpus_pinjam (pinjam_pada desc);

alter table public.perpus_fisik enable row level security;
alter table public.perpus_eksemplar enable row level security;
alter table public.perpus_pinjam enable row level security;
revoke all on table public.perpus_fisik, public.perpus_eksemplar, public.perpus_pinjam from anon, authenticated;

-- ---------------------------------------------------------------- pembantu
create or replace function private.perpus_hari_ini() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

-- Membuat n eksemplar dengan nomor induk FIS/{tahun}/{urut 4 digit}, dilanjutkan dari nomor tertinggi tahun itu.
create or replace function private.perpus_buat_eksemplar(p_npsn text, p_fisik uuid, p_jumlah int, p_sumber text, p_tanggal date, p_harga numeric, p_kondisi text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_tahun int := extract(year from (now() at time zone 'Asia/Jakarta'))::int; v_awal int; i int;
begin
  select coalesce(max(substring(nomor_induk from '^FIS/[0-9]{4}/([0-9]+)$')::int), 0) into v_awal
    from public.perpus_eksemplar where npsn = p_npsn and nomor_induk like 'FIS/' || v_tahun || '/%';
  for i in 1..p_jumlah loop
    insert into public.perpus_eksemplar (fisik_id, npsn, nomor_induk, kondisi, sumber_perolehan, tanggal_perolehan, harga)
    values (p_fisik, p_npsn, 'FIS/' || v_tahun || '/' || lpad((v_awal + i)::text, 4, '0'), coalesce(p_kondisi, 'baik'),
            coalesce(p_sumber, 'beli'), p_tanggal, p_harga);
  end loop;
  return p_jumlah;
end $$;

-- Identitas pengguna yang sedang masuk sebagai peminjam.
create or replace function private.perpus_saya_pd() returns uuid
language sql stable security definer set search_path = '' as $$ select peserta_didik_id from public.profil_pengguna where user_id = auth.uid() $$;

create or replace function private.perpus_nama_peminjam(p_pd uuid, p_ptk uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nama from public.peserta_didik where id = p_pd), (select nama from public.ptk where id = p_ptk))
$$;

-- ---------------------------------------------------------------- katalog
create or replace function public.perpus_fisik_daftar(p_q text default null, p_semua boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_kelola boolean := private.boleh_kelola_perpus(); v_q text := nullif(btrim(coalesce(p_q, '')), '');
        v_pd uuid := private.perpus_saya_pd(); v_ptk uuid := private.ptk_id_saya();
begin
  if not private.boleh_baca_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'judul', f.judul, 'penulis', f.penulis, 'penerbit', f.penerbit, 'tahun_terbit', f.tahun_terbit, 'isbn', f.isbn,
      'kategori', f.kategori, 'jenis_buku', f.jenis_buku, 'klasifikasi', f.klasifikasi, 'nomor_panggil', f.nomor_panggil,
      'edisi', f.edisi, 'kota_terbit', f.kota_terbit, 'bahasa', f.bahasa, 'subjek', f.subjek, 'mapel', f.mapel, 'tingkat', f.tingkat,
      'deskripsi', f.deskripsi, 'rak', f.rak, 'aktif', f.aktif,
      'jumlah', e.jumlah, 'tersedia', e.tersedia, 'dipinjam', e.dipinjam, 'rusak', e.rusak, 'hilang', e.hilang,
      'saya_pinjam', exists (select 1 from public.perpus_pinjam p join public.perpus_eksemplar x on x.id = p.eksemplar_id
                              where x.fisik_id = f.id and p.kembali_pada is null
                                and ((v_pd is not null and p.peserta_didik_id = v_pd) or (v_ptk is not null and p.ptk_id = v_ptk)))
    ) order by f.judul)
    from public.perpus_fisik f
    cross join lateral (
      select count(*) filter (where x.status <> 'dihapusbukukan') as jumlah,
             count(*) filter (where x.status = 'tersedia') as tersedia,
             count(*) filter (where x.status = 'dipinjam') as dipinjam,
             count(*) filter (where x.status = 'rusak') as rusak,
             count(*) filter (where x.status = 'hilang') as hilang
        from public.perpus_eksemplar x where x.fisik_id = f.id) e
    where f.npsn = private.npsn_saya()
      and (f.aktif or (v_kelola and p_semua))
      and (v_q is null or f.judul ilike '%' || v_q || '%' or f.penulis ilike '%' || v_q || '%' or f.penerbit ilike '%' || v_q || '%'
           or f.isbn ilike '%' || v_q || '%' or f.mapel ilike '%' || v_q || '%' or f.subjek ilike '%' || v_q || '%'
           or f.nomor_panggil ilike '%' || v_q || '%' or f.klasifikasi like v_q || '%' or f.rak ilike '%' || v_q || '%')
  ), '[]'::jsonb);
end $$;

create or replace function public.perpus_fisik_simpan(p_id uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_npsn text := private.npsn_saya(); v_jumlah int := coalesce(nullif(p_data ->> 'jumlah_awal', '')::int, 0);
begin
  if not private.boleh_kelola_perpus() then raise exception 'Hanya pengelola perpustakaan yang dapat mengubah koleksi.' using errcode = '42501'; end if;
  if p_id is not null and not exists (select 1 from public.perpus_fisik where id = p_id and npsn = v_npsn) then
    raise exception 'Judul tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_jumlah < 0 or v_jumlah > 500 then raise exception 'Jumlah eksemplar awal 0 sampai 500.' using errcode = '22023'; end if;
  begin
    if p_id is null then
      insert into public.perpus_fisik (npsn, judul, penulis, penerbit, tahun_terbit, isbn, kategori, jenis_buku, klasifikasi, nomor_panggil, edisi, kota_terbit,
        bahasa, subjek, mapel, tingkat, deskripsi, rak, dibuat_oleh)
      values (v_npsn, btrim(coalesce(p_data ->> 'judul', '')), nullif(btrim(p_data ->> 'penulis'), ''), nullif(btrim(p_data ->> 'penerbit'), ''),
        nullif(p_data ->> 'tahun_terbit', '')::int, nullif(btrim(p_data ->> 'isbn'), ''), coalesce(nullif(btrim(p_data ->> 'kategori'), ''), 'Umum'),
        coalesce(nullif(p_data ->> 'jenis_buku', ''), 'buku_teks'), nullif(btrim(p_data ->> 'klasifikasi'), ''), nullif(btrim(p_data ->> 'nomor_panggil'), ''),
        nullif(btrim(p_data ->> 'edisi'), ''), nullif(btrim(p_data ->> 'kota_terbit'), ''), coalesce(nullif(btrim(p_data ->> 'bahasa'), ''), 'Indonesia'),
        nullif(btrim(p_data ->> 'subjek'), ''), nullif(btrim(p_data ->> 'mapel'), ''), nullif(p_data ->> 'tingkat', ''),
        nullif(btrim(p_data ->> 'deskripsi'), ''), nullif(btrim(p_data ->> 'rak'), ''), auth.uid())
      returning id into v_id;
      if v_jumlah > 0 then
        perform private.perpus_buat_eksemplar(v_npsn, v_id, v_jumlah, p_data ->> 'sumber_perolehan', nullif(p_data ->> 'tanggal_perolehan', '')::date,
                                              nullif(p_data ->> 'harga', '')::numeric, 'baik');
      end if;
    else
      update public.perpus_fisik set
        judul = btrim(coalesce(p_data ->> 'judul', '')), penulis = nullif(btrim(p_data ->> 'penulis'), ''), penerbit = nullif(btrim(p_data ->> 'penerbit'), ''),
        tahun_terbit = nullif(p_data ->> 'tahun_terbit', '')::int, isbn = nullif(btrim(p_data ->> 'isbn'), ''),
        kategori = coalesce(nullif(btrim(p_data ->> 'kategori'), ''), 'Umum'), jenis_buku = coalesce(nullif(p_data ->> 'jenis_buku', ''), 'buku_teks'),
        klasifikasi = nullif(btrim(p_data ->> 'klasifikasi'), ''), nomor_panggil = nullif(btrim(p_data ->> 'nomor_panggil'), ''),
        edisi = nullif(btrim(p_data ->> 'edisi'), ''), kota_terbit = nullif(btrim(p_data ->> 'kota_terbit'), ''),
        bahasa = coalesce(nullif(btrim(p_data ->> 'bahasa'), ''), 'Indonesia'), subjek = nullif(btrim(p_data ->> 'subjek'), ''),
        mapel = nullif(btrim(p_data ->> 'mapel'), ''), tingkat = nullif(p_data ->> 'tingkat', ''),
        deskripsi = nullif(btrim(p_data ->> 'deskripsi'), ''), rak = nullif(btrim(p_data ->> 'rak'), ''), diubah_pada = now()
      where id = p_id;
    end if;
  exception
    when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
      raise exception 'Isian belum valid. Judul 3 sampai 200 huruf, klasifikasi berbentuk 005 atau 005.133, tahun 1900 sampai 2100.' using errcode = '22023';
    when unique_violation then
      raise exception 'Nomor induk bentrok. Coba simpan lagi.' using errcode = '23505';
  end;
  return v_id;
end $$;

create or replace function public.perpus_fisik_aktif(p_id uuid, p_aktif boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  update public.perpus_fisik set aktif = coalesce(p_aktif, true), diubah_pada = now() where id = p_id and npsn = private.npsn_saya();
  if not found then raise exception 'Judul tidak ditemukan.' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------- eksemplar
create or replace function public.perpus_eksemplar_tambah(p_fisik uuid, p_jumlah int, p_data jsonb default '{}'::jsonb) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if coalesce(p_jumlah, 0) < 1 or p_jumlah > 500 then raise exception 'Jumlah eksemplar 1 sampai 500.' using errcode = '22023'; end if;
  if not exists (select 1 from public.perpus_fisik where id = p_fisik and npsn = private.npsn_saya()) then raise exception 'Judul tidak ditemukan.' using errcode = 'P0002'; end if;
  begin
    return private.perpus_buat_eksemplar(private.npsn_saya(), p_fisik, p_jumlah, p_data ->> 'sumber_perolehan', nullif(p_data ->> 'tanggal_perolehan', '')::date,
                                         nullif(p_data ->> 'harga', '')::numeric, coalesce(nullif(p_data ->> 'kondisi', ''), 'baik'));
  exception
    when check_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
      raise exception 'Isian belum valid. Periksa sumber, tanggal, harga, dan kondisi.' using errcode = '22023';
    when unique_violation then
      raise exception 'Nomor induk bentrok. Coba lagi.' using errcode = '23505';
  end;
end $$;

create or replace function public.perpus_eksemplar_daftar(p_fisik uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'nomor_induk', x.nomor_induk, 'kondisi', x.kondisi, 'status', x.status, 'sumber_perolehan', x.sumber_perolehan,
      'tanggal_perolehan', x.tanggal_perolehan, 'harga', x.harga, 'catatan', x.catatan,
      'pinjam_id', p.id, 'peminjam', case when p.id is not null then private.perpus_nama_peminjam(p.peserta_didik_id, p.ptk_id) end,
      'jatuh_tempo', p.jatuh_tempo, 'terlambat', coalesce(p.jatuh_tempo < private.perpus_hari_ini(), false)
    ) order by x.nomor_induk)
    from public.perpus_eksemplar x
    left join public.perpus_pinjam p on p.eksemplar_id = x.id and p.kembali_pada is null
    where x.fisik_id = p_fisik and x.npsn = private.npsn_saya()
  ), '[]'::jsonb);
end $$;

create or replace function public.perpus_eksemplar_ubah(p_id uuid, p_kondisi text, p_status text, p_catatan text) returns void
language plpgsql security definer set search_path = '' as $$
declare x public.perpus_eksemplar%rowtype;
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select * into x from public.perpus_eksemplar where id = p_id and npsn = private.npsn_saya();
  if not found then raise exception 'Eksemplar tidak ditemukan.' using errcode = 'P0002'; end if;
  if x.status = 'dipinjam' then raise exception 'Eksemplar sedang dipinjam. Catat pengembalian dahulu.' using errcode = '22023'; end if;
  if p_kondisi not in ('baik', 'rusak_ringan', 'rusak_berat') then raise exception 'Kondisi tidak valid.' using errcode = '22023'; end if;
  if p_status not in ('tersedia', 'rusak', 'hilang', 'dihapusbukukan') then raise exception 'Status tidak valid.' using errcode = '22023'; end if;
  if p_status = 'tersedia' and p_kondisi = 'rusak_berat' then raise exception 'Eksemplar rusak berat tidak bisa berstatus tersedia.' using errcode = '22023'; end if;
  update public.perpus_eksemplar set kondisi = p_kondisi, status = p_status, catatan = nullif(btrim(coalesce(p_catatan, '')), '') where id = p_id;
end $$;

-- ---------------------------------------------------------------- peminjaman
create or replace function public.perpus_peminjam_cari(p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := btrim(coalesce(p_q, ''));
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if char_length(v_q) < 3 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(h) from (
      select jsonb_build_object('tipe', 'siswa', 'id', d.id, 'nama', d.nama, 'ket', coalesce(private.kes_rombel_nama(d.id), '') || case when d.nisn is not null then ' · NISN ' || d.nisn else '' end,
                                'dipinjam', (select count(*) from public.perpus_pinjam p where p.peserta_didik_id = d.id and p.kembali_pada is null)) as h
        from public.peserta_didik d
       where d.npsn = private.npsn_saya() and d.status_peserta_didik = 'aktif' and (d.nama ilike '%' || v_q || '%' or d.nisn like v_q || '%')
       order by d.nama limit 12) a
  ), '[]'::jsonb) || coalesce((
    select jsonb_agg(h) from (
      select jsonb_build_object('tipe', 'ptk', 'id', t.id, 'nama', t.nama, 'ket', coalesce(t.jenis_ptk, 'PTK'),
                                'dipinjam', (select count(*) from public.perpus_pinjam p where p.ptk_id = t.id and p.kembali_pada is null)) as h
        from public.ptk t where t.npsn = private.npsn_saya() and t.nama ilike '%' || v_q || '%' order by t.nama limit 8) b
  ), '[]'::jsonb);
end $$;

create or replace function public.perpus_pinjam_catat(p_eksemplar uuid, p_tipe text, p_orang uuid, p_hari int default 7) returns uuid
language plpgsql security definer set search_path = '' as $$
declare x public.perpus_eksemplar%rowtype; v_id uuid; v_hari int := coalesce(p_hari, 7); v_terbuka int; v_batas int;
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_tipe not in ('siswa', 'ptk') then raise exception 'Jenis peminjam tidak valid.' using errcode = '22023'; end if;
  if v_hari < 1 or v_hari > 60 then raise exception 'Lama pinjam 1 sampai 60 hari.' using errcode = '22023'; end if;
  select * into x from public.perpus_eksemplar where id = p_eksemplar and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Eksemplar tidak ditemukan.' using errcode = 'P0002'; end if;
  if x.status <> 'tersedia' then raise exception 'Eksemplar ini tidak tersedia (status: %).', x.status using errcode = '22023'; end if;
  if x.kondisi = 'rusak_berat' then raise exception 'Eksemplar rusak berat tidak bisa dipinjamkan.' using errcode = '22023'; end if;
  if p_tipe = 'siswa' then
    if not exists (select 1 from public.peserta_didik where id = p_orang and npsn = private.npsn_saya() and status_peserta_didik = 'aktif') then
      raise exception 'Siswa tidak ditemukan atau tidak aktif.' using errcode = 'P0002';
    end if;
    select count(*) into v_terbuka from public.perpus_pinjam where peserta_didik_id = p_orang and kembali_pada is null;
    v_batas := 3;
  else
    if not exists (select 1 from public.ptk where id = p_orang and npsn = private.npsn_saya()) then raise exception 'PTK tidak ditemukan.' using errcode = 'P0002'; end if;
    select count(*) into v_terbuka from public.perpus_pinjam where ptk_id = p_orang and kembali_pada is null;
    v_batas := 5;
  end if;
  if v_terbuka >= v_batas then raise exception 'Peminjam sudah memegang % buku, batas maksimal.', v_batas using errcode = '22023'; end if;
  insert into public.perpus_pinjam (eksemplar_id, npsn, peminjam_tipe, peserta_didik_id, ptk_id, jatuh_tempo, dicatat_oleh)
  values (x.id, x.npsn, p_tipe, case when p_tipe = 'siswa' then p_orang end, case when p_tipe = 'ptk' then p_orang end,
          private.perpus_hari_ini() + v_hari, auth.uid())
  returning id into v_id;
  update public.perpus_eksemplar set status = 'dipinjam' where id = x.id;
  return v_id;
end $$;

create or replace function public.perpus_kembali_catat(p_pinjam uuid, p_kondisi text default 'baik') returns void
language plpgsql security definer set search_path = '' as $$
declare p public.perpus_pinjam%rowtype;
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_kondisi not in ('baik', 'rusak_ringan', 'rusak_berat', 'hilang') then raise exception 'Kondisi tidak valid.' using errcode = '22023'; end if;
  select * into p from public.perpus_pinjam where id = p_pinjam and npsn = private.npsn_saya() and kembali_pada is null for update;
  if not found then raise exception 'Peminjaman tidak ditemukan atau sudah dikembalikan.' using errcode = 'P0002'; end if;
  update public.perpus_pinjam set kembali_pada = private.perpus_hari_ini(), kondisi_kembali = p_kondisi where id = p.id;
  update public.perpus_eksemplar set
    status = case p_kondisi when 'hilang' then 'hilang' when 'rusak_berat' then 'rusak' else 'tersedia' end,
    kondisi = case p_kondisi when 'rusak_ringan' then 'rusak_ringan' when 'rusak_berat' then 'rusak_berat' else kondisi end
  where id = p.eksemplar_id;
end $$;

create or replace function public.perpus_pinjam_perpanjang(p_pinjam uuid, p_hari int default 7) returns date
language plpgsql security definer set search_path = '' as $$
declare v_baru date;
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if coalesce(p_hari, 0) < 1 or p_hari > 30 then raise exception 'Perpanjangan 1 sampai 30 hari.' using errcode = '22023'; end if;
  update public.perpus_pinjam set jatuh_tempo = greatest(jatuh_tempo, private.perpus_hari_ini()) + p_hari
   where id = p_pinjam and npsn = private.npsn_saya() and kembali_pada is null returning jatuh_tempo into v_baru;
  if v_baru is null then raise exception 'Peminjaman tidak ditemukan atau sudah dikembalikan.' using errcode = 'P0002'; end if;
  return v_baru;
end $$;

-- Daftar peminjaman untuk petugas. p_semua = true menambahkan 100 pengembalian terakhir.
create or replace function public.perpus_pinjam_daftar(p_semua boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(h order by (h ->> 'kembali_pada') nulls first, (h ->> 'jatuh_tempo')) from (
      select jsonb_build_object(
        'id', p.id, 'judul', f.judul, 'nomor_induk', x.nomor_induk, 'peminjam', private.perpus_nama_peminjam(p.peserta_didik_id, p.ptk_id),
        'tipe', p.peminjam_tipe, 'kelas', case when p.peserta_didik_id is not null then private.kes_rombel_nama(p.peserta_didik_id) end,
        'pinjam_pada', p.pinjam_pada, 'jatuh_tempo', p.jatuh_tempo, 'kembali_pada', p.kembali_pada, 'kondisi_kembali', p.kondisi_kembali,
        'terlambat', p.kembali_pada is null and p.jatuh_tempo < private.perpus_hari_ini(),
        'hari_terlambat', case when p.kembali_pada is null and p.jatuh_tempo < private.perpus_hari_ini() then private.perpus_hari_ini() - p.jatuh_tempo end) as h
      from public.perpus_pinjam p
      join public.perpus_eksemplar x on x.id = p.eksemplar_id join public.perpus_fisik f on f.id = x.fisik_id
      where p.npsn = private.npsn_saya() and (p.kembali_pada is null or (p_semua and p.pinjam_pada >= private.perpus_hari_ini() - 365))
      order by p.kembali_pada nulls first, p.jatuh_tempo limit 400) a
  ), '[]'::jsonb);
end $$;

-- Pinjaman milik pengguna yang sedang masuk (siswa atau guru).
create or replace function public.perpus_pinjam_saya() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_pd uuid := private.perpus_saya_pd(); v_ptk uuid := private.ptk_id_saya();
begin
  if not private.boleh_baca_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(h order by (h ->> 'kembali_pada') nulls first, (h ->> 'jatuh_tempo')) from (
      select jsonb_build_object('id', p.id, 'judul', f.judul, 'penulis', f.penulis, 'nomor_induk', x.nomor_induk, 'rak', f.rak,
        'pinjam_pada', p.pinjam_pada, 'jatuh_tempo', p.jatuh_tempo, 'kembali_pada', p.kembali_pada,
        'terlambat', p.kembali_pada is null and p.jatuh_tempo < private.perpus_hari_ini()) as h
      from public.perpus_pinjam p
      join public.perpus_eksemplar x on x.id = p.eksemplar_id join public.perpus_fisik f on f.id = x.fisik_id
      where (v_pd is not null and p.peserta_didik_id = v_pd) or (v_ptk is not null and p.ptk_id = v_ptk)
      order by p.kembali_pada nulls first, p.pinjam_pada desc limit 30) a
  ), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'public.perpus_fisik_daftar(text,boolean)', 'public.perpus_fisik_simpan(uuid,jsonb)', 'public.perpus_fisik_aktif(uuid,boolean)',
    'public.perpus_eksemplar_tambah(uuid,int,jsonb)', 'public.perpus_eksemplar_daftar(uuid)', 'public.perpus_eksemplar_ubah(uuid,text,text,text)',
    'public.perpus_peminjam_cari(text)', 'public.perpus_pinjam_catat(uuid,text,uuid,int)', 'public.perpus_kembali_catat(uuid,text)',
    'public.perpus_pinjam_perpanjang(uuid,int)', 'public.perpus_pinjam_daftar(boolean)', 'public.perpus_pinjam_saya()']) loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke all on function private.perpus_buat_eksemplar(text, uuid, int, text, date, numeric, text) from public, anon, authenticated;
  revoke all on function private.perpus_saya_pd(), private.perpus_nama_peminjam(uuid, uuid) from public, anon, authenticated;
end $$;
