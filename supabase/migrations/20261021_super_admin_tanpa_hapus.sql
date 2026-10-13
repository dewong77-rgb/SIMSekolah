-- Super admin kedua tanpa hak hapus akun. Semua akses lain (menu, RLS, kelola akun) tetap sama dengan super admin penuh.
-- Hanya fungsi kelola-akun yang membaca kolom ini (aksi 'hapus').
alter table public.super_admin add column if not exists boleh_hapus boolean not null default true;

-- Contoh menambah super admin tanpa hak hapus (akunnya harus sudah terdaftar di auth.users):
--   insert into public.super_admin (user_id, boleh_hapus)
--     select id, false from auth.users where lower(email) = 'alamat@email'
--     on conflict (user_id) do update set boleh_hapus = false;
