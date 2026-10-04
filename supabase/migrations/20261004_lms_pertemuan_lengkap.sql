-- Satu pertemuan wajib lengkap: materi, latihan soal, forum diskusi. Rekap terpadu per pertemuan.

create or replace function private.lms_kelengkapan(p_pertemuan uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with h as (
    select
      (select count(*) from public.materi m where m.pertemuan_id = p_pertemuan) materi,
      (select count(*) from public.asesmen a where a.pertemuan_id = p_pertemuan and not a.diarsipkan
         and exists (select 1 from public.soal s where s.asesmen_id = a.id and not s.dihapus)) latihan,
      (select count(*) from public.forum_topik f where f.pertemuan_id = p_pertemuan and not f.dihapus) forum
  )
  select jsonb_build_object(
    'materi', materi, 'latihan', latihan, 'forum', forum,
    'lengkap', materi > 0 and latihan > 0 and forum > 0,
    'kurang', to_jsonb(array_remove(array[
      case when materi = 0 then 'materi' end,
      case when latihan = 0 then 'latihan soal' end,
      case when forum = 0 then 'forum diskusi' end], null)))
  from h
$$;

create or replace function public.lms_pertemuan_kelengkapan(p_pertemuan uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_kelas uuid;
begin
  select kelas_ajar_id into v_kelas from public.pertemuan where id = p_pertemuan;
  if v_kelas is null or not private.lms_kelola(v_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return private.lms_kelengkapan(p_pertemuan);
end $$;

create or replace function public.lms_simpan_pertemuan(p_kelas uuid, p_id uuid, p_judul text, p_tanggal date, p_tujuan text, p_wajib_absen boolean, p_terbit boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_lama text; k jsonb;
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul wajib diisi.' using errcode = '22023'; end if;
  if p_id is null then
    -- Pertemuan baru selalu draf. Terbit setelah materi, latihan soal, dan forum lengkap.
    insert into public.pertemuan (kelas_ajar_id, nomor, judul, tanggal, tujuan, wajib_absen, status)
    values (p_kelas,
            (select coalesce(max(nomor), 0) + 1 from public.pertemuan where kelas_ajar_id = p_kelas),
            btrim(p_judul),
            coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date),
            nullif(btrim(coalesce(p_tujuan, '')), ''),
            coalesce(p_wajib_absen, true), 'draf')
    returning id into v_id;
  else
    select status into v_lama from public.pertemuan where id = p_id and kelas_ajar_id = p_kelas;
    if v_lama is null then raise exception 'Pertemuan tidak ditemukan.' using errcode = 'P0002'; end if;
    if coalesce(p_terbit, false) and v_lama <> 'terbit' then
      k := private.lms_kelengkapan(p_id);
      if not (k->>'lengkap')::boolean then
        raise exception 'Belum bisa diterbitkan. Lengkapi dulu: %.', (select string_agg(x, ', ') from jsonb_array_elements_text(k->'kurang') x)
          using errcode = 'P0001';
      end if;
      -- Latihan soal pertemuan ini ikut terbit bersama pertemuannya.
      update public.asesmen set status = 'terbit' where pertemuan_id = p_id and not diarsipkan and status <> 'terbit'
        and exists (select 1 from public.soal s where s.asesmen_id = asesmen.id and not s.dihapus);
    end if;
    update public.pertemuan set
      judul = btrim(p_judul),
      tanggal = coalesce(p_tanggal, tanggal),
      tujuan = nullif(btrim(coalesce(p_tujuan, '')), ''),
      wajib_absen = coalesce(p_wajib_absen, wajib_absen),
      status = case when p_terbit is null then status when p_terbit then 'terbit' else 'draf' end
    where id = p_id and kelas_ajar_id = p_kelas
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Daftar pertemuan: tambahkan kelengkapan untuk pengelola dan jumlah latihan untuk semua.
create or replace function public.lms_pertemuan_daftar(p_kelas uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_kelola boolean := private.lms_kelola(p_kelas);
begin
  if not v_kelola and not private.lms_anggota(p_kelas) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'nomor', t.nomor, 'judul', t.judul, 'tanggal', t.tanggal, 'tujuan', t.tujuan,
      'status', t.status, 'wajib_absen', t.wajib_absen,
      'absen_terbuka', (t.absen_buka is not null and now() between t.absen_buka and t.absen_tutup),
      'absen_tutup', t.absen_tutup,
      'kode_absen', case when v_kelola then t.kode_absen end,
      'jumlah_materi', (select count(*) from public.materi m where m.pertemuan_id = t.id),
      'jumlah_latihan', (select count(*) from public.asesmen a where a.pertemuan_id = t.id and not a.diarsipkan and (v_kelola or a.status = 'terbit')),
      'kelengkapan', case when v_kelola then private.lms_kelengkapan(t.id) end,
      'hadir', case when v_kelola then (select count(*) from public.absensi_pertemuan a
                 where a.pertemuan_id = t.id and a.status = 'hadir') end,
      'status_saya', case when not v_kelola then (select a.status from public.absensi_pertemuan a
                 where a.pertemuan_id = t.id and a.peserta_didik_id = private.pd_id_saya()) end
    ) order by t.nomor)
    from public.pertemuan t
    where t.kelas_ajar_id = p_kelas and (v_kelola or t.status = 'terbit')), '[]'::jsonb);
end $$;

-- Rekap terpadu satu pertemuan: kehadiran, materi dibaca, latihan soal, keaktifan forum.
create or replace function public.lms_pertemuan_rekap_terpadu(p_pertemuan uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v jsonb;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  with agt as (
    select pd.id pd, pd.nama, pd.nisn, kr.no_urut
    from public.kelas_ajar k
    join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id
    join public.peserta_didik pd on pd.id = kr.peserta_didik_id
    where k.id = t.kelas_ajar_id and pd.status_peserta_didik = 'aktif'
  ), lat as (
    select a.id from public.asesmen a where a.pertemuan_id = t.id and not a.diarsipkan and a.status = 'terbit'
  ), mat as (select m.id from public.materi m where m.pertemuan_id = t.id),
  s as (
    select agt.pd, agt.nama, agt.nisn, agt.no_urut,
      coalesce((select a.status from public.absensi_pertemuan a where a.pertemuan_id = t.id and a.peserta_didik_id = agt.pd), 'belum') absen,
      (select count(*) from public.progres_materi pm where pm.peserta_didik_id = agt.pd and pm.materi_id in (select id from mat)) materi_selesai,
      (select count(distinct p.asesmen_id) from public.percobaan_asesmen p
         where p.peserta_didik_id = agt.pd and p.asesmen_id in (select id from lat) and p.selesai is not null) latihan_selesai,
      (select avg(x.n) from (select max(p.nilai) n from public.percobaan_asesmen p
         where p.peserta_didik_id = agt.pd and p.asesmen_id in (select id from lat) and p.selesai is not null and p.nilai is not null
         group by p.asesmen_id) x) latihan_nilai,
      (select count(*) from public.forum_topik f join public.profil_pengguna u on u.user_id = f.penulis_user
         where f.pertemuan_id = t.id and not f.dihapus and u.peserta_didik_id = agt.pd) forum_topik,
      (select count(*) from public.forum_balasan b join public.forum_topik f on f.id = b.topik_id join public.profil_pengguna u on u.user_id = b.penulis_user
         where f.pertemuan_id = t.id and not b.dihapus and u.peserta_didik_id = agt.pd) forum_balasan
    from agt
  )
  select jsonb_build_object(
    'total_materi', (select count(*) from mat),
    'total_latihan', (select count(*) from lat),
    'total_topik', (select count(*) from public.forum_topik f where f.pertemuan_id = t.id and not f.dihapus),
    'siswa', coalesce((select jsonb_agg(jsonb_build_object(
        'peserta_didik_id', s.pd, 'nama', s.nama, 'nisn', s.nisn, 'no_urut', s.no_urut, 'absen', s.absen,
        'materi_selesai', s.materi_selesai, 'latihan_selesai', s.latihan_selesai,
        'latihan_nilai', round(s.latihan_nilai, 1),
        'forum_topik', s.forum_topik, 'forum_balasan', s.forum_balasan, 'forum_total', s.forum_topik + s.forum_balasan
      ) order by s.no_urut nulls last, s.nama) from s), '[]'::jsonb)
  ) into v;
  return v;
end $$;

do $$
declare f text;
begin
  for f in select unnest(array[
    'public.lms_pertemuan_kelengkapan(uuid)', 'public.lms_pertemuan_rekap_terpadu(uuid)',
    'public.lms_simpan_pertemuan(uuid,uuid,text,date,text,boolean,boolean)', 'public.lms_pertemuan_daftar(uuid)'])
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke all on function private.lms_kelengkapan(uuid) from public, anon, authenticated;
end $$;
