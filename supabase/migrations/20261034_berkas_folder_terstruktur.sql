-- Struktur folder Drive yang rapi: Sekolah / Guru|Tenaga Kependidikan|Siswa / orang / jenis berkas.
-- Folder induk (nama sekolah) diatur Edge Function "drive". Jalur berkas.jalur dimulai dari tingkat peran.
--
--   Guru/{Nama (4 digit NUPTK)}/Berkas Pribadi
--   Guru/{Nama}/Modul Ajar/{Tahun Ajaran}
--   Guru/{Nama}/Perangkat Ajar/{Tahun Ajaran}
--   Guru/{Nama}/Materi/{Tahun Ajaran}/{Rombel Mapel}
--   Tenaga Kependidikan/{Nama}/Berkas Pribadi
--   Tenaga Kependidikan/Arsip Surat/{Tahun Ajaran}
--   Siswa/{Kelas}/{Nama (4 digit NISN)}/Berkas Pribadi
--   Siswa/{Kelas}/{Nama}/Tugas/{Tahun Ajaran}/{Judul - Mapel}
--   Sekolah/Galeri, Sekolah/Dokumen Lainnya

alter table public.berkas drop constraint if exists berkas_kategori_check;
alter table public.berkas add constraint berkas_kategori_check check (kategori = any (array[
  'perangkat_ajar','modul_ajar','materi','tugas_siswa','berkas_pribadi','arsip_surat','galeri','lainnya']));

-- Nama folder yang aman untuk Drive dan tidak memuat garis miring.
create or replace function private.berkas_bersih(p_teks text, p_maks int default 60)
returns text language sql immutable set search_path = '' as $$
  select btrim(left(regexp_replace(regexp_replace(coalesce(p_teks, ''), '[^A-Za-z0-9 ]', '', 'g'), ' +', ' ', 'g'), p_maks))
$$;

-- Penyusun jalur tunggal, dipakai unggahan baru dan perapian berkas lama.
create or replace function private.berkas_jalur(p_kategori text, p_user uuid, p_rujukan uuid, p_ta text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  pr record; v_nama text; v_kode text; v_kelompok text; v_orang text; v_kelas text;
  v_judul text; v_mapel text; v_rombel text; v_dasar text;
begin
  if p_kategori = 'galeri' then return 'Sekolah/Galeri'; end if;
  if p_kategori = 'lainnya' then return 'Sekolah/Dokumen Lainnya'; end if;
  if p_kategori = 'arsip_surat' then return 'Tenaga Kependidikan/Arsip Surat/' || p_ta; end if;

  select * into pr from public.profil_pengguna where user_id = p_user;
  if not found then return 'Sekolah/Dokumen Lainnya'; end if;

  if pr.peserta_didik_id is not null then
    select d.nama, d.nisn into v_nama, v_kode from public.peserta_didik d where d.id = pr.peserta_didik_id;
    select r.nama into v_kelas from public.keanggotaan_rombel k join public.rombel r on r.id = k.rombel_id
      where k.peserta_didik_id = pr.peserta_didik_id order by r.semester_id desc limit 1;
    v_kelompok := 'Siswa';
  elsif pr.ptk_id is not null then
    select p.nama, coalesce(nullif(p.nuptk, ''), nullif(p.nip, '')) into v_nama, v_kode from public.ptk p where p.id = pr.ptk_id;
    v_kelompok := case when pr.peran = 'guru' then 'Guru' else 'Tenaga Kependidikan' end;
  else
    return 'Sekolah/Dokumen Lainnya';
  end if;

  v_kode := right(regexp_replace(coalesce(v_kode, ''), '\D', '', 'g'), 4);
  if v_kode = '' then v_kode := left(p_user::text, 4); end if;
  v_orang := coalesce(nullif(private.berkas_bersih(v_nama), ''), 'Tanpa Nama') || ' (' || v_kode || ')';

  if v_kelompok = 'Siswa' then
    v_dasar := 'Siswa/' || coalesce(nullif(private.berkas_bersih(v_kelas, 30), ''), 'Tanpa Kelas') || '/' || v_orang;
  else
    v_dasar := v_kelompok || '/' || v_orang;
  end if;

  if p_kategori = 'berkas_pribadi' then return v_dasar || '/Berkas Pribadi'; end if;
  if p_kategori = 'modul_ajar' then return v_dasar || '/Modul Ajar/' || p_ta; end if;
  if p_kategori = 'perangkat_ajar' then return v_dasar || '/Perangkat Ajar/' || p_ta; end if;

  if p_kategori = 'materi' then
    select k.mapel, r.nama into v_mapel, v_rombel from public.kelas_ajar k left join public.rombel r on r.id = k.rombel_id where k.id = p_rujukan;
    return v_dasar || '/Materi/' || p_ta || '/'
      || coalesce(nullif(private.berkas_bersih(coalesce(v_rombel, '') || ' ' || coalesce(v_mapel, ''), 50), ''), 'Tanpa Kelas');
  end if;

  if p_kategori = 'tugas_siswa' then
    select t.judul, k.mapel into v_judul, v_mapel from public.tugas t left join public.kelas_ajar k on k.id = t.kelas_ajar_id where t.id = p_rujukan;
    return v_dasar || '/Tugas/' || p_ta || '/'
      || coalesce(nullif(private.berkas_bersih(v_judul, 40), ''), 'Tugas')
      || coalesce(' - ' || nullif(private.berkas_bersih(v_mapel, 25), ''), '');
  end if;

  return 'Sekolah/Dokumen Lainnya';
end $$;

create or replace function private.berkas_ta(p_waktu timestamptz)
returns text language sql immutable set search_path = '' as $$
  select case when extract(month from (p_waktu at time zone 'Asia/Jakarta')) >= 7
    then extract(year from (p_waktu at time zone 'Asia/Jakarta'))::int || '-' || (extract(year from (p_waktu at time zone 'Asia/Jakarta'))::int + 1)
    else (extract(year from (p_waktu at time zone 'Asia/Jakarta'))::int - 1) || '-' || extract(year from (p_waktu at time zone 'Asia/Jakarta'))::int end
$$;

create or replace function public.berkas_siapkan(p_kategori text, p_nama text, p_mime text, p_ukuran bigint, p_rujukan uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_npsn text := private.npsn_saya();
  v_nama text := btrim(coalesce(p_nama, ''));
  v_admin boolean := private.adalah_super() or private.peran_saya() = 'admin_tu';
  v_jalur text; v_id uuid; v_kelas uuid;
  v_mime_ok text[] := array[
    'application/pdf','application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg','image/png','image/webp','text/plain'];
begin
  if v_user is null then raise exception 'Harus masuk dulu.' using errcode = '42501'; end if;
  if v_npsn is null then raise exception 'Akun belum tertaut ke sekolah.' using errcode = '42501'; end if;
  if v_nama = '' or length(v_nama) > 200 then raise exception 'Nama berkas tidak valid.' using errcode = '22023'; end if;
  if p_ukuran is null or p_ukuran <= 0 or p_ukuran > 26214400 then
    raise exception 'Ukuran berkas maksimal 25 MB.' using errcode = '22023'; end if;
  if not (p_mime = any (v_mime_ok)) then raise exception 'Jenis berkas tidak diizinkan.' using errcode = '22023'; end if;
  if (select count(*) from public.berkas where pemilik_user_id = v_user and status = 'menunggu_unggah'
        and dibuat_pada > now() - interval '1 hour') >= 20 then
    raise exception 'Terlalu banyak unggahan tertunda. Coba lagi nanti.' using errcode = '54000'; end if;

  if p_kategori in ('perangkat_ajar','modul_ajar') then
    if private.ptk_id_saya() is null then raise exception 'Hanya untuk guru dan staf.' using errcode = '42501'; end if;
  elsif p_kategori = 'materi' then
    if p_rujukan is null or not private.lms_kelola(p_rujukan) then
      raise exception 'Bukan kelas ajar Anda.' using errcode = '42501'; end if;
  elsif p_kategori = 'tugas_siswa' then
    if private.pd_id_saya() is null then raise exception 'Hanya untuk siswa.' using errcode = '42501'; end if;
    select t.kelas_ajar_id into v_kelas from public.tugas t where t.id = p_rujukan and not t.dihapus;
    if v_kelas is null or not private.lms_anggota(v_kelas) then
      raise exception 'Tugas tidak ditemukan.' using errcode = 'P0002'; end if;
  elsif p_kategori = 'berkas_pribadi' then
    if private.ptk_id_saya() is null and private.pd_id_saya() is null then
      raise exception 'Akun belum tertaut ke data pribadi.' using errcode = '42501'; end if;
  elsif p_kategori = 'arsip_surat' then
    if not v_admin then raise exception 'Hanya TU yang dapat mengarsipkan surat.' using errcode = '42501'; end if;
  elsif p_kategori = 'galeri' then
    if not (v_admin or private.punya_izin('hubin.kelola_humas')) then
      raise exception 'Tidak berwenang mengelola galeri.' using errcode = '42501'; end if;
    if p_mime not in ('image/jpeg','image/png','image/webp') then
      raise exception 'Galeri hanya menerima gambar.' using errcode = '22023'; end if;
  elsif p_kategori = 'lainnya' then
    if not v_admin then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  else
    raise exception 'Kategori tidak dikenal.' using errcode = '22023';
  end if;

  v_jalur := private.berkas_jalur(p_kategori, v_user, p_rujukan, private.berkas_ta(now()));
  insert into public.berkas (npsn, kategori, nama_asli, mime, ukuran, pemilik_user_id, rujukan_id, jalur)
  values (v_npsn, p_kategori, v_nama, p_mime, p_ukuran, v_user, p_rujukan, v_jalur)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'jalur', v_jalur, 'nama', v_nama, 'mime', p_mime, 'ukuran', p_ukuran);
end $$;

-- Izin baca: kategori baru mengikuti pola lama (pemilik, TU, super admin).
create or replace function public.berkas_akses(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare b record; v_ok boolean := false; v_kelas uuid;
begin
  if auth.uid() is null then return null; end if;
  select * into b from public.berkas where id = p_id and status = 'tersimpan';
  if not found then return null; end if;
  if private.adalah_super() then v_ok := true;
  elsif b.npsn = private.npsn_saya() then
    if b.pemilik_user_id = auth.uid() then v_ok := true;
    elsif b.kategori in ('perangkat_ajar','modul_ajar','berkas_pribadi','arsip_surat','lainnya') then
      v_ok := private.peran_saya() = 'admin_tu';
    elsif b.kategori = 'materi' then
      v_ok := b.rujukan_id is not null and (private.lms_kelola(b.rujukan_id) or private.lms_anggota(b.rujukan_id));
    elsif b.kategori = 'tugas_siswa' then
      select t.kelas_ajar_id into v_kelas from public.tugas t where t.id = b.rujukan_id;
      v_ok := v_kelas is not null and private.lms_kelola(v_kelas);
    elsif b.kategori = 'galeri' then
      v_ok := private.peran_saya() = 'admin_tu' or private.punya_izin('hubin.kelola_humas');
    end if;
  end if;
  if not v_ok then return null; end if;
  return jsonb_build_object('id', b.id, 'drive_file_id', b.drive_file_id, 'nama', b.nama_asli, 'mime', b.mime, 'ukuran', b.ukuran);
end $$;

-- Hanya service role (Edge Function): berkas lama yang jalurnya belum sesuai struktur baru.
create or replace function public.berkas_rapikan_daftar(p_batas int default 20)
returns table (id uuid, drive_file_id text, jalur_lama text, jalur_baru text, sisa bigint)
language sql stable security definer set search_path = '' as $$
  with calon as (
    select b.id, b.drive_file_id, b.jalur as jalur_lama,
           private.berkas_jalur(b.kategori, b.pemilik_user_id, b.rujukan_id, private.berkas_ta(b.dibuat_pada)) as jalur_baru
    from public.berkas b
    where b.status = 'tersimpan' and b.drive_file_id is not null
  ), beda as (select * from calon where jalur_lama is distinct from jalur_baru)
  select e.id, e.drive_file_id, e.jalur_lama, e.jalur_baru, (select count(*) from beda)
  from (select * from beda order by id limit greatest(p_batas, 1)) e
$$;

revoke all on function public.berkas_rapikan_daftar(int) from public, anon, authenticated;
grant execute on function public.berkas_rapikan_daftar(int) to service_role;
