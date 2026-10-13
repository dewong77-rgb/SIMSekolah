-- Forum bergaya media sosial: komentar bisa dibalas dan saling berbalas.
-- Fungsi lms_forum_balas versi bersarang ada di migrasi 20261018 (bersama lampiran gambar).
-- Dua tingkat saja (komentar dan balasannya). Membalas sebuah balasan tetap ditaruh di bawah komentar induknya,
-- dengan nama yang dibalas disimpan di kolom balas_ke supaya tampil sebagai sebutan @nama.
-- Semua perhitungan bonus forum memakai topik_id, jadi balasan bersarang tetap dihitung sebagai tulisan siswa.

alter table public.forum_balasan
  add column if not exists induk_id uuid references public.forum_balasan(id) on delete cascade,
  add column if not exists balas_ke text;

create index if not exists forum_balasan_induk_idx on public.forum_balasan(induk_id);

create or replace function public.lms_forum_balasan_daftar(p_topik uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_pert uuid;
begin
  select pertemuan_id into v_pert from public.forum_topik where id = p_topik and not dihapus;
  if v_pert is null or not private.lms_forum_akses(v_pert) then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'isi', b.isi, 'penulis_nama', b.penulis_nama, 'penulis_peran', b.penulis_peran,
      'dibuat_pada', b.dibuat_pada, 'milik_saya', b.penulis_user = auth.uid(),
      'induk_id', b.induk_id, 'balas_ke', b.balas_ke) order by b.dibuat_pada)
    from public.forum_balasan b where b.topik_id = p_topik and not b.dihapus), '[]'::jsonb);
end $$;

-- Menghapus komentar utama ikut menyembunyikan balasan di bawahnya, supaya tidak ada balasan yatim.
create or replace function public.lms_forum_hapus(p_jenis text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_kelas uuid; v_penulis uuid;
begin
  if p_jenis = 'topik' then
    select kelas_ajar_id, penulis_user into v_kelas, v_penulis from public.forum_topik where id = p_id;
  elsif p_jenis = 'balasan' then
    select t.kelas_ajar_id, b.penulis_user into v_kelas, v_penulis
    from public.forum_balasan b join public.forum_topik t on t.id = b.topik_id where b.id = p_id;
  else
    raise exception 'Jenis tidak valid.' using errcode = '22023';
  end if;
  if v_kelas is null or not (private.lms_kelola(v_kelas) or v_penulis = auth.uid()) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if p_jenis = 'topik' then update public.forum_topik set dihapus = true where id = p_id;
  else update public.forum_balasan set dihapus = true where id = p_id or induk_id = p_id; end if;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.proname like 'lms\_forum\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
