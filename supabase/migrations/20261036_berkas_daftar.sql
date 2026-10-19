-- Daftar berkas untuk halaman "Berkas saya". Tabel berkas terkunci RLS tanpa kebijakan, jadi bacaan lewat fungsi ini.
-- Berkas pribadi dan modul ajar: milik sendiri. Arsip surat: seluruh arsip sekolah bagi TU dan super admin.
create or replace function public.berkas_daftar(p_kategori text)
returns table (id uuid, nama text, ukuran bigint, mime text, dibuat_pada timestamptz, milik_saya boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Harus masuk dulu.' using errcode = '42501'; end if;
  if p_kategori not in ('berkas_pribadi','modul_ajar','arsip_surat') then
    raise exception 'Kategori tidak dikenal.' using errcode = '22023'; end if;
  return query
    select b.id, b.nama_asli, b.ukuran, b.mime, b.dibuat_pada, b.pemilik_user_id = auth.uid()
    from public.berkas b
    where b.status = 'tersimpan' and b.kategori = p_kategori and b.npsn = private.npsn_saya()
      and (b.pemilik_user_id = auth.uid()
           or (p_kategori = 'arsip_surat' and (private.adalah_super() or private.peran_saya() = 'admin_tu')))
    order by b.dibuat_pada desc
    limit 500;
end $$;

revoke all on function public.berkas_daftar(text) from public, anon;
grant execute on function public.berkas_daftar(text) to authenticated;
