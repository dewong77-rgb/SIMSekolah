-- Rekap LMS per rombel dan mata pelajaran: mapel mana yang sudah mengunggah pertemuan, mana yang belum.
-- Siapa yang boleh melihat:
--   - Admin TU dan super admin: semua rombel di sekolahnya.
--   - Penugasan dengan izin lms.pantau_kelas tanpa lingkup (Waka Kurikulum, Staf Kurikulum, Kepala Sekolah): semua rombel.
--   - Wali kelas (izin yang sama, lingkup = rombel): hanya rombel yang dia walikan.
-- Status mapel: 'sudah' (ada pertemuan terbit), 'draf' (pertemuan ada tetapi belum terbit), 'belum' (belum ada pertemuan).
-- Pertemuan terbit "lengkap" memakai private.lms_kelengkapan (bahan bacaan dan lembar kerja).

insert into public.izin (kode, nama, bidang) values
  ('lms.pantau_kelas', 'Memantau kelengkapan LMS per kelas dan mata pelajaran', 'Kurikulum')
on conflict (kode) do nothing;
insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_kurikulum', 'lms.pantau_kelas'), ('staf_kurikulum', 'lms.pantau_kelas'),
  ('kepala_sekolah', 'lms.pantau_kelas'), ('wali_kelas', 'lms.pantau_kelas')
on conflict do nothing;

create or replace function public.lms_rekap_mapel() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya();
        v_ta text := public.tahun_ajaran_sekarang();
        v_semua boolean;
        v_rombel text[];
begin
  select coalesce(array_agg(p.lingkup_id) filter (where coalesce(p.lingkup_id, '') <> ''), '{}'),
         coalesce(bool_or(coalesce(p.lingkup_id, '') = ''), false)
    into v_rombel, v_semua
    from public.penugasan p
    join public.jabatan_izin ji on ji.jabatan_kode = p.jabatan_kode and ji.izin_kode = 'lms.pantau_kelas'
   where p.ptk_id = v_ptk and p.status = 'aktif' and p.tahun_ajaran = v_ta;
  v_semua := coalesce(v_semua, false) or private.adalah_super() or private.peran_saya() = 'admin_tu';
  if not v_semua and cardinality(v_rombel) = 0 then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  return jsonb_build_object('semua', v_semua, 'rombel', coalesce((
    select jsonb_agg(jsonb_build_object(
        'rombel_id', r.id, 'rombel', r.nama, 'wali', r.wali_kelas_nama,
        'mapel', (
          select jsonb_agg(jsonb_build_object(
              'kelas_id', x.id, 'mapel', x.mapel, 'guru', x.guru, 'pertemuan', x.n, 'terbit', x.terbit,
              'lengkap', x.lengkap, 'terakhir', x.terakhir,
              'status', case when x.terbit > 0 then 'sudah' when x.n > 0 then 'draf' else 'belum' end
            ) order by x.mapel)
          from (
            select k.id, k.mapel, p.nama guru,
              count(t.id) n,
              count(t.id) filter (where t.status = 'terbit') terbit,
              count(t.id) filter (where t.status = 'terbit' and (t.kl->>'lengkap')::boolean) lengkap,
              max(t.dibuat_pada) filter (where t.status = 'terbit') terakhir
            from public.kelas_ajar k
            left join public.ptk p on p.id = k.ptk_id
            left join lateral (
              select pt.id, pt.status, pt.dibuat_pada,
                case when pt.status = 'terbit' then private.lms_kelengkapan(pt.id) end kl
              from public.pertemuan pt where pt.kelas_ajar_id = k.id) t on true
            where k.rombel_id = r.id and k.aktif
            group by k.id, k.mapel, p.nama) x)
      ) order by r.nama)
    from public.rombel r
    where r.jenis_rombel = 'Kelas Utama'
      and (private.adalah_super() or r.npsn = private.npsn_saya())
      and (v_semua or r.id::text = any(v_rombel))
      and exists (select 1 from public.kelas_ajar k where k.rombel_id = r.id and k.aktif)), '[]'::jsonb));
end $$;
revoke all on function public.lms_rekap_mapel() from public, anon;
grant execute on function public.lms_rekap_mapel() to authenticated;

notify pgrst, 'reload schema';
