-- Ulangan dipisah: harian, tengah semester (UTS) dan akhir semester (UAS).
-- Nilai 'ulangan_semester' yang sudah ada dibaca sebagai UAS. Jenis baru: 'ulangan_tengah'.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.asesmen'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%ulangan_semester%' loop
    execute format('alter table public.asesmen drop constraint %I', c);
  end loop;
  alter table public.asesmen add constraint asesmen_jenis_check check (jenis in ('kuis','ulangan_harian','ulangan_tengah','ulangan_semester'));
end $$;

do $$
declare d text; n text; f text;
begin
  foreach f in array array['public.lms_asesmen_simpan(uuid,uuid,uuid,text,text,text,integer,timestamptz,timestamptz,integer,boolean,boolean,boolean)',
                           'public.lms_asesmen_atur(uuid,uuid,uuid,text,text,text,integer,timestamptz,timestamptz,integer,boolean,boolean,boolean,integer,numeric)'] loop
    d := pg_get_functiondef(f::regprocedure);
    n := replace(d, '(''kuis'',''ulangan_harian'',''ulangan_semester'')', '(''kuis'',''ulangan_harian'',''ulangan_tengah'',''ulangan_semester'')');
    if n = d then raise exception 'patch jenis gagal: %', f; end if;
    execute n;
  end loop;

  d := pg_get_functiondef('public.lms_nilai_kelas(uuid,jsonb)'::regprocedure);
  n := d;
  n := replace(n, '{"uh": 30, "uas": 30, "kuis": 20, "tugas": 20}', '{"uh": 20, "uts": 20, "uas": 20, "kuis": 20, "tugas": 20}');
  n := replace(n, 'w_uas numeric := coalesce((p_bobot ->> ''uas'')::numeric, 0);', 'w_uas numeric := coalesce((p_bobot ->> ''uas'')::numeric, 0);
        w_uts numeric := coalesce((p_bobot ->> ''uts'')::numeric, 0);');
  n := replace(n, 'when ''ulangan_harian'' then ''uh'' else ''uas'' end', 'when ''ulangan_harian'' then ''uh'' when ''ulangan_tengah'' then ''uts'' else ''uas'' end');
  n := replace(n, '''uh'', w_uh, ''uas'', w_uas)', '''uh'', w_uh, ''uts'', w_uts, ''uas'', w_uas)');
  n := replace(n, '(''uh'', w_uh), (''uas'', w_uas)', '(''uh'', w_uh), (''uts'', w_uts), (''uas'', w_uas)');
  if strpos(n, 'w_uts') = 0 or strpos(n, '''uts'', w_uts, ''uas''') = 0 or strpos(n, '(''uts'', w_uts), (''uas''') = 0 or strpos(n, 'then ''uts''') = 0 then raise exception 'patch nilai gagal'; end if;
  execute n;
end $$;
