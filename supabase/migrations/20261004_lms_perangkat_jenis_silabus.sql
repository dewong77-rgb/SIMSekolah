-- Jenis dokumen perangkat ajar bertambah: silabus.
alter table public.perangkat_ajar drop constraint perangkat_ajar_jenis_check;
alter table public.perangkat_ajar add constraint perangkat_ajar_jenis_check check (jenis in ('cp','tp','atp','silabus','prota','promes','modul_ajar','rpp','kktp','bahan_ajar','lkpd','soal_asesmen','analisis_nilai','remedial_pengayaan','lainnya'));
