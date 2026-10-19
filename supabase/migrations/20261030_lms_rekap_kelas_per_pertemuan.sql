-- Rekap kehadiran LMS: yang dihitung adalah keaktifan siswa di LMS (absen otomatis dari aktivitas atau kode),
-- bukan kehadiran kesiswaan. Penyebut = semua pertemuan terbit, bukan hanya yang absennya dibuka manual.
-- Ditambah daftar pertemuan dan status tiap siswa per pertemuan untuk matriks.

create or replace function public.lms_rekap_kelas(p_kelas uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return (
    with sesi as (
      select id, nomor, judul from public.pertemuan
      where kelas_ajar_id = p_kelas and status = 'terbit')
    select jsonb_build_object(
      'total_sesi', (select count(*) from sesi),
      'pertemuan', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nomor', s.nomor, 'judul', s.judul) order by s.nomor) from sesi s), '[]'::jsonb),
      'siswa', coalesce(jsonb_agg(jsonb_build_object(
        'peserta_didik_id', pd.id, 'nama', pd.nama, 'nisn', pd.nisn,
        'hadir', (select count(*) from public.absensi_pertemuan a where a.peserta_didik_id = pd.id and a.pertemuan_id in (select id from sesi) and a.status = 'hadir'),
        'izin',  (select count(*) from public.absensi_pertemuan a where a.peserta_didik_id = pd.id and a.pertemuan_id in (select id from sesi) and a.status = 'izin'),
        'sakit', (select count(*) from public.absensi_pertemuan a where a.peserta_didik_id = pd.id and a.pertemuan_id in (select id from sesi) and a.status = 'sakit'),
        'alpa',  (select count(*) from public.absensi_pertemuan a where a.peserta_didik_id = pd.id and a.pertemuan_id in (select id from sesi) and a.status = 'alpa'),
        'per_pertemuan', coalesce((select jsonb_object_agg(a.pertemuan_id, a.status) from public.absensi_pertemuan a
            where a.peserta_didik_id = pd.id and a.pertemuan_id in (select id from sesi)), '{}'::jsonb)
      ) order by kr.no_urut nulls last, pd.nama), '[]'::jsonb))
    from public.kelas_ajar k
    join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id
    join public.peserta_didik pd on pd.id = kr.peserta_didik_id
    where k.id = p_kelas);
end $$;
