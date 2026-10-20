-- Rencana ajar sebagai contoh bersama: guru boleh membagikan rencana ajarnya (TP, KKTP, program semester) sebagai contoh
-- yang bisa dilihat guru lain di sekolahnya, dan guru lain bisa menyalinnya sebagai titik awal.
-- NIP guru dan kepala sekolah tidak ikut dibagikan.

create table if not exists public.rencana_contoh (
  ptk_id uuid not null references public.ptk(id) on delete cascade,
  npsn text not null,
  mapel text not null,
  tingkat text not null,
  dibagikan_pada timestamptz not null default now(),
  primary key (ptk_id, mapel, tingkat)
);
alter table public.rencana_contoh enable row level security;
revoke all on table public.rencana_contoh from anon, authenticated;

create or replace function public.lms_rencana_bagikan(p_mapel text, p_tingkat text, p_bagikan boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya(); v_npsn text := private.npsn_saya();
begin
  if v_ptk is null then raise exception 'Khusus guru.' using errcode = '42501'; end if;
  if coalesce(p_bagikan, false) then
    if not exists (select 1 from public.rencana_tp where ptk_id = v_ptk and mapel = p_mapel and tingkat = p_tingkat) then
      raise exception 'Rencana ini belum berisi TP.' using errcode = '22023';
    end if;
    insert into public.rencana_contoh (ptk_id, npsn, mapel, tingkat) values (v_ptk, v_npsn, p_mapel, p_tingkat)
    on conflict (ptk_id, mapel, tingkat) do update set dibagikan_pada = now();
  else
    delete from public.rencana_contoh where ptk_id = v_ptk and mapel = p_mapel and tingkat = p_tingkat;
  end if;
end $$;
revoke all on function public.lms_rencana_bagikan(text, text, boolean) from public, anon;
grant execute on function public.lms_rencana_bagikan(text, text, boolean) to authenticated;

-- Daftar contoh yang dibagikan di sekolah ini.
create or replace function public.lms_rencana_contoh_daftar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (private.adalah_super() or private.ptk_id_saya() is not null or private.peran_saya() = 'admin_tu') then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'ptk_id', c.ptk_id, 'guru', p.nama, 'mapel', c.mapel, 'tingkat', c.tingkat,
        'jumlah_tp', (select count(*) from public.rencana_tp t where t.ptk_id = c.ptk_id and t.mapel = c.mapel and t.tingkat = c.tingkat),
        'milik_saya', c.ptk_id = private.ptk_id_saya()
      ) order by (c.ptk_id = private.ptk_id_saya()) desc, c.mapel, c.tingkat)
    from public.rencana_contoh c join public.ptk p on p.id = c.ptk_id
    where private.adalah_super() or c.npsn = private.npsn_saya()), '[]'::jsonb);
end $$;
revoke all on function public.lms_rencana_contoh_daftar() from public, anon;
grant execute on function public.lms_rencana_contoh_daftar() to authenticated;

-- Isi satu contoh yang dibagikan.
create or replace function public.lms_rencana_contoh_ambil(p_ptk uuid, p_mapel text, p_tingkat text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (private.adalah_super() or private.ptk_id_saya() is not null or private.peran_saya() = 'admin_tu') then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.rencana_contoh c
                  where c.ptk_id = p_ptk and c.mapel = p_mapel and c.tingkat = p_tingkat
                    and (private.adalah_super() or c.npsn = private.npsn_saya())) then
    raise exception 'Contoh tidak ditemukan.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'guru', (select nama from public.ptk where id = p_ptk),
    'tp', coalesce((select jsonb_agg(to_jsonb(x) order by x.urutan) from (
        select mapel, tingkat, elemen_kode, elemen_nama, capaian, semester, kode, rumusan, alokasi_jp, kriteria, nilai_tuntas, urutan
        from public.rencana_tp where ptk_id = p_ptk and mapel = p_mapel and tingkat = p_tingkat) x), '[]'::jsonb),
    'minggu', coalesce((select jsonb_agg(to_jsonb(x) order by x.urutan) from (
        select id, mapel, tingkat, urutan, nomor, semester, tanggal_mulai, tanggal_selesai, elemen_kode, materi_pokok, jp, tp_kode, keterangan, efektif
        from public.rencana_minggu where ptk_id = p_ptk and mapel = p_mapel and tingkat = p_tingkat) x), '[]'::jsonb),
    'profil', coalesce((select data - 'nip_guru' - 'nip_kepala' from public.rencana_profil
                         where ptk_id = p_ptk and mapel = p_mapel and tingkat = p_tingkat), '{}'::jsonb));
end $$;
revoke all on function public.lms_rencana_contoh_ambil(uuid, text, text) from public, anon;
grant execute on function public.lms_rencana_contoh_ambil(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
