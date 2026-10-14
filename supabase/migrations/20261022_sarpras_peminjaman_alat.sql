-- Sarpras: peminjaman alat (proyektor, sound system, dan sejenisnya) oleh guru atau pegawai.
-- Pengganti buku peminjaman manual. Staf atau Waka Sarpras mencatat peminjaman dan pengembalian.
-- Alat yang dipinjam tetap tercatat berkondisi baik di inventaris; ketersediaan = jumlah baik dikurangi yang sedang dipinjam.
-- Saat dikembalikan rusak ringan, rusak berat, atau hilang, kondisi di inventaris bergeser otomatis dan masuk log barang.

create table if not exists public.sarpras_pinjam (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  nomor text,
  barang_id uuid not null references public.sarpras_barang(id) on delete restrict,
  nama_barang text not null,
  jumlah numeric not null check (jumlah > 0),
  peminjam_nama text not null,
  peminjam_user_id uuid,
  keperluan text,
  tanggal_pinjam date not null,
  rencana_kembali date,
  status text not null default 'dipinjam' check (status in ('dipinjam', 'dikembalikan', 'dibatalkan')),
  tanggal_kembali date,
  kembali_baik numeric not null default 0 check (kembali_baik >= 0),
  kembali_rusak numeric not null default 0 check (kembali_rusak >= 0),
  kembali_rusak_berat numeric not null default 0 check (kembali_rusak_berat >= 0),
  kembali_hilang numeric not null default 0 check (kembali_hilang >= 0),
  catatan_kembali text,
  dicatat_oleh uuid, dicatat_nama text,
  dikembalikan_oleh uuid, dikembalikan_nama text,
  dibuat_pada timestamptz not null default now(), diubah_pada timestamptz not null default now()
);
create index if not exists sarpras_pinjam_status_idx on public.sarpras_pinjam (npsn, status);
create index if not exists sarpras_pinjam_barang_idx on public.sarpras_pinjam (barang_id);
create index if not exists sarpras_pinjam_tanggal_idx on public.sarpras_pinjam (npsn, tanggal_pinjam desc);

alter table public.sarpras_pinjam enable row level security;
revoke all on public.sarpras_pinjam from anon, authenticated;

create or replace function private.sarpras_pinjam_nomor(p_npsn text) returns text
language plpgsql security definer set search_path = '' as $fn$
declare v_tahun int := extract(year from (now() at time zone 'Asia/Jakarta'))::int; v_no int;
begin
  insert into public.sarpras_nomor_alur(npsn, tahun, jenis, terakhir) values (p_npsn, v_tahun, 'peminjaman', 1)
  on conflict (npsn, tahun, jenis) do update set terakhir = public.sarpras_nomor_alur.terakhir + 1
  returning terakhir into v_no;
  return 'PJ-' || lpad(v_no::text, 3, '0') || '/' || v_tahun;
end $fn$;

-- Daftar alat yang dapat dipinjam, lengkap dengan jumlah yang sedang dipinjam dan yang masih tersedia.
create or replace function public.sarpras_pinjam_alat() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(r order by r.nama), '[]'::jsonb) from (
    select b.id, b.nama, b.kode_barang, b.merek_tipe, b.satuan, b.lab_id, coalesce(l.nama, 'Umum') as lab_nama,
           b.jumlah_baik, b.jumlah_rusak, b.jumlah_rusak_berat, b.jumlah_hilang,
           coalesce(p.dipinjam, 0) as dipinjam,
           greatest(b.jumlah_baik - coalesce(p.dipinjam, 0), 0) as tersedia
    from public.sarpras_barang b
    left join public.sarpras_lab l on l.id = b.lab_id
    left join lateral (select sum(x.jumlah) as dipinjam from public.sarpras_pinjam x where x.barang_id = b.id and x.status = 'dipinjam') p on true
    where b.npsn = private.npsn_saya() and b.dihapus_pada is null and b.kategori = 'alat'
      and private.sarpras_boleh_lihat()
    limit 3000
  ) r
$fn$;

create or replace function public.sarpras_pinjam_daftar(p_status text default null, p_cari text default null, p_dari date default null, p_sampai date default null) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(r order by r.tanggal_pinjam desc, r.dibuat_pada desc), '[]'::jsonb) from (
    select k.id, k.nomor, k.barang_id, k.nama_barang, k.jumlah, coalesce(b.satuan, 'unit') as satuan, k.peminjam_nama, k.keperluan,
           k.tanggal_pinjam, k.rencana_kembali, k.status, k.tanggal_kembali,
           k.kembali_baik, k.kembali_rusak, k.kembali_rusak_berat, k.kembali_hilang, k.catatan_kembali,
           k.dicatat_nama, k.dikembalikan_nama, k.dibuat_pada,
           (k.status = 'dipinjam' and k.rencana_kembali is not null and k.rencana_kembali < (now() at time zone 'Asia/Jakarta')::date) as terlambat,
           array_remove(array[
             case when k.status = 'dipinjam' and private.sarpras_boleh_operasional() then 'kembali' end,
             case when k.status = 'dipinjam' and private.sarpras_boleh_operasional() then 'batal' end
           ], null) as aksi
    from public.sarpras_pinjam k
    left join public.sarpras_barang b on b.id = k.barang_id
    where k.npsn = private.npsn_saya() and private.sarpras_boleh_lihat()
      and (p_status is null or p_status = '' or (p_status = 'terlambat' and k.status = 'dipinjam' and k.rencana_kembali < (now() at time zone 'Asia/Jakarta')::date) or k.status = p_status)
      and (p_cari is null or p_cari = '' or k.nama_barang ilike '%' || p_cari || '%' or k.peminjam_nama ilike '%' || p_cari || '%' or coalesce(k.nomor,'') ilike '%' || p_cari || '%')
      and (p_dari is null or k.tanggal_pinjam >= p_dari)
      and (p_sampai is null or k.tanggal_pinjam <= p_sampai)
    limit 2000
  ) r
$fn$;

create or replace function public.sarpras_pinjam_catat(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_npsn text := private.npsn_saya();
  v_b public.sarpras_barang;
  v_jumlah numeric := coalesce(nullif(p->>'jumlah','')::numeric, 1);
  v_nama text := btrim(coalesce(p->>'peminjam_nama',''));
  v_tgl date := coalesce(nullif(p->>'tanggal_pinjam','')::date, (now() at time zone 'Asia/Jakarta')::date);
  v_rencana date := nullif(p->>'rencana_kembali','')::date;
  v_dipinjam numeric;
  v_id uuid;
begin
  if auth.uid() is null or v_npsn is null then raise exception 'Perlu masuk terlebih dahulu'; end if;
  if not private.sarpras_boleh_operasional() then raise exception 'Hanya Staf atau Waka Sarpras yang dapat mencatat peminjaman'; end if;
  if v_nama = '' then raise exception 'Nama peminjam wajib diisi'; end if;
  if v_jumlah <= 0 then raise exception 'Jumlah harus lebih dari nol'; end if;
  if v_rencana is not null and v_rencana < v_tgl then raise exception 'Rencana kembali tidak boleh sebelum tanggal pinjam'; end if;
  select * into v_b from public.sarpras_barang
   where id = nullif(p->>'barang_id','')::uuid and npsn = v_npsn and dihapus_pada is null and kategori = 'alat' for update;
  if not found then raise exception 'Pilih alat dari inventaris'; end if;
  select coalesce(sum(jumlah), 0) into v_dipinjam from public.sarpras_pinjam where barang_id = v_b.id and status = 'dipinjam';
  if v_jumlah > v_b.jumlah_baik - v_dipinjam then
    raise exception 'Jumlah melebihi alat yang tersedia (%)', greatest(v_b.jumlah_baik - v_dipinjam, 0);
  end if;
  insert into public.sarpras_pinjam(npsn, nomor, barang_id, nama_barang, jumlah, peminjam_nama, keperluan, tanggal_pinjam, rencana_kembali, dicatat_oleh, dicatat_nama)
  values (v_npsn, private.sarpras_pinjam_nomor(v_npsn), v_b.id, v_b.nama, v_jumlah, v_nama,
          nullif(btrim(coalesce(p->>'keperluan','')), ''), v_tgl, v_rencana, auth.uid(), public.nama_saya())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $fn$;

-- Pengembalian: p_rusak, p_berat, p_hilang adalah jumlah yang kembali tidak baik; sisanya kembali baik.
create or replace function public.sarpras_pinjam_kembali(p_id uuid, p_rusak numeric default 0, p_berat numeric default 0, p_hilang numeric default 0,
                                                         p_catatan text default null, p_tanggal date default null) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_k public.sarpras_pinjam;
  v_rusak numeric := coalesce(p_rusak, 0); v_berat numeric := coalesce(p_berat, 0); v_hilang numeric := coalesce(p_hilang, 0);
  v_baik numeric;
  v_tgl date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
  v_cat text := nullif(btrim(coalesce(p_catatan,'')), '');
begin
  if not private.sarpras_boleh_operasional() then raise exception 'Hanya Staf atau Waka Sarpras yang dapat mencatat pengembalian'; end if;
  select * into v_k from public.sarpras_pinjam where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Catatan peminjaman tidak ditemukan'; end if;
  if v_k.status <> 'dipinjam' then raise exception 'Peminjaman ini sudah ditutup'; end if;
  if least(v_rusak, v_berat, v_hilang) < 0 then raise exception 'Jumlah tidak boleh negatif'; end if;
  v_baik := v_k.jumlah - v_rusak - v_berat - v_hilang;
  if v_baik < 0 then raise exception 'Jumlah rusak dan hilang melebihi jumlah yang dipinjam (%)', v_k.jumlah; end if;
  if v_tgl < v_k.tanggal_pinjam then raise exception 'Tanggal kembali tidak boleh sebelum tanggal pinjam'; end if;
  if (v_rusak + v_berat + v_hilang) > 0 and v_cat is null then raise exception 'Catatan kondisi wajib diisi bila alat kembali rusak atau hilang'; end if;
  if v_rusak > 0 then perform private.sarpras_geser_kondisi(v_k.barang_id, 'baik', 'rusak', v_rusak, 'pinjam_rusak_' || v_k.nomor); end if;
  if v_berat > 0 then perform private.sarpras_geser_kondisi(v_k.barang_id, 'baik', 'rusak_berat', v_berat, 'pinjam_rusak_berat_' || v_k.nomor); end if;
  if v_hilang > 0 then perform private.sarpras_geser_kondisi(v_k.barang_id, 'baik', 'hilang', v_hilang, 'pinjam_hilang_' || v_k.nomor); end if;
  update public.sarpras_pinjam set status = 'dikembalikan', tanggal_kembali = v_tgl,
         kembali_baik = v_baik, kembali_rusak = v_rusak, kembali_rusak_berat = v_berat, kembali_hilang = v_hilang,
         catatan_kembali = v_cat, dikembalikan_oleh = auth.uid(), dikembalikan_nama = public.nama_saya(), diubah_pada = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'status', 'dikembalikan');
end $fn$;

-- Membatalkan catatan yang salah input. Tidak mengubah inventaris.
create or replace function public.sarpras_pinjam_batal(p_id uuid, p_catatan text default null) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_k public.sarpras_pinjam;
begin
  if not private.sarpras_boleh_operasional() then raise exception 'Hanya Staf atau Waka Sarpras yang dapat membatalkan catatan'; end if;
  select * into v_k from public.sarpras_pinjam where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Catatan peminjaman tidak ditemukan'; end if;
  if v_k.status <> 'dipinjam' then raise exception 'Hanya peminjaman yang masih berjalan yang dapat dibatalkan'; end if;
  update public.sarpras_pinjam set status = 'dibatalkan', catatan_kembali = nullif(btrim(coalesce(p_catatan,'')), ''),
         dikembalikan_oleh = auth.uid(), dikembalikan_nama = public.nama_saya(), diubah_pada = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'status', 'dibatalkan');
end $fn$;

-- Rekap: ringkasan angka, per alat (frekuensi pinjam dan kondisi saat ini), dan per peminjam.
create or replace function public.sarpras_pinjam_rekap(p_dari date default null, p_sampai date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_npsn text := private.npsn_saya();
  v_hari date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if v_npsn is null or not private.sarpras_boleh_lihat() then return null; end if;
  return jsonb_build_object(
    'ringkas', (select jsonb_build_object(
        'sedang', coalesce(sum(1) filter (where status = 'dipinjam'), 0),
        'terlambat', coalesce(sum(1) filter (where status = 'dipinjam' and rencana_kembali < v_hari), 0),
        'periode', coalesce(sum(1) filter (where status <> 'dibatalkan' and (p_dari is null or tanggal_pinjam >= p_dari) and (p_sampai is null or tanggal_pinjam <= p_sampai)), 0),
        'bermasalah', coalesce(sum(1) filter (where status = 'dikembalikan' and (kembali_rusak + kembali_rusak_berat + kembali_hilang) > 0), 0))
      from public.sarpras_pinjam where npsn = v_npsn),
    'per_alat', (select coalesce(jsonb_agg(r order by r.kali desc, r.nama), '[]'::jsonb) from (
        select b.id, b.nama, coalesce(l.nama, 'Umum') as lab_nama, b.satuan,
               b.jumlah_baik, b.jumlah_rusak, b.jumlah_rusak_berat, b.jumlah_hilang, b.jumlah_total,
               count(k.id) filter (where k.status <> 'dibatalkan' and (p_dari is null or k.tanggal_pinjam >= p_dari) and (p_sampai is null or k.tanggal_pinjam <= p_sampai)) as kali,
               coalesce(sum(k.jumlah) filter (where k.status = 'dipinjam'), 0) as dipinjam,
               greatest(b.jumlah_baik - coalesce(sum(k.jumlah) filter (where k.status = 'dipinjam'), 0), 0) as tersedia
        from public.sarpras_barang b
        left join public.sarpras_lab l on l.id = b.lab_id
        left join public.sarpras_pinjam k on k.barang_id = b.id
        where b.npsn = v_npsn and b.dihapus_pada is null and b.kategori = 'alat'
        group by b.id, b.nama, l.nama, b.satuan, b.jumlah_baik, b.jumlah_rusak, b.jumlah_rusak_berat, b.jumlah_hilang, b.jumlah_total
        having count(k.id) > 0 or b.jumlah_total > 0
        limit 1000) r),
    'per_peminjam', (select coalesce(jsonb_agg(r order by r.kali desc, r.nama), '[]'::jsonb) from (
        select k.peminjam_nama as nama,
               count(*) filter (where k.status <> 'dibatalkan' and (p_dari is null or k.tanggal_pinjam >= p_dari) and (p_sampai is null or k.tanggal_pinjam <= p_sampai)) as kali,
               count(*) filter (where k.status = 'dipinjam') as sedang,
               count(*) filter (where k.status = 'dipinjam' and k.rencana_kembali < v_hari) as terlambat
        from public.sarpras_pinjam k
        where k.npsn = v_npsn
        group by k.peminjam_nama
        limit 1000) r));
end $fn$;

revoke execute on function private.sarpras_pinjam_nomor(text) from public, anon;
revoke execute on function public.sarpras_pinjam_alat(), public.sarpras_pinjam_daftar(text, text, date, date), public.sarpras_pinjam_catat(jsonb),
  public.sarpras_pinjam_kembali(uuid, numeric, numeric, numeric, text, date), public.sarpras_pinjam_batal(uuid, text),
  public.sarpras_pinjam_rekap(date, date) from public, anon;
grant execute on function public.sarpras_pinjam_alat(), public.sarpras_pinjam_daftar(text, text, date, date), public.sarpras_pinjam_catat(jsonb),
  public.sarpras_pinjam_kembali(uuid, numeric, numeric, numeric, text, date), public.sarpras_pinjam_batal(uuid, text),
  public.sarpras_pinjam_rekap(date, date) to authenticated;
