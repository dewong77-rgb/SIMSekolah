-- Daftar pertemuan (sisi guru): hitung hadir LMS hanya dari siswa aktif di rombel, dan sertakan jumlah_siswa
-- sebagai penyebut ("34 dari 36 siswa"). Diubah lewat penggantian teks tetap seperti migrasi LMS lain.

do $$
declare
  d text := pg_get_functiondef('public.lms_pertemuan_daftar(uuid)'::regprocedure);
  n text;
begin
  n := replace(d, $a$where a.pertemuan_id = t.id and a.status = 'hadir') end,$a$,
    $b$where a.pertemuan_id = t.id and a.status = 'hadir'
                 and a.peserta_didik_id in (select kr.peserta_didik_id from public.kelas_ajar ka
                   join public.keanggotaan_rombel kr on kr.rombel_id = ka.rombel_id
                   join public.peserta_didik pd on pd.id = kr.peserta_didik_id
                   where ka.id = t.kelas_ajar_id and pd.status_peserta_didik = 'aktif')) end,
      'jumlah_siswa', case when v_kelola then (select count(*) from public.kelas_ajar ka
                   join public.keanggotaan_rombel kr on kr.rombel_id = ka.rombel_id
                   join public.peserta_didik pd on pd.id = kr.peserta_didik_id
                   where ka.id = t.kelas_ajar_id and pd.status_peserta_didik = 'aktif') end,$b$);
  if n = d or strpos(n, '''jumlah_siswa''') = 0 then raise exception 'pola hadir pada daftar pertemuan tidak ditemukan'; end if;
  execute n;
end $$;

-- Rekap kelas memakai himpunan siswa yang sama (aktif saja).
do $$
declare
  d text := pg_get_functiondef('public.lms_rekap_kelas(uuid)'::regprocedure);
  n text;
begin
  n := replace(d, $a$    where k.id = p_kelas);$a$, $b$    where k.id = p_kelas and pd.status_peserta_didik = 'aktif');$b$);
  if n = d then raise exception 'pola rekap kelas tidak ditemukan'; end if;
  execute n;
end $$;

revoke all on function public.lms_pertemuan_daftar(uuid), public.lms_rekap_kelas(uuid) from public, anon;
grant execute on function public.lms_pertemuan_daftar(uuid), public.lms_rekap_kelas(uuid) to authenticated;
