-- Profil guru, staf, dan siswa: semua kolom yang dulu menunggu persetujuan TU (jalur 'tu') kini berlaku langsung.
-- Perubahan langsung tersimpan di SIMS, lalu tercatat sebagai ajuan bagian kepegawaian (PTK) atau kesiswaan (siswa)
-- berstatus 'diteruskan' dan masuk antrean operator Dapodik, yang menyalinnya ke Dapodik. Mekanismenya sudah ada di
-- ajukan_perubahan (jalur 'langsung'); migrasi ini hanya mengubah katalog kolom.
--
-- Tetap jalur 'operator' (tidak diterapkan langsung): nama, NIK PTK, tanggal lahir, NUPTK, NISN. Kolom ini membentuk
-- kunci pencocokan unggahan Dapodik. Mengubahnya di SIMS membuat unggahan berikutnya menghasilkan baris ganda.
update public.kolom_ajuan set jalur = 'langsung' where jalur = 'tu';
