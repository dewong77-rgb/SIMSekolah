-- Lanjutan modul Kesiswaan.
--   A. Pengeluaran siswa: tahap "sedang diproses" (ceklis operator) dan bukti hasil kerja berupa PDF atau gambar (tangkapan layar).
--   B. Pemanggilan orang tua berjenjang untuk siswa yang sering tidak hadir.
--
-- Aturan pemanggilan (per bulan kalender, hanya hari sekolah; dispensasi dan terlambat tidak dihitung):
--   Siswa melewati ambang bila alfa > 3, atau sakit > 4, atau izin > 4 dalam satu bulan (ambang di private.panggilan_ambang).
--   Siswa yang melewati ambang pada bulan M muncul sebagai kandidat (notifikasi ke pengelola kesiswaan) di bulan M+1
--   untuk Panggilan 1. Wali kelas menindaklanjuti dengan berita acara.
--   - Orang tua hadir, berita acara terisi: bila bulan berikutnya (yang sudah berakhir) masih melewati ambang -> kandidat panggilan berikutnya.
--     Bila tidak lagi melewati ambang -> "membaik", pengelola dapat menutup rangkaian.
--   - Orang tua tidak hadir (dikonfirmasi wali kelas): langsung naik ke panggilan berikutnya tanpa menunggu bulan berikutnya.
--   - Setelah Panggilan 3 (hadir maupun tidak): tahap 4 = kunjungan rumah (home visit) oleh wali kelas dan penerbitan SP 1. Rangkaian selesai.
-- Satu rangkaian berjalan per siswa. Rangkaian baru hanya dimulai untuk bulan setelah bulan terakhir yang pernah dipanggil.
-- Setelah SP 1 belum ada jenjang lanjutan (SP 2 dst.); siswa yang masih melewati ambang dimulai lagi dari Panggilan 1 di bulan berikutnya.
-- Riwayat tidak dihapus; pembatalan berupa status.

-- ================================================================ A. PENGELUARAN SISWA
alter table public.pengeluaran_siswa
  add column if not exists diproses_oleh uuid,
  add column if not exists diproses_nama text,
  add column if not exists diproses_pada timestamptz,
  add column if not exists catatan_proses text;
alter table public.pengeluaran_siswa drop constraint if exists pengeluaran_siswa_catatan_proses_check;
alter table public.pengeluaran_siswa add constraint pengeluaran_siswa_catatan_proses_check check (catatan_proses is null or char_length(catatan_proses) <= 500);

alter table public.pengeluaran_siswa drop constraint if exists pengeluaran_siswa_status_check;
alter table public.pengeluaran_siswa add constraint pengeluaran_siswa_status_check check (status in ('diajukan','diproses','selesai','ditolak','dibatalkan'));
alter table public.pengeluaran_siswa drop constraint if exists pengeluaran_siswa_bukti_path_check;
alter table public.pengeluaran_siswa add constraint pengeluaran_siswa_bukti_path_check
  check (bukti_path is null or bukti_path ~* '^[0-9]+/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(pdf|png|jpe?g|webp)$');
drop index if exists public.pengeluaran_satu_aktif;
create unique index pengeluaran_satu_aktif on public.pengeluaran_siswa (peserta_didik_id) where status in ('diajukan','diproses');

update storage.buckets set allowed_mime_types = array['application/pdf','image/png','image/jpeg','image/webp'] where id = 'dokumen-keluar';

create or replace function private.keluar_berkas_boleh(p_nama text, p_tulis boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and p_nama ~* '^[0-9]+/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(pdf|png|jpe?g|webp)$'
     and (storage.foldername(p_nama))[1] = private.npsn_saya()
     and (private.boleh_kerjakan() or (not p_tulis and private.keluar_pengusul()))
$$;

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
         and not exists (select 1 from public.pengeluaran_siswa e where e.peserta_didik_id = pd.id and e.status in ('diajukan','diproses'))
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
  if exists (select 1 from public.pengeluaran_siswa where peserta_didik_id = p_pd and status in ('diajukan','diproses')) then raise exception 'Siswa ini sudah memiliki ajuan yang belum selesai.'; end if;
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
  if p_status is not null and p_status not in ('diajukan','diproses','selesai','ditolak','dibatalkan') then raise exception 'Status tidak dikenal.'; end if;
  return jsonb_build_object(
    'operator', v_op,
    'baris', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'pd', e.peserta_didik_id, 'nama', pd.nama, 'nisn', pd.nisn, 'nipd', pd.nipd, 'rombel', r.nama,
        'alasan', e.alasan, 'keterangan', e.keterangan, 'tgl_keluar', e.tgl_keluar, 'status', e.status,
        'diajukan_nama', e.diajukan_nama, 'diajukan_pada', e.diajukan_pada,
        'diproses_nama', e.diproses_nama, 'diproses_pada', e.diproses_pada, 'catatan_proses', e.catatan_proses,
        'ditanggapi_nama', e.ditanggapi_nama, 'ditanggapi_pada', e.ditanggapi_pada, 'catatan_tanggapan', e.catatan_tanggapan,
        'bukti_path', e.bukti_path, 'bukti_nama', e.bukti_nama,
        'bisa_batal', (e.status = 'diajukan' and (v_op or e.diajukan_oleh = auth.uid())) or (e.status = 'diproses' and v_op))
        order by (e.status in ('diajukan','diproses')) desc, e.diajukan_pada desc), '[]'::jsonb)
      from public.pengeluaran_siswa e
      join public.peserta_didik pd on pd.id = e.peserta_didik_id
      left join public.rombel r on r.id = e.rombel_id
     where e.npsn = private.npsn_saya() and (p_status is null or e.status = p_status)));
end $$;

create or replace function public.keluar_batalkan(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.pengeluaran_siswa%rowtype; v_op boolean := private.boleh_kerjakan();
begin
  select * into e from public.pengeluaran_siswa where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if e.status not in ('diajukan','diproses') then raise exception 'Hanya ajuan yang belum selesai yang dapat dibatalkan.'; end if;
  if not (v_op or (private.keluar_pengusul() and e.diajukan_oleh = auth.uid() and e.status = 'diajukan')) then raise exception 'Ajuan ini tidak dapat Anda batalkan.'; end if;
  update public.pengeluaran_siswa set status = 'dibatalkan', ditanggapi_oleh = auth.uid(), ditanggapi_nama = private.lms_nama_saya(), ditanggapi_pada = now() where id = p_id;
  perform private.kes_audit('pengeluaran_siswa', 'BATAL', jsonb_build_object('id', p_id));
end $$;

-- Operator: tandai sedang diproses di Dapodik (ceklis tahap 2).
create or replace function public.keluar_proses(p_id uuid, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.pengeluaran_siswa%rowtype; v_c text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  if not private.boleh_kerjakan() then raise exception 'Hanya operator sekolah atau super admin yang dapat memproses ajuan ini.'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  select * into e from public.pengeluaran_siswa where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if e.status <> 'diajukan' then raise exception 'Ajuan ini tidak berstatus menunggu.'; end if;
  update public.pengeluaran_siswa set status = 'diproses', diproses_oleh = auth.uid(), diproses_nama = private.lms_nama_saya(), diproses_pada = now(), catatan_proses = v_c where id = p_id;
  perform private.kes_audit('pengeluaran_siswa', 'PROSES', jsonb_build_object('id', p_id));
end $$;

-- Operator: selesai (wajib melampirkan bukti PDF atau tangkapan layar dari Dapodik) atau tolak (wajib beralasan).
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
  if e.status not in ('diajukan','diproses') then raise exception 'Ajuan ini sudah ditanggapi.'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  if v_nama is not null and char_length(v_nama) > 200 then v_nama := left(v_nama, 200); end if;
  if p_selesai is null then raise exception 'Tanggapan wajib dipilih.'; end if;
  if p_selesai then
    if p_bukti_path is null or p_bukti_path !~* ('^' || e.npsn || '/' || e.id::text || '/[A-Za-z0-9._-]+\.(pdf|png|jpe?g|webp)$') then raise exception 'Lampirkan bukti hasil keluar dari Dapodik (PDF atau tangkapan layar).'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'dokumen-keluar' and name = p_bukti_path) then raise exception 'Berkas belum terunggah. Coba unggah ulang.'; end if;
  elsif v_c is null then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;
  update public.pengeluaran_siswa
     set status = case when p_selesai then 'selesai' else 'ditolak' end, ditanggapi_oleh = auth.uid(), ditanggapi_nama = private.lms_nama_saya(), ditanggapi_pada = now(),
         catatan_tanggapan = v_c, bukti_path = case when p_selesai then p_bukti_path end, bukti_nama = case when p_selesai then coalesce(v_nama, 'bukti-keluar') end
   where id = p_id;
  perform private.kes_audit('pengeluaran_siswa', case when p_selesai then 'SELESAI' else 'TOLAK' end, jsonb_build_object('id', p_id, 'pd', e.peserta_didik_id));
end $$;

-- ================================================================ B. PEMANGGILAN ORANG TUA
insert into public.izin (kode, nama, bidang) values
  ('panggilan.kelola',       'Menjadwalkan pemanggilan orang tua dan memantau rangkaiannya', 'Kesiswaan'),
  ('panggilan.tindaklanjut', 'Menindaklanjuti pemanggilan orang tua dan kunjungan rumah (wali kelas)', 'Kesiswaan')
on conflict (kode) do nothing;
insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_kesiswaan', 'panggilan.kelola'),
  ('tu_kesiswaan',   'panggilan.kelola'),
  ('wali_kelas',     'panggilan.tindaklanjut')
on conflict do nothing;

create table if not exists public.pemanggilan_rangkaian (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  peserta_didik_id uuid not null references public.peserta_didik (id),
  status text not null default 'berjalan' check (status in ('berjalan','selesai','membaik')),
  dibuat_pada timestamptz not null default now(),
  ditutup_pada timestamptz,
  ditutup_oleh uuid,
  catatan_tutup text check (catatan_tutup is null or char_length(catatan_tutup) <= 500)
);
alter table public.pemanggilan_rangkaian enable row level security;
revoke all on table public.pemanggilan_rangkaian from anon, authenticated;
create unique index if not exists rangkaian_satu_berjalan on public.pemanggilan_rangkaian (peserta_didik_id) where status = 'berjalan';

create table if not exists public.pemanggilan_ortu (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  rangkaian_id uuid not null references public.pemanggilan_rangkaian (id),
  peserta_didik_id uuid not null references public.peserta_didik (id),
  rombel_id uuid references public.rombel (id),
  urutan int not null check (urutan between 1 and 4),
  periode date not null,
  alfa int not null default 0,
  sakit int not null default 0,
  izin int not null default 0,
  tgl_panggil date not null,
  catatan_jadwal text check (catatan_jadwal is null or char_length(catatan_jadwal) <= 500),
  status text not null default 'dijadwalkan' check (status in ('dijadwalkan','selesai','tidak_hadir','dibatalkan')),
  dibuat_oleh uuid not null,
  dibuat_nama text,
  dibuat_pada timestamptz not null default now(),
  tgl_pelaksanaan date,
  ringkasan text check (ringkasan is null or char_length(ringkasan) between 10 and 3000),
  kesepakatan text check (kesepakatan is null or char_length(kesepakatan) <= 2000),
  sp_terbit boolean not null default false,
  sp_nomor text check (sp_nomor is null or char_length(sp_nomor) <= 100),
  lampiran_path text check (lampiran_path is null or lampiran_path ~* '^[0-9]+/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(pdf|png|jpe?g|webp)$'),
  lampiran_nama text check (lampiran_nama is null or char_length(lampiran_nama) <= 200),
  diisi_oleh uuid,
  diisi_nama text,
  diisi_pada timestamptz
);
alter table public.pemanggilan_ortu enable row level security;
revoke all on table public.pemanggilan_ortu from anon, authenticated;
create unique index if not exists pemanggilan_urutan_uq on public.pemanggilan_ortu (rangkaian_id, urutan) where status <> 'dibatalkan';
create index if not exists pemanggilan_status_idx on public.pemanggilan_ortu (npsn, status, tgl_panggil);
create index if not exists pemanggilan_rombel_idx on public.pemanggilan_ortu (rombel_id, status);

-- Ambang "lebih dari" per bulan. Ubah angka di sini bila kebijakan sekolah berubah.
create or replace function private.panggilan_ambang() returns jsonb
language sql immutable set search_path = '' as $$ select jsonb_build_object('alfa', 3, 'sakit', 4, 'izin', 4) $$;

create or replace function private.panggilan_kelola() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (private.adalah_super() or private.peran_saya() = 'admin_tu' or private.punya_izin('panggilan.kelola', '__semua__'))
$$;

-- Rombel yang dipegang pemanggil sebagai wali kelas (penugasan berlingkup rombel atau wali kelas Dapodik).
create or replace function private.panggilan_wali_rombel() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct t.x), array[]::uuid[]) from (
    select unnest(private.kes_rombel_saya(array['panggilan.tindaklanjut'])) as x
    union
    select r.id from public.rombel r
     where r.npsn = private.npsn_saya() and r.wali_kelas_ptk_id is not null and r.wali_kelas_ptk_id = private.ptk_id_saya()
       and r.jenis_rombel ilike '%utama%' and r.semester_id = (select max(semester_id) from public.rombel where npsn = private.npsn_saya())
  ) t
$$;

create or replace function private.panggilan_wali(p_rombel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (private.adalah_super() or p_rombel = any (private.panggilan_wali_rombel()))
$$;

-- Kandidat tindakan pada bulan p_awal (tanggal 1). Tanpa pemeriksaan hak: pemanggil publik wajib memeriksanya.
-- kondisi: baru (Panggilan 1), lanjut (bulan berikutnya masih melewati ambang), tidak_hadir (orang tua tidak hadir, langsung naik), membaik (boleh ditutup).
create or replace function private.panggilan_kandidat(p_awal date, p_pd uuid default null)
returns table (pd uuid, nama text, nisn text, rombel_id uuid, rombel text, wali text, alfa int, sakit int, izin int,
               melebihi text[], kondisi text, urutan int, rangkaian uuid)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_a jsonb := private.panggilan_ambang();
  v_akhir date := (p_awal + interval '1 month' - interval '1 day')::date;
begin
  return query
  with st as (
    select h.pd as spd,
           count(*) filter (where h.status = 'alpa')::int as alfa, count(*) filter (where h.status = 'sakit')::int as sakit,
           count(*) filter (where h.status = 'izin')::int as izin
      from private.kes_status_hari(p_awal, v_akhir) h group by h.pd),
  sw as (
    select p.id as spd, p.nama as snama, p.nisn as snisn, r.id as rid, r.nama as rnama, r.wali_kelas_nama as swali,
           exists (select 1 from public.pemanggilan_ortu o where o.peserta_didik_id = p.id and o.status <> 'dibatalkan' and o.periode >= p_awal) as lalu
      from public.peserta_didik p
      join lateral (
        select r2.id, r2.nama, r2.wali_kelas_nama from public.keanggotaan_rombel k join public.rombel r2 on r2.id = k.rombel_id
         where k.peserta_didik_id = p.id and r2.jenis_rombel ilike '%utama%' order by r2.semester_id desc limit 1) r on true
     where p.npsn = private.npsn_saya() and p.status_peserta_didik = 'aktif' and (p_pd is null or p.id = p_pd)),
  lst as (
    select distinct on (o.rangkaian_id) o.rangkaian_id as lrg, o.urutan as lu, o.status as ls, o.tgl_panggil as lt
      from public.pemanggilan_ortu o where o.status <> 'dibatalkan' order by o.rangkaian_id, o.urutan desc),
  x as (
    select sw.*, coalesce(st.alfa, 0) as alfa, coalesce(st.sakit, 0) as sakit, coalesce(st.izin, 0) as izin,
           g.id as gid, lst.lu, lst.ls, lst.lt,
           array_remove(array[
             case when coalesce(st.alfa, 0) > (v_a->>'alfa')::int then 'alfa' end,
             case when coalesce(st.sakit, 0) > (v_a->>'sakit')::int then 'sakit' end,
             case when coalesce(st.izin, 0) > (v_a->>'izin')::int then 'izin' end], null) as mel
      from sw
      left join st on st.spd = sw.spd
      left join public.pemanggilan_rangkaian g on g.peserta_didik_id = sw.spd and g.status = 'berjalan'
      left join lst on lst.lrg = g.id)
  select x.spd, x.snama, x.snisn, x.rid, x.rnama, x.swali, x.alfa, x.sakit, x.izin, x.mel,
         case
           when x.gid is null then case when cardinality(x.mel) > 0 and not x.lalu then 'baru' end
           when x.ls = 'dijadwalkan' then null
           when x.ls = 'tidak_hadir' and x.lu < 4 then 'tidak_hadir'
           when x.ls = 'selesai' and x.lu < 4 and date_trunc('month', x.lt)::date <= p_awal then case when cardinality(x.mel) > 0 then 'lanjut' else 'membaik' end
         end,
         case when x.gid is null then 1 else x.lu + 1 end,
         x.gid
    from x
   where case
           when x.gid is null then cardinality(x.mel) > 0 and not x.lalu
           when x.ls = 'dijadwalkan' then false
           when x.ls = 'tidak_hadir' and x.lu < 4 then true
           when x.ls = 'selesai' and x.lu < 4 and date_trunc('month', x.lt)::date <= p_awal then true
           else false
         end;
end $$;

create or replace function private.panggilan_bulan_awal(p_bulan date) returns date
language plpgsql stable set search_path = '' as $$
declare v_ini date := date_trunc('month', private.kes_hari())::date; v date;
begin
  v := coalesce(date_trunc('month', p_bulan)::date, (v_ini - interval '1 month')::date);
  if v >= v_ini then raise exception 'Hanya bulan yang sudah berakhir yang dapat dinilai.'; end if;
  if v < (v_ini - interval '24 months')::date then raise exception 'Bulan terlalu lampau.'; end if;
  return v;
end $$;

create or replace function public.panggilan_kandidat(p_bulan date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v date;
begin
  if not private.panggilan_kelola() then raise exception 'Anda tidak berwenang membuka daftar pemanggilan orang tua.'; end if;
  v := private.panggilan_bulan_awal(p_bulan);
  return jsonb_build_object('bulan', v, 'ambang', private.panggilan_ambang(), 'baris', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'pd', k.pd, 'nama', k.nama, 'nisn', k.nisn, 'rombel_id', k.rombel_id, 'rombel', k.rombel, 'wali', k.wali,
        'alfa', k.alfa, 'sakit', k.sakit, 'izin', k.izin, 'melebihi', k.melebihi, 'kondisi', k.kondisi, 'urutan', k.urutan)
        order by (k.kondisi = 'membaik'), k.kondisi = 'tidak_hadir' desc, k.rombel, k.nama), '[]'::jsonb)
      from private.panggilan_kandidat(v) k));
end $$;

create or replace function public.panggilan_buat(p_pd uuid, p_bulan date, p_tgl date, p_catatan text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v date;
  k record;
  v_hari date := private.kes_hari();
  v_c text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_rg uuid;
  v_id uuid;
begin
  if not private.panggilan_kelola() then raise exception 'Anda tidak berwenang menjadwalkan pemanggilan orang tua.'; end if;
  v := private.panggilan_bulan_awal(p_bulan);
  if p_tgl is null or p_tgl < v_hari or p_tgl > v_hari + 60 then raise exception 'Tanggal pemanggilan harus dalam 60 hari ke depan.'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  select * into k from private.panggilan_kandidat(v, p_pd) where kondisi in ('baru','lanjut','tidak_hadir');
  if not found then raise exception 'Siswa ini tidak memerlukan pemanggilan baru pada periode tersebut.'; end if;
  if k.rangkaian is null then
    insert into public.pemanggilan_rangkaian (npsn, peserta_didik_id) values (private.npsn_saya(), p_pd) returning id into v_rg;
  else
    v_rg := k.rangkaian;
  end if;
  insert into public.pemanggilan_ortu (npsn, rangkaian_id, peserta_didik_id, rombel_id, urutan, periode, alfa, sakit, izin, tgl_panggil, catatan_jadwal, dibuat_oleh, dibuat_nama)
  values (private.npsn_saya(), v_rg, p_pd, k.rombel_id, k.urutan, v, k.alfa, k.sakit, k.izin, p_tgl, v_c, auth.uid(), private.lms_nama_saya())
  returning id into v_id;
  perform private.kes_audit('pemanggilan_ortu', 'JADWAL', jsonb_build_object('id', v_id, 'pd', p_pd, 'urutan', k.urutan, 'periode', v));
  return v_id;
end $$;

-- Tutup rangkaian yang membaik (tidak lagi melewati ambang pada bulan berikutnya).
create or replace function public.panggilan_tutup(p_pd uuid, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.pemanggilan_rangkaian%rowtype; v_c text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  if not private.panggilan_kelola() then raise exception 'Anda tidak berwenang menutup rangkaian pemanggilan.'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  select * into g from public.pemanggilan_rangkaian where peserta_didik_id = p_pd and npsn = private.npsn_saya() and status = 'berjalan' for update;
  if not found then raise exception 'Tidak ada rangkaian pemanggilan yang berjalan untuk siswa ini.'; end if;
  if exists (select 1 from public.pemanggilan_ortu where rangkaian_id = g.id and status = 'dijadwalkan') then raise exception 'Masih ada pemanggilan yang belum ditindaklanjuti wali kelas.'; end if;
  update public.pemanggilan_rangkaian set status = 'membaik', ditutup_pada = now(), ditutup_oleh = auth.uid(), catatan_tutup = v_c where id = g.id;
  perform private.kes_audit('pemanggilan_ortu', 'TUTUP', jsonb_build_object('rangkaian', g.id, 'pd', p_pd));
end $$;

create or replace function public.panggilan_batalkan(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.pemanggilan_ortu%rowtype;
begin
  if not private.panggilan_kelola() then raise exception 'Anda tidak berwenang membatalkan jadwal pemanggilan.'; end if;
  select * into o from public.pemanggilan_ortu where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Pemanggilan tidak ditemukan.'; end if;
  if o.status <> 'dijadwalkan' then raise exception 'Hanya jadwal yang belum ditindaklanjuti yang dapat dibatalkan.'; end if;
  update public.pemanggilan_ortu set status = 'dibatalkan' where id = p_id;
  -- Rangkaian tanpa catatan aktif lagi dibuang agar siswa dapat dinilai ulang sebagai kasus baru.
  if not exists (select 1 from public.pemanggilan_ortu where rangkaian_id = o.rangkaian_id and status <> 'dibatalkan') then
    update public.pemanggilan_rangkaian set status = 'membaik', ditutup_pada = now(), ditutup_oleh = auth.uid(), catatan_tutup = 'Jadwal pertama dibatalkan' where id = o.rangkaian_id;
  end if;
  perform private.kes_audit('pemanggilan_ortu', 'BATAL', jsonb_build_object('id', p_id));
end $$;

create or replace function public.panggilan_daftar(p_status text default null, p_pd uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_kelola boolean := private.panggilan_kelola();
  v_rombel uuid[] := private.panggilan_wali_rombel();
  v_super boolean := private.adalah_super();
begin
  if auth.uid() is null or not (v_kelola or cardinality(v_rombel) > 0) then raise exception 'Anda tidak berwenang membuka daftar pemanggilan orang tua.'; end if;
  if p_status is not null and p_status not in ('dijadwalkan','selesai','tidak_hadir','dibatalkan') then raise exception 'Status tidak dikenal.'; end if;
  return jsonb_build_object('kelola', v_kelola, 'baris', (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'pd', o.peserta_didik_id, 'nama', pd.nama, 'nisn', pd.nisn, 'rombel_id', o.rombel_id, 'rombel', r.nama, 'wali', r.wali_kelas_nama,
        'urutan', o.urutan, 'periode', o.periode, 'alfa', o.alfa, 'sakit', o.sakit, 'izin', o.izin, 'tgl_panggil', o.tgl_panggil,
        'catatan_jadwal', o.catatan_jadwal, 'status', o.status, 'dibuat_nama', o.dibuat_nama, 'dibuat_pada', o.dibuat_pada,
        'tgl_pelaksanaan', o.tgl_pelaksanaan, 'ringkasan', o.ringkasan, 'kesepakatan', o.kesepakatan, 'sp_terbit', o.sp_terbit, 'sp_nomor', o.sp_nomor,
        'lampiran_path', o.lampiran_path, 'lampiran_nama', o.lampiran_nama, 'diisi_nama', o.diisi_nama, 'diisi_pada', o.diisi_pada,
        'rangkaian', g.status,
        'bisa_isi', o.status = 'dijadwalkan' and (v_super or o.rombel_id = any (v_rombel)),
        'bisa_batal', o.status = 'dijadwalkan' and v_kelola)
        order by (o.status = 'dijadwalkan') desc, o.tgl_panggil desc, o.urutan desc), '[]'::jsonb)
      from public.pemanggilan_ortu o
      join public.pemanggilan_rangkaian g on g.id = o.rangkaian_id
      join public.peserta_didik pd on pd.id = o.peserta_didik_id
      left join public.rombel r on r.id = o.rombel_id
     where o.npsn = private.npsn_saya()
       and (v_kelola or o.rombel_id = any (v_rombel))
       and (p_status is null or o.status = p_status)
       and (p_pd is null or o.peserta_didik_id = p_pd)));
end $$;

-- Wali kelas: konfirmasi orang tua tidak hadir, atau isi hasil (berita acara). Kunjungan rumah (urutan 4) wajib hadir dan wajib mencatat SP 1.
create or replace function public.panggilan_tindaklanjut(
  p_id uuid, p_hadir boolean, p_tgl date, p_ringkasan text, p_kesepakatan text default null,
  p_sp_terbit boolean default false, p_sp_nomor text default null, p_lampiran_path text default null, p_lampiran_nama text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.pemanggilan_ortu%rowtype;
  v_hari date := private.kes_hari();
  v_r text := btrim(coalesce(p_ringkasan, ''));
  v_k text := nullif(btrim(coalesce(p_kesepakatan, '')), '');
  v_sp text := nullif(btrim(coalesce(p_sp_nomor, '')), '');
  v_ln text := nullif(btrim(coalesce(p_lampiran_nama, '')), '');
  v_tgl date := coalesce(p_tgl, v_hari);
begin
  select * into o from public.pemanggilan_ortu where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Pemanggilan tidak ditemukan.'; end if;
  if not private.panggilan_wali(o.rombel_id) then raise exception 'Hanya wali kelas rombel ini yang dapat menindaklanjuti.'; end if;
  if o.status <> 'dijadwalkan' then raise exception 'Pemanggilan ini sudah ditindaklanjuti.'; end if;
  if p_hadir is null then raise exception 'Pilih apakah orang tua hadir.'; end if;
  if v_tgl > v_hari or v_tgl < v_hari - 90 then raise exception 'Tanggal pelaksanaan tidak valid.'; end if;
  if char_length(v_r) < 10 or char_length(v_r) > 3000 then raise exception 'Isi berita acara atau keterangan 10 sampai 3000 karakter.'; end if;
  if v_k is not null and char_length(v_k) > 2000 then raise exception 'Kesepakatan maksimal 2000 karakter.'; end if;
  if v_sp is not null and char_length(v_sp) > 100 then raise exception 'Nomor SP maksimal 100 karakter.'; end if;
  if o.urutan = 4 then
    if not p_hadir then raise exception 'Kunjungan rumah dicatat sebagai terlaksana. Tulis kendala di berita acara.'; end if;
    if not coalesce(p_sp_terbit, false) then raise exception 'Kunjungan rumah disertai penerbitan SP 1. Centang bila SP 1 sudah diberikan.'; end if;
  end if;
  if p_lampiran_path is not null then
    if p_lampiran_path !~* ('^' || o.npsn || '/' || o.id::text || '/[A-Za-z0-9._-]+\.(pdf|png|jpe?g|webp)$') then raise exception 'Lampiran tidak valid.'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'panggilan-ortu' and name = p_lampiran_path) then raise exception 'Lampiran belum terunggah. Coba unggah ulang.'; end if;
  end if;
  update public.pemanggilan_ortu
     set status = case when p_hadir then 'selesai' else 'tidak_hadir' end, tgl_pelaksanaan = v_tgl, ringkasan = v_r, kesepakatan = v_k,
         sp_terbit = (o.urutan = 4), sp_nomor = case when o.urutan = 4 then v_sp end,
         lampiran_path = p_lampiran_path, lampiran_nama = case when p_lampiran_path is not null then coalesce(v_ln, 'lampiran') end,
         diisi_oleh = auth.uid(), diisi_nama = private.lms_nama_saya(), diisi_pada = now()
   where id = p_id;
  if o.urutan = 4 then
    update public.pemanggilan_rangkaian set status = 'selesai', ditutup_pada = now(), ditutup_oleh = auth.uid(), catatan_tutup = 'Kunjungan rumah dan SP 1' where id = o.rangkaian_id;
  end if;
  perform private.kes_audit('pemanggilan_ortu', case when p_hadir then 'SELESAI' else 'TIDAK_HADIR' end, jsonb_build_object('id', p_id, 'pd', o.peserta_didik_id, 'urutan', o.urutan));
end $$;

-- Berkas lampiran: bucket privat "panggilan-ortu/{npsn}/{id pemanggilan}/{kode}.ext".
-- Menulis: wali kelas rombel itu selama jadwal belum ditindaklanjuti. Membaca: wali kelas dan pengelola.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('panggilan-ortu', 'panggilan-ortu', false, 5242880, array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.panggilan_berkas_boleh(p_nama text, p_tulis boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and p_nama ~* '^[0-9]+/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(pdf|png|jpe?g|webp)$'
     and (storage.foldername(p_nama))[1] = private.npsn_saya()
     and exists (
       select 1 from public.pemanggilan_ortu o
        where o.id::text = (storage.foldername(p_nama))[2] and o.npsn = private.npsn_saya()
          and ((private.panggilan_wali(o.rombel_id) and (not p_tulis or o.status = 'dijadwalkan'))
               or (not p_tulis and private.panggilan_kelola())))
$$;

drop policy if exists panggilan_tulis on storage.objects;
create policy panggilan_tulis on storage.objects for insert to authenticated
  with check (bucket_id = 'panggilan-ortu' and (select private.panggilan_berkas_boleh(name, true)));
drop policy if exists panggilan_hapus on storage.objects;
create policy panggilan_hapus on storage.objects for delete to authenticated
  using (bucket_id = 'panggilan-ortu' and (select private.panggilan_berkas_boleh(name, true)));
drop policy if exists panggilan_baca on storage.objects;
create policy panggilan_baca on storage.objects for select to authenticated
  using (bucket_id = 'panggilan-ortu' and (select private.panggilan_berkas_boleh(name, false)));

-- ================================================================ akses dan lencana
create or replace function public.kesiswaan_akses_tambahan() returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare v text[] := '{}';
begin
  if auth.uid() is null then return v; end if;
  if private.adalah_super() or private.peran_saya() = 'admin_tu' or private.punya_izin('kesiswaan.biodata', '__semua__') then v := array_append(v, 'biodata'); end if;
  if private.keluar_pengusul() then v := array_append(v, 'keluar'); end if;
  if private.boleh_kerjakan() then v := array_append(v, 'keluar.tanggapi'); end if;
  if private.panggilan_kelola() then v := array_append(v, 'panggilan.kelola'); end if;
  if private.adalah_super() or cardinality(private.panggilan_wali_rombel()) > 0 then v := array_append(v, 'panggilan.wali'); end if;
  return v;
end $$;

-- Angka lencana: keluar (ajuan belum selesai, untuk operator) dan panggilan (kandidat untuk pengelola, jadwal belum ditindaklanjuti untuk wali kelas).
create or replace function public.kesiswaan_lencana_tambahan() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_keluar int := 0;
  v_pang int := 0;
  v_rombel uuid[];
begin
  if auth.uid() is null then return jsonb_build_object('keluar', 0, 'panggilan', 0); end if;
  if private.boleh_kerjakan() then
    select count(*) into v_keluar from public.pengeluaran_siswa where npsn = private.npsn_saya() and status in ('diajukan','diproses');
  end if;
  if private.panggilan_kelola() then
    select count(*) into v_pang from private.panggilan_kandidat(private.panggilan_bulan_awal(null)) k where k.kondisi <> 'membaik';
  end if;
  v_rombel := private.panggilan_wali_rombel();
  if cardinality(v_rombel) > 0 then
    v_pang := v_pang + (select count(*) from public.pemanggilan_ortu where npsn = private.npsn_saya() and status = 'dijadwalkan' and rombel_id = any (v_rombel));
  end if;
  return jsonb_build_object('keluar', v_keluar, 'panggilan', v_pang);
end $$;

-- ================================================================ hak eksekusi
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array[
       'keluar_siswa_cari','keluar_ajukan','keluar_daftar','keluar_batalkan','keluar_proses','keluar_tanggapi',
       'panggilan_kandidat','panggilan_buat','panggilan_tutup','panggilan_batalkan','panggilan_daftar','panggilan_tindaklanjut',
       'kesiswaan_akses_tambahan','kesiswaan_lencana_tambahan'])
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;
