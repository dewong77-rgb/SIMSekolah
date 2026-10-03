-- Terpasang sebagai migrasi lms_fase6a_tipe_soal_rubrik, lms_fase6b_penilaian_inti, lms_fase6c_soal_asesmen_baru.
-- Kuis ragam soal: pilihan ganda, isian singkat, esai dengan rubrik. Jumlah soal tampil, KKM, nilai sementara.
-- Catatan: fungsi lms_soal_simpan (7 argumen), lms_asesmen_simpan (13 argumen), dan lms_jawab(uuid,uuid,integer) dari fase 2
-- tetap ada sebagai versi lama yang tidak dipakai lagi. Aplikasi memakai lms_soal_tulis, lms_asesmen_atur, lms_jawab_isi.
-- Bagian 6a ditulis ulang dari catatan migrasi; 6b dan 6c adalah salinan badan fungsi dari basis data.

-- 6a. Skema
alter table public.soal drop constraint soal_opsi_check;
alter table public.soal alter column opsi drop not null;
alter table public.soal alter column kunci drop not null;
alter table public.soal
  add column tipe text not null default 'pilgan' check (tipe in ('pilgan', 'isian', 'esai')),
  add column kunci_isian jsonb,
  add column rubrik jsonb;
alter table public.soal add constraint soal_tipe_data_check check (
  (tipe = 'pilgan' and opsi is not null and kunci is not null)
  or (tipe = 'isian' and kunci_isian is not null and jsonb_array_length(kunci_isian) between 1 and 10)
  or (tipe = 'esai' and rubrik is not null and jsonb_array_length(rubrik) between 1 and 10));

alter table public.jawaban_asesmen alter column pilihan drop not null;
alter table public.jawaban_asesmen
  add column jawaban_teks text check (jawaban_teks is null or length(jawaban_teks) <= 5000),
  add column skor_rubrik jsonb,
  add column skor numeric(7,2),
  add column catatan_guru text,
  add column dikoreksi_pada timestamptz;

alter table public.asesmen
  add column jumlah_tampil integer check (jumlah_tampil is null or jumlah_tampil >= 1),
  add column kkm numeric(5,2) check (kkm is null or kkm between 0 and 100);

alter table public.percobaan_asesmen
  add column nilai_otomatis numeric(5,2),
  add column butuh_koreksi boolean not null default false;

-- 6b. Penilaian inti
create or replace function private.lms_norm(t text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'))
$$;

create or replace function private.lms_skor(p_soal uuid, p_percobaan uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case
    when j.skor is not null then j.skor
    when s.tipe = 'pilgan' then case when j.pilihan is not null and j.pilihan = s.kunci then s.bobot else 0 end
    when s.tipe = 'isian' then case when private.lms_norm(j.jawaban_teks) <> '' and exists (
        select 1 from jsonb_array_elements_text(s.kunci_isian) k where private.lms_norm(k) = private.lms_norm(j.jawaban_teks)
      ) then s.bobot else 0 end
    else 0 end
  from public.soal s
  left join public.jawaban_asesmen j on j.soal_id = s.id and j.percobaan_id = p_percobaan
  where s.id = p_soal
$$;

create or replace function private.lms_hitung_nilai(p_percobaan uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; v_total numeric; v_auto numeric; v_esai numeric; v_pending boolean; v_nilai numeric;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan;
  if not found then return null; end if;
  select coalesce(sum(s.bobot), 0),
         coalesce(sum(case when s.tipe <> 'esai' then private.lms_skor(s.id, p.id) else 0 end), 0),
         coalesce(sum(case when s.tipe = 'esai' then private.lms_skor(s.id, p.id) else 0 end), 0),
         coalesce(bool_or(s.tipe = 'esai' and btrim(coalesce(j.jawaban_teks, '')) <> '' and j.skor is null), false)
    into v_total, v_auto, v_esai, v_pending
  from jsonb_array_elements(p.susunan) e
  join public.soal s on s.id = (e.value ->> 'soal')::uuid
  left join public.jawaban_asesmen j on j.soal_id = s.id and j.percobaan_id = p.id;
  v_nilai := case when v_pending or v_total = 0 then null else round(100.0 * (v_auto + v_esai) / v_total, 2) end;
  update public.percobaan_asesmen
    set nilai_otomatis = case when v_total = 0 then 0 else round(100.0 * v_auto / v_total, 2) end,
        butuh_koreksi = v_pending, nilai = v_nilai
  where id = p.id;
  return v_nilai;
end $$;

create or replace function private.lms_selesaikan(p_percobaan uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan for update;
  if not found then return null; end if;
  if p.selesai is not null then return p.nilai; end if;
  update public.percobaan_asesmen set selesai = now() where id = p.id;
  return private.lms_hitung_nilai(p.id);
end $$;

create or replace function private.lms_paket(p_percobaan uuid, p_kunci boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'soal_id', s.id, 'tipe', s.tipe, 'pertanyaan', s.pertanyaan, 'bobot', s.bobot,
      'opsi', case when s.tipe = 'pilgan' then (select jsonb_agg(s.opsi -> (u.v::int) order by u.n)
               from jsonb_array_elements_text(e.value -> 'urut') with ordinality u(v, n)) end,
      'pilihan', case when s.tipe = 'pilgan' then (select (u.n - 1)::int from jsonb_array_elements_text(e.value -> 'urut') with ordinality u(v, n)
                  where u.v::int = j.pilihan) end,
      'teks', j.jawaban_teks,
      'rubrik', case when s.tipe = 'esai' then s.rubrik end,
      'benar', case when p_kunci and s.tipe = 'pilgan' then (select (u.n - 1)::int
                  from jsonb_array_elements_text(e.value -> 'urut') with ordinality u(v, n)
                  where u.v::int = s.kunci) end,
      'kunci_isian', case when p_kunci and s.tipe = 'isian' then s.kunci_isian end,
      'skor', case when p_kunci then private.lms_skor(s.id, p.id) end,
      'status_koreksi', case when p_kunci and s.tipe = 'esai' and btrim(coalesce(j.jawaban_teks, '')) <> '' and j.skor is null then 'menunggu' end,
      'skor_rubrik', case when p_kunci then j.skor_rubrik end,
      'catatan_guru', case when p_kunci then j.catatan_guru end,
      'pembahasan', case when p_kunci then s.pembahasan end
    ) order by e.n), '[]'::jsonb)
  from public.percobaan_asesmen p
  cross join jsonb_array_elements(p.susunan) with ordinality e(value, n)
  join public.soal s on s.id = (e.value ->> 'soal')::uuid
  left join public.jawaban_asesmen j on j.percobaan_id = p.id and j.soal_id = s.id
  where p.id = p_percobaan
$$;

-- 6c. Fungsi guru: tulis soal dan atur asesmen
create or replace function public.lms_soal_tulis(
  p_asesmen uuid, p_id uuid, p_tipe text, p_pertanyaan text, p_opsi jsonb, p_kunci integer,
  p_kunci_isian jsonb, p_rubrik jsonb, p_bobot integer, p_pembahasan text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n integer;
begin
  if not private.lms_kelola_asesmen(p_asesmen) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if exists (select 1 from public.percobaan_asesmen where asesmen_id = p_asesmen) then
    raise exception 'Soal terkunci karena sudah ada yang mengerjakan.' using errcode = '23503';
  end if;
  if p_tipe not in ('pilgan', 'isian', 'esai') then raise exception 'Tipe soal tidak valid.' using errcode = '22023'; end if;
  if btrim(coalesce(p_pertanyaan, '')) = '' then raise exception 'Pertanyaan wajib diisi.' using errcode = '22023'; end if;
  if p_bobot is null or p_bobot not between 1 and 100 then raise exception 'Bobot 1 sampai 100.' using errcode = '22023'; end if;

  if p_tipe = 'pilgan' then
    if p_opsi is null or jsonb_typeof(p_opsi) <> 'array' then raise exception 'Pilihan jawaban tidak valid.' using errcode = '22023'; end if;
    v_n := jsonb_array_length(p_opsi);
    if v_n not between 2 and 6 then raise exception 'Pilihan jawaban 2 sampai 6.' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements(p_opsi) o where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '') then
      raise exception 'Semua pilihan harus berisi teks.' using errcode = '22023';
    end if;
    if p_kunci is null or p_kunci not between 0 and v_n - 1 then raise exception 'Kunci jawaban tidak valid.' using errcode = '22023'; end if;
  elsif p_tipe = 'isian' then
    if p_kunci_isian is null or jsonb_typeof(p_kunci_isian) <> 'array' or jsonb_array_length(p_kunci_isian) not between 1 and 10 then
      raise exception 'Isi 1 sampai 10 jawaban yang diterima.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_kunci_isian) o where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '') then
      raise exception 'Jawaban yang diterima tidak boleh kosong.' using errcode = '22023';
    end if;
  else
    if p_rubrik is null or jsonb_typeof(p_rubrik) <> 'array' or jsonb_array_length(p_rubrik) not between 1 and 10 then
      raise exception 'Isi 1 sampai 10 kriteria rubrik.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_rubrik) o
               where jsonb_typeof(o) <> 'object' or btrim(coalesce(o ->> 'kriteria', '')) = ''
                  or coalesce(o ->> 'skor_maks', '') !~ '^[0-9]+$' or (o ->> 'skor_maks')::int not between 1 and 100) then
      raise exception 'Setiap kriteria perlu nama dan skor maksimum 1 sampai 100.' using errcode = '22023';
    end if;
  end if;

  if p_id is null then
    insert into public.soal (asesmen_id, urutan, tipe, pertanyaan, opsi, kunci, kunci_isian, rubrik, bobot, pembahasan)
    values (p_asesmen, (select coalesce(max(urutan), 0) + 1 from public.soal where asesmen_id = p_asesmen),
            p_tipe, btrim(p_pertanyaan),
            case when p_tipe = 'pilgan' then p_opsi end, case when p_tipe = 'pilgan' then p_kunci end,
            case when p_tipe = 'isian' then p_kunci_isian end, case when p_tipe = 'esai' then p_rubrik end,
            p_bobot, nullif(btrim(coalesce(p_pembahasan, '')), ''))
    returning id into v_id;
  else
    update public.soal set tipe = p_tipe, pertanyaan = btrim(p_pertanyaan),
      opsi = case when p_tipe = 'pilgan' then p_opsi end, kunci = case when p_tipe = 'pilgan' then p_kunci end,
      kunci_isian = case when p_tipe = 'isian' then p_kunci_isian end, rubrik = case when p_tipe = 'esai' then p_rubrik end,
      bobot = p_bobot, pembahasan = nullif(btrim(coalesce(p_pembahasan, '')), '')
    where id = p_id and asesmen_id = p_asesmen and not dihapus
    returning id into v_id;
    if v_id is null then raise exception 'Soal tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.lms_soal_daftar(p_asesmen uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.lms_kelola_asesmen(p_asesmen) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'urutan', s.urutan, 'tipe', s.tipe, 'pertanyaan', s.pertanyaan, 'opsi', s.opsi,
      'kunci', s.kunci, 'kunci_isian', s.kunci_isian, 'rubrik', s.rubrik, 'bobot', s.bobot, 'pembahasan', s.pembahasan)
      order by s.urutan, s.dibuat_pada)
    from public.soal s where s.asesmen_id = p_asesmen and not s.dihapus), '[]'::jsonb);
end $$;

create or replace function public.lms_asesmen_atur(
  p_kelas uuid, p_id uuid, p_pertemuan uuid, p_jenis text, p_judul text, p_petunjuk text, p_durasi integer,
  p_buka timestamptz, p_tutup timestamptz, p_maks integer, p_acak boolean, p_tampil_hasil boolean, p_terbit boolean,
  p_jumlah_tampil integer, p_kkm numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_bank integer;
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_jenis not in ('kuis','ulangan_harian','ulangan_semester') then raise exception 'Jenis asesmen tidak valid.' using errcode = '22023'; end if;
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul wajib diisi.' using errcode = '22023'; end if;
  if p_durasi is null or p_durasi not between 1 and 300 then raise exception 'Durasi 1 sampai 300 menit.' using errcode = '22023'; end if;
  if p_maks is null or p_maks not between 1 and 10 then raise exception 'Kesempatan 1 sampai 10 kali.' using errcode = '22023'; end if;
  if p_buka is not null and p_tutup is not null and p_tutup <= p_buka then raise exception 'Waktu tutup harus setelah waktu buka.' using errcode = '22023'; end if;
  if p_jumlah_tampil is not null and p_jumlah_tampil < 1 then raise exception 'Jumlah soal tampil minimal 1.' using errcode = '22023'; end if;
  if p_kkm is not null and p_kkm not between 0 and 100 then raise exception 'KKM 0 sampai 100.' using errcode = '22023'; end if;
  if p_pertemuan is not null and not exists (select 1 from public.pertemuan where id = p_pertemuan and kelas_ajar_id = p_kelas) then
    raise exception 'Pertemuan bukan milik kelas ini.' using errcode = '22023';
  end if;
  if p_id is not null then
    select count(*) into v_bank from public.soal where asesmen_id = p_id and not dihapus;
    if p_terbit and v_bank = 0 then raise exception 'Tambahkan soal sebelum diterbitkan.' using errcode = '22023'; end if;
    if p_jumlah_tampil is not null and v_bank > 0 and p_jumlah_tampil > v_bank then
      raise exception 'Jumlah soal tampil (%) melebihi bank soal (%).', p_jumlah_tampil, v_bank using errcode = '22023';
    end if;
  end if;
  if p_id is null then
    insert into public.asesmen (kelas_ajar_id, pertemuan_id, jenis, judul, petunjuk, durasi_menit, buka, tutup, maks_percobaan, acak, tampil_hasil, status, jumlah_tampil, kkm)
    values (p_kelas, p_pertemuan, p_jenis, btrim(p_judul), nullif(btrim(coalesce(p_petunjuk, '')), ''), p_durasi, p_buka, p_tutup, p_maks,
            coalesce(p_acak, true), coalesce(p_tampil_hasil, true), 'draf', p_jumlah_tampil, p_kkm)
    returning id into v_id;
  else
    update public.asesmen set
      pertemuan_id = p_pertemuan, jenis = p_jenis, judul = btrim(p_judul),
      petunjuk = nullif(btrim(coalesce(p_petunjuk, '')), ''), durasi_menit = p_durasi,
      buka = p_buka, tutup = p_tutup, maks_percobaan = p_maks,
      acak = coalesce(p_acak, acak), tampil_hasil = coalesce(p_tampil_hasil, tampil_hasil),
      jumlah_tampil = p_jumlah_tampil, kkm = p_kkm,
      status = case when p_terbit is null then status when p_terbit then 'terbit' else 'draf' end
    where id = p_id and kelas_ajar_id = p_kelas and not diarsipkan
    returning id into v_id;
    if v_id is null then raise exception 'Asesmen tidak ditemukan.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- lms_asesmen_daftar (versi fase 6): menambah jumlah_tampil, kkm, komposisi, perlu_koreksi, menunggu_koreksi, percobaan_terakhir.
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
      'jumlah_tampil', a.jumlah_tampil, 'kkm', a.kkm,
      'status', a.status,
      'jumlah_soal', (select count(*) from public.soal s where s.asesmen_id = a.id and not s.dihapus),
      'komposisi', (select jsonb_build_object(
          'pilgan', count(*) filter (where s.tipe = 'pilgan'), 'isian', count(*) filter (where s.tipe = 'isian'),
          'esai', count(*) filter (where s.tipe = 'esai'), 'total_bobot', coalesce(sum(s.bobot), 0))
          from public.soal s where s.asesmen_id = a.id and not s.dihapus),
      'terkunci', exists (select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id),
      'sudah_selesai', case when v_kelola then (select count(distinct p.peserta_didik_id) from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.selesai is not null) end,
      'perlu_koreksi', case when v_kelola then (select count(*) from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.selesai is not null and p.butuh_koreksi) end,
      'percobaan_selesai', case when not v_kelola then (select count(*) from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.peserta_didik_id = v_pd and p.selesai is not null) end,
      'nilai_terbaik', case when not v_kelola then (select max(p.nilai) from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.peserta_didik_id = v_pd and p.selesai is not null) end,
      'menunggu_koreksi', case when not v_kelola then (select count(*) from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.peserta_didik_id = v_pd and p.selesai is not null and p.butuh_koreksi) end,
      'percobaan_terakhir', case when not v_kelola then (select p.id from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.peserta_didik_id = v_pd and p.selesai is not null order by p.ke desc limit 1) end,
      'berjalan', case when not v_kelola then exists (select 1 from public.percobaan_asesmen p
                          where p.asesmen_id = a.id and p.peserta_didik_id = v_pd and p.selesai is null and p.batas_waktu + interval '5 seconds' > now()) end
    ) order by a.dibuat_pada)
    from public.asesmen a
    where a.kelas_ajar_id = p_kelas and not a.diarsipkan and (v_kelola or a.status = 'terbit')), '[]'::jsonb);
end $$;
