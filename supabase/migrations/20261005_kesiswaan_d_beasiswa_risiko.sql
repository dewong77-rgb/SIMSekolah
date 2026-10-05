-- Modul Kesiswaan, bagian D: beasiswa dan PIP, dashboard risiko siswa, ringkasan, pencarian, dan akses siswa/orang tua.
-- Beasiswa tidak menyimpan nomor rekening atau data keuangan keluarga; hanya status proses dan ceklis berkas.
-- Risiko dihitung dari sinyal yang tercatat sistem. Skor bukan vonis: hanya penanda siswa yang perlu dilihat lebih dulu.

create table if not exists public.beasiswa_program (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  nama text not null check (char_length(nama) between 3 and 150),
  jenis text not null check (jenis in ('pip','bantuan_pemerintah','swasta','internal','lainnya')),
  penyelenggara text check (penyelenggara is null or char_length(penyelenggara) <= 150),
  tahun_ajaran text not null,
  kuota int check (kuota is null or kuota between 1 and 5000),
  syarat text check (syarat is null or char_length(syarat) <= 1000),
  berkas_wajib text[] not null default '{}',
  tenggat date,
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  unique (npsn, nama, tahun_ajaran)
);
alter table public.beasiswa_program enable row level security;

create table if not exists public.beasiswa_siswa (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.beasiswa_program (id),
  peserta_didik_id uuid not null references public.peserta_didik (id),
  status text not null default 'calon' check (status in ('calon','diusulkan','verifikasi_berkas','ditetapkan','tidak_lolos','dicairkan','mundur')),
  berkas jsonb not null default '{}'::jsonb,
  catatan text check (catatan is null or char_length(catatan) <= 500),
  tgl_cair date,
  diperbarui_oleh uuid,
  diperbarui_pada timestamptz not null default now(),
  dibuat_pada timestamptz not null default now(),
  unique (program_id, peserta_didik_id)
);
alter table public.beasiswa_siswa enable row level security;
create index if not exists beasiswa_siswa_pd_idx on public.beasiswa_siswa (peserta_didik_id);

-- ---------------------------------------------------------------- beasiswa
create or replace function public.beasiswa_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.kes_semua(array['kesiswaan.beasiswa']) then raise exception 'Anda tidak berwenang membuka data beasiswa.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'nama', b.nama, 'jenis', b.jenis, 'penyelenggara', b.penyelenggara, 'tahun_ajaran', b.tahun_ajaran, 'kuota', b.kuota,
      'syarat', b.syarat, 'berkas_wajib', to_jsonb(b.berkas_wajib), 'tenggat', b.tenggat, 'aktif', b.aktif,
      'jumlah', (select count(*) from public.beasiswa_siswa s where s.program_id = b.id),
      'calon', (select count(*) from public.beasiswa_siswa s where s.program_id = b.id and s.status = 'calon'),
      'proses', (select count(*) from public.beasiswa_siswa s where s.program_id = b.id and s.status in ('diusulkan','verifikasi_berkas')),
      'ditetapkan', (select count(*) from public.beasiswa_siswa s where s.program_id = b.id and s.status = 'ditetapkan'),
      'dicairkan', (select count(*) from public.beasiswa_siswa s where s.program_id = b.id and s.status = 'dicairkan'),
      'tidak_lolos', (select count(*) from public.beasiswa_siswa s where s.program_id = b.id and s.status in ('tidak_lolos','mundur')))
      order by b.aktif desc, b.tahun_ajaran desc, b.nama), '[]'::jsonb)
      from public.beasiswa_program b where b.npsn = private.npsn_saya());
end $$;

create or replace function public.beasiswa_program_simpan(p_id uuid, p_nama text, p_jenis text, p_penyelenggara text, p_tahun_ajaran text,
                                                          p_kuota int, p_syarat text, p_berkas_wajib text[], p_tenggat date, p_aktif boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_nama text := btrim(coalesce(p_nama, ''));
  v_ta text := btrim(coalesce(p_tahun_ajaran, ''));
  v_berkas text[] := (select coalesce(array_agg(distinct btrim(x)) filter (where btrim(x) <> ''), '{}') from unnest(coalesce(p_berkas_wajib, '{}')) x);
  v_id uuid := p_id;
begin
  if auth.uid() is null or not private.kes_semua(array['kesiswaan.beasiswa']) then raise exception 'Anda tidak berwenang mengatur program beasiswa.'; end if;
  if char_length(v_nama) < 3 or char_length(v_nama) > 150 then raise exception 'Nama program 3 sampai 150 karakter.'; end if;
  if p_jenis not in ('pip','bantuan_pemerintah','swasta','internal','lainnya') then raise exception 'Jenis program tidak dikenal.'; end if;
  if v_ta !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Tahun ajaran harus berbentuk 2026/2027.'; end if;
  if p_kuota is not null and (p_kuota < 1 or p_kuota > 5000) then raise exception 'Kuota 1 sampai 5000.'; end if;
  if cardinality(v_berkas) > 15 then raise exception 'Berkas wajib maksimal 15 butir.'; end if;
  if v_id is null then
    insert into public.beasiswa_program (npsn, nama, jenis, penyelenggara, tahun_ajaran, kuota, syarat, berkas_wajib, tenggat, aktif)
    values (private.npsn_saya(), v_nama, p_jenis, nullif(btrim(coalesce(p_penyelenggara, '')), ''), v_ta, p_kuota, nullif(btrim(coalesce(p_syarat, '')), ''), v_berkas, p_tenggat, coalesce(p_aktif, true))
    returning id into v_id;
  else
    update public.beasiswa_program set nama = v_nama, jenis = p_jenis, penyelenggara = nullif(btrim(coalesce(p_penyelenggara, '')), ''), tahun_ajaran = v_ta,
           kuota = p_kuota, syarat = nullif(btrim(coalesce(p_syarat, '')), ''), berkas_wajib = v_berkas, tenggat = p_tenggat, aktif = coalesce(p_aktif, true)
     where id = v_id and npsn = private.npsn_saya();
    if not found then raise exception 'Program tidak ditemukan.'; end if;
  end if;
  perform private.kes_audit('beasiswa_program', 'SIMPAN', jsonb_build_object('id', v_id, 'nama', v_nama));
  return v_id;
exception when unique_violation then
  raise exception 'Program dengan nama dan tahun ajaran itu sudah ada.';
end $$;

create or replace function public.beasiswa_siswa_daftar(p_program uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.kes_semua(array['kesiswaan.beasiswa']) then raise exception 'Anda tidak berwenang membuka data beasiswa.'; end if;
  if not exists (select 1 from public.beasiswa_program where id = p_program and npsn = private.npsn_saya()) then raise exception 'Program tidak ditemukan.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'pd', s.peserta_didik_id, 'nama', pd.nama, 'nisn', pd.nisn, 'rombel', private.kes_rombel_nama(pd.id),
      'layak_pip', pd.layak_pip, 'status', s.status, 'berkas', s.berkas, 'catatan', s.catatan, 'tgl_cair', s.tgl_cair)
      order by pd.nama), '[]'::jsonb)
      from public.beasiswa_siswa s join public.peserta_didik pd on pd.id = s.peserta_didik_id where s.program_id = p_program);
end $$;

create or replace function public.beasiswa_siswa_tambah(p_program uuid, p_pds uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if auth.uid() is null or not private.kes_semua(array['kesiswaan.beasiswa']) then raise exception 'Anda tidak berwenang mengelola data beasiswa.'; end if;
  if not exists (select 1 from public.beasiswa_program where id = p_program and npsn = private.npsn_saya()) then raise exception 'Program tidak ditemukan.'; end if;
  if p_pds is null or cardinality(p_pds) = 0 or cardinality(p_pds) > 500 then raise exception 'Pilih 1 sampai 500 siswa.'; end if;
  insert into public.beasiswa_siswa (program_id, peserta_didik_id, diperbarui_oleh)
  select p_program, pd.id, auth.uid() from public.peserta_didik pd
   where pd.id = any (p_pds) and pd.npsn = private.npsn_saya() and pd.status_peserta_didik = 'aktif'
  on conflict (program_id, peserta_didik_id) do nothing;
  get diagnostics v_n = row_count;
  perform private.kes_audit('beasiswa_siswa', 'TAMBAH', jsonb_build_object('program', p_program, 'jumlah', v_n));
  return v_n;
end $$;

-- Menambahkan semua siswa aktif berstatus layak PIP pada data Dapodik sebagai calon.
create or replace function public.beasiswa_tambah_layak_pip(p_program uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if auth.uid() is null or not private.kes_semua(array['kesiswaan.beasiswa']) then raise exception 'Anda tidak berwenang mengelola data beasiswa.'; end if;
  if not exists (select 1 from public.beasiswa_program where id = p_program and npsn = private.npsn_saya()) then raise exception 'Program tidak ditemukan.'; end if;
  insert into public.beasiswa_siswa (program_id, peserta_didik_id, diperbarui_oleh)
  select p_program, pd.id, auth.uid() from public.peserta_didik pd
   where pd.npsn = private.npsn_saya() and pd.status_peserta_didik = 'aktif' and pd.layak_pip = 'Ya'
  on conflict (program_id, peserta_didik_id) do nothing;
  get diagnostics v_n = row_count;
  perform private.kes_audit('beasiswa_siswa', 'TAMBAH_PIP', jsonb_build_object('program', p_program, 'jumlah', v_n));
  return v_n;
end $$;

create or replace function public.beasiswa_siswa_atur(p_id uuid, p_status text, p_berkas jsonb default null, p_catatan text default null, p_tgl_cair date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.beasiswa_siswa%rowtype;
  v_p public.beasiswa_program%rowtype;
  v_c text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_berkas jsonb;
  v_terisi int;
begin
  if auth.uid() is null or not private.kes_semua(array['kesiswaan.beasiswa']) then raise exception 'Anda tidak berwenang mengelola data beasiswa.'; end if;
  select * into v from public.beasiswa_siswa where id = p_id for update;
  if not found then raise exception 'Data tidak ditemukan.'; end if;
  select * into v_p from public.beasiswa_program where id = v.program_id and npsn = private.npsn_saya();
  if not found then raise exception 'Program tidak ditemukan.'; end if;
  if p_status not in ('calon','diusulkan','verifikasi_berkas','ditetapkan','tidak_lolos','dicairkan','mundur') then raise exception 'Status tidak dikenal.'; end if;
  if v_c is not null and char_length(v_c) > 500 then raise exception 'Catatan maksimal 500 karakter.'; end if;
  if p_berkas is not null then
    if jsonb_typeof(p_berkas) <> 'object' then raise exception 'Ceklis berkas tidak valid.'; end if;
    select coalesce(jsonb_object_agg(k.key, (k.value = 'true'::jsonb)), '{}'::jsonb) into v_berkas
      from jsonb_each(p_berkas) k where k.key = any (v_p.berkas_wajib);
  else
    v_berkas := v.berkas;
  end if;
  if p_status = 'dicairkan' and p_tgl_cair is null then raise exception 'Tanggal pencairan wajib diisi.'; end if;
  if p_status in ('ditetapkan','dicairkan') and v.status not in ('ditetapkan','dicairkan') and v_p.kuota is not null then
    select count(*) into v_terisi from public.beasiswa_siswa where program_id = v.program_id and status in ('ditetapkan','dicairkan');
    if v_terisi >= v_p.kuota then raise exception 'Kuota program sudah penuh.'; end if;
  end if;
  update public.beasiswa_siswa set status = p_status, berkas = v_berkas, catatan = v_c,
         tgl_cair = case when p_status = 'dicairkan' then p_tgl_cair else null end,
         diperbarui_oleh = auth.uid(), diperbarui_pada = now()
   where id = p_id;
  perform private.kes_audit('beasiswa_siswa', 'ATUR', jsonb_build_object('id', p_id, 'status', p_status));
end $$;

-- ---------------------------------------------------------------- risiko siswa
-- Jendela 30 hari terakhir. Skor: alpa >=3 (+1) atau >=6 (+2); tidak hadir (alpa, sakit, izin) >=8 (+1); terlambat >=5 (+1);
-- poin tahun ajaran ini >=50 (+1) atau >=100 (+2); keaktifan LMS <50% dari >=6 pertemuan wajib (+1); tugas lewat tenggat belum dikumpulkan >=5 (+1).
-- Level: tinggi bila skor >=3, sedang bila 1 sampai 2. perlu_tindak bila jumlah ambang poin yang tercapai melebihi jumlah tindak lanjut tahun ini.
create or replace function public.risiko_daftar(p_rombel uuid default null, p_level text default null, p_cari text default null,
                                                p_batas int default 50, p_mulai int default 0, p_semua boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_semua boolean := private.kes_semua(array['kesiswaan.pantau']);
  v_rombel uuid[] := private.kes_rombel_saya(array['kesiswaan.pantau']);
  v_hari date := private.kes_hari();
  v_ta text := public.tahun_ajaran_sekarang();
  v_npsn text := private.npsn_saya();
  v_cari text := nullif(btrim(coalesce(p_cari, '')), '');
  v_batas int := least(greatest(coalesce(p_batas, 50), 1), 200);
begin
  if auth.uid() is null or not (v_semua or cardinality(v_rombel) > 0) then raise exception 'Anda tidak berwenang membuka dashboard risiko siswa.'; end if;
  if p_level is not null and p_level not in ('tinggi','sedang','rendah') then raise exception 'Level tidak dikenal.'; end if;
  if p_rombel is not null and not (v_semua or p_rombel = any (v_rombel)) then raise exception 'Anda tidak berwenang membuka rombel ini.'; end if;
  return (
    with pop0 as (
      select distinct on (k.peserta_didik_id) k.peserta_didik_id as pd, r.id as rombel_id, r.nama as rombel_nama
        from public.keanggotaan_rombel k
        join public.rombel r on r.id = k.rombel_id and r.npsn = v_npsn and r.jenis_rombel ilike '%utama%'
       order by k.peserta_didik_id, r.semester_id desc),
    pop as (
      select o.pd, o.rombel_id, o.rombel_nama, p.nama, p.nisn
        from pop0 o join public.peserta_didik p on p.id = o.pd and p.status_peserta_didik = 'aktif'
       where (v_semua or o.rombel_id = any (v_rombel))
         and (p_rombel is null or o.rombel_id = p_rombel)
         and (v_cari is null or p.nama ilike '%' || v_cari || '%' or p.nisn = v_cari)),
    keh as (
      select s.pd, count(*) as tercatat, count(*) filter (where s.status = 'alpa') as alpa,
             count(*) filter (where s.status in ('alpa','sakit','izin')) as absen, count(*) filter (where s.status = 'terlambat') as telat
        from private.kes_status_hari(v_hari - 29, v_hari) s where s.pd in (select pd from pop) group by s.pd),
    poin as (
      select z.peserta_didik_id as pd, sum(z.poin)::int as poin from public.pelanggaran_siswa z
       where z.status = 'terverifikasi' and not z.dihapus and z.tahun_ajaran = v_ta and z.peserta_didik_id in (select pd from pop) group by z.peserta_didik_id),
    tl as (
      select t.peserta_didik_id as pd, count(*)::int as n from public.tindak_lanjut_siswa t
       where not t.dihapus and t.tahun_ajaran = v_ta and t.peserta_didik_id in (select pd from pop) group by t.peserta_didik_id),
    lms_a as (
      select pop.pd, count(pt.id)::int as total, (count(*) filter (where ab.status = 'hadir'))::int as hadir
        from pop
        join public.kelas_ajar ka on ka.rombel_id = pop.rombel_id and ka.aktif
        join public.pertemuan pt on pt.kelas_ajar_id = ka.id and pt.status = 'terbit' and pt.wajib_absen and pt.tanggal between v_hari - 29 and v_hari
        left join public.absensi_pertemuan ab on ab.pertemuan_id = pt.id and ab.peserta_didik_id = pop.pd
       group by pop.pd),
    lms_t as (
      select pop.pd, count(*)::int as n
        from pop
        join public.kelas_ajar ka on ka.rombel_id = pop.rombel_id and ka.aktif
        join public.tugas t on t.kelas_ajar_id = ka.id and t.status = 'terbit' and not t.dihapus and t.tenggat < now() and t.tenggat >= now() - interval '60 days'
       where not exists (select 1 from public.kumpul_tugas q where q.tugas_id = t.id and q.peserta_didik_id = pop.pd)
       group by pop.pd),
    h as (
      select pop.*, coalesce(keh.tercatat, 0)::int as tercatat, coalesce(keh.alpa, 0)::int as alpa, coalesce(keh.absen, 0)::int as absen, coalesce(keh.telat, 0)::int as telat,
             coalesce(poin.poin, 0) as poin, coalesce(tl.n, 0) as tl, coalesce(lms_a.total, 0) as lms_total, coalesce(lms_a.hadir, 0) as lms_hadir, coalesce(lms_t.n, 0) as tunggak,
             (select count(*)::int from public.kesiswaan_ambang a where a.npsn = v_npsn and a.aktif and a.poin_min <= coalesce(poin.poin, 0)) as ambang
        from pop
        left join keh on keh.pd = pop.pd left join poin on poin.pd = pop.pd left join tl on tl.pd = pop.pd
        left join lms_a on lms_a.pd = pop.pd left join lms_t on lms_t.pd = pop.pd),
    g as (
      select h.*,
        (case when h.alpa >= 6 then 2 when h.alpa >= 3 then 1 else 0 end)
        + (case when h.absen >= 8 then 1 else 0 end)
        + (case when h.telat >= 5 then 1 else 0 end)
        + (case when h.poin >= 100 then 2 when h.poin >= 50 then 1 else 0 end)
        + (case when h.lms_total >= 6 and h.lms_hadir * 2 < h.lms_total then 1 else 0 end)
        + (case when h.tunggak >= 5 then 1 else 0 end) as skor,
        array_remove(array[
          case when h.alpa >= 3 then 'Alpa ' || h.alpa || ' kali dalam 30 hari' end,
          case when h.absen >= 8 then 'Tidak hadir ' || h.absen || ' hari dalam 30 hari' end,
          case when h.telat >= 5 then 'Terlambat ' || h.telat || ' kali dalam 30 hari' end,
          case when h.poin >= 50 then 'Poin pelanggaran ' || h.poin end,
          case when h.lms_total >= 6 and h.lms_hadir * 2 < h.lms_total then 'Keaktifan LMS ' || (h.lms_hadir * 100 / h.lms_total) || '%' end,
          case when h.tunggak >= 5 then h.tunggak || ' tugas LMS lewat tenggat belum dikumpulkan' end], null) as sinyal
        from h),
    f as (
      select g.*, (case when g.skor >= 3 then 'tinggi' when g.skor >= 1 then 'sedang' else 'rendah' end) as level
        from g),
    sel as (
      select * from f where (coalesce(p_semua, false) or f.skor >= 1) and (p_level is null or f.level = p_level)),
    hal as (
      select * from sel order by skor desc, poin desc, nama limit v_batas offset greatest(coalesce(p_mulai, 0), 0))
    select jsonb_build_object(
      'dari', v_hari - 29, 'sampai', v_hari,
      'total', (select count(*) from sel),
      'tinggi', (select count(*) from f where f.level = 'tinggi'),
      'sedang', (select count(*) from f where f.level = 'sedang'),
      'siswa', (select count(*) from f),
      'rombel_total', (select count(distinct rombel_id) from pop),
      'rombel_tercatat', (select count(*) from (
          select kh.rombel_id from public.kehadiran_harian kh
           where kh.tanggal between v_hari - 29 and v_hari and kh.rombel_id in (select rombel_id from pop)
           group by kh.rombel_id having count(distinct kh.tanggal) >= 5) x),
      'baris', coalesce((select jsonb_agg(jsonb_build_object(
          'pd', q.pd, 'nama', q.nama, 'nisn', q.nisn, 'rombel', q.rombel_nama, 'rombel_id', q.rombel_id, 'skor', q.skor, 'level', q.level, 'sinyal', to_jsonb(q.sinyal),
          'alpa', q.alpa, 'tidak_hadir', q.absen, 'terlambat', q.telat, 'hari_tercatat', q.tercatat, 'poin', q.poin, 'tindak_lanjut', q.tl,
          'ambang_tercapai', q.ambang, 'perlu_tindak', (q.ambang > q.tl), 'lms_hadir', q.lms_hadir, 'lms_total', q.lms_total, 'tugas_tunggak', q.tunggak)
          order by q.skor desc, q.poin desc, q.nama) from hal q), '[]'::jsonb)));
end $$;

-- ---------------------------------------------------------------- izin efektif, lencana, ringkasan
create or replace function public.kesiswaan_izin() returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hasil text[] := '{}';
  k text;
begin
  if auth.uid() is null then return v_hasil; end if;
  foreach k in array array['kesiswaan.catat','kesiswaan.verifikasi','kesiswaan.pantau','kesiswaan.izin','kesiswaan.beasiswa','ekskul.kelola'] loop
    if private.kes_semua(array[k]) or cardinality(private.kes_rombel_saya(array[k])) > 0 then
      v_hasil := v_hasil || k;
    end if;
  end loop;
  if not ('ekskul.kelola' = any (v_hasil)) and exists (
       select 1 from public.ekskul e where e.npsn = private.npsn_saya() and e.aktif and private.kes_boleh_ekskul(e.id)) then
    v_hasil := v_hasil || 'ekskul.kelola';
  end if;
  return v_hasil;
end $$;

create or replace function public.kesiswaan_lencana() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_waka boolean := private.kes_waka();
  v_semua boolean := private.kes_semua(array['kesiswaan.izin']);
  v_rombel uuid[] := private.kes_rombel_saya(array['kesiswaan.izin']);
begin
  if auth.uid() is null then return jsonb_build_object('pelanggaran', 0, 'prestasi', 0, 'izin', 0); end if;
  return jsonb_build_object(
    'pelanggaran', case when v_waka then (select count(*) from public.pelanggaran_siswa where status = 'diajukan' and not dihapus and npsn = private.npsn_saya()) else 0 end,
    'prestasi', case when v_waka then (select count(*) from public.prestasi_siswa where status = 'diajukan' and not dihapus and npsn = private.npsn_saya()) else 0 end,
    'izin', case when v_semua or cardinality(v_rombel) > 0 then
              (select count(*) from public.izin_siswa i where i.status = 'diajukan' and i.npsn = private.npsn_saya() and (v_semua or i.rombel_id = any (v_rombel))) else 0 end);
end $$;

create or replace function public.kesiswaan_ringkasan() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hari date := private.kes_hari();
  v_ta text := public.tahun_ajaran_sekarang();
  v_npsn text := private.npsn_saya();
  v_izin text[] := public.kesiswaan_izin();
  v_risiko jsonb := null;
begin
  if auth.uid() is null or cardinality(v_izin) = 0 then raise exception 'Anda tidak berwenang membuka ringkasan kesiswaan.'; end if;
  if 'kesiswaan.pantau' = any (v_izin) then
    v_risiko := public.risiko_daftar(null, null, null, 1, 0, false) - 'baris';
  end if;
  return jsonb_build_object(
    'tahun_ajaran', v_ta,
    'seluruh_sekolah', private.kes_semua(array['kesiswaan.catat','kesiswaan.izin','kesiswaan.pantau','kesiswaan.beasiswa','ekskul.kelola','kesiswaan.verifikasi']),
    'lencana', public.kesiswaan_lencana(),
    'risiko', v_risiko,
    'izin_hari_ini', (select count(*) from public.izin_siswa i where i.npsn = v_npsn and i.status = 'disetujui' and i.tgl_mulai <= v_hari and i.tgl_selesai >= v_hari),
    'pelanggaran_30_hari', (select coalesce(jsonb_object_agg(x.kategori, x.n), '{}'::jsonb) from (
        select kategori, count(*) as n from public.pelanggaran_siswa
         where npsn = v_npsn and status = 'terverifikasi' and not dihapus and tanggal >= v_hari - 29 group by kategori) x),
    'pelanggaran_teratas', (select coalesce(jsonb_agg(jsonb_build_object('nama', x.jenis_nama, 'jumlah', x.n) order by x.n desc), '[]'::jsonb) from (
        select jenis_nama, count(*) as n from public.pelanggaran_siswa
         where npsn = v_npsn and status = 'terverifikasi' and not dihapus and tanggal >= v_hari - 29 group by jenis_nama order by count(*) desc limit 5) x),
    'prestasi_tahun_ini', (select count(*) from public.prestasi_siswa where npsn = v_npsn and status = 'terverifikasi' and not dihapus and tahun_ajaran = v_ta),
    'ekskul_aktif', (select count(*) from public.ekskul where npsn = v_npsn and aktif),
    'anggota_ekskul', (select count(distinct a.peserta_didik_id) from public.ekskul_anggota a join public.ekskul e on e.id = a.ekskul_id
                        where e.npsn = v_npsn and a.aktif and a.tahun_ajaran = v_ta),
    'beasiswa', case when 'kesiswaan.beasiswa' = any (v_izin) then
        (select jsonb_build_object(
           'program', count(distinct b.id),
           'ditetapkan', count(*) filter (where s.status = 'ditetapkan'),
           'dicairkan', count(*) filter (where s.status = 'dicairkan'),
           'proses', count(*) filter (where s.status in ('calon','diusulkan','verifikasi_berkas')))
           from public.beasiswa_program b left join public.beasiswa_siswa s on s.program_id = b.id where b.npsn = v_npsn and b.aktif) else null end);
end $$;

-- ---------------------------------------------------------------- pencarian siswa dan rombel
create or replace function public.kesiswaan_siswa_cari(p_cari text, p_untuk text default 'catat') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_c text := btrim(coalesce(p_cari, ''));
  v_k text;
  v_semua boolean;
  v_rombel uuid[];
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu.'; end if;
  if p_untuk not in ('catat','izin','pantau','beasiswa','ekskul') then raise exception 'Tujuan pencarian tidak dikenal.'; end if;
  if char_length(v_c) < 2 then return '[]'::jsonb; end if;
  v_k := case p_untuk when 'catat' then 'kesiswaan.catat' when 'izin' then 'kesiswaan.izin' when 'pantau' then 'kesiswaan.pantau'
                      when 'beasiswa' then 'kesiswaan.beasiswa' else 'ekskul.kelola' end;
  v_semua := private.kes_semua(array[v_k]);
  v_rombel := private.kes_rombel_saya(array[v_k]);
  if p_untuk = 'ekskul' and not v_semua then
    v_semua := exists (select 1 from public.ekskul e where e.npsn = private.npsn_saya() and e.aktif and private.kes_boleh_ekskul(e.id));
  end if;
  if not (v_semua or cardinality(v_rombel) > 0) then raise exception 'Anda tidak berwenang mencari siswa untuk keperluan ini.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nama', x.nama, 'nisn', x.nisn, 'rombel', x.rombel) order by x.nama), '[]'::jsonb) from (
      select pd.id, pd.nama, pd.nisn, private.kes_rombel_nama(pd.id) as rombel
        from public.peserta_didik pd
       where pd.npsn = private.npsn_saya() and pd.status_peserta_didik = 'aktif'
         and (pd.nama ilike '%' || v_c || '%' or pd.nisn = v_c)
         and (v_semua or exists (select 1 from public.keanggotaan_rombel k where k.peserta_didik_id = pd.id and k.rombel_id = any (v_rombel)))
       order by pd.nama limit 20) x);
end $$;

create or replace function public.kesiswaan_rombel(p_untuk text default 'izin') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_k text;
  v_semua boolean;
  v_rombel uuid[];
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu.'; end if;
  if p_untuk not in ('catat','izin','pantau') then raise exception 'Tujuan tidak dikenal.'; end if;
  v_k := case p_untuk when 'catat' then 'kesiswaan.catat' when 'izin' then 'kesiswaan.izin' else 'kesiswaan.pantau' end;
  v_semua := private.kes_semua(array[v_k]);
  v_rombel := private.kes_rombel_saya(array[v_k]);
  if not (v_semua or cardinality(v_rombel) > 0) then raise exception 'Anda tidak berwenang membuka daftar rombel.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nama', r.nama, 'tingkat', r.tingkat,
            'jumlah', (select count(*) from public.keanggotaan_rombel k join public.peserta_didik pd on pd.id = k.peserta_didik_id and pd.status_peserta_didik = 'aktif' where k.rombel_id = r.id))
            order by r.tingkat, r.nama), '[]'::jsonb)
          from public.rombel r
         where r.npsn = private.npsn_saya() and r.jenis_rombel ilike '%utama%'
           and r.semester_id = (select max(semester_id) from public.rombel where npsn = private.npsn_saya() and jenis_rombel ilike '%utama%')
           and (v_semua or r.id = any (v_rombel)));
end $$;

-- ---------------------------------------------------------------- riwayat satu siswa (petugas)
create or replace function public.kesiswaan_siswa_riwayat(p_pd uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ta text := public.tahun_ajaran_sekarang();
  v_hari date := private.kes_hari();
  v_pd public.peserta_didik%rowtype;
begin
  if auth.uid() is null or not (private.kes_pd_boleh(array['kesiswaan.catat','kesiswaan.pantau','kesiswaan.izin'], p_pd)) then
    raise exception 'Anda tidak berwenang membuka riwayat siswa ini.';
  end if;
  select * into v_pd from public.peserta_didik where id = p_pd and npsn = private.npsn_saya();
  if not found then raise exception 'Siswa tidak ditemukan.'; end if;
  return jsonb_build_object(
    'pd', v_pd.id, 'nama', v_pd.nama, 'nisn', v_pd.nisn, 'rombel', private.kes_rombel_nama(p_pd), 'tahun_ajaran', v_ta,
    'poin', (select coalesce(sum(poin), 0) from public.pelanggaran_siswa where peserta_didik_id = p_pd and status = 'terverifikasi' and not dihapus and tahun_ajaran = v_ta),
    'pelanggaran', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'tanggal', z.tanggal, 'jenis', z.jenis_nama, 'kategori', z.kategori, 'poin', z.poin,
                      'status', z.status, 'uraian', z.uraian, 'dicatat_nama', z.dicatat_nama) order by z.tanggal desc), '[]'::jsonb)
                      from public.pelanggaran_siswa z where z.peserta_didik_id = p_pd and not z.dihapus and z.tahun_ajaran = v_ta),
    'tindak_lanjut', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'tanggal', t.tanggal, 'jenis', t.jenis, 'catatan', t.catatan, 'dicatat_nama', t.dicatat_nama)
                      order by t.tanggal desc), '[]'::jsonb) from public.tindak_lanjut_siswa t where t.peserta_didik_id = p_pd and not t.dihapus and t.tahun_ajaran = v_ta),
    'prestasi', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'nama', z.nama_prestasi, 'bidang', z.bidang, 'tingkat', z.tingkat, 'peringkat', z.peringkat,
                      'tanggal', z.tanggal, 'status', z.status) order by z.tanggal desc), '[]'::jsonb)
                      from public.prestasi_siswa z where z.peserta_didik_id = p_pd and not z.dihapus),
    'izin', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'jenis', i.jenis, 'tgl_mulai', i.tgl_mulai, 'tgl_selesai', i.tgl_selesai, 'status', i.status, 'alasan', i.alasan)
                      order by i.tgl_mulai desc), '[]'::jsonb) from (select * from public.izin_siswa where peserta_didik_id = p_pd order by tgl_mulai desc limit 15) i),
    'kehadiran_30_hari', (select jsonb_build_object('tercatat', count(*), 'hadir', count(*) filter (where status = 'hadir'), 'terlambat', count(*) filter (where status = 'terlambat'),
                      'sakit', count(*) filter (where status = 'sakit'), 'izin', count(*) filter (where status = 'izin'),
                      'dispensasi', count(*) filter (where status = 'dispensasi'), 'alpa', count(*) filter (where status = 'alpa'))
                      from private.kes_status_hari(v_hari - 29, v_hari) where pd = p_pd),
    'ekskul', (select coalesce(jsonb_agg(jsonb_build_object('nama', e.nama, 'peran', a.peran, 'predikat', a.predikat) order by e.nama), '[]'::jsonb)
                      from public.ekskul_anggota a join public.ekskul e on e.id = a.ekskul_id where a.peserta_didik_id = p_pd and a.aktif and a.tahun_ajaran = v_ta));
end $$;

-- ---------------------------------------------------------------- tampilan siswa dan orang tua
-- Hanya catatan terverifikasi, tanpa uraian dan catatan internal. Orang tua memilih anak lewat p_pd.
create or replace function public.kesiswaan_catatan_saya(p_pd uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ta text := public.tahun_ajaran_sekarang();
  v_hari date := private.kes_hari();
  v_pd uuid;
  v_anak jsonb;
  v_nama text;
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('pd', p.id, 'nama', p.nama) order by p.nama), '[]'::jsonb) into v_anak
    from public.peserta_didik p where p.id in (select private.anak_saya());
  if private.pd_id_saya() is not null then
    v_pd := private.pd_id_saya();
  elsif p_pd is not null and p_pd in (select private.anak_saya()) then
    v_pd := p_pd;
  elsif p_pd is null and jsonb_array_length(v_anak) > 0 then
    v_pd := (v_anak->0->>'pd')::uuid;
  else
    raise exception 'Data siswa tidak ditemukan untuk akun ini.';
  end if;
  select nama into v_nama from public.peserta_didik where id = v_pd;
  return jsonb_build_object(
    'anak', v_anak, 'pd', v_pd, 'nama', v_nama, 'rombel', private.kes_rombel_nama(v_pd), 'tahun_ajaran', v_ta,
    'poin', (select coalesce(sum(poin), 0) from public.pelanggaran_siswa where peserta_didik_id = v_pd and status = 'terverifikasi' and not dihapus and tahun_ajaran = v_ta),
    'pelanggaran', (select coalesce(jsonb_agg(jsonb_build_object('tanggal', z.tanggal, 'jenis', z.jenis_nama, 'kategori', z.kategori, 'poin', z.poin) order by z.tanggal desc), '[]'::jsonb)
                      from public.pelanggaran_siswa z where z.peserta_didik_id = v_pd and z.status = 'terverifikasi' and not z.dihapus and z.tahun_ajaran = v_ta),
    'tindak_lanjut', (select coalesce(jsonb_agg(jsonb_build_object('tanggal', t.tanggal, 'jenis', t.jenis) order by t.tanggal desc), '[]'::jsonb)
                      from public.tindak_lanjut_siswa t where t.peserta_didik_id = v_pd and not t.dihapus and t.tahun_ajaran = v_ta),
    'prestasi', (select coalesce(jsonb_agg(jsonb_build_object('nama', z.nama_prestasi, 'bidang', z.bidang, 'tingkat', z.tingkat, 'peringkat', z.peringkat, 'tanggal', z.tanggal)
                      order by z.tanggal desc), '[]'::jsonb) from public.prestasi_siswa z where z.peserta_didik_id = v_pd and z.status = 'terverifikasi' and not z.dihapus),
    'kehadiran_30_hari', (select jsonb_build_object('tercatat', count(*), 'hadir', count(*) filter (where status = 'hadir'), 'terlambat', count(*) filter (where status = 'terlambat'),
                      'sakit', count(*) filter (where status = 'sakit'), 'izin', count(*) filter (where status = 'izin'),
                      'dispensasi', count(*) filter (where status = 'dispensasi'), 'alpa', count(*) filter (where status = 'alpa'))
                      from private.kes_status_hari(v_hari - 29, v_hari) where pd = v_pd),
    'ekskul', (select coalesce(jsonb_agg(jsonb_build_object('nama', e.nama, 'peran', a.peran, 'predikat', a.predikat) order by e.nama), '[]'::jsonb)
                      from public.ekskul_anggota a join public.ekskul e on e.id = a.ekskul_id where a.peserta_didik_id = v_pd and a.aktif and a.tahun_ajaran = v_ta));
end $$;

-- ---------------------------------------------------------------- hak eksekusi
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array[
       'beasiswa_daftar','beasiswa_program_simpan','beasiswa_siswa_daftar','beasiswa_siswa_tambah','beasiswa_tambah_layak_pip','beasiswa_siswa_atur',
       'risiko_daftar','kesiswaan_izin','kesiswaan_lencana','kesiswaan_ringkasan','kesiswaan_siswa_cari','kesiswaan_rombel','kesiswaan_siswa_riwayat','kesiswaan_catatan_saya'])
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;
