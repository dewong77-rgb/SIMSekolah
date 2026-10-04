-- Ubah dan hapus pertemuan untuk semua kelas yang berbagi pertemuan sama (judul sama), supaya kelompok tidak pecah.
create or replace function public.lms_pertemuan_ubah_serentak(p_pertemuan uuid, p_judul text, p_tanggal date, p_tujuan text, p_wajib_absen boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_ids uuid[]; n integer;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if btrim(coalesce(p_judul, '')) = '' then raise exception 'Judul wajib diisi.' using errcode = '22023'; end if;
  select array_agg(x) into v_ids from private.lms_saudara(p_pertemuan) x;
  if exists (select 1 from public.pertemuan q where q.kelas_ajar_id in (select kelas_ajar_id from public.pertemuan where id = any (v_ids))
             and lower(btrim(q.judul)) = lower(btrim(p_judul)) and q.id <> all (v_ids)) then
    raise exception 'Sudah ada pertemuan lain berjudul "%" di salah satu kelas.', btrim(p_judul) using errcode = 'P0001';
  end if;
  update public.pertemuan set judul = btrim(p_judul), tanggal = coalesce(p_tanggal, tanggal),
    tujuan = nullif(btrim(coalesce(p_tujuan, '')), ''), wajib_absen = coalesce(p_wajib_absen, wajib_absen)
  where id = any (v_ids);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.lms_pertemuan_ubah_serentak(uuid, text, date, text, boolean) from public, anon;
grant execute on function public.lms_pertemuan_ubah_serentak(uuid, text, date, text, boolean) to authenticated;

create or replace function public.lms_pertemuan_hapus_serentak(p_pertemuan uuid, p_paksa boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; i uuid; n integer := 0;
begin
  if not exists (select 1 from public.pertemuan where id = p_pertemuan and private.lms_kelola(kelas_ajar_id)) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  select array_agg(x) into v_ids from private.lms_saudara(p_pertemuan) x;
  foreach i in array v_ids loop
    perform public.lms_pertemuan_hapus(i, coalesce(p_paksa, false));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.lms_pertemuan_hapus_serentak(uuid, boolean) from public, anon;
grant execute on function public.lms_pertemuan_hapus_serentak(uuid, boolean) to authenticated;
