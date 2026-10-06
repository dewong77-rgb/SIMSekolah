-- Sarpras, bagian B: laporan kerusakan dan permintaan alat dan bahan.
--
-- Laporan kerusakan: kepala bengkel melapor -> staf sarpras memproses (kondisi barang di inventaris bergeser otomatis)
--   -> selesai (kembali baik) atau tidak dapat diperbaiki. Kepala program dan Waka Sarpras melihat.
-- Permintaan alat dan bahan: kepala bengkel mengajukan -> kepala program meneruskan -> staf sarpras menyiapkan dan menyerahkan
--   (stok sumber berkurang, stok bengkel bertambah otomatis).

create table if not exists public.sarpras_nomor_alur (
  npsn text not null, tahun integer not null, jenis text not null, terakhir integer not null default 0,
  primary key (npsn, tahun, jenis)
);

create table if not exists public.sarpras_alur_riwayat (
  id bigint generated always as identity primary key,
  jenis text not null check (jenis in ('kerusakan', 'permintaan')),
  ref_id uuid not null,
  status_dari text, status_ke text not null,
  oleh uuid, oleh_nama text, catatan text,
  waktu timestamptz not null default now()
);
create index if not exists sarpras_alur_riwayat_idx on public.sarpras_alur_riwayat (jenis, ref_id, waktu);

create table if not exists public.sarpras_kerusakan (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  nomor text,
  lab_id uuid not null references public.sarpras_lab(id) on delete restrict,
  program text,
  barang_id uuid not null references public.sarpras_barang(id) on delete restrict,
  nama_barang text not null,
  jumlah numeric not null check (jumlah > 0),
  tingkat text not null check (tingkat in ('ringan', 'berat', 'hilang')),
  uraian text not null,
  tanggal_kejadian date,
  status text not null default 'dilaporkan'
    check (status in ('dilaporkan', 'diproses', 'selesai', 'tidak_dapat_diperbaiki', 'ditolak', 'dibatalkan')),
  pelapor_user_id uuid, pelapor_nama text,
  dibuat_pada timestamptz not null default now(), diubah_pada timestamptz not null default now()
);
create index if not exists sarpras_kerusakan_status_idx on public.sarpras_kerusakan (npsn, status);
create index if not exists sarpras_kerusakan_barang_idx on public.sarpras_kerusakan (barang_id);
create index if not exists sarpras_kerusakan_lab_idx on public.sarpras_kerusakan (lab_id);

create table if not exists public.sarpras_permintaan (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  nomor text,
  lab_id uuid not null references public.sarpras_lab(id) on delete restrict,
  program text,
  jenis text not null check (jenis in ('alat', 'bahan')),
  nama_barang text not null,
  spesifikasi text,
  jumlah numeric not null check (jumlah > 0),
  satuan text not null default 'unit',
  keperluan text not null,
  dibutuhkan_tanggal date,
  sumber_barang_id uuid references public.sarpras_barang(id) on delete set null,
  status text not null default 'draf'
    check (status in ('draf', 'menunggu_kaprog', 'menunggu_staf', 'dikembalikan', 'disiapkan', 'diserahkan', 'ditolak', 'dibatalkan')),
  pengusul_user_id uuid, pengusul_nama text,
  dibuat_pada timestamptz not null default now(), diubah_pada timestamptz not null default now()
);
create index if not exists sarpras_permintaan_status_idx on public.sarpras_permintaan (npsn, status);
create index if not exists sarpras_permintaan_lab_idx on public.sarpras_permintaan (lab_id);

alter table public.sarpras_nomor_alur enable row level security;
alter table public.sarpras_alur_riwayat enable row level security;
alter table public.sarpras_kerusakan enable row level security;
alter table public.sarpras_permintaan enable row level security;
revoke all on public.sarpras_nomor_alur, public.sarpras_alur_riwayat, public.sarpras_kerusakan, public.sarpras_permintaan from anon, authenticated;

create or replace function private.sarpras_nomor_alur_baru(p_npsn text, p_jenis text) returns text
language plpgsql security definer set search_path = '' as $fn$
declare v_tahun int := extract(year from (now() at time zone 'Asia/Jakarta'))::int; v_no int;
begin
  insert into public.sarpras_nomor_alur(npsn, tahun, jenis, terakhir) values (p_npsn, v_tahun, p_jenis, 1)
  on conflict (npsn, tahun, jenis) do update set terakhir = public.sarpras_nomor_alur.terakhir + 1
  returning terakhir into v_no;
  return case p_jenis when 'kerusakan' then 'KR' else 'PM' end || '-' || lpad(v_no::text, 3, '0') || '/' || v_tahun;
end $fn$;

create or replace function private.sarpras_alur_catat(p_jenis text, p_ref uuid, p_dari text, p_ke text, p_catatan text) returns void
language sql security definer set search_path = '' as $fn$
  insert into public.sarpras_alur_riwayat(jenis, ref_id, status_dari, status_ke, oleh, oleh_nama, catatan)
  values (p_jenis, p_ref, p_dari, p_ke, auth.uid(), public.nama_saya(), nullif(btrim(coalesce(p_catatan,'')), ''))
$fn$;

create or replace function private.sarpras_ada_kaprog(p_program text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.penugasan pg
    where pg.jabatan_kode = 'kaprog' and pg.status = 'aktif' and pg.tahun_ajaran = public.tahun_ajaran_sekarang()
      and p_program is not null and (coalesce(pg.lingkup_id,'') = '' or pg.lingkup_id = p_program))
$fn$;

-- Laporan kerusakan ---------------------------------------------------------------------------------------------

create or replace function public.sarpras_kerusakan_lapor(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_npsn text := private.npsn_saya();
  v_b public.sarpras_barang;
  v_l public.sarpras_lab;
  v_jumlah numeric := coalesce(nullif(p->>'jumlah','')::numeric, 1);
  v_tingkat text := p->>'tingkat';
  v_uraian text := btrim(coalesce(p->>'uraian',''));
  v_id uuid;
begin
  if auth.uid() is null or v_npsn is null then raise exception 'Perlu masuk terlebih dahulu'; end if;
  if v_tingkat is null or v_tingkat not in ('ringan','berat','hilang') then raise exception 'Pilih tingkat kerusakan'; end if;
  if v_uraian = '' then raise exception 'Uraian kerusakan wajib diisi'; end if;
  if v_jumlah <= 0 then raise exception 'Jumlah harus lebih dari nol'; end if;
  select * into v_b from public.sarpras_barang where id = nullif(p->>'barang_id','')::uuid and npsn = v_npsn and dihapus_pada is null;
  if not found or v_b.lab_id is null then raise exception 'Pilih barang di bengkel atau laboratorium'; end if;
  select * into v_l from public.sarpras_lab where id = v_b.lab_id and npsn = v_npsn;
  if not private.sarpras_boleh_lab(v_b.lab_id) then raise exception 'Tidak berwenang melapor untuk bengkel atau laboratorium ini'; end if;
  if v_jumlah > v_b.jumlah_baik then raise exception 'Jumlah melebihi barang yang tercatat berkondisi baik (%)', v_b.jumlah_baik; end if;
  insert into public.sarpras_kerusakan(npsn, nomor, lab_id, program, barang_id, nama_barang, jumlah, tingkat, uraian, tanggal_kejadian, pelapor_user_id, pelapor_nama)
  values (v_npsn, private.sarpras_nomor_alur_baru(v_npsn, 'kerusakan'), v_b.lab_id, v_l.program, v_b.id, v_b.nama, v_jumlah, v_tingkat, v_uraian,
          nullif(p->>'tanggal_kejadian','')::date, auth.uid(), public.nama_saya())
  returning id into v_id;
  perform private.sarpras_alur_catat('kerusakan', v_id, null, 'dilaporkan', 'Laporan dibuat');
  return jsonb_build_object('id', v_id);
end $fn$;

create or replace function public.sarpras_kerusakan_daftar(p_status text default null, p_barang uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(r order by r.dibuat_pada desc), '[]'::jsonb) from (
    select k.id, k.nomor, k.lab_id, l.nama as lab_nama, k.program, k.barang_id, k.nama_barang, k.jumlah, k.tingkat, k.uraian, k.tanggal_kejadian,
           k.status, k.pelapor_nama, k.dibuat_pada, k.diubah_pada,
           array_remove(array[
             case when k.status = 'dilaporkan' and private.sarpras_boleh_lab(k.lab_id) then 'batal' end,
             case when k.status = 'dilaporkan' and private.sarpras_boleh_operasional() then 'proses' end,
             case when k.status = 'dilaporkan' and private.sarpras_boleh_operasional() then 'tolak' end,
             case when k.status = 'diproses' and private.sarpras_boleh_operasional() then 'selesai' end,
             case when k.status = 'diproses' and private.sarpras_boleh_operasional() then 'tidak_dapat' end
           ], null) as aksi
    from public.sarpras_kerusakan k
    join public.sarpras_lab l on l.id = k.lab_id
    where k.npsn = private.npsn_saya()
      and (p_status is null or p_status = '' or k.status = p_status)
      and (p_barang is null or k.barang_id = p_barang)
      and (private.sarpras_boleh_lihat() or private.sarpras_boleh_lab(k.lab_id) or private.sarpras_boleh_program(k.program))
    limit 1000
  ) r
$fn$;

create or replace function public.sarpras_kerusakan_putuskan(p_id uuid, p_aksi text, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_k public.sarpras_kerusakan;
  v_ke text;
  v_kol text;
  v_cat text := nullif(btrim(coalesce(p_catatan,'')), '');
begin
  select * into v_k from public.sarpras_kerusakan where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Laporan tidak ditemukan'; end if;
  v_kol := case v_k.tingkat when 'ringan' then 'rusak' when 'berat' then 'rusak_berat' else 'hilang' end;
  if p_aksi = 'batal' then
    if v_k.status <> 'dilaporkan' or not private.sarpras_boleh_lab(v_k.lab_id) then raise exception 'Laporan ini tidak dapat dibatalkan'; end if;
    v_ke := 'dibatalkan';
  elsif p_aksi = 'proses' then
    if v_k.status <> 'dilaporkan' or not private.sarpras_boleh_operasional() then raise exception 'Hanya Staf atau Waka Sarpras yang dapat memproses laporan'; end if;
    perform private.sarpras_geser_kondisi(v_k.barang_id, 'baik', v_kol, v_k.jumlah, 'kerusakan_' || v_k.tingkat);
    v_ke := 'diproses';
  elsif p_aksi = 'tolak' then
    if v_k.status <> 'dilaporkan' or not private.sarpras_boleh_operasional() then raise exception 'Tidak berwenang menolak laporan ini'; end if;
    if v_cat is null then raise exception 'Catatan wajib diisi'; end if;
    v_ke := 'ditolak';
  elsif p_aksi = 'selesai' then
    if v_k.status <> 'diproses' or not private.sarpras_boleh_operasional() then raise exception 'Tidak berwenang menyelesaikan laporan ini'; end if;
    perform private.sarpras_geser_kondisi(v_k.barang_id, v_kol, 'baik', v_k.jumlah, 'pulih_' || v_k.tingkat);
    v_ke := 'selesai';
  elsif p_aksi = 'tidak_dapat' then
    if v_k.status <> 'diproses' or not private.sarpras_boleh_operasional() then raise exception 'Tidak berwenang memutuskan laporan ini'; end if;
    if v_cat is null then raise exception 'Catatan wajib diisi'; end if;
    if v_k.tingkat = 'ringan' then
      perform private.sarpras_geser_kondisi(v_k.barang_id, 'rusak', 'rusak_berat', v_k.jumlah, 'rusak_berat');
    end if;
    v_ke := 'tidak_dapat_diperbaiki';
  else
    raise exception 'Aksi tidak dikenal';
  end if;
  update public.sarpras_kerusakan set status = v_ke, diubah_pada = now() where id = p_id;
  perform private.sarpras_alur_catat('kerusakan', p_id, v_k.status, v_ke, v_cat);
  return jsonb_build_object('id', p_id, 'status', v_ke);
end $fn$;

-- Permintaan alat dan bahan -------------------------------------------------------------------------------------

create or replace function public.sarpras_permintaan_simpan(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_npsn text := private.npsn_saya();
  v_lab uuid := nullif(p->>'lab_id','')::uuid;
  v_l public.sarpras_lab;
  v_u public.sarpras_permintaan;
  v_jenis text := p->>'jenis';
  v_nama text := btrim(coalesce(p->>'nama_barang',''));
  v_perlu text := btrim(coalesce(p->>'keperluan',''));
  v_jumlah numeric := coalesce(nullif(p->>'jumlah','')::numeric, 1);
  v_id uuid;
begin
  if auth.uid() is null or v_npsn is null then raise exception 'Perlu masuk terlebih dahulu'; end if;
  if v_jenis is null or v_jenis not in ('alat','bahan') then raise exception 'Pilih jenis: alat atau bahan'; end if;
  if v_nama = '' then raise exception 'Nama alat atau bahan wajib diisi'; end if;
  if v_perlu = '' then raise exception 'Keperluan wajib diisi'; end if;
  if v_jumlah <= 0 then raise exception 'Jumlah harus lebih dari nol'; end if;
  if p_id is not null then
    select * into v_u from public.sarpras_permintaan where id = p_id and npsn = v_npsn;
    if not found then raise exception 'Permintaan tidak ditemukan'; end if;
    if v_u.status not in ('draf','dikembalikan') then raise exception 'Permintaan yang sudah diajukan tidak dapat diubah'; end if;
    v_lab := v_u.lab_id;
  end if;
  select * into v_l from public.sarpras_lab where id = v_lab and npsn = v_npsn and aktif;
  if not found then raise exception 'Pilih bengkel atau laboratorium yang aktif'; end if;
  if not private.sarpras_boleh_lab(v_lab) then raise exception 'Tidak berwenang meminta untuk bengkel atau laboratorium ini'; end if;
  if p_id is null then
    insert into public.sarpras_permintaan(npsn, nomor, lab_id, program, jenis, nama_barang, spesifikasi, jumlah, satuan, keperluan, dibutuhkan_tanggal, pengusul_user_id, pengusul_nama)
    values (v_npsn, private.sarpras_nomor_alur_baru(v_npsn, 'permintaan'), v_lab, v_l.program, v_jenis, v_nama, nullif(btrim(coalesce(p->>'spesifikasi','')),''),
            v_jumlah, coalesce(nullif(btrim(coalesce(p->>'satuan','')),''), 'unit'), v_perlu, nullif(p->>'dibutuhkan_tanggal','')::date, auth.uid(), public.nama_saya())
    returning id into v_id;
    perform private.sarpras_alur_catat('permintaan', v_id, null, 'draf', 'Permintaan dibuat');
  else
    update public.sarpras_permintaan set jenis = v_jenis, nama_barang = v_nama, spesifikasi = nullif(btrim(coalesce(p->>'spesifikasi','')),''),
           jumlah = v_jumlah, satuan = coalesce(nullif(btrim(coalesce(p->>'satuan','')),''), 'unit'), keperluan = v_perlu,
           dibutuhkan_tanggal = nullif(p->>'dibutuhkan_tanggal','')::date, program = v_l.program, diubah_pada = now()
     where id = p_id;
    v_id := p_id;
  end if;
  return jsonb_build_object('id', v_id);
end $fn$;

create or replace function public.sarpras_permintaan_ajukan(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_u public.sarpras_permintaan; v_ke text; v_cat text;
begin
  select * into v_u from public.sarpras_permintaan where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Permintaan tidak ditemukan'; end if;
  if v_u.status not in ('draf','dikembalikan') then raise exception 'Permintaan ini sudah diajukan'; end if;
  if not private.sarpras_boleh_lab(v_u.lab_id) then raise exception 'Tidak berwenang mengajukan permintaan ini'; end if;
  if private.sarpras_ada_kaprog(v_u.program) then
    v_ke := 'menunggu_kaprog'; v_cat := 'Diajukan ke Kepala Program';
  else
    v_ke := 'menunggu_staf'; v_cat := 'Tidak ada Kepala Program aktif untuk program ini, diteruskan langsung ke Staf Sarpras';
  end if;
  update public.sarpras_permintaan set status = v_ke, diubah_pada = now() where id = p_id;
  perform private.sarpras_alur_catat('permintaan', p_id, v_u.status, v_ke, v_cat);
  return jsonb_build_object('id', p_id, 'status', v_ke);
end $fn$;

create or replace function public.sarpras_permintaan_daftar(p_status text default null) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(r order by r.dibuat_pada desc), '[]'::jsonb) from (
    select u.id, u.nomor, u.lab_id, l.nama as lab_nama, u.program, u.jenis, u.nama_barang, u.spesifikasi, u.jumlah, u.satuan, u.keperluan,
           u.dibutuhkan_tanggal, u.sumber_barang_id, s.nama as sumber_nama, u.status, u.pengusul_nama, u.dibuat_pada, u.diubah_pada,
           array_remove(array[
             case when u.status in ('draf','dikembalikan') and private.sarpras_boleh_lab(u.lab_id) then 'ubah' end,
             case when u.status in ('draf','dikembalikan') and private.sarpras_boleh_lab(u.lab_id) then 'ajukan' end,
             case when u.status in ('draf','dikembalikan','menunggu_kaprog') and private.sarpras_boleh_lab(u.lab_id) then 'batal' end,
             case when u.status = 'menunggu_kaprog' and private.sarpras_boleh_program(u.program) then 'teruskan' end,
             case when (u.status = 'menunggu_kaprog' and private.sarpras_boleh_program(u.program)) or (u.status = 'menunggu_staf' and private.sarpras_boleh_operasional()) then 'kembalikan' end,
             case when (u.status = 'menunggu_kaprog' and private.sarpras_boleh_program(u.program)) or (u.status = 'menunggu_staf' and private.sarpras_boleh_operasional()) then 'tolak' end,
             case when u.status = 'menunggu_staf' and private.sarpras_boleh_operasional() then 'siapkan' end,
             case when u.status = 'disiapkan' and private.sarpras_boleh_operasional() then 'serahkan' end
           ], null) as aksi
    from public.sarpras_permintaan u
    join public.sarpras_lab l on l.id = u.lab_id
    left join public.sarpras_barang s on s.id = u.sumber_barang_id
    where u.npsn = private.npsn_saya()
      and (p_status is null or p_status = '' or u.status = p_status)
      and (private.sarpras_boleh_lihat() or private.sarpras_boleh_lab(u.lab_id) or private.sarpras_boleh_program(u.program))
    limit 1000
  ) r
$fn$;

create or replace function public.sarpras_permintaan_putuskan(p_id uuid, p_aksi text, p_catatan text default null, p_sumber uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_npsn text := private.npsn_saya();
  v_u public.sarpras_permintaan;
  v_ke text;
  v_cat text := nullif(btrim(coalesce(p_catatan,'')), '');
  v_sumber public.sarpras_barang;
  v_tujuan public.sarpras_barang;
  v_tid uuid;
begin
  select * into v_u from public.sarpras_permintaan where id = p_id and npsn = v_npsn for update;
  if not found then raise exception 'Permintaan tidak ditemukan'; end if;
  if p_aksi = 'batal' then
    if v_u.status not in ('draf','dikembalikan','menunggu_kaprog') or not private.sarpras_boleh_lab(v_u.lab_id) then raise exception 'Permintaan ini tidak dapat dibatalkan'; end if;
    v_ke := 'dibatalkan';
  elsif p_aksi = 'teruskan' then
    if v_u.status <> 'menunggu_kaprog' or not private.sarpras_boleh_program(v_u.program) then raise exception 'Tidak berwenang meneruskan permintaan ini'; end if;
    v_ke := 'menunggu_staf';
  elsif p_aksi in ('kembalikan','tolak') then
    if not ((v_u.status = 'menunggu_kaprog' and private.sarpras_boleh_program(v_u.program))
         or (v_u.status = 'menunggu_staf' and private.sarpras_boleh_operasional())) then
      raise exception 'Tidak berwenang memutuskan permintaan ini';
    end if;
    if v_cat is null then raise exception 'Catatan wajib diisi'; end if;
    v_ke := case when p_aksi = 'kembalikan' then 'dikembalikan' else 'ditolak' end;
  elsif p_aksi = 'siapkan' then
    if v_u.status <> 'menunggu_staf' or not private.sarpras_boleh_operasional() then raise exception 'Hanya Staf atau Waka Sarpras yang dapat menyiapkan permintaan'; end if;
    if p_sumber is not null then
      if not exists (select 1 from public.sarpras_barang where id = p_sumber and npsn = v_npsn and dihapus_pada is null) then raise exception 'Barang sumber tidak ditemukan'; end if;
      update public.sarpras_permintaan set sumber_barang_id = p_sumber where id = p_id;
    end if;
    v_ke := 'disiapkan';
  elsif p_aksi = 'serahkan' then
    if v_u.status <> 'disiapkan' or not private.sarpras_boleh_operasional() then raise exception 'Hanya Staf atau Waka Sarpras yang dapat menyerahkan permintaan'; end if;
    -- Stok sumber berkurang bila ditautkan ke barang di gudang.
    if v_u.sumber_barang_id is not null then
      select * into v_sumber from public.sarpras_barang where id = v_u.sumber_barang_id and npsn = v_npsn and dihapus_pada is null for update;
      if found then
        if v_sumber.jumlah_baik < v_u.jumlah then raise exception 'Stok sumber tidak mencukupi (tersedia %)', v_sumber.jumlah_baik; end if;
        update public.sarpras_barang set jumlah_baik = jumlah_baik - v_u.jumlah, diubah_oleh = auth.uid(), diubah_pada = now() where id = v_sumber.id;
        insert into public.sarpras_log(barang_id, aksi, sebelum, sesudah, oleh)
          select v_sumber.id, 'keluar_' || v_u.nomor, to_jsonb(v_sumber), to_jsonb(b), auth.uid() from public.sarpras_barang b where b.id = v_sumber.id;
      end if;
    end if;
    -- Stok bengkel bertambah: gabung ke barang bernama sama, atau buat baru.
    select * into v_tujuan from public.sarpras_barang
     where npsn = v_npsn and lab_id = v_u.lab_id and kategori = v_u.jenis and lower(nama) = lower(v_u.nama_barang) and dihapus_pada is null
     order by dibuat_pada limit 1 for update;
    if found then
      update public.sarpras_barang set jumlah_baik = jumlah_baik + v_u.jumlah, diubah_oleh = auth.uid(), diubah_pada = now() where id = v_tujuan.id;
      insert into public.sarpras_log(barang_id, aksi, sebelum, sesudah, oleh)
        select v_tujuan.id, 'masuk_' || v_u.nomor, to_jsonb(v_tujuan), to_jsonb(b), auth.uid() from public.sarpras_barang b where b.id = v_tujuan.id;
    else
      insert into public.sarpras_barang(npsn, lab_id, kategori, nama, spesifikasi, satuan, jumlah_baik, keterangan, dibuat_oleh, diubah_oleh)
      values (v_npsn, v_u.lab_id, v_u.jenis, v_u.nama_barang, v_u.spesifikasi, v_u.satuan, v_u.jumlah, 'Dari permintaan ' || v_u.nomor, auth.uid(), auth.uid())
      returning id into v_tid;
      insert into public.sarpras_log(barang_id, aksi, sesudah, oleh)
        select v_tid, 'tambah', to_jsonb(b), auth.uid() from public.sarpras_barang b where b.id = v_tid;
    end if;
    v_ke := 'diserahkan';
  else
    raise exception 'Aksi tidak dikenal';
  end if;
  update public.sarpras_permintaan set status = v_ke, diubah_pada = now() where id = p_id;
  perform private.sarpras_alur_catat('permintaan', p_id, v_u.status, v_ke, v_cat);
  return jsonb_build_object('id', p_id, 'status', v_ke);
end $fn$;

create or replace function public.sarpras_alur_riwayat(p_jenis text, p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('waktu', h.waktu, 'dari', h.status_dari, 'ke', h.status_ke, 'oleh', h.oleh_nama, 'catatan', h.catatan) order by h.waktu), '[]'::jsonb)
  from public.sarpras_alur_riwayat h
  where h.jenis = p_jenis and h.ref_id = p_id
    and (
      (p_jenis = 'kerusakan' and exists (select 1 from public.sarpras_kerusakan k where k.id = p_id and k.npsn = private.npsn_saya()
         and (private.sarpras_boleh_lihat() or private.sarpras_boleh_lab(k.lab_id) or private.sarpras_boleh_program(k.program))))
      or (p_jenis = 'permintaan' and exists (select 1 from public.sarpras_permintaan u where u.id = p_id and u.npsn = private.npsn_saya()
         and (private.sarpras_boleh_lihat() or private.sarpras_boleh_lab(u.lab_id) or private.sarpras_boleh_program(u.program))))
    )
$fn$;

revoke execute on function private.sarpras_nomor_alur_baru(text, text), private.sarpras_alur_catat(text, uuid, text, text, text), private.sarpras_ada_kaprog(text) from public, anon;
revoke execute on function public.sarpras_kerusakan_lapor(jsonb), public.sarpras_kerusakan_daftar(text, uuid), public.sarpras_kerusakan_putuskan(uuid, text, text),
  public.sarpras_permintaan_simpan(uuid, jsonb), public.sarpras_permintaan_ajukan(uuid), public.sarpras_permintaan_daftar(text),
  public.sarpras_permintaan_putuskan(uuid, text, text, uuid), public.sarpras_alur_riwayat(text, uuid) from public, anon;
grant execute on function public.sarpras_kerusakan_lapor(jsonb), public.sarpras_kerusakan_daftar(text, uuid), public.sarpras_kerusakan_putuskan(uuid, text, text),
  public.sarpras_permintaan_simpan(uuid, jsonb), public.sarpras_permintaan_ajukan(uuid), public.sarpras_permintaan_daftar(text),
  public.sarpras_permintaan_putuskan(uuid, text, text, uuid), public.sarpras_alur_riwayat(text, uuid) to authenticated;
