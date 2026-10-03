-- Nama tampilan untuk header portal. profil_pengguna tidak menyimpan nama,
-- jadi diambil dari ptk (guru, staf, admin) atau peserta_didik (siswa).
-- Orang tua: nama anak pertama yang ditautkan, ditambah jumlah anak lain.
create or replace function public.nama_saya()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when p.peran = 'orang_tua' then (
      select 'Orang tua ' || min(pd.nama) || case when count(*) > 1 then ' dan ' || (count(*) - 1) || ' anak lain' else '' end
      from public.akun_anak a join public.peserta_didik pd on pd.id = a.peserta_didik_id
      where a.user_id = p.user_id)
    when p.peserta_didik_id is not null then (select pd.nama from public.peserta_didik pd where pd.id = p.peserta_didik_id)
    when p.ptk_id is not null then (select t.nama from public.ptk t where t.id = p.ptk_id)
  end
  from public.profil_pengguna p
  where p.user_id = (select auth.uid())
$$;

revoke execute on function public.nama_saya() from public, anon;
grant execute on function public.nama_saya() to authenticated;
