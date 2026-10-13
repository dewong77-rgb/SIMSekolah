-- Tambahan untuk staf Kesiswaan:
--   1. Rekap kehadiran per periode (minggu, bulan, tiga bulan, tahun ajaran) per siswa, per kelas, dan per jurusan.
--   2. Biodata siswa untuk Waka Kesiswaan dan TU Kesiswaan (izin kesiswaan.biodata).
--   3. Usul pengeluaran siswa. TU Kesiswaan mengajukan; operator sekolah atau super admin menanggapi
--      dengan melampirkan PDF bukti proses keluar dari Dapodik. SIMS tidak mengubah status siswa:
--      Dapodik tetap sumber kebenaran, status berubah lewat unggahan Dapodik berikutnya.

-- ---------------------------------------------------------------- izin
insert into public.izin (kode, nama, bidang) values
  ('kesiswaan.biodata', 'Membuka biodata lengkap siswa seluruh sekolah', 'Kesiswaan'),
  ('kesiswaan.keluar',  'Mengusulkan pengeluaran siswa dan memantau tanggapannya', 'Kesiswaan')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_kesiswaan', 'kesiswaan.biodata'),
  ('tu_kesiswaan',   'kesiswaan.biodata'),
  ('waka_kesiswaan', 'kesiswaan.keluar'),
  ('tu_kesiswaan',   'kesiswaan.keluar')
on conflict do nothing;

-- ---------------------------------------------------------------- rekap kehadiran
-- p_kelompok: 'siswa' | 'rombel' | 'jurusan'. Rentang maksimal 400 hari. Hanya kelas utama (kecuali siswa dalam satu rombel dipilih).
-- Jurusan diambil dari kompetensi_keahlian rombel; bila kosong, dari nama rombel ("X TJKT 1" -> "TJKT").
create or replace function public.kehadiran_rekap_agregat(p_dari date, p_sampai date, p_kelompok text default 'rombel', p_rombel uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_semua boolean := private.kes_semua(array['kesiswaan.izin','kesiswaan.pantau']);
  v_rombel uuid[] := private.kes_rombel_saya(array['kesiswaan.izin','kesiswaan.pantau']);
  v_hasil jsonb;
  v_hari int;
begin
  if auth.uid() is null or not (v_semua or cardinality(v_rombel) > 0) then raise exception 'Anda tidak berwenang membuka rekap kehadiran.'; end if;
  if p_dari is null or p_sampai is null or p_sampai < p_dari or p_sampai - p_dari > 400 then raise exception 'Rentang tanggal 1 sampai 400 hari.'; end if;
  if p_kelompok not in ('siswa','rombel','jurusan') then raise exception 'Pengelompokan tidak dikenal.'; end if;
  if p_rombel is not null and not (v_semua or p_rombel = any (v_rombel)) then raise exception 'Anda tidak berwenang membuka rombel ini.'; end if;

  select count(*) into v_hari from generate_series(p_dari, p_sampai, interval '1 day') d where extract(isodow from d) < 6;

  with s as (
    select pd.id as pd, pd.nama, pd.nisn, r.id as rid, r.nama as rombel, r.tingkat,
           coalesce(nullif(btrim(r.kompetensi_keahlian), ''),
                    nullif(regexp_replace(regexp_replace(r.nama, '^[IVXivx]+\s+', ''), '\s+[0-9]+$', ''), ''), r.nama) as jurusan,
           count(h.status) as tercatat,
           count(*) filter (where h.status = 'hadir') as hadir, count(*) filter (where h.status = 'terlambat') as terlambat,
           count(*) filter (where h.status = 'sakit') as sakit, count(*) filter (where h.status = 'izin') as izin,
           count(*) filter (where h.status = 'dispensasi') as dispensasi, count(*) filter (where h.status = 'alpa') as alpa
      from public.keanggotaan_rombel k
      join public.rombel r on r.id = k.rombel_id and r.npsn = private.npsn_saya()
      join public.peserta_didik pd on pd.id = k.peserta_didik_id and pd.status_peserta_didik = 'aktif'
      left join private.kes_status_hari(p_dari, p_sampai) h on h.pd = pd.id
     where (p_rombel is null or k.rombel_id = p_rombel) and (v_semua or k.rombel_id = any (v_rombel))
       and (p_rombel is not null or r.jenis_rombel ilike '%utama%')
     group by pd.id, pd.nama, pd.nisn, r.id, r.nama, r.tingkat, r.kompetensi_keahlian)
  select case p_kelompok
    when 'siswa' then (select coalesce(jsonb_agg(jsonb_build_object(
        'nama', s.nama, 'nisn', s.nisn, 'rombel', s.rombel, 'jurusan', s.jurusan, 'siswa', 1, 'tercatat', s.tercatat, 'hadir', s.hadir,
        'terlambat', s.terlambat, 'sakit', s.sakit, 'izin', s.izin, 'dispensasi', s.dispensasi, 'alpa', s.alpa) order by s.rombel, s.nama), '[]'::jsonb) from s)
    when 'rombel' then (select coalesce(jsonb_agg(jsonb_build_object(
        'nama', t.rombel, 'rombel', t.rombel, 'jurusan', t.jurusan, 'siswa', t.siswa, 'tercatat', t.tercatat, 'hadir', t.hadir,
        'terlambat', t.terlambat, 'sakit', t.sakit, 'izin', t.izin, 'dispensasi', t.dispensasi, 'alpa', t.alpa) order by t.tingkat, t.jurusan, t.rombel), '[]'::jsonb)
      from (select s.rid, s.rombel, s.tingkat, s.jurusan, count(*) as siswa, sum(s.tercatat) as tercatat, sum(s.hadir) as hadir, sum(s.terlambat) as terlambat,
                   sum(s.sakit) as sakit, sum(s.izin) as izin, sum(s.dispensasi) as dispensasi, sum(s.alpa) as alpa
              from s group by s.rid, s.rombel, s.tingkat, s.jurusan) t)
    else (select coalesce(jsonb_agg(jsonb_build_object(
        'nama', t.jurusan, 'jurusan', t.jurusan, 'siswa', t.siswa, 'tercatat', t.tercatat, 'hadir', t.hadir,
        'terlambat', t.terlambat, 'sakit', t.sakit, 'izin', t.izin, 'dispensasi', t.dispensasi, 'alpa', t.alpa) order by t.jurusan), '[]'::jsonb)
      from (select s.jurusan, count(*) as siswa, sum(s.tercatat) as tercatat, sum(s.hadir) as hadir, sum(s.terlambat) as terlambat,
                   sum(s.sakit) as sakit, sum(s.izin) as izin, sum(s.dispensasi) as dispensasi, sum(s.alpa) as alpa
              from s group by s.jurusan) t)
  end into v_hasil;

  return jsonb_build_object('dari', p_dari, 'sampai', p_sampai, 'hari_kerja', v_hari, 'kelompok', p_kelompok, 'baris', v_hasil);
end $$;

-- ---------------------------------------------------------------- biodata siswa
-- Detail memakai profil_dapodik (formulir lengkap). Pemegang kesiswaan.biodata ikut diizinkan membuka siswa mana pun di sekolahnya.
do $do$
declare d text; sig regprocedure; baru text;
begin
  select p.oid::regprocedure into sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'profil_dapodik';
  d := pg_get_functiondef(sig);
  baru := replace(d, 'if not (v_peran = ''admin_tu''', 'if not (v_peran = ''admin_tu'' or private.punya_izin(''kesiswaan.biodata'', ''__semua__'')');
  if baru = d then raise exception 'profil_dapodik: pola izin siswa tidak ditemukan, perbarui migrasi ini.'; end if;
  execute baru;
end $do$;

create or replace function public.biodata_siswa_daftar(p_cari text default null, p_rombel uuid default null, p_status text default 'aktif',
                                                       p_batas int default 50, p_mulai int default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cari text := nullif(btrim(coalesce(p_cari, '')), '');
  v_batas int := least(greatest(coalesce(p_batas, 50), 1), 200);
begin
  if auth.uid() is null or not (private.adalah_super() or private.peran_saya() = 'admin_tu' or private.punya_izin('kesiswaan.biodata', '__semua__')) then
    raise exception 'Anda tidak berwenang membuka biodata siswa.';
  end if;
  if p_status is not null and p_status not in ('aktif','lulus','mutasi') then raise exception 'Status tidak dikenal.'; end if;
  return (
    with f as (
      select pd.id, pd.nama, pd.nisn, pd.nipd, pd.jk, pd.tempat_lahir, pd.tanggal_lahir, pd.status_peserta_didik,
             r.id as rombel_id, r.nama as rombel
        from public.peserta_didik pd
        left join lateral (
          select r2.id, r2.nama from public.keanggotaan_rombel k join public.rombel r2 on r2.id = k.rombel_id
           where k.peserta_didik_id = pd.id and r2.jenis_rombel ilike '%utama%' order by r2.semester_id desc limit 1) r on true
       where pd.npsn = private.npsn_saya()
         and (p_status is null or pd.status_peserta_didik = p_status)
         and (p_rombel is null or r.id = p_rombel)
         and (v_cari is null or pd.nama ilike '%' || v_cari || '%' or pd.nisn = v_cari or pd.nipd = v_cari)),
    hal as (select * from f order by rombel nulls last, nama limit v_batas offset greatest(coalesce(p_mulai, 0), 0))
    select jsonb_build_object('total', (select count(*) from f),
      'baris', coalesce((select jsonb_agg(to_jsonb(h) order by h.rombel nulls last, h.nama) from hal h), '[]'::jsonb)));
end $$;

-- Rombel kelas utama untuk saringan biodata.
create or replace function public.biodata_siswa_rombel() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (private.adalah_super() or private.peran_saya() = 'admin_tu' or private.punya_izin('kesiswaan.biodata', '__semua__')) then
    raise exception 'Anda tidak berwenang membuka biodata siswa.';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nama', r.nama, 'tingkat', r.tingkat,
            'jumlah', (select count(*) from public.keanggotaan_rombel k join public.peserta_didik pd on pd.id = k.peserta_didik_id and pd.status_peserta_didik = 'aktif' where k.rombel_id = r.id))
            order by r.tingkat, r.nama), '[]'::jsonb)
    from public.rombel r where r.npsn = private.npsn_saya() and r.jenis_rombel ilike '%utama%'
     and r.semester_id = (select max(semester_id) from public.rombel where npsn = private.npsn_saya()));
end $$;

-- Akses tambahan yang belum tercakup kesiswaan_izin(): 'biodata', 'keluar' (mengusulkan), 'keluar.tanggapi' (operator).
create or replace function public.kesiswaan_akses_tambahan() returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare v text[] := '{}';
begin
  if auth.uid() is null then return v; end if;
  if private.adalah_super() or private.peran_saya() = 'admin_tu' or private.punya_izin('kesiswaan.biodata', '__semua__') then v := v || 'biodata'; end if;
  if private.keluar_pengusul() then v := v || 'keluar'; end if;
  if private.boleh_kerjakan() then v := v || 'keluar.tanggapi'; end if;
  return v;
end $$;

-- ---------------------------------------------------------------- pengeluaran siswa
create table if not exists public.pengeluaran_siswa (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  peserta_didik_id uuid not null references public.peserta_didik (id),
  rombel_id uuid references public.rombel (id),
  alasan text not null check (alasan in ('Mutasi','Dikeluarkan','Mengundurkan diri','Putus sekolah','Wafat','Hilang','Lainnya')),
  keterangan text check (keterangan is null or char_length(keterangan) <= 500),
  tgl_keluar date not null,
  status text not null default 'diajukan' check (status in ('diajukan','selesai','ditolak','dibatalkan')),
  diajukan_oleh uuid not null,
  diajukan_nama text,
  diajukan_pada timestamptz not null default now(),
  ditanggapi_oleh uuid,
  ditanggapi_nama text,
  ditanggapi_pada timestamptz,
  catatan_tanggapan text check (catatan_tanggapan is null or char_length(catatan_tanggapan) <= 500),
  bukti_path text check (bukti_path is null or bukti_path ~ '^[0-9]+/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.pdf$'),
  bukti_nama text check (bukti_nama is null or char_length(bukti_nama) <= 200)
);
alter table public.pengeluaran_siswa enable row level security;
revoke all on table public.pengeluaran_siswa from anon, authenticated;
create unique index if not exists pengeluaran_satu_aktif on public.pengeluaran_siswa (peserta_didik_id) where status = 'diajukan';
create index if not exists pengeluaran_status_idx on public.pengeluaran_siswa (npsn, status, diajukan_pada desc);

-- Pengusul: pemegang kesiswaan.keluar seluruh sekolah. Penanggap: operator Dapodik, Admin TU, super admin.
create or replace function private.keluar_pengusul() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (private.boleh_kerjakan() or private.punya_izin('kesiswaan.keluar', '__semua__'))
$$;

-- Berkas bukti: bucket privat PDF "{npsn}/{id ajuan}/{kode}.pdf". Menulis hanya operator; membaca operator dan pengusul.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('dokumen-keluar', 'dokumen-keluar', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.keluar_berkas_boleh(p_nama text, p_tulis boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and p_nama ~ '^[0-9]+/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.pdf$'
     and (storage.foldername(p_nama))[1] = private.npsn_saya()
     and (private.boleh_kerjakan() or (not p_tulis and private.keluar_pengusul()))
$$;

drop policy if exists keluar_tulis on storage.objects;
create policy keluar_tulis on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumen-keluar' and (select private.keluar_berkas_boleh(name, true)));
drop policy if exists keluar_hapus on storage.objects;
create policy keluar_hapus on storage.objects for delete to authenticated
  using (bucket_id = 'dokumen-keluar' and (select private.keluar_berkas_boleh(name, true)));
drop policy if exists keluar_baca on storage.objects;
create policy keluar_baca on storage.objects for select to authenticated
  using (bucket_id = 'dokumen-keluar' and (select private.keluar_berkas_boleh(name, false)));

create or replace function public.keluar_siswa_cari(p_cari text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_c text := btrim(coalesce(p_cari, ''));
begin
  if not private.keluar_pengusul() then raise exception 'Anda tidak berwenang mengusulkan pengeluaran siswa.'; end if;
  if char_length(v_c) < 2 then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nisn', x.nisn, 'rombel', x.rombel) order by x.nama), '[]'::jsonb) from (
      select pd.id, pd.nama, pd.nisn, private.kes_rombel_nama(pd.id) as rombel
        from public.peserta_didik pd
       where pd.npsn = private.npsn_saya() and pd.status_peserta_didik = 'aktif'
         and (pd.nama ilike '%' || v_c || '%' or pd.nisn = v_c)
         and not exists (select 1 from public.pengeluaran_siswa e where e.peserta_didik_id = pd.id and e.status = 'diajukan')
       order by pd.nama limit 20) x);
end $$;

create or replace function public.keluar_ajukan(p_pd uuid, p_alasan text, p_tgl date, p_keterangan text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pd public.peserta_didik%rowtype;
  v_ket text := nullif(btrim(coalesce(p_keterangan, '')), '');
  v_hari date := private.kes_hari();
  v_id uuid;
begin
  if not private.keluar_pengusul() then raise exception 'Anda tidak berwenang mengusulkan pengeluaran siswa.'; end if;
  select * into v_pd from public.peserta_didik where id = p_pd and npsn = private.npsn_saya();
  if not found or v_pd.status_peserta_didik <> 'aktif' then raise exception 'Siswa tidak ditemukan atau sudah tidak aktif.'; end if;
  if p_alasan is null or p_alasan not in ('Mutasi','Dikeluarkan','Mengundurkan diri','Putus sekolah','Wafat','Hilang','Lainnya') then raise exception 'Alasan keluar tidak dikenal.'; end if;
  if p_tgl is null then raise exception 'Tanggal keluar wajib diisi.'; end if;
  if p_tgl < v_hari - 365 or p_tgl > v_hari + 90 then raise exception 'Tanggal keluar di luar rentang yang wajar.'; end if;
  if v_ket is not null and char_length(v_ket) > 500 then raise exception 'Keterangan maksimal 500 karakter.'; end if;
  if (p_alasan = 'Lainnya' or p_alasan = 'Dikeluarkan') and v_ket is null then raise exception 'Keterangan wajib diisi untuk alasan ini.'; end if;
  if exists (select 1 from public.pengeluaran_siswa where peserta_didik_id = p_pd and status = 'diajukan') then raise exception 'Siswa ini sudah memiliki ajuan yang menunggu.'; end if;
  insert into public.pengeluaran_siswa (npsn, peserta_didik_id, rombel_id, alasan, keterangan, tgl_keluar, diajukan_oleh, diajukan_nama)
  values (v_pd.npsn, p_pd, private.kes_rombel_pd(p_pd), p_alasan, v_ket, p_tgl, auth.uid(), private.lms_nama_saya())
  returning id into v_id;
  perform private.kes_audit('pengeluaran_siswa', 'AJUKAN', jsonb_build_object('id', v_id, 'pd', p_pd, 'alasan', p_alasan, 'tgl', p_tgl));
  return v_id;
end $$;

create or replace function public.keluar_daftar(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_op boolean := private.boleh_kerjakan();
begin
  if not private.keluar_pengusul() then raise exception 'Anda tidak berwenang membuka ajuan pengeluaran siswa.'; end if;
  if p_status is not null and p_status not in ('diajukan','selesai','ditolak','dibatalkan') then raise exception 'Status tidak dikenal.'; end if;
  return jsonb_build_object(
    'operator', v_op,
    'baris', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'pd', e.peserta_didik_id, 'nama', pd.nama, 'nisn', pd.nisn, 'nipd', pd.nipd, 'rombel', r.nama,
        'alasan', e.alasan, 'keterangan', e.keterangan, 'tgl_keluar', e.tgl_keluar, 'status', e.status,
        'diajukan_nama', e.diajukan_nama, 'diajukan_pada', e.diajukan_pada, 'ditanggapi_nama', e.ditanggapi_nama,
        'ditanggapi_pada', e.ditanggapi_pada, 'catatan_tanggapan', e.catatan_tanggapan, 'bukti_path', e.bukti_path, 'bukti_nama', e.bukti_nama,
        'bisa_batal', e.status = 'diajukan' and (v_op or e.diajukan_oleh = auth.uid()))
        order by (e.status = 'diajukan') desc, e.diajukan_pada desc), '[]'::jsonb)
      from public.pengeluaran_siswa e
      join public.peserta_didik pd on pd.id = e.peserta_didik_id
      left join public.rombel r on r.id = e.rombel_id
     where e.npsn = private.npsn_saya() and (p_status is null or e.status = p_status)));
end $$;

create or replace function public.keluar_batalkan(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.pengeluaran_siswa%rowtype;
begin
  select * into e from public.pengeluaran_siswa where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if not (private.boleh_kerjakan() or (private.keluar_pengusul() and e.diajukan_oleh = auth.uid())) then raise exception 'Ajuan ini tidak dapat Anda batalkan.'; end if;
  if e.status <> 'diajukan' then raise exception 'Hanya ajuan yang menunggu yang dapat dibatalkan.'; end if;
  update public.pengeluaran_siswa set status = 'dibatalkan', ditanggapi_oleh = auth.uid(), ditanggapi_nama = private.lms_nama_saya(), ditanggapi_pada = now() where id = p_id;
  perform private.kes_audit('pengeluaran_siswa', 'BATAL', jsonb_build_object('id', p_id));
end $$;

-- Operator: selesai (wajib melampirkan PDF bukti dari Dapodik) atau tolak (wajib beralasan).
create or replace function public.keluar_tanggapi(p_id uuid, p_selesai boolean, p_catatan text default null, p_bukti_path text default null, p_bukti_nama text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.pengeluaran_siswa%rowtype;
  v_c text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_nama text := nullif(btrim(coalesce(p_bukti_nama, '')), '');
begin
  if not private.boleh_kerjakan() then raise exception 'Hanya operator sekolah atau super admin yang dapat menanggapi ajuan ini.'; end if;
  select * into e from public.pengeluaran_siswa where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if e.status <> 'diajukan' then raise exception 'Ajuan ini sudah ditanggapi.'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  if p_selesai is null then raise exception 'Tanggapan wajib dipilih.'; end if;
  if p_selesai then
    if p_bukti_path is null or p_bukti_path !~ ('^' || e.npsn || '/' || e.id::text || '/[A-Za-z0-9._-]+\.pdf$') then raise exception 'Lampirkan PDF bukti hasil keluar dari Dapodik.'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'dokumen-keluar' and name = p_bukti_path) then raise exception 'Berkas PDF belum terunggah. Coba unggah ulang.'; end if;
  elsif v_c is null then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;
  update public.pengeluaran_siswa
     set status = case when p_selesai then 'selesai' else 'ditolak' end, ditanggapi_oleh = auth.uid(), ditanggapi_nama = private.lms_nama_saya(), ditanggapi_pada = now(),
         catatan_tanggapan = v_c, bukti_path = case when p_selesai then p_bukti_path end, bukti_nama = case when p_selesai then coalesce(v_nama, 'bukti-keluar.pdf') end
   where id = p_id;
  perform private.kes_audit('pengeluaran_siswa', case when p_selesai then 'SELESAI' else 'TOLAK' end, jsonb_build_object('id', p_id, 'pd', e.peserta_didik_id));
end $$;

-- ---------------------------------------------------------------- hak eksekusi
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array[
       'kehadiran_rekap_agregat','biodata_siswa_daftar','biodata_siswa_rombel','kesiswaan_akses_tambahan','keluar_siswa_cari','keluar_ajukan','keluar_daftar','keluar_batalkan','keluar_tanggapi'])
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;
