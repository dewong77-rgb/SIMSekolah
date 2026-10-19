-- Rekap guru lintas kelas: ukurannya pengerjaan di LMS (dikerjakan / belum), bukan hadir/izin/sakit/alpa.
-- Penyebut = semua pertemuan terbit, bukan hanya yang absennya dibuka manual.
-- Kunci lama (hadir, izin, sakit, alpa, siswa_alpa) tetap dikirim agar halaman lama tidak rusak sebelum deploy:
-- hadir = dikerjakan, alpa = belum dikerjakan, izin dan sakit = 0.
create or replace function public.lms_absensi_guru()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  with kls as (
    select k.id, k.mapel, r.id rombel_id, r.nama rombel
    from public.kelas_ajar k join public.rombel r on r.id = k.rombel_id
    where k.aktif and private.lms_kelola(k.id)
  ), agt as (
    select kls.id kelas, pd.id pd, kr.no_urut
    from kls join public.keanggotaan_rombel kr on kr.rombel_id = kls.rombel_id
    join public.peserta_didik pd on pd.id = kr.peserta_didik_id
    where pd.status_peserta_didik = 'aktif'
  ), sesi as (
    select t.id, t.kelas_ajar_id kelas, t.nomor, t.judul, t.tanggal
    from public.pertemuan t join kls on kls.id = t.kelas_ajar_id
    where t.status = 'terbit'
  ), abs as (
    select s.kelas, s.id sesi, a.peserta_didik_id pd, a.status
    from sesi s join public.absensi_pertemuan a on a.pertemuan_id = s.id
    join agt on agt.kelas = s.kelas and agt.pd = a.peserta_didik_id
    where a.status = 'hadir'
  ), per_siswa as (
    select agt.kelas, agt.pd, count(abs.pd) selesai
    from agt left join abs on abs.kelas = agt.kelas and abs.pd = agt.pd
    group by agt.kelas, agt.pd
  ), ringkas as (
    select kls.id kelas,
      (select count(*) from agt where agt.kelas = kls.id) jumlah_siswa,
      (select count(*) from sesi where sesi.kelas = kls.id) n_sesi,
      (select count(*) from abs where abs.kelas = kls.id) dikerjakan
    from kls
  )
  select jsonb_build_object(
    'total_kelas', (select count(*) from kls),
    'total_rombel', (select count(distinct rombel_id) from kls),
    'total_siswa', (select count(distinct pd) from agt),
    'kelas', coalesce((select jsonb_agg(jsonb_build_object(
      'kelas_id', kls.id, 'mapel', kls.mapel, 'rombel', kls.rombel,
      'jumlah_siswa', rk.jumlah_siswa,
      'sesi', rk.n_sesi,
      'dikerjakan', rk.dikerjakan,
      'belum', greatest(rk.jumlah_siswa * rk.n_sesi - rk.dikerjakan, 0),
      'siswa_belum', (select count(*) from per_siswa ps where ps.kelas = kls.id and rk.n_sesi - ps.selesai >= 3),
      'hadir', rk.dikerjakan, 'izin', 0, 'sakit', 0,
      'alpa', greatest(rk.jumlah_siswa * rk.n_sesi - rk.dikerjakan, 0),
      'siswa_alpa', (select count(*) from per_siswa ps where ps.kelas = kls.id and rk.n_sesi - ps.selesai >= 3),
      'pertemuan', coalesce((select jsonb_agg(jsonb_build_object(
          'id', sesi.id, 'nomor', sesi.nomor, 'judul', sesi.judul, 'tanggal', sesi.tanggal,
          'dikerjakan', (select count(*) from abs where abs.sesi = sesi.id),
          'belum', greatest(rk.jumlah_siswa - (select count(*) from abs where abs.sesi = sesi.id), 0),
          'hadir', (select count(*) from abs where abs.sesi = sesi.id), 'izin', 0, 'sakit', 0,
          'alpa', greatest(rk.jumlah_siswa - (select count(*) from abs where abs.sesi = sesi.id), 0)
        ) order by sesi.nomor) from sesi where sesi.kelas = kls.id), '[]'::jsonb)
    ) order by kls.rombel, kls.mapel)
      from kls join ringkas rk on rk.kelas = kls.id), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function public.lms_absensi_guru() from public, anon;
grant execute on function public.lms_absensi_guru() to authenticated;
