-- Satu panggilan untuk profil, status super admin, dan penugasan pengguna yang sedang masuk.
-- Sebelumnya klien memanggil tiga endpoint terpisah di setiap pemuatan halaman. Keluaran identik (diuji pada 10 pengguna).
-- Sudah diterapkan di produksi lewat SQL; berkas ini hanya catatan agar lingkungan lain sama.
create or replace function public.profil_saya()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'profil', (select to_jsonb(p) from (
        select user_id, npsn, peran, ptk_id, peserta_didik_id from public.profil_pengguna where user_id = auth.uid()) p),
    'super_admin', exists (select 1 from public.super_admin where user_id = auth.uid()),
    'penugasan', coalesce((select jsonb_agg(to_jsonb(x)) from public.penugasan_saya() x), '[]'::jsonb)
  )
$$;
revoke all on function public.profil_saya() from public, anon;
grant execute on function public.profil_saya() to authenticated;
