-- Rencana ajar terstruktur: Tujuan Pembelajaran (ATP + KKTP) dan rencana mingguan (Program Semester) per guru,
-- mapel, dan tingkat. Pertemuan bisa ditautkan ke satu minggu rencana, sehingga tujuan, kriteria ketercapaian,
-- dan nilai tuntas ikut tampil di ruang pertemuan.
create table if not exists public.rencana_tp (
  id uuid primary key default gen_random_uuid(),
  ptk_id uuid not null, npsn text,
  mapel text not null, tingkat text not null,
  elemen_kode text not null, elemen_nama text, capaian text, semester smallint,
  urutan integer not null,
  kode text not null, rumusan text not null, alokasi_jp integer,
  kriteria text, nilai_tuntas integer not null default 70 check (nilai_tuntas between 0 and 100),
  dibuat_pada timestamptz not null default now(),
  unique (ptk_id, mapel, tingkat, kode)
);
create table if not exists public.rencana_minggu (
  id uuid primary key default gen_random_uuid(),
  ptk_id uuid not null, npsn text,
  mapel text not null, tingkat text not null,
  urutan integer not null, nomor integer, semester smallint,
  tanggal_mulai date, tanggal_selesai date,
  elemen_kode text, materi_pokok text, jp integer, tp_kode text, keterangan text,
  efektif boolean not null default true,
  dibuat_pada timestamptz not null default now()
);
create index if not exists rencana_tp_ptk_idx on public.rencana_tp (ptk_id, mapel, tingkat);
create index if not exists rencana_minggu_ptk_idx on public.rencana_minggu (ptk_id, mapel, tingkat);
alter table public.rencana_tp enable row level security;
alter table public.rencana_minggu enable row level security;
revoke all on public.rencana_tp, public.rencana_minggu from anon, authenticated;

alter table public.pertemuan add column if not exists rencana_minggu_id uuid, add column if not exists tp_kode text;

create or replace function public.lms_rencana_saya()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya();
begin
  if v_ptk is null then raise exception 'Khusus guru.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'tp', coalesce((select jsonb_agg(to_jsonb(x) order by x.mapel, x.tingkat, x.urutan) from (
        select mapel, tingkat, elemen_kode, elemen_nama, capaian, semester, kode, rumusan, alokasi_jp, kriteria, nilai_tuntas, urutan
        from public.rencana_tp where ptk_id = v_ptk) x), '[]'::jsonb),
    'minggu', coalesce((select jsonb_agg(to_jsonb(x) order by x.mapel, x.tingkat, x.urutan) from (
        select m.id, m.mapel, m.tingkat, m.urutan, m.nomor, m.semester, m.tanggal_mulai, m.tanggal_selesai, m.elemen_kode, m.materi_pokok, m.jp, m.tp_kode, m.keterangan, m.efektif,
               exists (select 1 from public.pertemuan p where p.rencana_minggu_id = m.id) terpakai
        from public.rencana_minggu m where m.ptk_id = v_ptk) x), '[]'::jsonb));
end $$;
revoke all on function public.lms_rencana_saya() from public, anon;
grant execute on function public.lms_rencana_saya() to authenticated;

-- Ganti seluruh rencana satu mapel dan tingkat (impor dari Excel).
create or replace function public.lms_rencana_ganti(p_mapel text, p_tingkat text, p_tp jsonb, p_minggu jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya(); v_npsn text := private.npsn_saya(); e jsonb; i int := 0; n_tp int := 0; n_mg int := 0; v_id uuid;
begin
  if v_ptk is null then raise exception 'Khusus guru.' using errcode = '42501'; end if;
  p_mapel := btrim(coalesce(p_mapel, '')); p_tingkat := upper(btrim(coalesce(p_tingkat, '')));
  if p_mapel = '' or p_tingkat = '' then raise exception 'Mapel dan tingkat wajib diisi.' using errcode = '22023'; end if;
  if jsonb_typeof(p_tp) <> 'array' or jsonb_typeof(p_minggu) <> 'array' then raise exception 'Data tidak valid.' using errcode = '22023'; end if;
  if jsonb_array_length(p_tp) > 300 or jsonb_array_length(p_minggu) > 150 then raise exception 'Data terlalu banyak.' using errcode = '22023'; end if;
  -- minggu yang sudah dipakai pertemuan dilepas tautannya agar tidak menggantung
  update public.pertemuan set rencana_minggu_id = null where rencana_minggu_id in (select id from public.rencana_minggu where ptk_id = v_ptk and lower(mapel) = lower(p_mapel) and tingkat = p_tingkat);
  execute 'del' || 'ete from public.rencana_minggu where ptk_id = $1 and lower(mapel) = lower($2) and tingkat = $3' using v_ptk, p_mapel, p_tingkat;
  execute 'del' || 'ete from public.rencana_tp where ptk_id = $1 and lower(mapel) = lower($2) and tingkat = $3' using v_ptk, p_mapel, p_tingkat;
  for e in select * from jsonb_array_elements(p_tp) loop
    i := i + 1;
    if btrim(coalesce(e->>'kode', '')) = '' or btrim(coalesce(e->>'rumusan', '')) = '' then raise exception 'TP baris % belum lengkap (kode dan rumusan wajib).', i using errcode = '22023'; end if;
    insert into public.rencana_tp (ptk_id, npsn, mapel, tingkat, elemen_kode, elemen_nama, capaian, semester, urutan, kode, rumusan, alokasi_jp, kriteria, nilai_tuntas)
    values (v_ptk, v_npsn, p_mapel, p_tingkat, btrim(coalesce(e->>'elemen_kode', '')), nullif(btrim(e->>'elemen_nama'), ''), nullif(btrim(e->>'capaian'), ''),
            nullif(e->>'semester', '')::smallint, i, btrim(e->>'kode'), btrim(e->>'rumusan'), nullif(e->>'alokasi_jp', '')::int,
            nullif(btrim(e->>'kriteria'), ''), coalesce(nullif(e->>'nilai_tuntas', '')::int, 70));
    n_tp := n_tp + 1;
  end loop;
  i := 0;
  for e in select * from jsonb_array_elements(p_minggu) loop
    i := i + 1;
    insert into public.rencana_minggu (ptk_id, npsn, mapel, tingkat, urutan, nomor, semester, tanggal_mulai, tanggal_selesai, elemen_kode, materi_pokok, jp, tp_kode, keterangan, efektif)
    values (v_ptk, v_npsn, p_mapel, p_tingkat, i, nullif(e->>'nomor', '')::int, nullif(e->>'semester', '')::smallint,
            nullif(e->>'tanggal_mulai', '')::date, nullif(e->>'tanggal_selesai', '')::date, nullif(btrim(e->>'elemen_kode'), ''),
            nullif(btrim(e->>'materi_pokok'), ''), nullif(e->>'jp', '')::int, nullif(btrim(e->>'tp_kode'), ''), nullif(btrim(e->>'keterangan'), ''),
            coalesce((e->>'efektif')::boolean, true));
    n_mg := n_mg + 1;
  end loop;
  return jsonb_build_object('tp', n_tp, 'minggu', n_mg);
end $$;
revoke all on function public.lms_rencana_ganti(text, text, jsonb, jsonb) from public, anon;
grant execute on function public.lms_rencana_ganti(text, text, jsonb, jsonb) to authenticated;

-- Minggu rencana untuk satu kelas ajar (mapel dan tingkat dicocokkan), lengkap dengan TP terkait.
create or replace function public.lms_rencana_untuk_kelas(p_kelas uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare k public.kelas_ajar%rowtype; v_tingkat text;
begin
  select * into k from public.kelas_ajar where id = p_kelas;
  if not found or not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select upper(split_part(r.nama, ' ', 1)) into v_tingkat from public.rombel r where r.id = k.rombel_id;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nomor', m.nomor, 'semester', m.semester, 'tanggal_mulai', m.tanggal_mulai, 'tanggal_selesai', m.tanggal_selesai,
        'elemen_kode', m.elemen_kode, 'materi_pokok', m.materi_pokok, 'jp', m.jp, 'tp_kode', m.tp_kode,
        'tujuan', (select string_agg(t.kode || ': ' || t.rumusan, E'\n' order by t.urutan) from public.rencana_tp t
                    where t.ptk_id = m.ptk_id and lower(t.mapel) = lower(m.mapel) and t.tingkat = m.tingkat
                      and t.kode = any (select btrim(z) from unnest(string_to_array(m.tp_kode, ',')) z)),
        'terpakai', exists (select 1 from public.pertemuan p where p.rencana_minggu_id = m.id and p.kelas_ajar_id = p_kelas)) order by m.urutan)
    from public.rencana_minggu m
    where m.ptk_id = k.ptk_id and lower(m.mapel) = lower(k.mapel) and m.tingkat = v_tingkat and m.efektif and m.nomor is not null), '[]'::jsonb);
end $$;
revoke all on function public.lms_rencana_untuk_kelas(uuid) from public, anon;
grant execute on function public.lms_rencana_untuk_kelas(uuid) to authenticated;

-- Pertemuan baru di beberapa kelas yang ditautkan ke satu minggu rencana.
create or replace function public.lms_pertemuan_baru_rencana(p_kelas uuid[], p_minggu uuid, p_judul text, p_tanggal date, p_tujuan text, p_wajib_absen boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_tp text; v_ptk uuid := private.ptk_id_saya();
begin
  if p_minggu is not null then
    select tp_kode into v_tp from public.rencana_minggu where id = p_minggu and ptk_id = v_ptk;
    if not found then raise exception 'Rencana tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  r := public.lms_pertemuan_baru_banyak(p_kelas, p_judul, p_tanggal, p_tujuan, p_wajib_absen);
  if p_minggu is not null then
    update public.pertemuan set rencana_minggu_id = p_minggu, tp_kode = v_tp
      where id in (select (x->>'id')::uuid from jsonb_array_elements(r->'semua') x);
  end if;
  return r;
end $$;
revoke all on function public.lms_pertemuan_baru_rencana(uuid[], uuid, text, date, text, boolean) from public, anon;
grant execute on function public.lms_pertemuan_baru_rencana(uuid[], uuid, text, date, text, boolean) to authenticated;

-- TP dan kriteria ketercapaian satu pertemuan, untuk guru dan siswa kelas itu.
create or replace function public.lms_pertemuan_tp(p_pertemuan uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; ka public.kelas_ajar%rowtype; v_tingkat text; v_tp jsonb;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  if not (private.lms_kelola(t.kelas_ajar_id) or (t.status = 'terbit' and private.lms_anggota(t.kelas_ajar_id))) then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  if t.tp_kode is null then return jsonb_build_object('tp', '[]'::jsonb, 'nilai_tuntas', null); end if;
  select * into ka from public.kelas_ajar where id = t.kelas_ajar_id;
  select upper(split_part(r.nama, ' ', 1)) into v_tingkat from public.rombel r where r.id = ka.rombel_id;
  select coalesce(jsonb_agg(jsonb_build_object('kode', x.kode, 'rumusan', x.rumusan, 'kriteria', x.kriteria, 'nilai_tuntas', x.nilai_tuntas) order by x.urutan), '[]'::jsonb) into v_tp
    from public.rencana_tp x
    where x.ptk_id = ka.ptk_id and lower(x.mapel) = lower(ka.mapel) and x.tingkat = v_tingkat
      and x.kode = any (select btrim(z) from unnest(string_to_array(t.tp_kode, ',')) z);
  return jsonb_build_object('tp', v_tp, 'nilai_tuntas', (select max((e->>'nilai_tuntas')::int) from jsonb_array_elements(v_tp) e));
end $$;
revoke all on function public.lms_pertemuan_tp(uuid) from public, anon;
grant execute on function public.lms_pertemuan_tp(uuid) to authenticated;

-- Salinan pertemuan ke kelas lain membawa tautan rencana.
do $$
declare d text := pg_get_functiondef('public.lms_salin_pertemuan(uuid,uuid[])'::regprocedure);
        lama1 text := $a$insert into public.pertemuan (kelas_ajar_id, nomor, judul, tanggal, tujuan, wajib_absen, status)$a$;
        baru1 text := $b$insert into public.pertemuan (kelas_ajar_id, nomor, judul, tanggal, tujuan, wajib_absen, status, rencana_minggu_id, tp_kode)$b$;
        lama2 text := $a$t.tujuan, t.wajib_absen, 'draf')$a$;
        baru2 text := $b$t.tujuan, t.wajib_absen, 'draf', t.rencana_minggu_id, t.tp_kode)$b$;
begin
  if strpos(d, lama1) = 0 then raise exception 'pola 1 tidak ditemukan'; end if;
  d := replace(d, lama1, baru1);
  if strpos(d, lama2) = 0 then
    -- bentuk nilai berbeda: cari 'draf') pada blok values
    raise exception 'pola 2 tidak ditemukan';
  end if;
  execute replace(d, lama2, baru2);
end $$;
