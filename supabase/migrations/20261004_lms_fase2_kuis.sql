-- LMS fase 2: mesin asesmen (kuis per pertemuan; dipakai ulang untuk ulangan harian dan semester).
-- Tabel tanpa policy; akses lewat fungsi security definer. Kunci jawaban tidak pernah dikirim sebelum selesai.

create table public.asesmen (
  id uuid primary key default gen_random_uuid(),
  kelas_ajar_id uuid not null references public.kelas_ajar(id) on delete cascade,
  pertemuan_id uuid references public.pertemuan(id) on delete set null,
  jenis text not null default 'kuis' check (jenis in ('kuis','ulangan_harian','ulangan_semester')),
  judul text not null check (length(btrim(judul)) > 0),
  petunjuk text,
  durasi_menit integer not null default 15 check (durasi_menit between 1 and 300),
  buka timestamptz,
  tutup timestamptz,
  maks_percobaan integer not null default 1 check (maks_percobaan between 1 and 10),
  acak boolean not null default true,
  tampil_hasil boolean not null default true,
  status text not null default 'draf' check (status in ('draf','terbit')),
  dibuat_pada timestamptz not null default now(),
  check (buka is null or tutup is null or tutup > buka)
);

create table public.soal (
  id uuid primary key default gen_random_uuid(),
  asesmen_id uuid not null references public.asesmen(id) on delete cascade,
  urutan integer not null default 1,
  pertanyaan text not null check (length(btrim(pertanyaan)) > 0 and length(pertanyaan) <= 4000),
  opsi jsonb not null check (jsonb_typeof(opsi) = 'array' and jsonb_array_length(opsi) between 2 and 6),
  kunci integer not null check (kunci >= 0),
  bobot integer not null default 1 check (bobot between 1 and 100),
  pembahasan text check (pembahasan is null or length(pembahasan) <= 2000),
  dibuat_pada timestamptz not null default now()
);

create table public.percobaan_asesmen (
  id uuid primary key default gen_random_uuid(),
  asesmen_id uuid not null references public.asesmen(id) on delete cascade,
  peserta_didik_id uuid not null references public.peserta_didik(id),
  ke integer not null,
  mulai timestamptz not null default now(),
  batas_waktu timestamptz not null,
  selesai timestamptz,
  nilai numeric(5,2),
  susunan jsonb not null,
  unique (asesmen_id, peserta_didik_id, ke)
);

create table public.jawaban_asesmen (
  percobaan_id uuid not null references public.percobaan_asesmen(id) on delete cascade,
  soal_id uuid not null references public.soal(id) on delete cascade,
  pilihan integer not null,
  dijawab_pada timestamptz not null default now(),
  primary key (percobaan_id, soal_id)
);

create index asesmen_kelas_idx on public.asesmen(kelas_ajar_id);
create index asesmen_pertemuan_idx on public.asesmen(pertemuan_id);
create index soal_asesmen_idx on public.soal(asesmen_id);
create index percobaan_pd_idx on public.percobaan_asesmen(peserta_didik_id);
create index jawaban_soal_idx on public.jawaban_asesmen(soal_id);

alter table public.asesmen enable row level security;
alter table public.soal enable row level security;
alter table public.percobaan_asesmen enable row level security;
alter table public.jawaban_asesmen enable row level security;
revoke all on table public.asesmen, public.soal, public.percobaan_asesmen, public.jawaban_asesmen from anon, authenticated;

-- Fungsi bantu
create or replace function private.lms_kelola_asesmen(p_asesmen uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.lms_kelola(a.kelas_ajar_id) from public.asesmen a where a.id = p_asesmen), false)
$$;

create or replace function private.lms_selesaikan(p_percobaan uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; v_nilai numeric;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan for update;
  if not found then return null; end if;
  if p.selesai is not null then return p.nilai; end if;
  select coalesce(round(100.0 * sum(case when j.pilihan = s.kunci then s.bobot else 0 end) / nullif(sum(s.bobot), 0), 2), 0)
    into v_nilai
  from public.soal s
  left join public.jawaban_asesmen j on j.soal_id = s.id and j.percobaan_id = p.id
  where s.asesmen_id = p.asesmen_id;
  update public.percobaan_asesmen set selesai = now(), nilai = v_nilai where id = p.id;
  return v_nilai;
end $$;

-- Soal sesuai susunan acak siswa. Tanpa kunci kecuali diminta (setelah selesai).
create or replace function private.lms_paket(p_percobaan uuid, p_kunci boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'soal_id', s.id, 'pertanyaan', s.pertanyaan, 'bobot', s.bobot,
      'opsi', (select jsonb_agg(s.opsi -> (u.v::int) order by u.n)
               from jsonb_array_elements_text(e.value -> 'urut') with ordinality u(v, n)),
      'pilihan', (select (u.n - 1)::int from jsonb_array_elements_text(e.value -> 'urut') with ordinality u(v, n)
                  where u.v::int = j.pilihan),
      'benar', case when p_kunci then (select (u.n - 1)::int
                  from jsonb_array_elements_text(e.value -> 'urut') with ordinality u(v, n)
                  where u.v::int = s.kunci) end,
      'pembahasan', case when p_kunci then s.pembahasan end
    ) order by e.n), '[]'::jsonb)
  from public.percobaan_asesmen p
  cross join jsonb_array_elements(p.susunan) with ordinality e(value, n)
  join public.soal s on s.id = (e.value ->> 'soal')::uuid
  left join public.jawaban_asesmen j on j.percobaan_id = p.id and j.soal_id = s.id
  where p.id = p_percobaan
$$;

-- Pengelola: asesmen
create or replace function public.lms_asesmen_simpan(
  p_kelas uuid, p_id uuid, p_pertemuan uuid, p_jenis text, p_judul text, p_petunjuk text,
  p_durasi integer, p_buka timestamptz, p_tutup timestamptz, p_maks integer,
  p_acak boolean, p_tampil_hasil boolean, p_terbit boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_jenis not in ('kuis','ulangan_harian','ulangan_semester') then raise exception 'Jenis asesmen tidak valid.' using errcode = '22023'; end if;
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul wajib diisi.' using errcode = '22023'; end if;
  if p_durasi is null or p_durasi not between 1 and 300 then raise exception 'Durasi 1 sampai 300 menit.' using errcode = '22023'; end if;
  if p_maks is null or p_maks not between 1 and 10 then raise exception 'Kesempatan 1 sampai 10 kali.' using errcode = '22023'; end if;
  if p_buka is not null and p_tutup is not null and p_tutup <= p_buka then raise exception 'Waktu tutup harus setelah waktu buka.' using errcode = '22023'; end if;
  if p_pertemuan is not null and not exists (select 1 from public.pertemuan where id = p_pertemuan and kelas_ajar_id = p_kelas) then
    raise exception 'Pertemuan bukan milik kelas ini.' using errcode = '22023';
  end if;
  if p_terbit and p_id is not null and not exists (select 1 from public.soal where asesmen_id = p_id) then
    raise exception 'Tambahkan soal sebelum diterbitkan.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.asesmen (kelas_ajar_id, pertemuan_id, jenis, judul, petunjuk, durasi_menit, buka, tutup, maks_percobaan, acak, tampil_hasil, status)
    values (p_kelas, p_pertemuan, p_jenis, btrim(p_judul), nullif(btrim(coalesce(p_petunjuk, '')), ''), p_durasi, p_buka, p_tutup, p_maks,
            coalesce(p_acak, true), coalesce(p_tampil_hasil, true), 'draf')
    returning id into v_id;
  else
    update public.asesmen set
      pertemuan_id = p_pertemuan, jenis = p_jenis, judul = btrim(p_judul),
      petunjuk = nullif(btrim(coalesce(p_petunjuk, '')), ''), durasi_menit = p_durasi,
      buka = p_buka, tutup = p_tutup, maks_percobaan = p_maks,
      acak = coalesce(p_acak, acak), tampil_hasil = coalesce(p_tampil_hasil, tampil_hasil),
      status = case when p_terbit is null then status when p_terbit then 'terbit' else 'draf' end
    where id = p_id and kelas_ajar_id = p_kelas
    returning id into v_id;
    if v_id is null then raise exception 'Asesmen tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.lms_asesmen_hapus(p_asesmen uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.lms_kelola_asesmen(p_asesmen) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if exists (select 1 from public.percobaan_asesmen where asesmen_id = p_asesmen) then
    raise exception 'Sudah ada siswa yang mengerjakan. Ubah ke draf saja.' using errcode = '23503';
  end if;
  delete from public.asesmen where id = p_asesmen;
end $$;

create or replace function public.lms_asesmen_daftar(p_kelas uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_kelola boolean := private.lms_kelola(p_kelas); v_pd uuid := private.pd_id_saya();
begin
  if not v_kelola and not private.lms_anggota(p_kelas) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'jenis', a.jenis, 'judul', a.judul, 'petunjuk', a.petunjuk,
      'pertemuan_id', a.pertemuan_id,
      'pertemuan_nomor', (select t.nomor from public.pertemuan t where t.id = a.pertemuan_id),
      'durasi_menit', a.durasi_menit, 'buka', a.buka, 'tutup', a.tutup,
      'maks_percobaan', a.maks_percobaan, 'acak', a.acak, 'tampil_hasil', a.tampil_hasil,
      'status', a.status,
      'jumlah_soal', (select count(*) from public.soal s where s.asesmen_id = a.id),
      'terkunci', exists (select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id),
      'sudah_selesai', case when v_kelola then (select count(distinct p.peserta_didik_id) from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.selesai is not null) end,
      'percobaan_selesai', case when not v_kelola then (select count(*) from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.peserta_didik_id = v_pd and p.selesai is not null) end,
      'nilai_terbaik', case when not v_kelola then (select max(p.nilai) from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.peserta_didik_id = v_pd and p.selesai is not null) end,
      'berjalan', case when not v_kelola then exists (select 1 from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.peserta_didik_id = v_pd and p.selesai is null and p.batas_waktu + interval '5 seconds' > now()) end
    ) order by a.dibuat_pada)
    from public.asesmen a
    where a.kelas_ajar_id = p_kelas and (v_kelola or a.status = 'terbit')), '[]'::jsonb);
end $$;

-- Pengelola: soal (terkunci setelah ada yang mengerjakan)
create or replace function public.lms_soal_daftar(p_asesmen uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.lms_kelola_asesmen(p_asesmen) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'urutan', s.urutan, 'pertanyaan', s.pertanyaan, 'opsi', s.opsi,
      'kunci', s.kunci, 'bobot', s.bobot, 'pembahasan', s.pembahasan) order by s.urutan, s.dibuat_pada)
    from public.soal s where s.asesmen_id = p_asesmen), '[]'::jsonb);
end $$;

create or replace function public.lms_soal_simpan(
  p_asesmen uuid, p_id uuid, p_pertanyaan text, p_opsi jsonb, p_kunci integer, p_bobot integer, p_pembahasan text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n integer;
begin
  if not private.lms_kelola_asesmen(p_asesmen) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if exists (select 1 from public.percobaan_asesmen where asesmen_id = p_asesmen) then
    raise exception 'Soal terkunci karena sudah ada yang mengerjakan.' using errcode = '23503';
  end if;
  if btrim(coalesce(p_pertanyaan, '')) = '' then raise exception 'Pertanyaan wajib diisi.' using errcode = '22023'; end if;
  if p_opsi is null or jsonb_typeof(p_opsi) <> 'array' then raise exception 'Pilihan jawaban tidak valid.' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_opsi);
  if v_n not between 2 and 6 then raise exception 'Pilihan jawaban 2 sampai 6.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_opsi) o where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '') then
    raise exception 'Semua pilihan harus berisi teks.' using errcode = '22023';
  end if;
  if p_kunci is null or p_kunci not between 0 and v_n - 1 then raise exception 'Kunci jawaban tidak valid.' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.soal (asesmen_id, urutan, pertanyaan, opsi, kunci, bobot, pembahasan)
    values (p_asesmen, (select coalesce(max(urutan), 0) + 1 from public.soal where asesmen_id = p_asesmen),
            btrim(p_pertanyaan), p_opsi, p_kunci, coalesce(p_bobot, 1), nullif(btrim(coalesce(p_pembahasan, '')), ''))
    returning id into v_id;
  else
    update public.soal set pertanyaan = btrim(p_pertanyaan), opsi = p_opsi, kunci = p_kunci,
      bobot = coalesce(p_bobot, bobot), pembahasan = nullif(btrim(coalesce(p_pembahasan, '')), '')
    where id = p_id and asesmen_id = p_asesmen
    returning id into v_id;
    if v_id is null then raise exception 'Soal tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.lms_soal_hapus(p_soal uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_as uuid;
begin
  select asesmen_id into v_as from public.soal where id = p_soal;
  if v_as is null or not private.lms_kelola_asesmen(v_as) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if exists (select 1 from public.percobaan_asesmen where asesmen_id = v_as) then
    raise exception 'Soal terkunci karena sudah ada yang mengerjakan.' using errcode = '23503';
  end if;
  delete from public.soal where id = p_soal;
end $$;

-- Siswa: mengerjakan
create or replace function public.lms_asesmen_mulai(p_asesmen uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.asesmen%rowtype; p public.percobaan_asesmen%rowtype;
        v_pd uuid := private.pd_id_saya(); v_ke integer; v_susunan jsonb; v_batas timestamptz;
begin
  select * into a from public.asesmen where id = p_asesmen;
  if not found or v_pd is null or a.status <> 'terbit' or not private.lms_anggota(a.kelas_ajar_id) then
    raise exception 'Tidak tersedia.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_asesmen::text || v_pd::text));

  select * into p from public.percobaan_asesmen
    where asesmen_id = p_asesmen and peserta_didik_id = v_pd and selesai is null order by ke desc limit 1;
  if found then
    if now() <= p.batas_waktu + interval '5 seconds' then
      return jsonb_build_object('percobaan', p.id, 'batas_waktu', p.batas_waktu, 'sekarang', now(),
        'judul', a.judul, 'petunjuk', a.petunjuk, 'soal', private.lms_paket(p.id, false));
    end if;
    perform private.lms_selesaikan(p.id);
  end if;

  if a.buka is not null and now() < a.buka then raise exception 'Belum dibuka.' using errcode = 'P0001'; end if;
  if a.tutup is not null and now() > a.tutup then raise exception 'Sudah ditutup.' using errcode = 'P0001'; end if;
  if a.pertemuan_id is not null and not private.lms_gerbang_lolos(a.pertemuan_id) then
    raise exception 'Absen dulu sebelum mengerjakan.' using errcode = 'P0001', hint = 'gerbang_absen';
  end if;
  select count(*) into v_ke from public.percobaan_asesmen where asesmen_id = p_asesmen and peserta_didik_id = v_pd;
  if v_ke >= a.maks_percobaan then raise exception 'Kesempatan mengerjakan sudah habis.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.soal where asesmen_id = p_asesmen) then
    raise exception 'Soal belum tersedia.' using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_build_object('soal', s.id,
      'urut', (select jsonb_agg(g - 1 order by case when a.acak then random() else g::float8 end)
               from generate_series(1, jsonb_array_length(s.opsi)) g))
      order by case when a.acak then random() else s.urutan::float8 end, s.urutan)
    into v_susunan
  from public.soal s where s.asesmen_id = p_asesmen;

  v_batas := now() + make_interval(mins => a.durasi_menit);
  if a.tutup is not null and a.tutup < v_batas then v_batas := a.tutup; end if;
  insert into public.percobaan_asesmen (asesmen_id, peserta_didik_id, ke, batas_waktu, susunan)
  values (p_asesmen, v_pd, v_ke + 1, v_batas, v_susunan)
  returning * into p;
  return jsonb_build_object('percobaan', p.id, 'batas_waktu', p.batas_waktu, 'sekarang', now(),
    'judul', a.judul, 'petunjuk', a.petunjuk, 'soal', private.lms_paket(p.id, false));
end $$;

create or replace function public.lms_jawab(p_percobaan uuid, p_soal uuid, p_pilihan integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; v_asli integer;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan;
  if not found or p.peserta_didik_id is distinct from private.pd_id_saya() then
    raise exception 'Tidak tersedia.' using errcode = '42501';
  end if;
  if p.selesai is not null then return jsonb_build_object('ok', false, 'habis', true); end if;
  if now() > p.batas_waktu + interval '5 seconds' then
    perform private.lms_selesaikan(p.id);
    return jsonb_build_object('ok', false, 'habis', true);
  end if;
  if p_pilihan is null then
    delete from public.jawaban_asesmen where percobaan_id = p.id and soal_id = p_soal;
    return jsonb_build_object('ok', true);
  end if;
  select (e.value -> 'urut' ->> p_pilihan)::int into v_asli
    from jsonb_array_elements(p.susunan) e where e.value ->> 'soal' = p_soal::text;
  if v_asli is null then raise exception 'Jawaban tidak valid.' using errcode = '22023'; end if;
  insert into public.jawaban_asesmen (percobaan_id, soal_id, pilihan) values (p.id, p_soal, v_asli)
  on conflict (percobaan_id, soal_id) do update set pilihan = excluded.pilihan, dijawab_pada = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.lms_kirim(p_percobaan uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; a public.asesmen%rowtype; v_nilai numeric;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan;
  if not found or p.peserta_didik_id is distinct from private.pd_id_saya() then
    raise exception 'Tidak tersedia.' using errcode = '42501';
  end if;
  v_nilai := private.lms_selesaikan(p.id);
  select * into a from public.asesmen where id = p.asesmen_id;
  return jsonb_build_object('nilai', v_nilai, 'tampil_hasil', a.tampil_hasil,
    'tinjau', case when a.tampil_hasil then private.lms_paket(p.id, true) end);
end $$;

-- Pengelola: rekap
create or replace function public.lms_asesmen_rekap(p_asesmen uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.asesmen%rowtype;
begin
  select * into a from public.asesmen where id = p_asesmen;
  if not found or not private.lms_kelola(a.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'asesmen', jsonb_build_object('id', a.id, 'judul', a.judul, 'jenis', a.jenis),
    'siswa', coalesce((select jsonb_agg(jsonb_build_object(
        'peserta_didik_id', pd.id, 'nama', pd.nama, 'nisn', pd.nisn, 'no_urut', kr.no_urut,
        'percobaan', (select count(*) from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id),
        'status', case
          when exists (select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id and p.selesai is null and p.batas_waktu + interval '5 seconds' > now()) then 'berjalan'
          when exists (select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id) then 'selesai'
          else 'belum' end,
        'nilai_terbaik', (select max(p.nilai) from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id and p.selesai is not null),
        'nilai_terakhir', (select p.nilai from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id and p.selesai is not null order by p.ke desc limit 1)
      ) order by kr.no_urut nulls last, pd.nama)
      from public.keanggotaan_rombel kr
      join public.kelas_ajar k on k.rombel_id = kr.rombel_id
      join public.peserta_didik pd on pd.id = kr.peserta_didik_id
      where k.id = a.kelas_ajar_id), '[]'::jsonb));
end $$;

-- Pengelola: siapa sudah menandai materi selesai dan mengerjakan kuis pada satu pertemuan
create or replace function public.lms_progres_baca(p_pertemuan uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total_materi', (select count(*) from public.materi m where m.pertemuan_id = t.id),
    'total_kuis', (select count(*) from public.asesmen a where a.pertemuan_id = t.id and a.status = 'terbit'),
    'siswa', coalesce((select jsonb_agg(jsonb_build_object(
        'peserta_didik_id', pd.id,
        'materi_selesai', (select count(*) from public.progres_materi pm join public.materi m on m.id = pm.materi_id
                           where m.pertemuan_id = t.id and pm.peserta_didik_id = pd.id),
        'kuis_selesai', (select count(distinct p.asesmen_id) from public.percobaan_asesmen p join public.asesmen a on a.id = p.asesmen_id
                         where a.pertemuan_id = t.id and a.status = 'terbit' and p.peserta_didik_id = pd.id and p.selesai is not null)
      ))
      from public.keanggotaan_rombel kr
      join public.peserta_didik pd on pd.id = kr.peserta_didik_id
      where kr.rombel_id = (select k.rombel_id from public.kelas_ajar k where k.id = t.kelas_ajar_id)), '[]'::jsonb));
end $$;

-- Hak eksekusi: hanya pengguna masuk
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname like 'lms\_%') or (n.nspname = 'private' and p.proname like 'lms\_%')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
