-- Absen otomatis dari aktivitas siswa: guru tidak lagi diingatkan "absen belum dibuka".
do $$
declare d text := pg_get_functiondef('public.lms_pengingat_saya()'::regprocedure);
        lama text := $a$where p.status = 'terbit' and p.wajib_absen and p.absen_buka is null and p.tanggal = (now() at time zone 'Asia/Jakarta')::date$a$;
        baru text := $b$where false and p.status = 'terbit' and p.tanggal = (now() at time zone 'Asia/Jakarta')::date$b$;
begin
  if strpos(d, lama) = 0 then raise exception 'pola tidak ditemukan'; end if;
  execute replace(d, lama, baru);
end $$;
