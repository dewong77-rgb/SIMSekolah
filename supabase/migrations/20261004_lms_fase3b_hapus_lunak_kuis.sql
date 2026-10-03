-- Terpasang sebagai migrasi lms_fase3b_hapus_lunak_kuis. Hapus kuis dan soal memakai penanda (bukan delete).
alter table public.asesmen add column diarsipkan boolean not null default false;
alter table public.soal add column dihapus boolean not null default false;

create or replace function public.lms_asesmen_hapus(p_asesmen uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.lms_kelola_asesmen(p_asesmen) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if exists (select 1 from public.percobaan_asesmen where asesmen_id = p_asesmen) then
    raise exception 'Sudah ada siswa yang mengerjakan. Tarik jadi draf saja agar nilai tetap tersimpan.' using errcode = '23503';
  end if;
  update public.asesmen set diarsipkan = true, status = 'draf' where id = p_asesmen;
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
  update public.soal set dihapus = true where id = p_soal;
end $$;

create or replace function public.lms_soal_daftar(p_asesmen uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.lms_kelola_asesmen(p_asesmen) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'urutan', s.urutan, 'pertanyaan', s.pertanyaan, 'opsi', s.opsi,
      'kunci', s.kunci, 'bobot', s.bobot, 'pembahasan', s.pembahasan) order by s.urutan, s.dibuat_pada)
    from public.soal s where s.asesmen_id = p_asesmen and not s.dihapus), '[]'::jsonb);
end $$;

-- lms_asesmen_daftar dan lms_asesmen_mulai diganti dengan versi yang menyaring soal dihapus dan asesmen diarsipkan.
-- Versi final kedua fungsi ada di basis data; lihat juga 20261004_lms_fase2_kuis.sql untuk badan dasarnya.
-- Perubahan: jumlah_soal menghitung soal tanpa penanda dihapus; daftar menyaring "not a.diarsipkan";
-- mulai menolak asesmen diarsipkan serta memakai soal "not dihapus" untuk pengecekan dan susunan acak.
