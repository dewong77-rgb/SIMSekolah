-- Modul Kesiswaan (Waka Kesiswaan), bagian A: hak akses, fungsi bantu lingkup, pelanggaran, tindak lanjut, prestasi.
--
-- Pola hak akses mengikuti modul Hubinmas: tabel tanpa kebijakan RLS, semua akses lewat fungsi security definer.
--   Waka Kesiswaan : semua izin kesiswaan.* dan ekskul.kelola, satu-satunya yang memverifikasi, mengubah, dan menghapus catatan.
--   TU Kesiswaan   : mencatat, mengurus izin, beasiswa, ekstrakurikuler.
--   Guru Piket     : mencatat pelanggaran dan prestasi, memutuskan izin siswa (seluruh sekolah).
--   Wali Kelas     : sama dengan Guru Piket tetapi hanya untuk rombelnya (lingkup rombel), ditambah memantau siswa rombelnya.
--   Guru BK        : mencatat, memantau siswa berisiko, mencatat tindak lanjut pembinaan.
-- Catatan pelanggaran baru berstatus "diajukan" dan baru tampil ke siswa dan orang tua setelah Waka memverifikasi.
-- Hapus berupa penanda (dihapus), bukan penghapusan baris, supaya riwayat dan jejak audit tetap utuh.

-- ---------------------------------------------------------------- izin dan jabatan
insert into public.izin (kode, nama, bidang) values
  ('kesiswaan.catat',      'Mencatat pelanggaran dan prestasi siswa', 'Kesiswaan'),
  ('kesiswaan.verifikasi', 'Memverifikasi catatan kesiswaan dan mengatur katalog pelanggaran', 'Kesiswaan'),
  ('kesiswaan.pantau',     'Memantau siswa berisiko dan mencatat tindak lanjut pembinaan', 'Kesiswaan'),
  ('kesiswaan.izin',       'Memutuskan izin siswa dan mencatat kehadiran harian', 'Kesiswaan'),
  ('kesiswaan.beasiswa',   'Mengelola beasiswa dan bantuan siswa', 'Kesiswaan')
on conflict (kode) do nothing;

insert into public.jabatan (kode, nama, kelompok, lingkup, induk_kode, urutan, tampil_publik, satu_pemegang, bagan, keterangan) values
  ('guru_bk', 'Guru Bimbingan dan Konseling', 'Kesiswaan', 'sekolah', 'waka_kesiswaan', 25, true, false, false,
   'Membina siswa bermasalah, menindaklanjuti pelanggaran, dan memantau siswa berisiko.')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_kesiswaan', 'kesiswaan.catat'),
  ('waka_kesiswaan', 'kesiswaan.verifikasi'),
  ('waka_kesiswaan', 'kesiswaan.pantau'),
  ('waka_kesiswaan', 'kesiswaan.izin'),
  ('waka_kesiswaan', 'kesiswaan.beasiswa'),
  ('waka_kesiswaan', 'ekskul.kelola'),
  ('tu_kesiswaan',   'kesiswaan.catat'),
  ('tu_kesiswaan',   'kesiswaan.izin'),
  ('tu_kesiswaan',   'kesiswaan.beasiswa'),
  ('tu_kesiswaan',   'ekskul.kelola'),
  ('guru_piket',     'kesiswaan.catat'),
  ('guru_piket',     'kesiswaan.izin'),
  ('wali_kelas',     'kesiswaan.catat'),
  ('wali_kelas',     'kesiswaan.izin'),
  ('wali_kelas',     'kesiswaan.pantau'),
  ('guru_bk',        'kesiswaan.catat'),
  ('guru_bk',        'kesiswaan.pantau')
on conflict do nothing;

-- ---------------------------------------------------------------- fungsi bantu lingkup
-- Benar bila pemegang izin berlaku untuk seluruh sekolah (penugasan tanpa lingkup), super admin,
-- atau Admin TU untuk izin operasional. Pemegang berlingkup rombel (wali kelas) tidak termasuk.
create or replace function private.kes_semua(p_izin text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    private.adalah_super()
    or (private.peran_saya() = 'admin_tu'
        and p_izin && array['kesiswaan.catat','kesiswaan.izin','kesiswaan.beasiswa','ekskul.kelola'])
    or exists (select 1 from unnest(p_izin) k where private.punya_izin(k, '__semua__'))
  )
$$;

-- Rombel yang diampu pemanggil lewat penugasan berlingkup rombel untuk salah satu izin.
create or replace function private.kes_rombel_saya(p_izin text[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct p.lingkup_id::uuid), array[]::uuid[])
    from public.penugasan p
    join public.jabatan_izin ji on ji.jabatan_kode = p.jabatan_kode
   where p.ptk_id = private.ptk_id_saya()
     and p.status = 'aktif'
     and p.tahun_ajaran = public.tahun_ajaran_sekarang()
     and ji.izin_kode = any (p_izin)
     and p.lingkup_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- Boleh bertindak atas satu siswa: pemegang seluruh sekolah, atau pemegang rombel tempat siswa itu berada.
create or replace function private.kes_pd_boleh(p_izin text[], p_pd uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.kes_semua(p_izin) or exists (
    select 1 from public.keanggotaan_rombel k
     where k.peserta_didik_id = p_pd and k.rombel_id = any (private.kes_rombel_saya(p_izin)))
$$;

-- Rombel kelas utama siswa pada semester terbaru.
create or replace function private.kes_rombel_pd(p_pd uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.id from public.keanggotaan_rombel k join public.rombel r on r.id = k.rombel_id
   where k.peserta_didik_id = p_pd and r.jenis_rombel ilike '%utama%'
   order by r.semester_id desc limit 1
$$;

create or replace function private.kes_waka() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.punya_izin('kesiswaan.verifikasi', '__semua__')
$$;

create or replace function private.kes_hari() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Jakarta')::date
$$;

create or replace function private.kes_audit(p_tabel text, p_aksi text, p_ringkasan jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values (auth.uid(), p_tabel, p_aksi, p_ringkasan)
$$;

-- ---------------------------------------------------------------- tabel
create table if not exists public.pelanggaran_jenis (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  kategori text not null check (kategori in ('ringan','sedang','berat')),
  nama text not null check (char_length(nama) between 3 and 150),
  poin int not null check (poin between 1 and 500),
  aktif boolean not null default true,
  urutan int not null default 0,
  dibuat_pada timestamptz not null default now(),
  unique (npsn, nama)
);
alter table public.pelanggaran_jenis enable row level security;

create table if not exists public.kesiswaan_ambang (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  poin_min int not null check (poin_min between 1 and 2000),
  tindakan text not null check (char_length(tindakan) between 3 and 150),
  keterangan text check (keterangan is null or char_length(keterangan) <= 500),
  aktif boolean not null default true,
  unique (npsn, poin_min)
);
alter table public.kesiswaan_ambang enable row level security;

create table if not exists public.pelanggaran_siswa (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  peserta_didik_id uuid not null references public.peserta_didik (id),
  rombel_id uuid references public.rombel (id),
  jenis_id uuid references public.pelanggaran_jenis (id),
  jenis_nama text not null,
  kategori text not null check (kategori in ('ringan','sedang','berat')),
  poin int not null check (poin between 0 and 500),
  tanggal date not null,
  uraian text check (uraian is null or char_length(uraian) <= 1000),
  tahun_ajaran text not null,
  status text not null default 'diajukan' check (status in ('diajukan','terverifikasi','ditolak')),
  dicatat_oleh uuid not null,
  dicatat_nama text,
  diputuskan_oleh uuid,
  diputuskan_pada timestamptz,
  catatan_keputusan text check (catatan_keputusan is null or char_length(catatan_keputusan) <= 500),
  dihapus boolean not null default false,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
alter table public.pelanggaran_siswa enable row level security;
create index if not exists pelanggaran_pd_idx on public.pelanggaran_siswa (peserta_didik_id, tahun_ajaran) where not dihapus;
create index if not exists pelanggaran_status_idx on public.pelanggaran_siswa (status) where not dihapus;

create table if not exists public.tindak_lanjut_siswa (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  peserta_didik_id uuid not null references public.peserta_didik (id),
  pelanggaran_id uuid references public.pelanggaran_siswa (id),
  jenis text not null check (jenis in ('teguran_lisan','teguran_tertulis','panggilan_orang_tua','pembinaan_bk','kunjungan_rumah',
                                       'surat_peringatan_1','surat_peringatan_2','surat_peringatan_3','skorsing','dikembalikan_ke_orang_tua','lainnya')),
  tanggal date not null,
  catatan text check (catatan is null or char_length(catatan) <= 1000),
  tahun_ajaran text not null,
  dicatat_oleh uuid not null,
  dicatat_nama text,
  dihapus boolean not null default false,
  dibuat_pada timestamptz not null default now()
);
alter table public.tindak_lanjut_siswa enable row level security;
create index if not exists tindak_pd_idx on public.tindak_lanjut_siswa (peserta_didik_id, tahun_ajaran) where not dihapus;

create table if not exists public.prestasi_siswa (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  peserta_didik_id uuid not null references public.peserta_didik (id),
  nama_prestasi text not null check (char_length(nama_prestasi) between 3 and 200),
  bidang text not null check (bidang in ('akademik','olahraga','seni','keterampilan_kejuruan','keagamaan','organisasi','lainnya')),
  tingkat text not null check (tingkat in ('sekolah','kecamatan','kabupaten','provinsi','nasional','internasional')),
  peringkat text check (peringkat is null or char_length(peringkat) <= 60),
  penyelenggara text check (penyelenggara is null or char_length(penyelenggara) <= 150),
  tanggal date not null,
  berkas_url text check (berkas_url is null or berkas_url ~* '^https://'),
  tahun_ajaran text not null,
  status text not null default 'diajukan' check (status in ('diajukan','terverifikasi','ditolak')),
  dicatat_oleh uuid not null,
  dicatat_nama text,
  diputuskan_oleh uuid,
  diputuskan_pada timestamptz,
  catatan_keputusan text check (catatan_keputusan is null or char_length(catatan_keputusan) <= 500),
  dihapus boolean not null default false,
  dibuat_pada timestamptz not null default now()
);
alter table public.prestasi_siswa enable row level security;
create index if not exists prestasi_pd_idx on public.prestasi_siswa (peserta_didik_id) where not dihapus;
create index if not exists prestasi_status_idx on public.prestasi_siswa (status) where not dihapus;

-- ---------------------------------------------------------------- isi awal katalog dan ambang
-- CONTOH AWAL. Daftar dan poin ini disusun umum untuk SMK, bukan tata tertib SMKN 1 Gunung Sindur.
-- Waka Kesiswaan menyesuaikannya di halaman Katalog pelanggaran sebelum dipakai.
insert into public.pelanggaran_jenis (npsn, kategori, nama, poin, urutan)
select s.npsn, v.kategori, v.nama, v.poin, v.urutan
  from (select npsn from public.sekolah order by npsn limit 1) s,
  (values
    ('ringan', 'Terlambat masuk sekolah', 5, 1),
    ('ringan', 'Seragam atau atribut tidak sesuai ketentuan', 5, 2),
    ('ringan', 'Rambut atau penampilan tidak sesuai ketentuan', 5, 3),
    ('ringan', 'Tidak mengikuti upacara atau apel tanpa keterangan', 10, 4),
    ('ringan', 'Membuang sampah sembarangan', 5, 5),
    ('ringan', 'Tidak melaksanakan piket kelas', 5, 6),
    ('sedang', 'Membolos atau tidak hadir tanpa keterangan (alpa)', 20, 1),
    ('sedang', 'Meninggalkan kelas atau sekolah tanpa izin', 20, 2),
    ('sedang', 'Memakai ponsel saat pembelajaran tanpa izin guru', 15, 3),
    ('sedang', 'Tidak memakai alat pelindung diri saat praktik', 20, 4),
    ('sedang', 'Berkata kasar atau tidak sopan kepada warga sekolah', 25, 5),
    ('sedang', 'Menyontek saat ulangan atau ujian', 25, 6),
    ('sedang', 'Merokok atau membawa rokok di lingkungan sekolah', 30, 7),
    ('sedang', 'Merusak fasilitas sekolah', 30, 8),
    ('berat', 'Berkelahi atau perundungan', 75, 1),
    ('berat', 'Memalsukan surat, tanda tangan, atau dokumen', 50, 2),
    ('berat', 'Mengambil barang milik orang lain tanpa izin', 75, 3),
    ('berat', 'Membawa atau meminum minuman keras', 75, 4),
    ('berat', 'Membawa senjata tajam atau benda berbahaya', 100, 5),
    ('berat', 'Membawa, memakai, atau mengedarkan narkotika dan obat terlarang', 100, 6),
    ('berat', 'Tindakan asusila', 100, 7)
  ) as v (kategori, nama, poin, urutan)
on conflict (npsn, nama) do nothing;

insert into public.kesiswaan_ambang (npsn, poin_min, tindakan, keterangan)
select s.npsn, v.poin_min, v.tindakan, v.keterangan
  from (select npsn from public.sekolah order by npsn limit 1) s,
  (values
    (25, 'Teguran dan pembinaan wali kelas', 'Wali kelas memanggil siswa dan mencatat pembinaan.'),
    (50, 'Panggilan orang tua', 'Orang tua dipanggil ke sekolah oleh wali kelas dan BK.'),
    (75, 'Surat peringatan 1', 'Surat peringatan pertama dari sekolah.'),
    (100, 'Surat peringatan 2 dan pembinaan BK', 'Pembinaan intensif oleh Guru BK.'),
    (150, 'Surat peringatan 3 dan rapat penentuan tindakan', 'Dibahas Waka Kesiswaan dan Kepala Sekolah.')
  ) as v (poin_min, tindakan, keterangan)
on conflict (npsn, poin_min) do nothing;

-- ---------------------------------------------------------------- katalog dan ambang
create or replace function public.kesiswaan_katalog() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_waka boolean := private.kes_waka();
begin
  if auth.uid() is null
     or not (v_waka
             or private.kes_semua(array['kesiswaan.catat','kesiswaan.pantau','kesiswaan.kelola'])
             or cardinality(private.kes_rombel_saya(array['kesiswaan.catat','kesiswaan.pantau'])) > 0) then
    raise exception 'Anda tidak berwenang membuka katalog pelanggaran.';
  end if;
  return jsonb_build_object(
    'bisa_atur', v_waka,
    'jenis', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'kategori', j.kategori, 'nama', j.nama, 'poin', j.poin, 'aktif', j.aktif)
                order by case j.kategori when 'ringan' then 1 when 'sedang' then 2 else 3 end, j.urutan, j.nama), '[]'::jsonb)
                from public.pelanggaran_jenis j where j.npsn = private.npsn_saya() and (j.aktif or v_waka)),
    'ambang', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'poin_min', a.poin_min, 'tindakan', a.tindakan, 'keterangan', a.keterangan, 'aktif', a.aktif)
                order by a.poin_min), '[]'::jsonb)
                from public.kesiswaan_ambang a where a.npsn = private.npsn_saya() and (a.aktif or v_waka)));
end $$;

create or replace function public.pelanggaran_jenis_simpan(p_id uuid, p_kategori text, p_nama text, p_poin int, p_aktif boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_nama text := btrim(coalesce(p_nama, ''));
  v_id uuid := p_id;
begin
  if not private.kes_waka() then raise exception 'Hanya Waka Kesiswaan yang mengatur katalog pelanggaran.'; end if;
  if p_kategori not in ('ringan','sedang','berat') then raise exception 'Kategori harus ringan, sedang, atau berat.'; end if;
  if char_length(v_nama) < 3 or char_length(v_nama) > 150 then raise exception 'Nama pelanggaran 3 sampai 150 karakter.'; end if;
  if p_poin is null or p_poin < 1 or p_poin > 500 then raise exception 'Poin 1 sampai 500.'; end if;
  if v_id is null then
    insert into public.pelanggaran_jenis (npsn, kategori, nama, poin, aktif, urutan)
    values (private.npsn_saya(), p_kategori, v_nama, p_poin, coalesce(p_aktif, true),
            coalesce((select max(urutan) + 1 from public.pelanggaran_jenis where npsn = private.npsn_saya() and kategori = p_kategori), 1))
    returning id into v_id;
  else
    update public.pelanggaran_jenis set kategori = p_kategori, nama = v_nama, poin = p_poin, aktif = coalesce(p_aktif, true)
     where id = v_id and npsn = private.npsn_saya();
    if not found then raise exception 'Jenis pelanggaran tidak ditemukan.'; end if;
  end if;
  perform private.kes_audit('pelanggaran_jenis', 'SIMPAN', jsonb_build_object('id', v_id, 'nama', v_nama, 'poin', p_poin, 'aktif', p_aktif));
  return v_id;
exception when unique_violation then
  raise exception 'Nama pelanggaran itu sudah ada di katalog.';
end $$;

create or replace function public.kesiswaan_ambang_simpan(p_id uuid, p_poin_min int, p_tindakan text, p_keterangan text default null, p_aktif boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_t text := btrim(coalesce(p_tindakan, ''));
  v_id uuid := p_id;
begin
  if not private.kes_waka() then raise exception 'Hanya Waka Kesiswaan yang mengatur ambang poin.'; end if;
  if p_poin_min is null or p_poin_min < 1 or p_poin_min > 2000 then raise exception 'Ambang poin 1 sampai 2000.'; end if;
  if char_length(v_t) < 3 or char_length(v_t) > 150 then raise exception 'Tindakan 3 sampai 150 karakter.'; end if;
  if v_id is null then
    insert into public.kesiswaan_ambang (npsn, poin_min, tindakan, keterangan, aktif)
    values (private.npsn_saya(), p_poin_min, v_t, nullif(btrim(coalesce(p_keterangan, '')), ''), coalesce(p_aktif, true)) returning id into v_id;
  else
    update public.kesiswaan_ambang set poin_min = p_poin_min, tindakan = v_t, keterangan = nullif(btrim(coalesce(p_keterangan, '')), ''), aktif = coalesce(p_aktif, true)
     where id = v_id and npsn = private.npsn_saya();
    if not found then raise exception 'Ambang tidak ditemukan.'; end if;
  end if;
  perform private.kes_audit('kesiswaan_ambang', 'SIMPAN', jsonb_build_object('id', v_id, 'poin_min', p_poin_min, 'tindakan', v_t, 'aktif', p_aktif));
  return v_id;
exception when unique_violation then
  raise exception 'Sudah ada ambang dengan poin itu.';
end $$;

-- ---------------------------------------------------------------- pelanggaran
create or replace function public.pelanggaran_catat(p_pd uuid, p_jenis_id uuid, p_tanggal date, p_uraian text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_hari date := private.kes_hari();
  v_pd public.peserta_didik%rowtype;
  v_j public.pelanggaran_jenis%rowtype;
  v_uraian text := nullif(btrim(coalesce(p_uraian, '')), '');
  v_waka boolean := private.kes_waka();
  v_id uuid;
begin
  if auth.uid() is null or not private.kes_pd_boleh(array['kesiswaan.catat'], p_pd) then
    raise exception 'Anda tidak berwenang mencatat untuk siswa ini.';
  end if;
  select * into v_pd from public.peserta_didik where id = p_pd;
  if not found or v_pd.status_peserta_didik <> 'aktif' then raise exception 'Siswa tidak ditemukan atau sudah tidak aktif.'; end if;
  select * into v_j from public.pelanggaran_jenis where id = p_jenis_id and aktif and npsn = v_pd.npsn;
  if not found then raise exception 'Jenis pelanggaran tidak dikenal.'; end if;
  if p_tanggal is null or p_tanggal > v_hari or p_tanggal < v_hari - 365 then raise exception 'Tanggal kejadian tidak valid.'; end if;
  if v_uraian is not null and char_length(v_uraian) > 1000 then raise exception 'Uraian maksimal 1000 karakter.'; end if;
  if (select count(*) from public.pelanggaran_siswa where dicatat_oleh = auth.uid() and dibuat_pada > now() - interval '1 hour') >= 60 then
    raise exception 'Terlalu banyak catatan dalam satu jam. Coba lagi nanti.';
  end if;
  if exists (select 1 from public.pelanggaran_siswa
              where peserta_didik_id = p_pd and jenis_id = p_jenis_id and tanggal = p_tanggal and not dihapus and status <> 'ditolak') then
    raise exception 'Pelanggaran yang sama pada tanggal itu sudah tercatat.';
  end if;
  insert into public.pelanggaran_siswa (npsn, peserta_didik_id, rombel_id, jenis_id, jenis_nama, kategori, poin, tanggal, uraian, tahun_ajaran,
                                        status, dicatat_oleh, dicatat_nama, diputuskan_oleh, diputuskan_pada)
  values (v_pd.npsn, p_pd, private.kes_rombel_pd(p_pd), v_j.id, v_j.nama, v_j.kategori, v_j.poin, p_tanggal, v_uraian, public.tahun_ajaran_sekarang(),
          case when v_waka then 'terverifikasi' else 'diajukan' end, auth.uid(), public.nama_saya(),
          case when v_waka then auth.uid() end, case when v_waka then now() end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.pelanggaran_daftar(p_status text default 'diajukan', p_rombel uuid default null, p_cari text default null,
                                                     p_batas int default 50, p_mulai int default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_izin text[] := array['kesiswaan.catat','kesiswaan.pantau','kesiswaan.verifikasi','kesiswaan.kelola'];
  v_semua boolean := private.kes_semua(v_izin);
  v_rb uuid[] := private.kes_rombel_saya(v_izin);
  v_waka boolean := private.kes_waka();
  v_q text := nullif(btrim(coalesce(p_cari, '')), '');
  v_batas int := least(greatest(coalesce(p_batas, 50), 1), 200);
begin
  if auth.uid() is null or (not v_semua and cardinality(v_rb) = 0) then raise exception 'Anda tidak berwenang membuka catatan pelanggaran.'; end if;
  if p_status not in ('diajukan','terverifikasi','ditolak','semua') then raise exception 'Status tidak dikenal.'; end if;
  if v_q is not null then v_q := replace(replace(v_q, '%', '\%'), '_', '\_'); end if;
  return (
    with dasar as (
      select ps.*, pd.nama, pd.nisn
        from public.pelanggaran_siswa ps join public.peserta_didik pd on pd.id = ps.peserta_didik_id
       where not ps.dihapus and ps.npsn = private.npsn_saya()
         and (p_status = 'semua' or ps.status = p_status)
         and (v_semua or exists (select 1 from public.keanggotaan_rombel k where k.peserta_didik_id = ps.peserta_didik_id and k.rombel_id = any (v_rb)))
         and (p_rombel is null or exists (select 1 from public.keanggotaan_rombel k2 where k2.peserta_didik_id = ps.peserta_didik_id and k2.rombel_id = p_rombel))
         and (v_q is null or pd.nama ilike '%' || v_q || '%' or pd.nisn = btrim(p_cari))
    ), hal as (select * from dasar order by tanggal desc, dibuat_pada desc limit v_batas offset greatest(coalesce(p_mulai, 0), 0))
    select jsonb_build_object(
      'total', (select count(*) from dasar),
      'bisa_putuskan', v_waka,
      'baris', coalesce((select jsonb_agg(jsonb_build_object(
          'id', h.id, 'pd_id', h.peserta_didik_id, 'nama', h.nama, 'nisn', h.nisn,
          'rombel', (select r.nama from public.rombel r where r.id = private.kes_rombel_pd(h.peserta_didik_id)),
          'jenis_id', h.jenis_id, 'jenis_nama', h.jenis_nama, 'kategori', h.kategori, 'poin', h.poin, 'tanggal', h.tanggal, 'uraian', h.uraian,
          'status', h.status, 'dicatat_nama', h.dicatat_nama, 'dicatat_pada', h.dibuat_pada, 'diputuskan_pada', h.diputuskan_pada,
          'catatan_keputusan', h.catatan_keputusan,
          'bisa_tarik', (h.status = 'diajukan' and h.dicatat_oleh = auth.uid())) order by h.tanggal desc, h.dibuat_pada desc) from hal h), '[]'::jsonb)));
end $$;

create or replace function public.pelanggaran_putuskan(p_id uuid, p_setuju boolean, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  if not private.kes_waka() then raise exception 'Hanya Waka Kesiswaan yang memverifikasi catatan pelanggaran.'; end if;
  if not coalesce(p_setuju, false) and (v_c is null or char_length(v_c) < 3) then raise exception 'Alasan penolakan wajib diisi.'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  update public.pelanggaran_siswa
     set status = case when p_setuju then 'terverifikasi' else 'ditolak' end, diputuskan_oleh = auth.uid(), diputuskan_pada = now(),
         catatan_keputusan = v_c, diperbarui_pada = now()
   where id = p_id and status = 'diajukan' and not dihapus and npsn = private.npsn_saya();
  if not found then raise exception 'Catatan tidak ditemukan atau sudah diputuskan.'; end if;
  perform private.kes_audit('pelanggaran_siswa', case when p_setuju then 'VERIFIKASI' else 'TOLAK' end, jsonb_build_object('id', p_id));
end $$;

create or replace function public.pelanggaran_ubah(p_id uuid, p_jenis_id uuid, p_tanggal date, p_uraian text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hari date := private.kes_hari();
  v_lama public.pelanggaran_siswa%rowtype;
  v_j public.pelanggaran_jenis%rowtype;
  v_uraian text := nullif(btrim(coalesce(p_uraian, '')), '');
begin
  if not private.kes_waka() then raise exception 'Hanya Waka Kesiswaan yang mengubah catatan pelanggaran.'; end if;
  select * into v_lama from public.pelanggaran_siswa where id = p_id and not dihapus and npsn = private.npsn_saya();
  if not found then raise exception 'Catatan tidak ditemukan.'; end if;
  select * into v_j from public.pelanggaran_jenis where id = p_jenis_id and npsn = v_lama.npsn;
  if not found then raise exception 'Jenis pelanggaran tidak dikenal.'; end if;
  if p_tanggal is null or p_tanggal > v_hari or p_tanggal < v_hari - 365 then raise exception 'Tanggal kejadian tidak valid.'; end if;
  if v_uraian is not null and char_length(v_uraian) > 1000 then raise exception 'Uraian maksimal 1000 karakter.'; end if;
  update public.pelanggaran_siswa
     set jenis_id = v_j.id, jenis_nama = v_j.nama, kategori = v_j.kategori, poin = v_j.poin, tanggal = p_tanggal, uraian = v_uraian, diperbarui_pada = now()
   where id = p_id;
  perform private.kes_audit('pelanggaran_siswa', 'UBAH', jsonb_build_object('id', p_id,
    'lama', jsonb_build_object('jenis', v_lama.jenis_nama, 'poin', v_lama.poin, 'tanggal', v_lama.tanggal),
    'baru', jsonb_build_object('jenis', v_j.nama, 'poin', v_j.poin, 'tanggal', p_tanggal)));
end $$;

create or replace function public.pelanggaran_hapus(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_a text := nullif(btrim(coalesce(p_alasan, '')), '');
begin
  if not private.kes_waka() then raise exception 'Hanya Waka Kesiswaan yang menghapus catatan pelanggaran.'; end if;
  if v_a is null or char_length(v_a) < 3 then raise exception 'Alasan penghapusan wajib diisi.'; end if;
  update public.pelanggaran_siswa set dihapus = true, diperbarui_pada = now() where id = p_id and not dihapus and npsn = private.npsn_saya();
  if not found then raise exception 'Catatan tidak ditemukan.'; end if;
  perform private.kes_audit('pelanggaran_siswa', 'HAPUS', jsonb_build_object('id', p_id, 'alasan', left(v_a, 300)));
end $$;

create or replace function public.pelanggaran_tarik(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.pelanggaran_siswa set dihapus = true, diperbarui_pada = now()
   where id = p_id and status = 'diajukan' and not dihapus and dicatat_oleh = auth.uid();
  if not found then raise exception 'Hanya catatan Anda yang belum diverifikasi yang bisa ditarik.'; end if;
end $$;

-- ---------------------------------------------------------------- tindak lanjut pembinaan
create or replace function public.tindak_lanjut_catat(p_pd uuid, p_pelanggaran_id uuid, p_jenis text, p_tanggal date, p_catatan text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_hari date := private.kes_hari();
  v_npsn text;
  v_c text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_id uuid;
begin
  if auth.uid() is null or not private.kes_pd_boleh(array['kesiswaan.pantau','kesiswaan.verifikasi','kesiswaan.kelola'], p_pd) then
    raise exception 'Anda tidak berwenang mencatat pembinaan untuk siswa ini.';
  end if;
  select npsn into v_npsn from public.peserta_didik where id = p_pd;
  if v_npsn is null then raise exception 'Siswa tidak ditemukan.'; end if;
  if p_jenis not in ('teguran_lisan','teguran_tertulis','panggilan_orang_tua','pembinaan_bk','kunjungan_rumah','surat_peringatan_1',
                     'surat_peringatan_2','surat_peringatan_3','skorsing','dikembalikan_ke_orang_tua','lainnya') then
    raise exception 'Jenis tindakan tidak dikenal.';
  end if;
  if p_tanggal is null or p_tanggal > v_hari or p_tanggal < v_hari - 365 then raise exception 'Tanggal tindakan tidak valid.'; end if;
  if v_c is not null and char_length(v_c) > 1000 then raise exception 'Catatan maksimal 1000 karakter.'; end if;
  if p_pelanggaran_id is not null
     and not exists (select 1 from public.pelanggaran_siswa where id = p_pelanggaran_id and peserta_didik_id = p_pd and not dihapus) then
    raise exception 'Pelanggaran yang dirujuk bukan milik siswa ini.';
  end if;
  insert into public.tindak_lanjut_siswa (npsn, peserta_didik_id, pelanggaran_id, jenis, tanggal, catatan, tahun_ajaran, dicatat_oleh, dicatat_nama)
  values (v_npsn, p_pd, p_pelanggaran_id, p_jenis, p_tanggal, v_c, public.tahun_ajaran_sekarang(), auth.uid(), public.nama_saya())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.tindak_lanjut_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.tindak_lanjut_siswa set dihapus = true
   where id = p_id and not dihapus and npsn = private.npsn_saya() and (private.kes_waka() or dicatat_oleh = auth.uid());
  if not found then raise exception 'Tindakan tidak ditemukan atau bukan milik Anda.'; end if;
  perform private.kes_audit('tindak_lanjut_siswa', 'HAPUS', jsonb_build_object('id', p_id));
end $$;

-- ---------------------------------------------------------------- prestasi
create or replace function public.prestasi_ajukan(p_pd uuid, p_nama text, p_bidang text, p_tingkat text, p_peringkat text, p_penyelenggara text,
                                                  p_tanggal date, p_berkas_url text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_hari date := private.kes_hari();
  v_npsn text;
  v_nama text := btrim(coalesce(p_nama, ''));
  v_url text := nullif(btrim(coalesce(p_berkas_url, '')), '');
  v_staf boolean;
  v_waka boolean := private.kes_waka();
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Perlu masuk.'; end if;
  v_staf := private.kes_pd_boleh(array['kesiswaan.catat'], p_pd);
  if not (v_staf or p_pd = private.pd_id_saya() or p_pd in (select private.anak_saya())) then
    raise exception 'Anda tidak berwenang mengajukan prestasi untuk siswa ini.';
  end if;
  select npsn into v_npsn from public.peserta_didik where id = p_pd and status_peserta_didik = 'aktif';
  if v_npsn is null then raise exception 'Siswa tidak ditemukan atau sudah tidak aktif.'; end if;
  if char_length(v_nama) < 3 or char_length(v_nama) > 200 then raise exception 'Nama prestasi 3 sampai 200 karakter.'; end if;
  if p_bidang not in ('akademik','olahraga','seni','keterampilan_kejuruan','keagamaan','organisasi','lainnya') then raise exception 'Bidang tidak dikenal.'; end if;
  if p_tingkat not in ('sekolah','kecamatan','kabupaten','provinsi','nasional','internasional') then raise exception 'Tingkat tidak dikenal.'; end if;
  if p_tanggal is null or p_tanggal > v_hari or p_tanggal < v_hari - 1100 then raise exception 'Tanggal prestasi tidak valid.'; end if;
  if v_url is not null and v_url !~* '^https://' then raise exception 'Tautan bukti harus diawali https://.'; end if;
  if not v_staf and (select count(*) from public.prestasi_siswa where peserta_didik_id = p_pd and status = 'diajukan' and not dihapus) >= 10 then
    raise exception 'Masih ada 10 ajuan prestasi yang menunggu verifikasi.';
  end if;
  insert into public.prestasi_siswa (npsn, peserta_didik_id, nama_prestasi, bidang, tingkat, peringkat, penyelenggara, tanggal, berkas_url, tahun_ajaran,
                                     status, dicatat_oleh, dicatat_nama, diputuskan_oleh, diputuskan_pada)
  values (v_npsn, p_pd, v_nama, p_bidang, p_tingkat, nullif(btrim(coalesce(p_peringkat, '')), ''), nullif(btrim(coalesce(p_penyelenggara, '')), ''),
          p_tanggal, v_url, public.tahun_ajaran_sekarang(), case when v_waka then 'terverifikasi' else 'diajukan' end, auth.uid(), public.nama_saya(),
          case when v_waka then auth.uid() end, case when v_waka then now() end)
  returning id into v_id;
  return v_id;
exception when check_violation then
  raise exception 'Isian prestasi belum valid. Periksa peringkat dan penyelenggara (maksimal 60 dan 150 karakter).';
end $$;

create or replace function public.prestasi_daftar(p_status text default 'diajukan', p_rombel uuid default null, p_cari text default null,
                                                  p_batas int default 50, p_mulai int default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_izin text[] := array['kesiswaan.catat','kesiswaan.pantau','kesiswaan.verifikasi','kesiswaan.kelola'];
  v_semua boolean := private.kes_semua(v_izin);
  v_rb uuid[] := private.kes_rombel_saya(v_izin);
  v_q text := nullif(btrim(coalesce(p_cari, '')), '');
  v_batas int := least(greatest(coalesce(p_batas, 50), 1), 200);
begin
  if auth.uid() is null or (not v_semua and cardinality(v_rb) = 0) then raise exception 'Anda tidak berwenang membuka catatan prestasi.'; end if;
  if p_status not in ('diajukan','terverifikasi','ditolak','semua') then raise exception 'Status tidak dikenal.'; end if;
  if v_q is not null then v_q := replace(replace(v_q, '%', '\%'), '_', '\_'); end if;
  return (
    with dasar as (
      select pr.*, pd.nama, pd.nisn
        from public.prestasi_siswa pr join public.peserta_didik pd on pd.id = pr.peserta_didik_id
       where not pr.dihapus and pr.npsn = private.npsn_saya()
         and (p_status = 'semua' or pr.status = p_status)
         and (v_semua or exists (select 1 from public.keanggotaan_rombel k where k.peserta_didik_id = pr.peserta_didik_id and k.rombel_id = any (v_rb)))
         and (p_rombel is null or exists (select 1 from public.keanggotaan_rombel k2 where k2.peserta_didik_id = pr.peserta_didik_id and k2.rombel_id = p_rombel))
         and (v_q is null or pd.nama ilike '%' || v_q || '%' or pd.nisn = btrim(p_cari))
    ), hal as (select * from dasar order by tanggal desc, dibuat_pada desc limit v_batas offset greatest(coalesce(p_mulai, 0), 0))
    select jsonb_build_object(
      'total', (select count(*) from dasar),
      'bisa_putuskan', private.kes_waka(),
      'baris', coalesce((select jsonb_agg(jsonb_build_object(
          'id', h.id, 'pd_id', h.peserta_didik_id, 'nama', h.nama, 'nisn', h.nisn,
          'rombel', (select r.nama from public.rombel r where r.id = private.kes_rombel_pd(h.peserta_didik_id)),
          'nama_prestasi', h.nama_prestasi, 'bidang', h.bidang, 'tingkat', h.tingkat, 'peringkat', h.peringkat, 'penyelenggara', h.penyelenggara,
          'tanggal', h.tanggal, 'berkas_url', h.berkas_url, 'status', h.status, 'dicatat_nama', h.dicatat_nama,
          'catatan_keputusan', h.catatan_keputusan,
          'bisa_tarik', (h.status = 'diajukan' and h.dicatat_oleh = auth.uid())) order by h.tanggal desc, h.dibuat_pada desc) from hal h), '[]'::jsonb)));
end $$;

create or replace function public.prestasi_putuskan(p_id uuid, p_setuju boolean, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  if not private.kes_waka() then raise exception 'Hanya Waka Kesiswaan yang memverifikasi prestasi.'; end if;
  if not coalesce(p_setuju, false) and (v_c is null or char_length(v_c) < 3) then raise exception 'Alasan penolakan wajib diisi.'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  update public.prestasi_siswa
     set status = case when p_setuju then 'terverifikasi' else 'ditolak' end, diputuskan_oleh = auth.uid(), diputuskan_pada = now(), catatan_keputusan = v_c
   where id = p_id and status = 'diajukan' and not dihapus and npsn = private.npsn_saya();
  if not found then raise exception 'Prestasi tidak ditemukan atau sudah diputuskan.'; end if;
  perform private.kes_audit('prestasi_siswa', case when p_setuju then 'VERIFIKASI' else 'TOLAK' end, jsonb_build_object('id', p_id));
end $$;

create or replace function public.prestasi_hapus(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_a text := nullif(btrim(coalesce(p_alasan, '')), '');
begin
  if not private.kes_waka() then raise exception 'Hanya Waka Kesiswaan yang menghapus catatan prestasi.'; end if;
  if v_a is null or char_length(v_a) < 3 then raise exception 'Alasan penghapusan wajib diisi.'; end if;
  update public.prestasi_siswa set dihapus = true where id = p_id and not dihapus and npsn = private.npsn_saya();
  if not found then raise exception 'Prestasi tidak ditemukan.'; end if;
  perform private.kes_audit('prestasi_siswa', 'HAPUS', jsonb_build_object('id', p_id, 'alasan', left(v_a, 300)));
end $$;

create or replace function public.prestasi_tarik(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.prestasi_siswa set dihapus = true where id = p_id and status = 'diajukan' and not dihapus and dicatat_oleh = auth.uid();
  if not found then raise exception 'Hanya ajuan Anda yang belum diverifikasi yang bisa ditarik.'; end if;
end $$;

-- ---------------------------------------------------------------- hak eksekusi
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array[
       'kesiswaan_katalog','pelanggaran_jenis_simpan','kesiswaan_ambang_simpan','pelanggaran_catat','pelanggaran_daftar','pelanggaran_putuskan',
       'pelanggaran_ubah','pelanggaran_hapus','pelanggaran_tarik','tindak_lanjut_catat','tindak_lanjut_hapus',
       'prestasi_ajukan','prestasi_daftar','prestasi_putuskan','prestasi_hapus','prestasi_tarik'])
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;
