-- Rekap "materi dibaca" hanya menghitung bahan bacaan (untuk siswa, bukan lembar kerja).
-- Sebelumnya lembar kerja ikut dihitung sebagai materi sehingga siswa yang sudah membaca tidak pernah tuntas.
do $$
declare d text; n text;
begin
  -- dashboard pertemuan
  d := pg_get_functiondef('public.lms_dashboard_pertemuan(uuid)'::regprocedure); n := d;
  n := replace(n, 'from public.materi m where m.pertemuan_id = sd.id and m.untuk = ''siswa'') total_materi', 'from public.materi m where m.pertemuan_id = sd.id and m.untuk = ''siswa'' and m.tugas_id is null) total_materi');
  n := replace(n, 'where pm.peserta_didik_id = agt.pd and m.pertemuan_id = k.id and m.untuk = ''siswa'') >= k.total_materi) materi_tuntas', 'where pm.peserta_didik_id = agt.pd and m.pertemuan_id = k.id and m.untuk = ''siswa'' and m.tugas_id is null) >= k.total_materi) materi_tuntas');
  n := replace(n, 'exists (select 1 from public.progres_materi pm join public.materi m on m.id = pm.materi_id
            where pm.peserta_didik_id = agt.pd and m.pertemuan_id = k.id and m.untuk = ''siswa'')) materi_mulai',
    'exists (select 1 from public.progres_mulai pm join public.materi m on m.id = pm.materi_id
            where pm.peserta_didik_id = agt.pd and m.pertemuan_id = k.id and m.untuk = ''siswa'' and m.tugas_id is null)) materi_mulai');
  if strpos(n, 'm.tugas_id is null) total_materi') = 0 or strpos(n, 'progres_mulai pm') = 0 or strpos(n, 'm.tugas_id is null) >= k.total_materi') = 0 then raise exception 'patch dashboard gagal'; end if;
  execute n;
  -- rekap terpadu
  d := pg_get_functiondef('public.lms_pertemuan_rekap_terpadu(uuid)'::regprocedure);
  n := replace(d, 'mat as (select m.id from public.materi m where m.pertemuan_id = t.id and m.untuk = ''siswa'')', 'mat as (select m.id from public.materi m where m.pertemuan_id = t.id and m.untuk = ''siswa'' and m.tugas_id is null)');
  if n = d then raise exception 'patch rekap gagal'; end if;
  execute n;
  -- ringkasan orang tua / siswa
  d := pg_get_functiondef('private.lms_kelas_ringkas(uuid)'::regprocedure);
  n := replace(d, 'where t.kelas_ajar_id = k.id and t.status = ''terbit'' and m.untuk = ''siswa''),', 'where t.kelas_ajar_id = k.id and t.status = ''terbit'' and m.untuk = ''siswa'' and m.tugas_id is null),');
  n := replace(n, 'where t.kelas_ajar_id = k.id and t.status = ''terbit'' and pm.peserta_didik_id = p_pd),', 'where t.kelas_ajar_id = k.id and t.status = ''terbit'' and m.untuk = ''siswa'' and m.tugas_id is null and pm.peserta_didik_id = p_pd),');
  if n = d then raise exception 'patch ringkas gagal'; end if;
  execute n;
end $$;
