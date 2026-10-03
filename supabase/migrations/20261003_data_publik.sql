-- Data publik untuk situs: nama kompetensi keahlian aktif dan statistik ringkas (tanpa data pribadi).
create or replace function public.jurusan_publik()
returns table (bidang_keahlian text, program_keahlian text, kompetensi_keahlian text)
language sql security definer stable set search_path = public as $$
  select k.bidang_keahlian, k.program_keahlian, k.kompetensi_keahlian
    from public.kompetensi_keahlian k
   where k.kompetensi_keahlian <> ''
     and k.tanggal_izin = (select max(tanggal_izin) from public.kompetensi_keahlian where kompetensi_keahlian <> '')
   order by k.program_keahlian, k.kompetensi_keahlian
$$;

create or replace function public.statistik_publik()
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'peserta_didik_aktif', (select count(*) from public.peserta_didik where status_peserta_didik = 'aktif'),
    'alumni', (select count(*) from public.peserta_didik where status_peserta_didik = 'lulus'),
    'ptk', (select count(*) from public.ptk),
    'rombel', (select count(*) from public.rombel r where r.jenis_rombel = 'Kelas Utama'
               and r.semester_id = (select max(semester_id) from public.rombel where jenis_rombel = 'Kelas Utama'))
  )
$$;

revoke all on function public.jurusan_publik() from public;
revoke all on function public.statistik_publik() from public;
grant execute on function public.jurusan_publik() to anon, authenticated;
grant execute on function public.statistik_publik() to anon, authenticated;
