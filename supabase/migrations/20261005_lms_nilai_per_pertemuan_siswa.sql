-- Nilai per pertemuan (M1, M2, dst.) ikut di ringkasan kelas, jadi tampil di Progres belajar siswa
-- dan di halaman orang tua. Angkanya dari private.lms_nilai_pertemuan_pd, aturan tidak berubah:
-- nilai dasar = KKTP begitu bacaan dan lembar kerja selesai, ditambah bonus kuis dan bonus forum, maksimal 100.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('private.lms_kelas_ringkas(uuid)'::regprocedure);
  n := replace(d, $a$'kuis', coalesce((select jsonb_agg(jsonb_build_object('judul', a.judul,$a$,
    $b$'pertemuan', coalesce((select jsonb_agg(jsonb_build_object(
                'id', pt.id, 'nomor', pt.nomor, 'judul', pt.judul,
                'nilai', private.lms_nilai_pertemuan_pd(pt.id, p_pd))
              order by pt.nomor nulls last, pt.tanggal)
              from public.pertemuan pt where pt.kelas_ajar_id = k.id and pt.status = 'terbit'), '[]'::jsonb),
      'kuis', coalesce((select jsonb_agg(jsonb_build_object('judul', a.judul,$b$);
  if n = d or strpos(n, '''pertemuan'', coalesce(') = 0 then raise exception 'patch lms_kelas_ringkas gagal'; end if;
  execute n;
end $$;
