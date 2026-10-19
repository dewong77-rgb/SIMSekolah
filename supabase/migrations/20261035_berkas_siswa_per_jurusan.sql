-- Folder siswa: Siswa/{Jurusan}/{Nama (NISN)}/... Jurusan = kode kedua nama rombel (BP, TE, TJKT, TO, TP),
-- konvensi yang sama dengan jurusan_profil_publik. Tidak lagi per kelas, jadi tidak terpecah saat naik kelas.
-- Guru dan tenaga kependidikan tetap memakai 4 digit NUPTK/NIP. Berkas lama dirapikan ulang lewat tombol
-- "Rapikan folder Drive" (aman diulang).

create or replace function private.berkas_jalur(p_kategori text, p_user uuid, p_rujukan uuid, p_ta text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  pr record; v_nama text; v_kode text; v_kelompok text; v_orang text; v_jurusan text;
  v_judul text; v_mapel text; v_rombel text; v_dasar text;
begin
  if p_kategori = 'galeri' then return 'Sekolah/Galeri'; end if;
  if p_kategori = 'lainnya' then return 'Sekolah/Dokumen Lainnya'; end if;
  if p_kategori = 'arsip_surat' then return 'Tenaga Kependidikan/Arsip Surat/' || p_ta; end if;

  select * into pr from public.profil_pengguna where user_id = p_user;
  if not found then return 'Sekolah/Dokumen Lainnya'; end if;

  if pr.peserta_didik_id is not null then
    select d.nama, d.nisn into v_nama, v_kode from public.peserta_didik d where d.id = pr.peserta_didik_id;
    select split_part(r.nama, ' ', 2) into v_jurusan from public.keanggotaan_rombel k join public.rombel r on r.id = k.rombel_id
      where k.peserta_didik_id = pr.peserta_didik_id
      order by (r.jenis_rombel = 'Kelas Utama') desc, r.semester_id desc limit 1;
    v_kelompok := 'Siswa';
    v_kode := regexp_replace(coalesce(v_kode, ''), '\D', '', 'g');
  elsif pr.ptk_id is not null then
    select p.nama, coalesce(nullif(p.nuptk, ''), nullif(p.nip, '')) into v_nama, v_kode from public.ptk p where p.id = pr.ptk_id;
    v_kelompok := case when pr.peran = 'guru' then 'Guru' else 'Tenaga Kependidikan' end;
    v_kode := right(regexp_replace(coalesce(v_kode, ''), '\D', '', 'g'), 4);
  else
    return 'Sekolah/Dokumen Lainnya';
  end if;

  if v_kode = '' then v_kode := left(p_user::text, 4); end if;
  v_orang := coalesce(nullif(private.berkas_bersih(v_nama), ''), 'Tanpa Nama') || ' (' || v_kode || ')';

  if v_kelompok = 'Siswa' then
    v_dasar := 'Siswa/' || coalesce(nullif(private.berkas_bersih(v_jurusan, 20), ''), 'Tanpa Jurusan') || '/' || v_orang;
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
