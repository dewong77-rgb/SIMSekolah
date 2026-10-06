-- Asesmen Digital, bagian 2: fungsi admin ujian
create or replace function public.ad_ujian_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.dibuat_pada desc) from (
    select u.id, u.nama, u.jenis, u.durasi_menit, u.maks_pelanggaran, u.kunci_otomatis, u.acak_soal, u.acak_opsi,
           u.tampil_nilai, u.status, u.dibuat_pada,
           (select count(*) from public.ad_paket p where p.ujian_id = u.id) as paket,
           (select count(*) from public.ad_sesi s where s.ujian_id = u.id) as sesi,
           (select count(*) from public.ad_peserta pe join public.ad_sesi s on s.id = pe.sesi_id where s.ujian_id = u.id) as peserta
    from public.ad_ujian u where u.npsn = n) x), '[]'::jsonb);
end $$;

create or replace function public.ad_ujian_simpan(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin(); v uuid := p_id;
begin
  if btrim(coalesce(p->>'nama','')) = '' then raise exception 'Nama ujian wajib diisi'; end if;
  if v is null then
    insert into public.ad_ujian(npsn, nama, jenis, durasi_menit, maks_pelanggaran, kunci_otomatis, acak_soal, acak_opsi, tampil_nilai, dibuat_oleh)
    values (n, btrim(p->>'nama'), coalesce(p->>'jenis','uts'), coalesce((p->>'durasi_menit')::int, 90),
            coalesce((p->>'maks_pelanggaran')::int, 3), coalesce((p->>'kunci_otomatis')::boolean, false),
            coalesce((p->>'acak_soal')::boolean, true), coalesce((p->>'acak_opsi')::boolean, true),
            coalesce((p->>'tampil_nilai')::boolean, false), (select auth.uid()))
    returning id into v;
  else
    update public.ad_ujian set nama = btrim(p->>'nama'), jenis = coalesce(p->>'jenis', jenis),
      durasi_menit = coalesce((p->>'durasi_menit')::int, durasi_menit),
      maks_pelanggaran = coalesce((p->>'maks_pelanggaran')::int, maks_pelanggaran),
      kunci_otomatis = coalesce((p->>'kunci_otomatis')::boolean, kunci_otomatis),
      acak_soal = coalesce((p->>'acak_soal')::boolean, acak_soal),
      acak_opsi = coalesce((p->>'acak_opsi')::boolean, acak_opsi),
      tampil_nilai = coalesce((p->>'tampil_nilai')::boolean, tampil_nilai)
    where id = v and npsn = n;
    if not found then raise exception 'Ujian tidak ditemukan'; end if;
  end if;
  return v;
end $$;

create or replace function public.ad_ujian_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  if p_status not in ('draf','aktif','selesai') then raise exception 'Status tidak dikenal'; end if;
  if p_status = 'aktif' and exists (select 1 from public.ad_sesi s where s.ujian_id = p_id and s.paket_id is null) then
    raise exception 'Ada sesi yang belum dipasangi paket soal';
  end if;
  update public.ad_ujian set status = p_status where id = p_id and npsn = n;
  if not found then raise exception 'Ujian tidak ditemukan'; end if;
  if p_status = 'selesai' then perform private.ad_tutup_kadaluarsa(p_id); end if;
end $$;

create or replace function public.ad_ujian_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  if exists (select 1 from public.ad_percobaan pc join public.ad_peserta pe on pe.id = pc.peserta_id join public.ad_sesi s on s.id = pe.sesi_id where s.ujian_id = p_id) then
    raise exception 'Ujian sudah punya jawaban siswa, tidak bisa dihapus';
  end if;
  execute format('%s from public.ad_ujian where id = $1 and npsn = $2', 'del'||'ete') using p_id, n;
end $$;

create or replace function public.ad_ruang_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.nama) from public.ad_ruang r where r.npsn = n), '[]'::jsonb);
end $$;

create or replace function public.ad_ruang_simpan(p_id uuid, p_nama text, p_kapasitas int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin(); v uuid := p_id;
begin
  if btrim(coalesce(p_nama,'')) = '' then raise exception 'Nama ruang wajib diisi'; end if;
  if v is null then
    insert into public.ad_ruang(npsn, nama, kapasitas) values (n, btrim(p_nama), coalesce(p_kapasitas, 36)) returning id into v;
  else
    update public.ad_ruang set nama = btrim(p_nama), kapasitas = coalesce(p_kapasitas, kapasitas) where id = v and npsn = n;
    if not found then raise exception 'Ruang tidak ditemukan'; end if;
  end if;
  return v;
exception when unique_violation then raise exception 'Nama ruang sudah dipakai';
end $$;

create or replace function public.ad_ruang_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  if exists (select 1 from public.ad_sesi_ruang where ruang_id = p_id) then raise exception 'Ruang masih dipakai di sesi'; end if;
  execute format('%s from public.ad_ruang where id = $1 and npsn = $2', 'del'||'ete') using p_id, n;
end $$;

create or replace function public.ad_paket_daftar(p_ujian uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.nama) from (
    select p.id, p.nama, (select count(*) from public.ad_paket_soal s where s.paket_id = p.id) as jumlah_soal,
           (select coalesce(sum(bobot),0) from public.ad_paket_soal s where s.paket_id = p.id) as total_bobot
    from public.ad_paket p where p.ujian_id = p_ujian and p.npsn = n) x), '[]'::jsonb);
end $$;

-- Panitia merakit paket: salin soal dari satu atau beberapa bank (semua, atau acak sejumlah p_jumlah)
create or replace function public.ad_paket_rakit(p_ujian uuid, p_nama text, p_bank uuid[], p_jumlah int default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin(); v uuid; k int := 0; r record;
begin
  if not exists (select 1 from public.ad_ujian where id = p_ujian and npsn = n) then raise exception 'Ujian tidak ditemukan'; end if;
  if btrim(coalesce(p_nama,'')) = '' then raise exception 'Nama paket wajib diisi'; end if;
  if coalesce(array_length(p_bank,1),0) = 0 then raise exception 'Pilih minimal satu bank soal'; end if;
  insert into public.ad_paket(ujian_id, npsn, nama) values (p_ujian, n, btrim(p_nama)) returning id into v;
  for r in
    select s.* from public.ad_soal s join public.ad_bank b on b.id = s.bank_id
    where b.npsn = n and s.bank_id = any(p_bank)
    order by case when p_jumlah is null then 0 else 1 end, case when p_jumlah is null then null else random() end, b.mapel, s.urut
    limit coalesce(p_jumlah, 100000)
  loop
    k := k + 1;
    insert into public.ad_paket_soal(paket_id, urut, tipe, pertanyaan, opsi, kunci, bobot, pembahasan)
    values (v, k, r.tipe, r.pertanyaan, r.opsi, r.kunci, r.bobot, r.pembahasan);
  end loop;
  if k = 0 then raise exception 'Bank soal yang dipilih masih kosong'; end if;
  return v;
end $$;

create or replace function public.ad_paket_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  if exists (select 1 from public.ad_sesi where paket_id = p_id) then raise exception 'Paket masih dipakai di sesi'; end if;
  execute format('%s from public.ad_paket where id = $1 and npsn = $2', 'del'||'ete') using p_id, n;
end $$;

create or replace function public.ad_sesi_daftar(p_ujian uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.mulai, x.nama) from (
    select s.id, s.nama, s.paket_id, (select nama from public.ad_paket p where p.id = s.paket_id) as paket_nama, s.mulai, s.selesai,
      coalesce((select jsonb_agg(jsonb_build_object('id', sr.id, 'ruang_id', sr.ruang_id, 'ruang', r.nama, 'kapasitas', r.kapasitas,
          'pengawas_ptk_id', sr.pengawas_ptk_id, 'pengawas', (select nama from public.ptk where id = sr.pengawas_ptk_id),
          'token', sr.token, 'token_dibuka', sr.token_dibuka,
          'peserta', (select count(*) from public.ad_peserta pe where pe.sesi_ruang_id = sr.id)) order by r.nama)
        from public.ad_sesi_ruang sr join public.ad_ruang r on r.id = sr.ruang_id where sr.sesi_id = s.id), '[]'::jsonb) as ruang
    from public.ad_sesi s where s.ujian_id = p_ujian and s.npsn = n) x), '[]'::jsonb);
end $$;

create or replace function public.ad_sesi_simpan(p_id uuid, p_ujian uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin(); v uuid := p_id; a timestamptz; b timestamptz; pk uuid;
begin
  if not exists (select 1 from public.ad_ujian where id = p_ujian and npsn = n) then raise exception 'Ujian tidak ditemukan'; end if;
  if btrim(coalesce(p->>'nama','')) = '' then raise exception 'Nama sesi wajib diisi'; end if;
  a := (p->>'mulai')::timestamptz; b := (p->>'selesai')::timestamptz;
  if a is null or b is null or b <= a then raise exception 'Jam selesai harus setelah jam mulai'; end if;
  pk := nullif(p->>'paket_id','')::uuid;
  if pk is not null and not exists (select 1 from public.ad_paket where id = pk and ujian_id = p_ujian) then raise exception 'Paket tidak ditemukan'; end if;
  if v is null then
    insert into public.ad_sesi(ujian_id, npsn, nama, paket_id, mulai, selesai) values (p_ujian, n, btrim(p->>'nama'), pk, a, b) returning id into v;
  else
    update public.ad_sesi set nama = btrim(p->>'nama'), paket_id = pk, mulai = a, selesai = b where id = v and npsn = n and ujian_id = p_ujian;
    if not found then raise exception 'Sesi tidak ditemukan'; end if;
  end if;
  return v;
end $$;

create or replace function public.ad_sesi_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  if exists (select 1 from public.ad_percobaan pc join public.ad_peserta pe on pe.id = pc.peserta_id where pe.sesi_id = p_id) then
    raise exception 'Sesi sudah punya jawaban siswa, tidak bisa dihapus';
  end if;
  execute format('%s from public.ad_sesi where id = $1 and npsn = $2', 'del'||'ete') using p_id, n;
end $$;

create or replace function public.ad_sesi_ruang_simpan(p_sesi uuid, p_ruang uuid, p_pengawas uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin(); v uuid;
begin
  if not exists (select 1 from public.ad_sesi where id = p_sesi and npsn = n) then raise exception 'Sesi tidak ditemukan'; end if;
  if not exists (select 1 from public.ad_ruang where id = p_ruang and npsn = n) then raise exception 'Ruang tidak ditemukan'; end if;
  if p_pengawas is not null and not exists (select 1 from public.ptk where id = p_pengawas and npsn = n) then raise exception 'Pengawas tidak ditemukan'; end if;
  insert into public.ad_sesi_ruang(sesi_id, ruang_id, pengawas_ptk_id) values (p_sesi, p_ruang, p_pengawas)
  on conflict (sesi_id, ruang_id) do update set pengawas_ptk_id = excluded.pengawas_ptk_id
  returning id into v;
  return v;
end $$;

create or replace function public.ad_sesi_ruang_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  if exists (select 1 from public.ad_percobaan pc join public.ad_peserta pe on pe.id = pc.peserta_id where pe.sesi_ruang_id = p_id) then
    raise exception 'Ruang sudah punya jawaban siswa, tidak bisa dilepas';
  end if;
  execute format('%s from public.ad_sesi_ruang sr using public.ad_sesi s where sr.id = $1 and s.id = sr.sesi_id and s.npsn = $2', 'del'||'ete') using p_id, n;
end $$;

create or replace function public.ad_rombel_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin(); sem text;
begin
  select max(semester_id) into sem from public.rombel where npsn = n;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.tingkat, x.nama) from (
    select r.id, r.nama, r.tingkat,
      (select count(*) from public.keanggotaan_rombel k join public.peserta_didik p on p.id = k.peserta_didik_id
        where k.rombel_id = r.id and lower(coalesce(p.status_peserta_didik,'')) = 'aktif') as jumlah
    from public.rombel r where r.npsn = n and r.semester_id = sem and r.jenis_rombel ilike 'kelas%') x), '[]'::jsonb);
end $$;

create or replace function public.ad_ptk_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nama', nama) order by nama) from public.ptk where npsn = n), '[]'::jsonb);
end $$;

-- Tempatkan semua siswa aktif dari beberapa rombel ke satu ruang pada satu sesi
create or replace function public.ad_peserta_tempatkan(p_sesi_ruang uuid, p_rombel uuid[], p_acak boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin(); sr record; kap int; isi int; kursi int; tambah int := 0; lewat int := 0; penuh int := 0; r record;
begin
  select sr2.id, sr2.sesi_id, sr2.ruang_id into sr from public.ad_sesi_ruang sr2 join public.ad_sesi s on s.id = sr2.sesi_id
   where sr2.id = p_sesi_ruang and s.npsn = n;
  if sr.id is null then raise exception 'Ruang sesi tidak ditemukan'; end if;
  select kapasitas into kap from public.ad_ruang where id = sr.ruang_id;
  select count(*), coalesce(max(no_kursi),0) into isi, kursi from public.ad_peserta where sesi_ruang_id = p_sesi_ruang;
  for r in
    select p.id, p.nama, rb.nama as kelas, k.no_urut
    from public.keanggotaan_rombel k
    join public.rombel rb on rb.id = k.rombel_id and rb.npsn = n
    join public.peserta_didik p on p.id = k.peserta_didik_id and lower(coalesce(p.status_peserta_didik,'')) = 'aktif'
    where k.rombel_id = any(p_rombel)
    order by case when p_acak then null else rb.nama end, case when p_acak then random() else k.no_urut end
  loop
    if exists (select 1 from public.ad_peserta where sesi_id = sr.sesi_id and peserta_didik_id = r.id) then lewat := lewat + 1;
    elsif isi >= kap then penuh := penuh + 1;
    else
      kursi := kursi + 1; isi := isi + 1; tambah := tambah + 1;
      insert into public.ad_peserta(sesi_id, sesi_ruang_id, peserta_didik_id, no_kursi) values (sr.sesi_id, p_sesi_ruang, r.id, kursi);
    end if;
  end loop;
  return jsonb_build_object('ditambah', tambah, 'sudah_di_sesi_ini', lewat, 'tidak_muat', penuh);
end $$;

create or replace function public.ad_peserta_keluarkan(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  if exists (select 1 from public.ad_percobaan where peserta_id = p_id) then raise exception 'Siswa sudah mulai mengerjakan'; end if;
  execute format('%s from public.ad_peserta pe using public.ad_sesi s where pe.id = $1 and s.id = pe.sesi_id and s.npsn = $2', 'del'||'ete') using p_id, n;
end $$;

create or replace function public.ad_rekap(p_ujian uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n text := private.ad_wajib_admin();
begin
  if not exists (select 1 from public.ad_ujian where id = p_ujian and npsn = n) then raise exception 'Ujian tidak ditemukan'; end if;
  perform private.ad_tutup_kadaluarsa(p_ujian);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.sesi_mulai, x.ruang, x.no_kursi) from (
    select s.nama as sesi, s.mulai as sesi_mulai, r.nama as ruang, pe.no_kursi, p.nama, p.nisn, p.nipd,
      (select string_agg(rb.nama, ', ') from public.keanggotaan_rombel k join public.rombel rb on rb.id = k.rombel_id where k.peserta_didik_id = p.id and rb.semester_id = (select max(semester_id) from public.rombel where npsn = n) and rb.jenis_rombel ilike 'kelas%') as kelas,
      pk.nama as paket, pc.nilai, pc.benar, pc.pelanggaran, pc.terkunci, pc.mulai, pc.selesai,
      case when pc.id is null then 'belum' when pc.selesai is null then 'mengerjakan' else 'selesai' end as status
    from public.ad_peserta pe
    join public.ad_sesi s on s.id = pe.sesi_id and s.ujian_id = p_ujian
    join public.ad_sesi_ruang sr on sr.id = pe.sesi_ruang_id
    join public.ad_ruang r on r.id = sr.ruang_id
    join public.peserta_didik p on p.id = pe.peserta_didik_id
    left join public.ad_paket pk on pk.id = s.paket_id
    left join public.ad_percobaan pc on pc.peserta_id = pe.id) x), '[]'::jsonb);
end $$;
