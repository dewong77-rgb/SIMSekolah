-- Sarpras, bagian C: pembukuan memuat empat kondisi, laporan kerusakan, permintaan, dan stok menipis.
-- Ringkasan (lencana menu) menghitung pekerjaan yang menunggu tindakan pengguna untuk usulan, kerusakan, dan permintaan.

create or replace function public.sarpras_buku() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare v_npsn text := private.npsn_saya();
begin
  if not private.sarpras_boleh_lihat() or v_npsn is null then return null; end if;
  return jsonb_build_object(
    'per_kategori', (select coalesce(jsonb_agg(r order by r.kategori), '[]'::jsonb) from (
        select b.kategori, count(*) as jenis_barang, sum(b.jumlah_baik) as baik, sum(b.jumlah_rusak) as rusak,
               sum(b.jumlah_rusak_berat) as rusak_berat, sum(b.jumlah_hilang) as hilang,
               sum(b.jumlah_total * coalesce(b.harga_satuan, 0)) as nilai
        from public.sarpras_barang b where b.npsn = v_npsn and b.dihapus_pada is null group by b.kategori) r),
    'per_lab', (select coalesce(jsonb_agg(r order by r.lab_nama), '[]'::jsonb) from (
        select coalesce(l.nama, 'Tanpa bengkel atau lab (umum)') as lab_nama, l.program, count(*) as jenis_barang,
               sum(b.jumlah_baik) as baik, sum(b.jumlah_rusak) as rusak, sum(b.jumlah_rusak_berat) as rusak_berat, sum(b.jumlah_hilang) as hilang,
               sum(b.jumlah_total * coalesce(b.harga_satuan, 0)) as nilai
        from public.sarpras_barang b left join public.sarpras_lab l on l.id = b.lab_id
        where b.npsn = v_npsn and b.dihapus_pada is null group by l.nama, l.program) r),
    'usulan', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) from (
        select status, count(*) as n from public.sarpras_usulan where npsn = v_npsn group by status) s),
    'kerusakan', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) from (
        select status, count(*) as n from public.sarpras_kerusakan where npsn = v_npsn group by status) s),
    'permintaan', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) from (
        select status, count(*) as n from public.sarpras_permintaan where npsn = v_npsn group by status) s),
    'stok_menipis', (select coalesce(jsonb_agg(r order by r.nama), '[]'::jsonb) from (
        select b.nama, coalesce(l.nama, 'Umum') as lab_nama, b.kategori, b.jumlah_baik, b.stok_minimum, b.satuan
        from public.sarpras_barang b left join public.sarpras_lab l on l.id = b.lab_id
        where b.npsn = v_npsn and b.dihapus_pada is null and b.stok_minimum is not null and b.jumlah_baik <= b.stok_minimum
        limit 100) r),
    'dapodik', jsonb_build_object(
        'ruang', (select count(*) from public.prasarana where npsn = v_npsn),
        'luas_m2', (select coalesce(sum(panjang * lebar), 0) from public.prasarana where npsn = v_npsn),
        'jenis_sarana', (select count(*) from public.sarana where npsn = v_npsn),
        'sarana_laik', (select coalesce(sum(laik), 0) from public.sarana where npsn = v_npsn),
        'sarana_tidak_laik', (select coalesce(sum(tidak_laik), 0) from public.sarana where npsn = v_npsn)));
end $fn$;

create or replace function public.sarpras_ringkasan() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'izin', public.sarpras_izin(),
    'perlu_aksi', (select count(*) from public.sarpras_usulan u where u.npsn = private.npsn_saya()
        and ((u.status = 'menunggu_kaprog' and private.sarpras_boleh_program(u.program))
          or (u.status = 'menunggu_waka' and private.sarpras_boleh_kelola())
          or (u.status = 'dikembalikan' and private.sarpras_boleh_lab(u.lab_id)))),
    'perlu_kerusakan', (select count(*) from public.sarpras_kerusakan k where k.npsn = private.npsn_saya()
        and k.status in ('dilaporkan', 'diproses') and private.sarpras_boleh_operasional()),
    'perlu_permintaan', (select count(*) from public.sarpras_permintaan m where m.npsn = private.npsn_saya()
        and ((m.status = 'menunggu_kaprog' and private.sarpras_boleh_program(m.program))
          or (m.status in ('menunggu_staf', 'disiapkan') and private.sarpras_boleh_operasional())
          or (m.status = 'dikembalikan' and private.sarpras_boleh_lab(m.lab_id)))))
  where auth.uid() is not null
$fn$;
