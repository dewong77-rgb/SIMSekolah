-- Daftar ringkas PTK (id dan nama) untuk pilihan pembina, tanpa membuka data pribadi PTK.
-- Dipakai halaman Ekskul agar tabel ptk tidak perlu dibaca langsung oleh guru (lihat 20261036).
create or replace function public.ptk_pilihan() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.peran_saya() not in ('admin_tu', 'guru', 'staf') and not private.adalah_super() then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.nama) order by p.nama)
                   from public.ptk p where p.npsn = private.npsn_saya()), '[]'::jsonb);
end $$;
revoke all on function public.ptk_pilihan() from public, anon;
grant execute on function public.ptk_pilihan() to authenticated;
