-- Salin satu pertemuan (materi, latihan soal, topik forum pembuka) ke kelas ajar lain milik guru yang sama.
-- Absen, balasan forum, nilai, jadwal latihan, dan tanggal terbit tetap terpisah per kelas.

create or replace function public.lms_salin_tujuan(p_pertemuan uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; src public.kelas_ajar%rowtype;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  select * into src from public.kelas_ajar where id = t.kelas_ajar_id;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'kelas_id', k.id, 'rombel', r.nama, 'mapel', k.mapel,
      'jumlah_siswa', (select count(*) from public.keanggotaan_rombel kr join public.peserta_didik pd on pd.id = kr.peserta_didik_id
                       where kr.rombel_id = k.rombel_id and pd.status_peserta_didik = 'aktif'),
      'sudah_ada', exists (select 1 from public.pertemuan x where x.kelas_ajar_id = k.id and lower(btrim(x.judul)) = lower(btrim(t.judul)))
    ) order by r.nama)
    from public.kelas_ajar k join public.rombel r on r.id = k.rombel_id
    where k.aktif and k.id <> src.id and k.semester_id = src.semester_id
      and lower(btrim(k.mapel)) = lower(btrim(src.mapel)) and private.lms_kelola(k.id)), '[]'::jsonb);
end $$;

create or replace function public.lms_salin_pertemuan(p_pertemuan uuid, p_kelas uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; tujuan jsonb; k uuid; baru uuid; a record; na uuid; u uuid[]; n int := 0; lewat text[] := '{}'; nama text;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_kelas is null or coalesce(array_length(p_kelas, 1), 0) = 0 then raise exception 'Pilih minimal satu kelas.' using errcode = '22023'; end if;
  if array_length(p_kelas, 1) > 20 then raise exception 'Terlalu banyak kelas.' using errcode = '22023'; end if;
  tujuan := public.lms_salin_tujuan(p_pertemuan);
  select array_agg(distinct x) into u from unnest(p_kelas) x;
  foreach k in array u loop
    if not exists (select 1 from jsonb_array_elements(tujuan) e where (e->>'kelas_id')::uuid = k) then
      raise exception 'Kelas tujuan tidak valid.' using errcode = '42501';
    end if;
    select r.nama into nama from public.kelas_ajar ka join public.rombel r on r.id = ka.rombel_id where ka.id = k;
    if exists (select 1 from public.pertemuan x where x.kelas_ajar_id = k and lower(btrim(x.judul)) = lower(btrim(t.judul))) then
      lewat := lewat || nama; continue;
    end if;
    insert into public.pertemuan (kelas_ajar_id, nomor, judul, tanggal, tujuan, wajib_absen, status)
    values (k, (select coalesce(max(nomor), 0) + 1 from public.pertemuan where kelas_ajar_id = k), t.judul,
            (now() at time zone 'Asia/Jakarta')::date, t.tujuan, t.wajib_absen, 'draf')
    returning id into baru;
    insert into public.materi (pertemuan_id, urutan, jenis, judul, isi, url, berkas_id)
      select baru, m.urutan, m.jenis, m.judul, m.isi, m.url, m.berkas_id from public.materi m where m.pertemuan_id = t.id;
    for a in select * from public.asesmen where pertemuan_id = t.id and not diarsipkan order by dibuat_pada loop
      insert into public.asesmen (kelas_ajar_id, pertemuan_id, jenis, judul, petunjuk, durasi_menit, buka, tutup, maks_percobaan, acak, tampil_hasil, status, jumlah_tampil, kkm)
      values (k, baru, a.jenis, a.judul, a.petunjuk, a.durasi_menit, null, null, a.maks_percobaan, a.acak, a.tampil_hasil, 'draf', a.jumlah_tampil, a.kkm)
      returning id into na;
      insert into public.soal (asesmen_id, urutan, pertanyaan, opsi, kunci, bobot, pembahasan, tipe, kunci_isian, rubrik)
        select na, s.urutan, s.pertanyaan, s.opsi, s.kunci, s.bobot, s.pembahasan, s.tipe, s.kunci_isian, s.rubrik
        from public.soal s where s.asesmen_id = a.id and not s.dihapus;
    end loop;
    insert into public.forum_topik (pertemuan_id, kelas_ajar_id, penulis_user, penulis_nama, penulis_peran, judul, isi)
      select baru, k, auth.uid(), private.lms_nama_saya(), 'guru', f.judul, f.isi
      from public.forum_topik f where f.pertemuan_id = t.id and not f.dihapus and f.penulis_peran = 'guru' order by f.dibuat_pada;
    n := n + 1;
  end loop;
  return jsonb_build_object('disalin', n, 'dilewati', to_jsonb(lewat));
end $$;

do $$
declare f text;
begin
  for f in select unnest(array['public.lms_salin_tujuan(uuid)', 'public.lms_salin_pertemuan(uuid,uuid[])']) loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
