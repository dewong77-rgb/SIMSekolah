-- Asesmen Digital, bagian 4: sisi siswa dan hak akses
create or replace function private.ad_muat(p_percobaan uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare h jsonb;
begin
  select jsonb_build_object(
    'percobaan_id', pc.id, 'mulai', pc.mulai, 'batas', pc.batas,
    'sisa_detik', greatest(0, floor(extract(epoch from (pc.batas - now()))))::int,
    'durasi_menit', u.durasi_menit, 'ujian', u.nama, 'jenis', u.jenis, 'mapel', pk.nama,
    'pelanggaran', pc.pelanggaran, 'terkunci', pc.terkunci, 'ambang', u.maks_pelanggaran, 'kunci_otomatis', u.kunci_otomatis,
    'soal', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ps.id, 'nomor', e.ord, 'tipe', ps.tipe, 'pertanyaan', ps.pertanyaan,
        'opsi', case when ps.tipe = 'pilgan' then coalesce((select jsonb_agg(jsonb_build_object('i', (o.v #>> '{}')::int, 't', ps.opsi ->> ((o.v #>> '{}')::int)) order by o.ord2)
                    from jsonb_array_elements(e.val -> 'o') with ordinality o(v, ord2)), '[]'::jsonb) else '[]'::jsonb end,
        'jawaban', j.jawaban, 'ragu', coalesce(j.ragu, false)) order by e.ord)
      from jsonb_array_elements(pc.urutan) with ordinality e(val, ord)
      join public.ad_paket_soal ps on ps.id = (e.val ->> 's')::uuid
      left join public.ad_jawaban j on j.percobaan_id = pc.id and j.soal_id = ps.id), '[]'::jsonb))
  into h
  from public.ad_percobaan pc
  join public.ad_peserta pe on pe.id = pc.peserta_id
  join public.ad_sesi s on s.id = pe.sesi_id
  join public.ad_ujian u on u.id = s.ujian_id
  left join public.ad_paket pk on pk.id = s.paket_id
  where pc.id = p_percobaan;
  return h;
end $$;

create or replace function public.ad_siswa_jadwal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pd uuid := private.pd_id_saya();
begin
  if pd is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.mulai) from (
    select pe.id as peserta_id, u.nama as ujian, u.jenis, u.durasi_menit, u.status, u.tampil_nilai,
           s.nama as sesi, s.mulai, s.selesai, r.nama as ruang, pe.no_kursi, pk.nama as mapel, sr.token_dibuka,
           pc.id as percobaan_id, pc.selesai as percobaan_selesai,
           case when u.tampil_nilai and pc.selesai is not null then pc.nilai end as nilai
    from public.ad_peserta pe
    join public.ad_sesi s on s.id = pe.sesi_id
    join public.ad_ujian u on u.id = s.ujian_id and u.status in ('aktif','selesai')
    join public.ad_sesi_ruang sr on sr.id = pe.sesi_ruang_id
    join public.ad_ruang r on r.id = sr.ruang_id
    left join public.ad_paket pk on pk.id = s.paket_id
    left join public.ad_percobaan pc on pc.peserta_id = pe.id
    where pe.peserta_didik_id = pd and s.selesai > now() - interval '30 days') x), '[]'::jsonb);
end $$;

create or replace function public.ad_siswa_mulai(p_peserta uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pe record; pc record; urut jsonb;
begin
  select pe2.id, pe2.peserta_didik_id, s.id as sesi_id, s.mulai, s.selesai, s.paket_id, u.id as ujian_id, u.status, u.durasi_menit, u.acak_soal, u.acak_opsi,
         sr.token, sr.token_dibuka
    into pe
  from public.ad_peserta pe2 join public.ad_sesi s on s.id = pe2.sesi_id join public.ad_ujian u on u.id = s.ujian_id
  join public.ad_sesi_ruang sr on sr.id = pe2.sesi_ruang_id
  where pe2.id = p_peserta;
  if pe.id is null or pe.peserta_didik_id is distinct from private.pd_id_saya() then raise exception 'Jadwal tidak ditemukan'; end if;
  select * into pc from public.ad_percobaan where peserta_id = p_peserta;
  if pc.id is not null and pc.selesai is not null then return jsonb_build_object('selesai', true, 'percobaan_id', pc.id); end if;
  if pe.status <> 'aktif' then raise exception 'Ujian belum dibuka'; end if;
  if pe.paket_id is null then raise exception 'Paket soal belum dipasang'; end if;
  if now() < pe.mulai then raise exception 'Sesi belum dimulai'; end if;
  if now() >= pe.selesai then raise exception 'Sesi sudah berakhir'; end if;
  if not pe.token_dibuka then raise exception 'Pengawas belum membuka token'; end if;
  if upper(btrim(coalesce(p_token,''))) <> upper(coalesce(pe.token,'')) or coalesce(pe.token,'') = '' then raise exception 'Token salah'; end if;
  if pc.id is null then
    select jsonb_agg(jsonb_build_object('s', ps.id,
             'o', case when ps.tipe = 'pilgan' then (select jsonb_agg(g order by case when pe.acak_opsi then random() else g end) from generate_series(0, jsonb_array_length(ps.opsi) - 1) g) else '[]'::jsonb end)
           order by case when pe.acak_soal then random() else ps.urut end)
      into urut from public.ad_paket_soal ps where ps.paket_id = pe.paket_id;
    if urut is null then raise exception 'Paket soal kosong'; end if;
    insert into public.ad_percobaan(peserta_id, batas, urutan)
    values (p_peserta, least(now() + make_interval(mins => pe.durasi_menit), pe.selesai), urut) returning * into pc;
  end if;
  return private.ad_muat(pc.id);
end $$;

create or replace function private.ad_percobaan_saya(p_percobaan uuid) returns record
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select pc.id, pc.batas, pc.selesai, pc.terkunci, pc.pelanggaran, pc.dasar, pc.nilai, u.maks_pelanggaran, u.kunci_otomatis, u.tampil_nilai, s.paket_id
    into r
  from public.ad_percobaan pc join public.ad_peserta pe on pe.id = pc.peserta_id
  join public.ad_sesi s on s.id = pe.sesi_id join public.ad_ujian u on u.id = s.ujian_id
  where pc.id = p_percobaan and pe.peserta_didik_id = private.pd_id_saya();
  if r.id is null then raise exception 'Percobaan tidak ditemukan'; end if;
  return r;
end $$;

create or replace function public.ad_siswa_jawab(p_percobaan uuid, p_soal uuid, p_jawaban text, p_ragu boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  r := private.ad_percobaan_saya(p_percobaan);
  if r.selesai is not null or now() > r.batas + interval '5 seconds' then return jsonb_build_object('ok', false, 'habis', true); end if;
  if r.terkunci then return jsonb_build_object('ok', false, 'terkunci', true); end if;
  if not exists (select 1 from public.ad_paket_soal where id = p_soal and paket_id = r.paket_id) then raise exception 'Soal tidak ditemukan'; end if;
  insert into public.ad_jawaban(percobaan_id, soal_id, jawaban, ragu, diperbarui)
  values (p_percobaan, p_soal, nullif(left(coalesce(p_jawaban,''), 500), ''), coalesce(p_ragu, false), now())
  on conflict (percobaan_id, soal_id) do update set jawaban = excluded.jawaban, ragu = excluded.ragu, diperbarui = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ad_siswa_kirim(p_percobaan uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; n numeric;
begin
  r := private.ad_percobaan_saya(p_percobaan);
  if r.selesai is null then perform private.ad_hitung(p_percobaan); end if;
  select case when r.tampil_nilai then nilai end into n from public.ad_percobaan where id = p_percobaan;
  return jsonb_build_object('ok', true, 'tampil_nilai', r.tampil_nilai, 'nilai', n);
end $$;

create or replace function public.ad_siswa_status(p_percobaan uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  r := private.ad_percobaan_saya(p_percobaan);
  if r.selesai is null and now() > r.batas + interval '6 seconds' then
    perform private.ad_hitung(p_percobaan);
    r := private.ad_percobaan_saya(p_percobaan);
  end if;
  return jsonb_build_object('selesai', r.selesai is not null, 'terkunci', r.terkunci, 'pelanggaran', r.pelanggaran,
    'sisa_detik', greatest(0, floor(extract(epoch from (r.batas - now()))))::int);
end $$;

create or replace function public.ad_siswa_pelanggaran(p_percobaan uuid, p_jenis text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; terakhir timestamptz; sekarang int; kunci boolean;
begin
  r := private.ad_percobaan_saya(p_percobaan);
  if p_jenis not in ('pindah_tab','keluar_layar') then raise exception 'Jenis tidak dikenal'; end if;
  if r.selesai is not null then return jsonb_build_object('terkunci', r.terkunci, 'pelanggaran', r.pelanggaran); end if;
  select max(waktu) into terakhir from public.ad_pelanggaran where percobaan_id = p_percobaan;
  if terakhir is not null and now() - terakhir < interval '3 seconds' then
    return jsonb_build_object('terkunci', r.terkunci, 'pelanggaran', r.pelanggaran, 'abaikan', true);
  end if;
  insert into public.ad_pelanggaran(percobaan_id, jenis) values (p_percobaan, p_jenis);
  sekarang := r.pelanggaran + 1;
  kunci := r.terkunci or (r.kunci_otomatis and sekarang - r.dasar >= r.maks_pelanggaran);
  update public.ad_percobaan set pelanggaran = sekarang, terkunci = kunci where id = p_percobaan;
  return jsonb_build_object('terkunci', kunci, 'pelanggaran', sekarang);
end $$;

-- Hak akses: hanya pengguna masuk yang boleh memanggil fungsi ad_*
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'ad\_%' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
