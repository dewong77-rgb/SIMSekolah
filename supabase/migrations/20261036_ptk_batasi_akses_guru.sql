-- Pembatasan akses guru ke data PTK: guru hanya membaca barisnya sendiri (super admin tetap penuh).
-- Sebelumnya policy guru_baca mengizinkan setiap guru membaca semua PTK sekolahnya (NIP, NUPTK, HP, alamat, tanggal lahir, dst).
-- Daftar nama untuk pilihan pembina kini lewat public.ptk_pilihan() (20261035). Admin TU tidak berubah (policy tu_semua).
-- Diterapkan SETELAH frontend yang memakai ptk_pilihan() terdeploy.
-- Pemulihan bila perlu:
--   alter policy guru_baca on public.ptk using (((select private.peran_saya()) = 'guru') and npsn = (select private.npsn_saya()));
alter policy guru_baca on public.ptk
  using (((select private.peran_saya()) = 'guru')
         and npsn = (select private.npsn_saya())
         and (id = (select private.ptk_id_saya()) or (select private.adalah_super())));
