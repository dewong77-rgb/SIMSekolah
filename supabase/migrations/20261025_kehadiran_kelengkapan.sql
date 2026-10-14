-- Kelengkapan kehadiran harian per rombel untuk satu minggu (Senin sampai Jumat).
-- Sel dianggap terisi bila siswa sudah punya status hari itu (catatan petugas atau izin disetujui).
-- Tenggat pengisian sekolah: paling lambat satu minggu; idealnya setiap hari. Libur nasional belum dikecualikan.
create or replace function public.kehadiran_kelengkapan(p_awal date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_semua boolean := private.kes_semua(array['kesiswaan.izin','kesiswaan.pantau']);
  v_rombel uuid[] := private.kes_rombel_saya(array['kesiswaan.izin','kesiswaan.pantau']);
  v_ini date := private.kes_hari();
  v_awal date;
begin
  if auth.uid() is null or not (v_semua or cardinality(v_rombel) > 0) then raise exception 'Anda tidak berwenang membuka kelengkapan kehadiran.'; end if;
  v_awal := coalesce(p_awal, v_ini) - (extract(isodow from coalesce(p_awal, v_ini))::int - 1);
  if v_awal > v_ini or v_awal < v_ini - 180 then raise exception 'Minggu di luar rentang yang dapat dibuka.'; end if;
  return (
    with hari as (select d::date as tgl from generate_series(v_awal, v_awal + 4, interval '1 day') d),
         rb as (
           select r.id, r.nama, r.tingkat from public.rombel r
            where r.npsn = private.npsn_saya() and r.jenis_rombel ilike '%utama%'
              and r.semester_id = (select max(semester_id) from public.rombel where npsn = private.npsn_saya())
              and (v_semua or r.id = any (v_rombel))),
         sw as (
           select k.rombel_id, k.peserta_didik_id as pd from public.keanggotaan_rombel k
             join rb on rb.id = k.rombel_id
             join public.peserta_didik p on p.id = k.peserta_didik_id and p.status_peserta_didik = 'aktif'),
         st as materialized (select s.pd, s.tanggal from private.kes_status_hari(v_awal, v_awal + 4) s)
    select jsonb_build_object('awal', v_awal, 'hari_ini', v_ini, 'baris', coalesce(jsonb_agg(jsonb_build_object(
        'id', rb.id, 'nama', rb.nama, 'jumlah', (select count(*) from sw where sw.rombel_id = rb.id),
        'hari', (select jsonb_agg(jsonb_build_object('tgl', h.tgl,
                   'terisi', (select count(*) from sw join st on st.pd = sw.pd and st.tanggal = h.tgl where sw.rombel_id = rb.id)) order by h.tgl)
                   from hari h)) order by rb.tingkat, rb.nama), '[]'::jsonb))
      from rb);
end $$;
revoke all on function public.kehadiran_kelengkapan(date) from public, anon;
grant execute on function public.kehadiran_kelengkapan(date) to authenticated;
