-- Lembar kerja isian: materi dokumen yang bisa diisi siswa langsung di aplikasi, dengan lampiran foto.
-- Lembar kerja = materi (format html) yang tertaut ke satu tugas (materi.tugas_id).
-- Jawaban disimpan sebagai peta { f0: "...", f1: "..." } sesuai urutan kolom isian di dokumen.

alter table public.materi add column if not exists tugas_id uuid references public.tugas(id) on delete set null;
alter table public.kumpul_tugas add column if not exists isian jsonb;
alter table public.kumpul_tugas drop constraint if exists kumpul_tugas_check;
alter table public.kumpul_tugas add constraint kumpul_tugas_check
  check (teks is not null or url is not null or isian is not null);

create table if not exists public.draf_tugas (
  tugas_id uuid not null references public.tugas(id) on delete cascade,
  peserta_didik_id uuid not null references public.peserta_didik(id),
  isian jsonb not null default '{}'::jsonb,
  catatan text check (catatan is null or length(catatan) <= 10000),
  url text check (url is null or url ~* '^https://'),
  diubah_pada timestamptz not null default now(),
  primary key (tugas_id, peserta_didik_id)
);
alter table public.draf_tugas enable row level security;

create table if not exists public.lampiran_tugas (
  id uuid primary key default gen_random_uuid(),
  tugas_id uuid not null references public.tugas(id) on delete cascade,
  peserta_didik_id uuid not null references public.peserta_didik(id),
  berkas_id uuid not null references public.berkas(id),
  dilepas boolean not null default false,
  dibuat_pada timestamptz not null default now()
);
create index if not exists lampiran_tugas_tp on public.lampiran_tugas (tugas_id, peserta_didik_id);
alter table public.lampiran_tugas enable row level security;

-- Helper: validasi peta isian
create or replace function private.lms_isian_valid(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if length(p::text) > 200000 then return false; end if;
  for k, v in select * from jsonb_each(p) loop
    n := n + 1;
    if n > 300 or k !~ '^f[0-9]{1,3}$' or jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 5000 then return false; end if;
  end loop;
  return true;
end $$;

-- Helper: akses siswa ke tugas lembar. Mengembalikan baris tugas.
create or replace function private.lms_lembar_siswa(p_tugas uuid) returns public.tugas
language plpgsql stable security definer set search_path = '' as $$
declare t public.tugas%rowtype; v_pd uuid := private.pd_id_saya();
begin
  select * into t from public.tugas where id = p_tugas;
  if not found or t.dihapus or t.status <> 'terbit' or v_pd is null or not private.lms_anggota(t.kelas_ajar_id) then
    raise exception 'Tidak tersedia.' using errcode = '42501';
  end if;
  if t.pertemuan_id is not null and not private.lms_gerbang_lolos(t.pertemuan_id) then
    raise exception 'Absen dulu di pertemuan terkait sebelum mengisi.' using errcode = 'P0001', hint = 'gerbang_absen';
  end if;
  return t;
end $$;

-- Jadikan materi dokumen sebagai lembar kerja (atau cabut).
create or replace function public.lms_materi_lembar(p_materi uuid, p_aktif boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.materi%rowtype; p public.pertemuan%rowtype; v_id uuid;
begin
  select * into m from public.materi where id = p_materi;
  if not found then raise exception 'Materi tidak ditemukan.' using errcode = 'P0002'; end if;
  select * into p from public.pertemuan where id = m.pertemuan_id;
  if not private.lms_kelola(p.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if coalesce(p_aktif, true) then
    if m.format <> 'html' or m.untuk <> 'siswa' then
      raise exception 'Hanya dokumen untuk siswa yang bisa dijadikan lembar kerja.' using errcode = '22023';
    end if;
    if m.tugas_id is not null then return m.tugas_id; end if;
    insert into public.tugas (kelas_ajar_id, pertemuan_id, judul, instruksi, terima_telat, nilai_maks, status)
    values (p.kelas_ajar_id, p.id, m.judul, 'Isi lembar kerja pada halaman pertemuan.', true, 100,
            case when p.status = 'terbit' then 'terbit' else 'draf' end)
    returning id into v_id;
    update public.materi set tugas_id = v_id where id = p_materi;
    return v_id;
  else
    if m.tugas_id is not null then
      update public.tugas set dihapus = true where id = m.tugas_id;
      update public.materi set tugas_id = null where id = p_materi;
    end if;
    return null;
  end if;
end $$;

-- Lembar saya: isian kerja, lampiran, status kumpul.
create or replace function public.lms_lembar_saya(p_tugas uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.tugas%rowtype; v_pd uuid := private.pd_id_saya(); d public.draf_tugas%rowtype; k public.kumpul_tugas%rowtype;
begin
  t := private.lms_lembar_siswa(p_tugas);
  select * into d from public.draf_tugas where tugas_id = p_tugas and peserta_didik_id = v_pd;
  select * into k from public.kumpul_tugas where tugas_id = p_tugas and peserta_didik_id = v_pd;
  return jsonb_build_object(
    'tenggat', t.tenggat, 'terima_telat', t.terima_telat, 'nilai_maks', t.nilai_maks,
    'isian', coalesce(case when d.tugas_id is not null then d.isian else k.isian end, '{}'::jsonb),
    'catatan', case when d.tugas_id is not null then d.catatan else k.teks end,
    'url', case when d.tugas_id is not null then d.url else k.url end,
    'dikumpul', k.tugas_id is not null,
    'dikumpul_pada', k.diubah_pada,
    'terlambat', k.terlambat,
    'ada_perubahan', k.tugas_id is not null and d.tugas_id is not null and d.diubah_pada > k.diubah_pada,
    'nilai', k.nilai,
    'umpan_balik', case when k.nilai is not null then k.umpan_balik end,
    'terkunci', k.nilai is not null,
    'lampiran', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'berkas_id', b.id, 'nama', b.nama_asli, 'mime', b.mime, 'ukuran', b.ukuran) order by l.dibuat_pada)
        from public.lampiran_tugas l join public.berkas b on b.id = l.berkas_id
        where l.tugas_id = p_tugas and l.peserta_didik_id = v_pd and not l.dilepas), '[]'::jsonb));
end $$;

create or replace function public.lms_lembar_simpan_draf(p_tugas uuid, p_isian jsonb, p_catatan text, p_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tugas%rowtype; v_pd uuid := private.pd_id_saya();
begin
  t := private.lms_lembar_siswa(p_tugas);
  if exists (select 1 from public.kumpul_tugas where tugas_id = p_tugas and peserta_didik_id = v_pd and nilai is not null) then
    raise exception 'Tugas sudah dinilai, tidak bisa diubah.' using errcode = 'P0001';
  end if;
  if not private.lms_isian_valid(coalesce(p_isian, '{}'::jsonb)) then raise exception 'Isian tidak valid atau terlalu panjang.' using errcode = '22023'; end if;
  if btrim(coalesce(p_url, '')) <> '' and btrim(p_url) !~* '^https://' then raise exception 'Tautan harus diawali https://.' using errcode = '22023'; end if;
  if length(coalesce(p_catatan, '')) > 10000 then raise exception 'Catatan terlalu panjang.' using errcode = '22023'; end if;
  insert into public.draf_tugas (tugas_id, peserta_didik_id, isian, catatan, url)
  values (p_tugas, v_pd, coalesce(p_isian, '{}'::jsonb), nullif(btrim(coalesce(p_catatan, '')), ''), nullif(btrim(coalesce(p_url, '')), ''))
  on conflict (tugas_id, peserta_didik_id) do update
    set isian = excluded.isian, catatan = excluded.catatan, url = excluded.url, diubah_pada = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.lms_lembar_kumpul(p_tugas uuid, p_isian jsonb, p_catatan text, p_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tugas%rowtype; v_pd uuid := private.pd_id_saya(); v_telat boolean; v_isi boolean; v_lamp int; v_isian jsonb := coalesce(p_isian, '{}'::jsonb);
begin
  t := private.lms_lembar_siswa(p_tugas);
  if exists (select 1 from public.kumpul_tugas where tugas_id = p_tugas and peserta_didik_id = v_pd and nilai is not null) then
    raise exception 'Tugas sudah dinilai, tidak bisa diubah.' using errcode = 'P0001';
  end if;
  if not private.lms_isian_valid(v_isian) then raise exception 'Isian tidak valid atau terlalu panjang.' using errcode = '22023'; end if;
  if btrim(coalesce(p_url, '')) <> '' and btrim(p_url) !~* '^https://' then raise exception 'Tautan harus diawali https://.' using errcode = '22023'; end if;
  if length(coalesce(p_catatan, '')) > 10000 then raise exception 'Catatan terlalu panjang.' using errcode = '22023'; end if;
  v_isi := exists (select 1 from jsonb_each_text(v_isian) e where btrim(e.value) <> '');
  select count(*) into v_lamp from public.lampiran_tugas where tugas_id = p_tugas and peserta_didik_id = v_pd and not dilepas;
  if not v_isi and v_lamp = 0 and btrim(coalesce(p_catatan, '')) = '' and btrim(coalesce(p_url, '')) = '' then
    raise exception 'Lembar masih kosong. Isi jawaban atau lampirkan foto.' using errcode = '22023';
  end if;
  v_telat := t.tenggat is not null and now() > t.tenggat;
  if v_telat and not t.terima_telat then raise exception 'Tenggat sudah lewat.' using errcode = 'P0001'; end if;
  insert into public.draf_tugas (tugas_id, peserta_didik_id, isian, catatan, url)
  values (p_tugas, v_pd, v_isian, nullif(btrim(coalesce(p_catatan, '')), ''), nullif(btrim(coalesce(p_url, '')), ''))
  on conflict (tugas_id, peserta_didik_id) do update
    set isian = excluded.isian, catatan = excluded.catatan, url = excluded.url, diubah_pada = now();
  insert into public.kumpul_tugas (tugas_id, peserta_didik_id, teks, url, isian, terlambat)
  values (p_tugas, v_pd, nullif(btrim(coalesce(p_catatan, '')), ''), nullif(btrim(coalesce(p_url, '')), ''), v_isian, v_telat)
  on conflict (tugas_id, peserta_didik_id) do update
    set teks = excluded.teks, url = excluded.url, isian = excluded.isian, diubah_pada = now(), terlambat = excluded.terlambat;
  -- samakan stempel agar tidak dianggap ada perubahan baru
  update public.draf_tugas d set diubah_pada = (select k.diubah_pada from public.kumpul_tugas k where k.tugas_id = p_tugas and k.peserta_didik_id = v_pd)
    where d.tugas_id = p_tugas and d.peserta_didik_id = v_pd;
  return jsonb_build_object('ok', true, 'terlambat', v_telat);
end $$;

create or replace function public.lms_lampiran_tambah(p_tugas uuid, p_berkas uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.tugas%rowtype; v_pd uuid := private.pd_id_saya(); b public.berkas%rowtype; v_id uuid;
begin
  t := private.lms_lembar_siswa(p_tugas);
  if exists (select 1 from public.kumpul_tugas where tugas_id = p_tugas and peserta_didik_id = v_pd and nilai is not null) then
    raise exception 'Tugas sudah dinilai, tidak bisa diubah.' using errcode = 'P0001';
  end if;
  select * into b from public.berkas where id = p_berkas and status = 'tersimpan' and dihapus_pada is null;
  if not found or b.kategori <> 'tugas_siswa' or b.rujukan_id is distinct from p_tugas or b.pemilik_user_id <> auth.uid() then
    raise exception 'Berkas tidak valid.' using errcode = '42501';
  end if;
  if exists (select 1 from public.lampiran_tugas where berkas_id = p_berkas) then raise exception 'Berkas sudah terlampir.' using errcode = '22023'; end if;
  if (select count(*) from public.lampiran_tugas where tugas_id = p_tugas and peserta_didik_id = v_pd and not dilepas) >= 8 then
    raise exception 'Maksimal 8 lampiran.' using errcode = '22023';
  end if;
  insert into public.lampiran_tugas (tugas_id, peserta_didik_id, berkas_id) values (p_tugas, v_pd, p_berkas) returning id into v_id;
  return v_id;
end $$;

create or replace function public.lms_lampiran_lepas(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.lampiran_tugas%rowtype; v_pd uuid := private.pd_id_saya();
begin
  select * into l from public.lampiran_tugas where id = p_id and peserta_didik_id = v_pd and v_pd is not null;
  if not found then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  if exists (select 1 from public.kumpul_tugas where tugas_id = l.tugas_id and peserta_didik_id = v_pd and nilai is not null) then
    raise exception 'Tugas sudah dinilai, tidak bisa diubah.' using errcode = 'P0001';
  end if;
  update public.lampiran_tugas set dilepas = true where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Guru: dokumen lembar + jawaban satu siswa.
create or replace function public.lms_lembar_jawaban(p_tugas uuid, p_pd uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.tugas%rowtype; k public.kumpul_tugas%rowtype;
begin
  select * into t from public.tugas where id = p_tugas;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select * into k from public.kumpul_tugas where tugas_id = p_tugas and peserta_didik_id = p_pd;
  return jsonb_build_object(
    'isian', coalesce(k.isian, '{}'::jsonb), 'catatan', k.teks, 'url', k.url, 'dikumpul_pada', k.diubah_pada,
    'lampiran', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'berkas_id', b.id, 'nama', b.nama_asli, 'mime', b.mime, 'ukuran', b.ukuran) order by l.dibuat_pada)
        from public.lampiran_tugas l join public.berkas b on b.id = l.berkas_id
        where l.tugas_id = p_tugas and l.peserta_didik_id = p_pd and not l.dilepas), '[]'::jsonb),
    'dokumen', (select m.isi from public.materi m where m.tugas_id = p_tugas limit 1));
end $$;

-- Patch fungsi lama
do $$
declare p jsonb; r jsonb[] := array[
  jsonb_build_object('fn', 'public.lms_materi_buka(uuid)',
    'lama', '''untuk'', m.untuk,', 'baru', '''untuk'', m.untuk, ''tugas_id'', case when t.status = ''terbit'' or v_kelola then m.tugas_id end,'),
  jsonb_build_object('fn', 'public.lms_simpan_pertemuan(uuid,uuid,text,date,text,boolean,boolean)',
    'lama', 'update public.asesmen set status = ''terbit''',
    'baru', 'update public.tugas set status = ''terbit'' where pertemuan_id = p_id and not dihapus and status <> ''terbit'' and id in (select tugas_id from public.materi where pertemuan_id = p_id and tugas_id is not null);' || chr(10) || '      update public.asesmen set status = ''terbit'''),
  jsonb_build_object('fn', 'public.lms_salin_pertemuan(uuid,uuid[])',
    'lama', 'na uuid;', 'baru', 'na uuid; nt uuid; mm record;'),
  jsonb_build_object('fn', 'public.lms_salin_pertemuan(uuid,uuid[])',
    'lama', 'from public.materi m where m.pertemuan_id = t.id;',
    'baru', 'from public.materi m where m.pertemuan_id = t.id;' || chr(10) ||
      '    for mm in select m.urutan, m.judul, m.tugas_id from public.materi m where m.pertemuan_id = t.id and m.tugas_id is not null loop' || chr(10) ||
      '      nt := null;' || chr(10) ||
      '      insert into public.tugas (kelas_ajar_id, pertemuan_id, judul, instruksi, terima_telat, nilai_maks, status)' || chr(10) ||
      '        select k, baru, x.judul, x.instruksi, x.terima_telat, x.nilai_maks, ''draf'' from public.tugas x where x.id = mm.tugas_id and not x.dihapus returning id into nt;' || chr(10) ||
      '      if nt is not null then update public.materi set tugas_id = nt where pertemuan_id = baru and urutan = mm.urutan and judul = mm.judul; end if;' || chr(10) ||
      '    end loop;'),
  jsonb_build_object('fn', 'public.lms_tugas_rekap(uuid)',
    'lama', '''nilai_maks'', t.nilai_maks, ''tenggat'', t.tenggat)',
    'baru', '''nilai_maks'', t.nilai_maks, ''tenggat'', t.tenggat, ''lembar'', exists (select 1 from public.materi mm where mm.tugas_id = t.id))'),
  jsonb_build_object('fn', 'public.lms_tugas_rekap(uuid)',
    'lama', '''teks'', k.teks, ''url'', k.url,',
    'baru', '''ada_isian'', k.isian is not null, ''jumlah_lampiran'', (select count(*) from public.lampiran_tugas l where l.tugas_id = t.id and l.peserta_didik_id = pd.id and not l.dilepas), ''teks'', k.teks, ''url'', k.url,'),
  jsonb_build_object('fn', 'public.lms_tugas_daftar(uuid)',
    'lama', '''nilai_maks'', t.nilai_maks, ''status'', t.status,',
    'baru', '''nilai_maks'', t.nilai_maks, ''lembar'', exists (select 1 from public.materi mm where mm.tugas_id = t.id), ''status'', t.status,'),
  jsonb_build_object('fn', 'public.lms_pertemuan_rekap_terpadu(uuid)',
    'lama', 'u.peserta_didik_id = agt.pd) forum_balasan' || chr(10) || '    from agt',
    'baru', 'u.peserta_didik_id = agt.pd) forum_balasan,' || chr(10) ||
      '      (select case when k.nilai is not null then ''dinilai'' else ''terkumpul'' end from public.kumpul_tugas k where k.peserta_didik_id = agt.pd and k.tugas_id in (select mm.tugas_id from public.materi mm where mm.pertemuan_id = t.id and mm.tugas_id is not null) limit 1) lembar_status,' || chr(10) ||
      '      (select max(k.nilai) from public.kumpul_tugas k where k.peserta_didik_id = agt.pd and k.tugas_id in (select mm.tugas_id from public.materi mm where mm.pertemuan_id = t.id and mm.tugas_id is not null)) lembar_nilai' || chr(10) || '    from agt'),
  jsonb_build_object('fn', 'public.lms_pertemuan_rekap_terpadu(uuid)',
    'lama', '''forum_topik'', s.forum_topik,', 'baru', '''lembar_status'', s.lembar_status, ''lembar_nilai'', s.lembar_nilai, ''forum_topik'', s.forum_topik,'),
  jsonb_build_object('fn', 'public.lms_pertemuan_rekap_terpadu(uuid)',
    'lama', '''total_materi'', (select count(*) from mat),', 'baru', '''total_lembar'', (select count(*) from public.materi mm where mm.pertemuan_id = t.id and mm.tugas_id is not null), ''total_materi'', (select count(*) from mat),')
];
  d text; i int;
begin
  foreach p in array r loop
    d := pg_get_functiondef((p->>'fn')::regprocedure);
    if strpos(d, p->>'lama') = 0 then raise exception 'Pola tidak ditemukan: % / %', p->>'fn', p->>'lama'; end if;
    d := replace(d, p->>'lama', p->>'baru');
    execute d;
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and p.proname in ('lms_materi_lembar','lms_lembar_saya','lms_lembar_simpan_draf','lms_lembar_kumpul','lms_lampiran_tambah','lms_lampiran_lepas','lms_lembar_jawaban','lms_isian_valid','lms_lembar_siswa')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
