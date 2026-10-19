-- Kelengkapan administrasi guru, dihitung otomatis dari isi LMS (tanpa unggah ganda).
-- Guru melihat kelasnya sendiri. Admin TU dan super admin melihat semua guru di sekolahnya.
-- Pertemuan "lengkap" memakai private.lms_kelengkapan (bahan bacaan dan lembar kerja untuk siswa).
-- modul_guru = jumlah pertemuan yang punya materi khusus guru (modul ajar); informasi, bukan syarat.
create or replace function public.lms_kelengkapan_administrasi() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_admin boolean := private.peran_saya() = 'admin_tu' or private.adalah_super();
        v_ptk uuid := private.ptk_id_saya();
begin
  if not v_admin and v_ptk is null then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return jsonb_build_object('supervisi', v_admin, 'kelas', coalesce((
    select jsonb_agg(jsonb_build_object(
        'kelas_id', x.id, 'mapel', x.mapel, 'rombel', x.rombel, 'guru', x.guru,
        'jumlah_pertemuan', x.n, 'lengkap', x.lengkap, 'modul_guru', x.modul, 'kurang', x.kurang
      ) order by x.guru, x.mapel, x.rombel)
    from (
      select k.id, k.mapel, r.nama rombel, p.nama guru,
        count(t.id) n,
        count(t.id) filter (where (t.kl->>'lengkap')::boolean) lengkap,
        count(t.id) filter (where t.modul > 0) modul,
        coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'nomor', t.nomor, 'judul', t.judul, 'kurang', t.kl->'kurang') order by t.nomor)
          filter (where not (t.kl->>'lengkap')::boolean), '[]'::jsonb) kurang
      from public.kelas_ajar k
      join public.rombel r on r.id = k.rombel_id
      join public.ptk p on p.id = k.ptk_id
      left join lateral (
        select pt.id, pt.nomor, pt.judul, private.lms_kelengkapan(pt.id) kl,
          (select count(*) from public.materi m where m.pertemuan_id = pt.id and m.untuk = 'guru') modul
        from public.pertemuan pt where pt.kelas_ajar_id = k.id) t on true
      where k.aktif
        and ((not v_admin and k.ptk_id = v_ptk)
          or (v_admin and (private.adalah_super() or k.npsn = private.npsn_saya())))
      group by k.id, k.mapel, r.nama, p.nama
    ) x), '[]'::jsonb));
end $$;
revoke all on function public.lms_kelengkapan_administrasi() from public, anon;
grant execute on function public.lms_kelengkapan_administrasi() to authenticated;
