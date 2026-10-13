-- Dua fungsi penghapusan perpustakaan. Dipisahkan karena pernyataan hapus perlu dijalankan dengan konfirmasi (SQL Editor Supabase).
-- Isinya sama dengan bagian yang sama di 20261019_perpustakaan_digital.sql, aman dijalankan ulang.

-- Menghapus buku digital beserta rujukan, progres, sesi, dan kutipannya. Mengembalikan lokasi berkas agar aplikasi membersihkan penyimpanan.
create or replace function public.perpus_buku_hapus(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.perpus_buku%rowtype;
begin
  if not private.boleh_kelola_perpus() then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  delete from public.perpus_buku where id = p_id and npsn = private.npsn_saya() returning * into b;
  if not found then raise exception 'Buku tidak ditemukan.' using errcode = 'P0002'; end if;
  return jsonb_build_object('berkas_path', b.berkas_path, 'sampul_path', b.sampul_path);
end $$;

-- Melepas satu lampiran buku dari pertemuan atau tugas.
create or replace function public.perpus_rujukan_hapus(p_rujukan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.perpus_rujukan%rowtype; v_kelas uuid;
begin
  select * into r from public.perpus_rujukan where id = p_rujukan;
  if not found then return; end if;
  v_kelas := private.perpus_kelas_rujukan(case when r.pertemuan_id is not null then 'pertemuan' else 'tugas' end, coalesce(r.pertemuan_id, r.tugas_id));
  if v_kelas is null or not private.lms_kelola(v_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  delete from public.perpus_rujukan where id = p_rujukan;
end $$;

revoke all on function public.perpus_buku_hapus(uuid), public.perpus_rujukan_hapus(uuid) from public, anon;
grant execute on function public.perpus_buku_hapus(uuid), public.perpus_rujukan_hapus(uuid) to authenticated;
