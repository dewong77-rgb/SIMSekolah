-- Terpasang sebagai migrasi lms_fase6d_kuis_ragam_koreksi. Mulai, jawab, kirim, rekap, dan koreksi untuk kuis ragam soal.

create or replace function public.lms_asesmen_mulai(p_asesmen uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.asesmen%rowtype; p public.percobaan_asesmen%rowtype;
        v_pd uuid := private.pd_id_saya(); v_ke integer; v_susunan jsonb; v_batas timestamptz;
begin
  select * into a from public.asesmen where id = p_asesmen;
  if not found or v_pd is null or a.status <> 'terbit' or a.diarsipkan or not private.lms_anggota(a.kelas_ajar_id) then
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
  if not exists (select 1 from public.soal where asesmen_id = p_asesmen and not dihapus) then
    raise exception 'Soal belum tersedia.' using errcode = 'P0001';
  end if;

  -- Subset acak dari bank soal bila jumlah_tampil diisi. Urutan pilihan hanya untuk pilihan ganda.
  select jsonb_agg(jsonb_build_object('soal', x.id,
      'urut', case when x.tipe = 'pilgan' then (select jsonb_agg(g - 1 order by case when a.acak then random() else g::float8 end)
               from generate_series(1, jsonb_array_length(x.opsi)) g) end)
      order by case when a.acak then random() else x.urutan::float8 end, x.urutan)
    into v_susunan
  from (select s.id, s.tipe, s.opsi, s.urutan from public.soal s
        where s.asesmen_id = p_asesmen and not s.dihapus
        order by case when a.jumlah_tampil is not null then random() end
        limit coalesce(a.jumlah_tampil, 100000)) x;

  v_batas := now() + make_interval(mins => a.durasi_menit);
  if a.tutup is not null and a.tutup < v_batas then v_batas := a.tutup; end if;
  insert into public.percobaan_asesmen (asesmen_id, peserta_didik_id, ke, batas_waktu, susunan)
  values (p_asesmen, v_pd, v_ke + 1, v_batas, v_susunan)
  returning * into p;
  return jsonb_build_object('percobaan', p.id, 'batas_waktu', p.batas_waktu, 'sekarang', now(),
    'judul', a.judul, 'petunjuk', a.petunjuk, 'soal', private.lms_paket(p.id, false));
end $$;

create or replace function public.lms_jawab_isi(p_percobaan uuid, p_soal uuid, p_pilihan integer default null, p_teks text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; v_tipe text; v_asli integer; v_teks text; v_maks integer;
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
  if not exists (select 1 from jsonb_array_elements(p.susunan) e where e.value ->> 'soal' = p_soal::text) then
    raise exception 'Jawaban tidak valid.' using errcode = '22023';
  end if;
  select tipe into v_tipe from public.soal where id = p_soal;
  if v_tipe = 'pilgan' then
    if p_pilihan is null then return jsonb_build_object('ok', true); end if;
    select (e.value -> 'urut' ->> p_pilihan)::int into v_asli
      from jsonb_array_elements(p.susunan) e where e.value ->> 'soal' = p_soal::text;
    if v_asli is null then raise exception 'Jawaban tidak valid.' using errcode = '22023'; end if;
    insert into public.jawaban_asesmen (percobaan_id, soal_id, pilihan) values (p.id, p_soal, v_asli)
    on conflict (percobaan_id, soal_id) do update set pilihan = excluded.pilihan, dijawab_pada = now();
  else
    v_teks := btrim(coalesce(p_teks, ''));
    v_maks := 5000;
    if v_tipe = 'isian' then v_maks := 300; end if;
    if length(v_teks) > v_maks then
      raise exception 'Jawaban terlalu panjang.' using errcode = '22023';
    end if;
    insert into public.jawaban_asesmen (percobaan_id, soal_id, jawaban_teks) values (p.id, p_soal, nullif(v_teks, ''))
    on conflict (percobaan_id, soal_id) do update set jawaban_teks = excluded.jawaban_teks, dijawab_pada = now();
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Mengirim jawaban. Aman dipanggil ulang untuk percobaan yang sudah selesai (dipakai untuk melihat hasil).
create or replace function public.lms_kirim(p_percobaan uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; a public.asesmen%rowtype;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan;
  if not found or p.peserta_didik_id is distinct from private.pd_id_saya() then
    raise exception 'Tidak tersedia.' using errcode = '42501';
  end if;
  perform private.lms_selesaikan(p.id);
  select * into p from public.percobaan_asesmen where id = p_percobaan;
  select * into a from public.asesmen where id = p.asesmen_id;
  return jsonb_build_object('nilai', p.nilai, 'nilai_otomatis', p.nilai_otomatis, 'butuh_koreksi', p.butuh_koreksi,
    'kkm', a.kkm, 'tampil_hasil', a.tampil_hasil, 'judul', a.judul,
    'tinjau', case when a.tampil_hasil then private.lms_paket(p.id, true) end);
end $$;

create or replace function public.lms_asesmen_rekap(p_asesmen uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.asesmen%rowtype;
begin
  select * into a from public.asesmen where id = p_asesmen;
  if not found or not private.lms_kelola(a.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'asesmen', jsonb_build_object('id', a.id, 'judul', a.judul, 'jenis', a.jenis, 'kkm', a.kkm),
    'siswa', coalesce((select jsonb_agg(jsonb_build_object(
        'peserta_didik_id', pd.id, 'nama', pd.nama, 'nisn', pd.nisn, 'no_urut', kr.no_urut,
        'percobaan', (select count(*) from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id),
        'status', case
          when exists (select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id and p.selesai is null and p.batas_waktu + interval '5 seconds' > now()) then 'berjalan'
          when exists (select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id and p.selesai is not null and p.butuh_koreksi) then 'perlu_koreksi'
          when exists (select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id) then 'selesai'
          else 'belum' end,
        'nilai_terbaik', (select max(p.nilai) from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id and p.selesai is not null),
        'nilai_terakhir', (select p.nilai from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id and p.selesai is not null order by p.ke desc limit 1),
        'nilai_otomatis', (select max(p.nilai_otomatis) from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id and p.selesai is not null)
      ) order by kr.no_urut nulls last, pd.nama)
      from public.keanggotaan_rombel kr
      join public.kelas_ajar k on k.rombel_id = kr.rombel_id
      join public.peserta_didik pd on pd.id = kr.peserta_didik_id
      where k.id = a.kelas_ajar_id), '[]'::jsonb));
end $$;

create or replace function public.lms_koreksi_daftar(p_asesmen uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.lms_kelola_asesmen(p_asesmen) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'soal_id', s.id, 'tipe', s.tipe, 'pertanyaan', s.pertanyaan, 'bobot', s.bobot,
      'rubrik', s.rubrik, 'kunci_isian', s.kunci_isian,
      'jawaban', coalesce((select jsonb_agg(jsonb_build_object(
          'percobaan_id', p.id, 'peserta_didik_id', pd.id, 'nama', pd.nama, 'ke', p.ke,
          'teks', j.jawaban_teks, 'skor', j.skor, 'skor_rubrik', j.skor_rubrik, 'catatan_guru', j.catatan_guru,
          'dikoreksi', j.dikoreksi_pada is not null or j.skor is not null,
          'otomatis_benar', case when s.tipe = 'isian' then exists (
              select 1 from jsonb_array_elements_text(s.kunci_isian) k where private.lms_norm(k) = private.lms_norm(j.jawaban_teks)) end,
          'skor_efektif', private.lms_skor(s.id, p.id)
        ) order by pd.nama, p.ke)
        from public.jawaban_asesmen j
        join public.percobaan_asesmen p on p.id = j.percobaan_id and p.selesai is not null
        join public.peserta_didik pd on pd.id = p.peserta_didik_id
        where j.soal_id = s.id and btrim(coalesce(j.jawaban_teks, '')) <> ''), '[]'::jsonb)
    ) order by s.tipe desc, s.urutan)
    from public.soal s where s.asesmen_id = p_asesmen and not s.dihapus and s.tipe in ('esai', 'isian')), '[]'::jsonb);
end $$;

-- Skor esai: satu angka per kriteria rubrik. Skor soal = jumlah / total maksimum * bobot.
create or replace function public.lms_koreksi_simpan(p_percobaan uuid, p_soal uuid, p_skor jsonb, p_catatan text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; s public.soal%rowtype; v_maks numeric; v_sum numeric; v_n integer; v_skor numeric;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan;
  if not found or not private.lms_kelola_asesmen(p.asesmen_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p.selesai is null then raise exception 'Percobaan belum selesai.' using errcode = 'P0001'; end if;
  select * into s from public.soal where id = p_soal and asesmen_id = p.asesmen_id;
  if not found or s.tipe <> 'esai' then raise exception 'Soal bukan esai.' using errcode = '22023'; end if;
  if not exists (select 1 from public.jawaban_asesmen where percobaan_id = p.id and soal_id = s.id) then
    raise exception 'Belum ada jawaban.' using errcode = 'P0002';
  end if;
  v_n := jsonb_array_length(s.rubrik);
  if p_skor is null or jsonb_typeof(p_skor) <> 'array' or jsonb_array_length(p_skor) <> v_n then
    raise exception 'Skor harus satu per kriteria.' using errcode = '22023';
  end if;
  select sum((r.value ->> 'skor_maks')::numeric) into v_maks from jsonb_array_elements(s.rubrik) r;
  select sum(x.v::numeric) into v_sum from jsonb_array_elements_text(p_skor) x(v);
  if exists (select 1 from jsonb_array_elements(s.rubrik) with ordinality r(value, n)
             join jsonb_array_elements_text(p_skor) with ordinality x(v, n) using (n)
             where x.v::numeric < 0 or x.v::numeric > (r.value ->> 'skor_maks')::numeric) then
    raise exception 'Skor di luar rentang kriteria.' using errcode = '22023';
  end if;
  v_skor := round(v_sum / nullif(v_maks, 0) * s.bobot, 2);
  update public.jawaban_asesmen set skor_rubrik = p_skor, skor = coalesce(v_skor, 0),
    catatan_guru = nullif(btrim(coalesce(p_catatan, '')), ''), dikoreksi_pada = now()
  where percobaan_id = p.id and soal_id = s.id;
  return private.lms_hitung_nilai(p.id);
end $$;

-- Isian: guru menerima atau menolak jawaban secara manual. p_benar null mengembalikan ke penilaian otomatis.
create or replace function public.lms_koreksi_isian(p_percobaan uuid, p_soal uuid, p_benar boolean)
returns numeric language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; s public.soal%rowtype;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan;
  if not found or not private.lms_kelola_asesmen(p.asesmen_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p.selesai is null then raise exception 'Percobaan belum selesai.' using errcode = 'P0001'; end if;
  select * into s from public.soal where id = p_soal and asesmen_id = p.asesmen_id;
  if not found or s.tipe <> 'isian' then raise exception 'Soal bukan isian.' using errcode = '22023'; end if;
  update public.jawaban_asesmen set
    skor = case when p_benar is null then null when p_benar then s.bobot else 0 end,
    dikoreksi_pada = case when p_benar is null then null else now() end
  where percobaan_id = p.id and soal_id = s.id;
  if not found then raise exception 'Belum ada jawaban.' using errcode = 'P0002'; end if;
  return private.lms_hitung_nilai(p.id);
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.proname like 'lms\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
