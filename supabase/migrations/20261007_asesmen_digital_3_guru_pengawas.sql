-- Asesmen Digital, bagian 3: bank soal (guru) dan pengawas
create or replace function private.ad_bisa_bank() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.ad_admin() or coalesce((select peran in ('guru','staf','admin_tu') from public.profil_pengguna where user_id = (select auth.uid())), false)
$$;

create or replace function private.ad_bank_milik(p_bank uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ad_bank b where b.id = p_bank and b.npsn = private.npsn_saya()
                  and (b.pemilik = (select auth.uid()) or private.ad_admin()))
$$;

create or replace function public.ad_bank_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := private.npsn_saya();
begin
  if not private.ad_bisa_bank() then raise exception 'Tidak berwenang'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.mapel, x.judul) from (
    select b.id, b.mapel, b.tingkat, b.judul, b.dibuat_pada, (b.pemilik = (select auth.uid())) as milik_saya,
           coalesce((select pg.nama from public.profil_pengguna pp join public.ptk pg on pg.id = pp.ptk_id where pp.user_id = b.pemilik), 'Admin') as pemilik_nama,
           (select count(*) from public.ad_soal s where s.bank_id = b.id) as jumlah_soal
    from public.ad_bank b where b.npsn = n and (b.pemilik = (select auth.uid()) or private.ad_admin())) x), '[]'::jsonb);
end $$;

create or replace function public.ad_bank_simpan(p_id uuid, p_mapel text, p_tingkat int, p_judul text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := private.npsn_saya(); v uuid := p_id;
begin
  if not private.ad_bisa_bank() then raise exception 'Tidak berwenang'; end if;
  if btrim(coalesce(p_mapel,'')) = '' or btrim(coalesce(p_judul,'')) = '' then raise exception 'Mapel dan judul wajib diisi'; end if;
  if v is null then
    insert into public.ad_bank(npsn, mapel, tingkat, judul, pemilik) values (n, btrim(p_mapel), p_tingkat, btrim(p_judul), (select auth.uid())) returning id into v;
  else
    if not private.ad_bank_milik(v) then raise exception 'Bank soal bukan milik Anda'; end if;
    update public.ad_bank set mapel = btrim(p_mapel), tingkat = p_tingkat, judul = btrim(p_judul) where id = v;
  end if;
  return v;
end $$;

create or replace function public.ad_bank_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.ad_bank_milik(p_id) then raise exception 'Bank soal bukan milik Anda'; end if;
  execute format('%s from public.ad_bank where id = $1', 'del'||'ete') using p_id;
end $$;

create or replace function public.ad_soal_daftar(p_bank uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.ad_bank_milik(p_bank) then raise exception 'Bank soal bukan milik Anda'; end if;
  return coalesce((select jsonb_agg(to_jsonb(s) order by s.urut, s.id) from public.ad_soal s where s.bank_id = p_bank), '[]'::jsonb);
end $$;

create or replace function private.ad_soal_masuk(p_bank uuid, p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := p_id; t text := coalesce(p->>'tipe','pilgan'); o jsonb := coalesce(p->'opsi','[]'::jsonb); k text := btrim(coalesce(p->>'kunci','')); b numeric := coalesce(nullif(p->>'bobot','')::numeric, 1); u int;
begin
  if btrim(coalesce(p->>'pertanyaan','')) = '' then raise exception 'Pertanyaan wajib diisi'; end if;
  if t not in ('pilgan','isian') then raise exception 'Tipe soal belum didukung: %', t; end if;
  if b <= 0 then raise exception 'Bobot harus lebih dari 0'; end if;
  if t = 'pilgan' then
    if jsonb_typeof(o) <> 'array' or jsonb_array_length(o) < 2 then raise exception 'Pilihan ganda butuh minimal 2 opsi'; end if;
    if k !~ '^[0-9]+$' or k::int >= jsonb_array_length(o) then raise exception 'Kunci pilihan ganda tidak valid'; end if;
  else
    o := '[]'::jsonb;
    if k = '' then raise exception 'Kunci isian wajib diisi'; end if;
  end if;
  if v is null then
    select coalesce(max(urut),0) + 1 into u from public.ad_soal where bank_id = p_bank;
    insert into public.ad_soal(bank_id, urut, tipe, pertanyaan, opsi, kunci, bobot, pembahasan)
    values (p_bank, u, t, btrim(p->>'pertanyaan'), o, k, b, nullif(btrim(coalesce(p->>'pembahasan','')),'')) returning id into v;
  else
    update public.ad_soal set tipe = t, pertanyaan = btrim(p->>'pertanyaan'), opsi = o, kunci = k, bobot = b,
      pembahasan = nullif(btrim(coalesce(p->>'pembahasan','')),'') where id = v and bank_id = p_bank;
    if not found then raise exception 'Soal tidak ditemukan'; end if;
  end if;
  return v;
end $$;

create or replace function public.ad_soal_simpan(p_bank uuid, p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not private.ad_bank_milik(p_bank) then raise exception 'Bank soal bukan milik Anda'; end if;
  return private.ad_soal_masuk(p_bank, p_id, p);
end $$;

create or replace function public.ad_soal_impor(p_bank uuid, p jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare e jsonb; k int := 0;
begin
  if not private.ad_bank_milik(p_bank) then raise exception 'Bank soal bukan milik Anda'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'Tidak ada soal untuk diimpor'; end if;
  if jsonb_array_length(p) > 500 then raise exception 'Maksimal 500 soal sekali impor'; end if;
  for e in select * from jsonb_array_elements(p) loop
    k := k + 1;
    begin perform private.ad_soal_masuk(p_bank, null, e);
    exception when others then raise exception 'Soal nomor %: %', k, sqlerrm; end;
  end loop;
  return k;
end $$;

create or replace function public.ad_soal_hapus(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.ad_soal s where s.id = p_id and private.ad_bank_milik(s.bank_id)) then raise exception 'Soal tidak ditemukan'; end if;
  execute format('%s from public.ad_soal where id = $1', 'del'||'ete') using p_id;
end $$;

-- Pengawas
create or replace function public.ad_pengawas_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n text := private.npsn_saya(); pk uuid := private.ptk_id_saya();
begin
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.mulai) from (
    select sr.id, u.nama as ujian, u.durasi_menit, s.nama as sesi, s.mulai, s.selesai, r.nama as ruang,
           (select nama from public.ad_paket where id = s.paket_id) as mapel, sr.token, sr.token_dibuka,
           (select count(*) from public.ad_peserta pe where pe.sesi_ruang_id = sr.id) as peserta
    from public.ad_sesi_ruang sr join public.ad_sesi s on s.id = sr.sesi_id join public.ad_ujian u on u.id = s.ujian_id
    join public.ad_ruang r on r.id = sr.ruang_id
    where s.npsn = n and u.status = 'aktif' and sr.pengawas_ptk_id = pk and pk is not null and s.selesai > now() - interval '1 day') x), '[]'::jsonb);
end $$;

create or replace function public.ad_token_atur(p_sr uuid, p_aksi text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t text; i int; abjad text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; r record;
begin
  if not private.ad_kelola_sr(p_sr) then raise exception 'Bukan pengawas ruang ini'; end if;
  if p_aksi not in ('buka','tutup','baru') then raise exception 'Aksi tidak dikenal'; end if;
  select sr.token, sr.token_dibuka into r from public.ad_sesi_ruang sr where sr.id = p_sr;
  if p_aksi in ('buka','baru') and not exists (select 1 from public.ad_sesi_ruang sr join public.ad_sesi s on s.id = sr.sesi_id join public.ad_ujian u on u.id = s.ujian_id where sr.id = p_sr and u.status = 'aktif') then
    raise exception 'Ujian belum diaktifkan';
  end if;
  if p_aksi = 'tutup' then
    update public.ad_sesi_ruang set token_dibuka = false where id = p_sr;
  else
    t := r.token;
    if p_aksi = 'baru' or t is null then
      t := '';
      for i in 1..6 loop t := t || substr(abjad, 1 + floor(random() * 32)::int, 1); end loop;
    end if;
    update public.ad_sesi_ruang set token = t, token_dibuka = true where id = p_sr;
  end if;
  return (select jsonb_build_object('token', token, 'token_dibuka', token_dibuka) from public.ad_sesi_ruang where id = p_sr);
end $$;

create or replace function public.ad_pantau(p_sr uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uj uuid;
begin
  if not private.ad_kelola_sr(p_sr) then raise exception 'Bukan pengawas ruang ini'; end if;
  select s.ujian_id into uj from public.ad_sesi_ruang sr join public.ad_sesi s on s.id = sr.sesi_id where sr.id = p_sr;
  perform private.ad_tutup_kadaluarsa(uj);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.no_kursi) from (
    select pe.id as peserta_id, pe.no_kursi, p.nama, p.nisn, pc.id as percobaan_id, pc.mulai, pc.batas, pc.selesai, pc.nilai,
           coalesce(pc.pelanggaran,0) as pelanggaran, coalesce(pc.terkunci,false) as terkunci,
           (select count(*) from public.ad_jawaban j where j.percobaan_id = pc.id and j.jawaban is not null and j.jawaban <> '') as terjawab,
           case when pc.id is null then 'belum' when pc.selesai is null then 'mengerjakan' else 'selesai' end as status
    from public.ad_peserta pe join public.peserta_didik p on p.id = pe.peserta_didik_id
    left join public.ad_percobaan pc on pc.peserta_id = pe.id
    where pe.sesi_ruang_id = p_sr) x), '[]'::jsonb);
end $$;

create or replace function public.ad_kunci(p_percobaan uuid, p_kunci boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare sr uuid;
begin
  select pe.sesi_ruang_id into sr from public.ad_percobaan pc join public.ad_peserta pe on pe.id = pc.peserta_id where pc.id = p_percobaan;
  if sr is null or not private.ad_kelola_sr(sr) then raise exception 'Bukan pengawas ruang ini'; end if;
  if p_kunci then
    update public.ad_percobaan set terkunci = true where id = p_percobaan and selesai is null;
  else
    update public.ad_percobaan set terkunci = false, dasar = pelanggaran where id = p_percobaan and selesai is null;
  end if;
end $$;

create or replace function public.ad_akhiri(p_percobaan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare sr uuid;
begin
  select pe.sesi_ruang_id into sr from public.ad_percobaan pc join public.ad_peserta pe on pe.id = pc.peserta_id where pc.id = p_percobaan;
  if sr is null or not private.ad_kelola_sr(sr) then raise exception 'Bukan pengawas ruang ini'; end if;
  perform private.ad_hitung(p_percobaan);
end $$;
