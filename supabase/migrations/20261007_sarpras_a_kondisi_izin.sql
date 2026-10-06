-- Sarpras, bagian A: kondisi barang empat tingkat, stok minimum bahan, dan izin operasional staf.
-- jumlah_rusak berarti rusak ringan. Kolom baru: jumlah_rusak_berat dan jumlah_hilang.
-- Staf Sarpras tidak lagi memegang sarpras.kelola (memutuskan usulan, menghapus barang, mengelola bangunan dan daftar bengkel).
-- Staf memegang sarpras.operasional: memproses laporan kerusakan dan permintaan, memperbarui inventaris semua bengkel.

insert into public.izin (kode, nama, bidang) values
  ('sarpras.operasional', 'Memproses laporan kerusakan dan permintaan alat dan bahan, memperbarui inventaris semua bengkel', 'Sarana dan prasarana')
on conflict (kode) do nothing;

insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_sarpras', 'sarpras.operasional'),
  ('staf_sarpras', 'sarpras.operasional')
on conflict do nothing;
delete from public.jabatan_izin where jabatan_kode = 'staf_sarpras' and izin_kode = 'sarpras.kelola';

alter table public.sarpras_barang
  add column if not exists jumlah_rusak_berat numeric not null default 0 check (jumlah_rusak_berat >= 0),
  add column if not exists jumlah_hilang numeric not null default 0 check (jumlah_hilang >= 0),
  add column if not exists stok_minimum numeric check (stok_minimum >= 0);

alter table public.sarpras_barang alter column jumlah_total set expression as (jumlah_baik + jumlah_rusak + jumlah_rusak_berat + jumlah_hilang);

create or replace function private.sarpras_boleh_operasional() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select auth.uid() is not null and (private.punya_izin('sarpras.kelola', null) or private.punya_izin('sarpras.operasional', null))
$fn$;

create or replace function private.sarpras_boleh_lab(p_lab uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select auth.uid() is not null and (
    private.punya_izin('sarpras.kelola', null)
    or (p_lab is not null
        and (private.punya_izin('sarpras.operasional', null) or private.punya_izin('sarpras.catat_lab', p_lab::text))
        and exists (select 1 from public.sarpras_lab l where l.id = p_lab and l.npsn = private.npsn_saya())))
$fn$;

create or replace function private.sarpras_boleh_lihat() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select auth.uid() is not null and (private.punya_izin('sarpras.kelola', null) or private.punya_izin('sarpras.operasional', null) or private.punya_izin('sarpras.lihat', null))
$fn$;

create or replace function public.sarpras_izin() returns text[]
language sql stable security definer set search_path = '' as $fn$
  select coalesce(array_remove(array[
    case when private.punya_izin('sarpras.kelola', null) then 'kelola' end,
    case when private.sarpras_boleh_operasional() then 'operasional' end,
    case when private.punya_izin('sarpras.catat_lab', null) then 'catat_lab' end,
    case when private.punya_izin('sarpras.verifikasi_program', null) then 'verifikasi_program' end,
    case when private.sarpras_boleh_lihat() then 'lihat' end
  ], null), array[]::text[])
  where auth.uid() is not null
$fn$;

-- Memindahkan jumlah antar kondisi (baik, rusak, rusak_berat, hilang) dan mencatatnya di log barang.
create or replace function private.sarpras_geser_kondisi(p_barang uuid, p_dari text, p_ke text, p_jumlah numeric, p_aksi text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_old public.sarpras_barang;
  v_baik numeric; v_rusak numeric; v_berat numeric; v_hilang numeric;
begin
  select * into v_old from public.sarpras_barang where id = p_barang and npsn = private.npsn_saya() and dihapus_pada is null for update;
  if not found then raise exception 'Barang tidak ditemukan'; end if;
  v_baik := v_old.jumlah_baik; v_rusak := v_old.jumlah_rusak; v_berat := v_old.jumlah_rusak_berat; v_hilang := v_old.jumlah_hilang;
  case p_dari
    when 'baik' then v_baik := v_baik - p_jumlah;
    when 'rusak' then v_rusak := v_rusak - p_jumlah;
    when 'rusak_berat' then v_berat := v_berat - p_jumlah;
    when 'hilang' then v_hilang := v_hilang - p_jumlah;
    else raise exception 'Kondisi asal tidak dikenal';
  end case;
  case p_ke
    when 'baik' then v_baik := v_baik + p_jumlah;
    when 'rusak' then v_rusak := v_rusak + p_jumlah;
    when 'rusak_berat' then v_berat := v_berat + p_jumlah;
    when 'hilang' then v_hilang := v_hilang + p_jumlah;
    else raise exception 'Kondisi tujuan tidak dikenal';
  end case;
  if least(v_baik, v_rusak, v_berat, v_hilang) < 0 then
    raise exception 'Jumlah pada inventaris tidak mencukupi. Perbarui inventaris bengkel lebih dulu';
  end if;
  update public.sarpras_barang set jumlah_baik = v_baik, jumlah_rusak = v_rusak, jumlah_rusak_berat = v_berat, jumlah_hilang = v_hilang,
         diubah_oleh = auth.uid(), diubah_pada = now() where id = p_barang;
  insert into public.sarpras_log(barang_id, aksi, sebelum, sesudah, oleh)
    select p_barang, p_aksi, to_jsonb(v_old), to_jsonb(b), auth.uid() from public.sarpras_barang b where b.id = p_barang;
end $fn$;

create or replace function public.sarpras_barang_daftar(p_lab uuid default null, p_kategori text default null, p_cari text default null)
returns jsonb language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(r order by r.lab_nama nulls first, r.kategori, r.nama), '[]'::jsonb) from (
    select b.id, b.lab_id, l.nama as lab_nama, l.program as lab_program, b.kategori, b.kode_barang, b.nama, b.merek_tipe, b.spesifikasi, b.satuan,
           b.jumlah_baik, b.jumlah_rusak, b.jumlah_rusak_berat, b.jumlah_hilang, b.jumlah_total, b.stok_minimum,
           b.tahun_perolehan, b.sumber_dana, b.harga_satuan, b.luas_m2, b.keterangan, b.diubah_pada,
           case when b.lab_id is null then private.sarpras_boleh_operasional()
                else private.sarpras_boleh_lab(b.lab_id) and (b.kategori <> 'bangunan' or private.sarpras_boleh_kelola()) end as boleh_ubah
    from public.sarpras_barang b
    left join public.sarpras_lab l on l.id = b.lab_id
    where b.npsn = private.npsn_saya() and b.dihapus_pada is null
      and (p_lab is null or b.lab_id = p_lab)
      and (p_kategori is null or b.kategori = p_kategori)
      and (p_cari is null or p_cari = '' or b.nama ilike '%' || p_cari || '%' or coalesce(b.kode_barang,'') ilike '%' || p_cari || '%' or coalesce(b.spesifikasi,'') ilike '%' || p_cari || '%')
      and (private.sarpras_boleh_lihat() or (b.lab_id is not null and private.sarpras_lab_terlihat(b.lab_id)))
    limit 3000
  ) r
$fn$;

create or replace function public.sarpras_barang_simpan(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_npsn text := private.npsn_saya();
  v_lab uuid := nullif(p->>'lab_id','')::uuid;
  v_old public.sarpras_barang;
  v_kat text := p->>'kategori';
  v_nama text := btrim(coalesce(p->>'nama',''));
  v_baik numeric := coalesce(nullif(p->>'jumlah_baik','')::numeric, 0);
  v_rusak numeric := coalesce(nullif(p->>'jumlah_rusak','')::numeric, 0);
  v_berat numeric := coalesce(nullif(p->>'jumlah_rusak_berat','')::numeric, 0);
  v_hilang numeric := coalesce(nullif(p->>'jumlah_hilang','')::numeric, 0);
  v_min numeric := nullif(p->>'stok_minimum','')::numeric;
  v_id uuid;
begin
  if auth.uid() is null or v_npsn is null then raise exception 'Perlu masuk terlebih dahulu'; end if;
  if v_nama = '' then raise exception 'Nama barang wajib diisi'; end if;
  if v_kat is null or v_kat not in ('bangunan','alat','bahan','aset','lainnya') then raise exception 'Kategori tidak dikenal'; end if;
  if least(v_baik, v_rusak, v_berat, v_hilang) < 0 then raise exception 'Jumlah tidak boleh negatif'; end if;
  if v_min is not null and v_min < 0 then raise exception 'Stok minimum tidak boleh negatif'; end if;
  if v_lab is null then
    if not private.sarpras_boleh_operasional() then raise exception 'Barang tanpa lab hanya dapat dicatat Waka Sarpras atau Staf Sarpras'; end if;
  else
    if not exists (select 1 from public.sarpras_lab where id = v_lab and npsn = v_npsn) then raise exception 'Bengkel atau laboratorium tidak ditemukan'; end if;
    if not private.sarpras_boleh_lab(v_lab) then raise exception 'Tidak berwenang mencatat barang di bengkel atau laboratorium ini'; end if;
  end if;
  if v_kat = 'bangunan' and not private.sarpras_boleh_kelola() then raise exception 'Data bangunan dikelola Waka Sarpras'; end if;

  if p_id is null then
    insert into public.sarpras_barang(npsn, lab_id, kategori, kode_barang, nama, merek_tipe, spesifikasi, satuan, jumlah_baik, jumlah_rusak, jumlah_rusak_berat, jumlah_hilang,
        stok_minimum, tahun_perolehan, sumber_dana, harga_satuan, luas_m2, keterangan, dibuat_oleh, diubah_oleh)
    values (v_npsn, v_lab, v_kat, nullif(btrim(coalesce(p->>'kode_barang','')),''), v_nama, nullif(btrim(coalesce(p->>'merek_tipe','')),''),
        nullif(btrim(coalesce(p->>'spesifikasi','')),''), coalesce(nullif(btrim(coalesce(p->>'satuan','')),''), 'unit'), v_baik, v_rusak, v_berat, v_hilang,
        v_min, nullif(p->>'tahun_perolehan','')::int, nullif(btrim(coalesce(p->>'sumber_dana','')),''), nullif(p->>'harga_satuan','')::numeric,
        nullif(p->>'luas_m2','')::numeric, nullif(btrim(coalesce(p->>'keterangan','')),''), auth.uid(), auth.uid())
    returning id into v_id;
    insert into public.sarpras_log(barang_id, aksi, sesudah, oleh)
      select v_id, 'tambah', to_jsonb(b), auth.uid() from public.sarpras_barang b where b.id = v_id;
  else
    select * into v_old from public.sarpras_barang where id = p_id and npsn = v_npsn and dihapus_pada is null;
    if not found then raise exception 'Barang tidak ditemukan'; end if;
    if v_old.lab_id is null then
      if not private.sarpras_boleh_operasional() then raise exception 'Barang ini hanya dapat diubah Waka Sarpras atau Staf Sarpras'; end if;
    elsif not private.sarpras_boleh_lab(v_old.lab_id) then
      raise exception 'Tidak berwenang mengubah barang di bengkel atau laboratorium ini';
    end if;
    if v_old.kategori = 'bangunan' and not private.sarpras_boleh_kelola() then raise exception 'Data bangunan dikelola Waka Sarpras'; end if;
    update public.sarpras_barang set lab_id = v_lab, kategori = v_kat, kode_barang = nullif(btrim(coalesce(p->>'kode_barang','')),''), nama = v_nama,
        merek_tipe = nullif(btrim(coalesce(p->>'merek_tipe','')),''), spesifikasi = nullif(btrim(coalesce(p->>'spesifikasi','')),''),
        satuan = coalesce(nullif(btrim(coalesce(p->>'satuan','')),''), 'unit'), jumlah_baik = v_baik, jumlah_rusak = v_rusak,
        jumlah_rusak_berat = v_berat, jumlah_hilang = v_hilang, stok_minimum = v_min,
        tahun_perolehan = nullif(p->>'tahun_perolehan','')::int, sumber_dana = nullif(btrim(coalesce(p->>'sumber_dana','')),''),
        harga_satuan = nullif(p->>'harga_satuan','')::numeric, luas_m2 = nullif(p->>'luas_m2','')::numeric,
        keterangan = nullif(btrim(coalesce(p->>'keterangan','')),''), diubah_oleh = auth.uid(), diubah_pada = now()
     where id = p_id;
    v_id := p_id;
    insert into public.sarpras_log(barang_id, aksi, sebelum, sesudah, oleh)
      select p_id, 'ubah', to_jsonb(v_old), to_jsonb(b), auth.uid() from public.sarpras_barang b where b.id = p_id;
  end if;
  return jsonb_build_object('id', v_id);
end $fn$;

create or replace function public.sarpras_lab_daftar() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(r order by r.nama), '[]'::jsonb) from (
    select l.id, l.kode, l.nama, l.jenis, l.program, l.keterangan, l.aktif, l.prasarana_id,
           coalesce(a.jenis_barang, 0) as jenis_barang,
           coalesce(a.baik, 0) as baik, coalesce(a.rusak, 0) as rusak,
           coalesce(a.rusak_berat, 0) as rusak_berat, coalesce(a.hilang, 0) as hilang,
           private.sarpras_boleh_lab(l.id) as boleh_catat
    from public.sarpras_lab l
    left join lateral (
      select count(*) as jenis_barang, sum(b.jumlah_baik) as baik, sum(b.jumlah_rusak) as rusak,
             sum(b.jumlah_rusak_berat) as rusak_berat, sum(b.jumlah_hilang) as hilang
      from public.sarpras_barang b where b.lab_id = l.id and b.dihapus_pada is null) a on true
    where l.npsn = private.npsn_saya() and private.sarpras_lab_terlihat(l.id)
  ) r
$fn$;

revoke execute on function private.sarpras_boleh_operasional() from public, anon;
revoke execute on function private.sarpras_geser_kondisi(uuid, text, text, numeric, text) from public, anon;
