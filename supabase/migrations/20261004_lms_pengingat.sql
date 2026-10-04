-- Pengingat LMS. Dihitung langsung dari data saat dibuka, tanpa tabel notifikasi, sehingga selalu akurat
-- dan hilang sendiri begitu tindakannya selesai. Siswa: absen terbuka, tugas dan lembar kerja, latihan
-- yang sedang dibuka, forum yang belum diikuti. Guru: esai perlu dikoreksi, tugas menunggu nilai,
-- pertemuan draf, absen hari ini belum dibuka.

create or replace function public.lms_pengingat_saya()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_pd uuid := private.pd_id_saya(); v_ptk uuid := private.ptk_id_saya(); v_npsn text := private.npsn_saya();
  v jsonb := '[]'::jsonb; v_peran text;
begin
  if auth.uid() is null then raise exception 'Harus masuk dulu.' using errcode = '42501'; end if;
  if v_pd is not null then
    v_peran := 'siswa';
    with kls as (
      select ka.id, ka.mapel, r.nama rombel
      from public.kelas_ajar ka
      join public.keanggotaan_rombel kr on kr.rombel_id = ka.rombel_id and kr.peserta_didik_id = v_pd
      join public.rombel r on r.id = ka.rombel_id
      where ka.aktif
    ), it as (
      -- absen yang sedang dibuka
      select 'absen' jenis, 1 prioritas, 'Absen sekarang: ' || p.judul judul, k.id kelas_id, k.mapel, k.rombel,
             p.id pertemuan_id, null::uuid tugas_id, null::uuid asesmen_id, p.absen_tutup batas, 'segera' tingkat
      from kls k join public.pertemuan p on p.kelas_ajar_id = k.id
      where p.status = 'terbit' and p.wajib_absen and p.absen_buka is not null and p.absen_buka <= now()
        and (p.absen_tutup is null or p.absen_tutup > now())
        and not exists (select 1 from public.absensi_pertemuan a where a.pertemuan_id = p.id and a.peserta_didik_id = v_pd)
      union all
      -- tugas dan lembar kerja belum dikumpulkan
      select case when exists (select 1 from public.materi m where m.tugas_id = t.id) then 'lembar' else 'tugas' end, 2,
             t.judul, k.id, k.mapel, k.rombel, t.pertemuan_id, t.id, null::uuid, t.tenggat,
             case when t.tenggat is not null and t.tenggat < now() then 'lewat'
                  when t.tenggat is not null and t.tenggat < now() + interval '48 hours' then 'segera' else 'biasa' end
      from kls k join public.tugas t on t.kelas_ajar_id = k.id
      where t.status = 'terbit' and not t.dihapus
        and (t.tenggat is null or t.tenggat > now() - interval '14 days')
        and not (t.tenggat is not null and t.tenggat < now() and not t.terima_telat)
        and not exists (select 1 from public.kumpul_tugas c where c.tugas_id = t.id and c.peserta_didik_id = v_pd)
      union all
      -- latihan atau ulangan yang sedang dibuka dan belum dikerjakan
      select 'latihan', 3, a.judul, k.id, k.mapel, k.rombel, a.pertemuan_id, null::uuid, a.id, a.tutup,
             case when a.tutup is not null and a.tutup < now() + interval '48 hours' then 'segera' else 'biasa' end
      from kls k join public.asesmen a on a.kelas_ajar_id = k.id
      where a.status = 'terbit' and not a.diarsipkan
        and (a.buka is null or a.buka <= now()) and (a.tutup is null or a.tutup > now())
        and not exists (select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = v_pd and p.selesai is not null)
      union all
      -- forum yang sudah ada topiknya tetapi siswa belum ikut
      select 'forum', 4, 'Belum ikut diskusi: ' || p.judul, k.id, k.mapel, k.rombel, p.id, null::uuid, null::uuid, null::timestamptz, 'biasa'
      from kls k join public.pertemuan p on p.kelas_ajar_id = k.id
      where p.status = 'terbit' and p.dibuat_pada > now() - interval '21 days'
        and (not p.wajib_absen or exists (select 1 from public.absensi_pertemuan a where a.pertemuan_id = p.id and a.peserta_didik_id = v_pd and a.status <> 'alpa'))
        and exists (select 1 from public.forum_topik f where f.pertemuan_id = p.id and not f.dihapus)
        and not exists (select 1 from public.forum_topik f join public.profil_pengguna u on u.user_id = f.penulis_user
                         where f.pertemuan_id = p.id and not f.dihapus and u.peserta_didik_id = v_pd)
        and not exists (select 1 from public.forum_balasan b join public.forum_topik f on f.id = b.topik_id join public.profil_pengguna u on u.user_id = b.penulis_user
                         where f.pertemuan_id = p.id and not b.dihapus and u.peserta_didik_id = v_pd)
    )
    select coalesce(jsonb_agg(jsonb_build_object('jenis', jenis, 'judul', judul, 'kelas_id', kelas_id, 'mapel', mapel, 'rombel', rombel,
        'pertemuan_id', pertemuan_id, 'tugas_id', tugas_id, 'asesmen_id', asesmen_id, 'batas', batas, 'tingkat', tingkat)
        order by case tingkat when 'lewat' then 0 when 'segera' then 1 else 2 end, prioritas, batas nulls last), '[]'::jsonb)
    into v from it;
  elsif v_ptk is not null then
    v_peran := 'guru';
    with kls as (
      select ka.id, ka.mapel, r.nama rombel from public.kelas_ajar ka join public.rombel r on r.id = ka.rombel_id
      where ka.aktif and ka.ptk_id = v_ptk
    ), it as (
      select 'koreksi' jenis, 1 prioritas, count(*)::text || ' esai perlu dikoreksi: ' || a.judul judul, k.id kelas_id, k.mapel, k.rombel,
             a.pertemuan_id, null::uuid tugas_id, a.id asesmen_id, null::timestamptz batas, 'segera' tingkat
      from kls k join public.asesmen a on a.kelas_ajar_id = k.id join public.percobaan_asesmen p on p.asesmen_id = a.id
      where p.selesai is not null and p.butuh_koreksi and not a.diarsipkan
      group by a.id, k.id, k.mapel, k.rombel
      union all
      select 'nilai', 2, count(*)::text || ' pengumpulan belum dinilai: ' || t.judul, k.id, k.mapel, k.rombel, t.pertemuan_id, t.id, null::uuid, null::timestamptz, 'biasa'
      from kls k join public.tugas t on t.kelas_ajar_id = k.id join public.kumpul_tugas c on c.tugas_id = t.id
      where t.status = 'terbit' and not t.dihapus and c.nilai is null
      group by t.id, k.id, k.mapel, k.rombel
      union all
      select 'absen_guru', 0, 'Absen hari ini belum dibuka: ' || p.judul, k.id, k.mapel, k.rombel, p.id, null::uuid, null::uuid, null::timestamptz, 'segera'
      from kls k join public.pertemuan p on p.kelas_ajar_id = k.id
      where p.status = 'terbit' and p.wajib_absen and p.absen_buka is null and p.tanggal = (now() at time zone 'Asia/Jakarta')::date
      union all
      select 'draf', 3, 'Pertemuan belum terbit: ' || p.judul || coalesce(' (kurang ' || (select string_agg(x, ', ') from jsonb_array_elements_text(private.lms_kelengkapan(p.id)->'kurang') x) || ')', ''),
             k.id, k.mapel, k.rombel, p.id, null::uuid, null::uuid, null::timestamptz, 'biasa'
      from kls k join public.pertemuan p on p.kelas_ajar_id = k.id
      where p.status = 'draf' and p.dibuat_pada > now() - interval '30 days'
    )
    select coalesce(jsonb_agg(jsonb_build_object('jenis', jenis, 'judul', judul, 'kelas_id', kelas_id, 'mapel', mapel, 'rombel', rombel,
        'pertemuan_id', pertemuan_id, 'tugas_id', tugas_id, 'asesmen_id', asesmen_id, 'batas', batas, 'tingkat', tingkat)
        order by prioritas, judul), '[]'::jsonb)
    into v from it;
  else
    v_peran := 'lain';
  end if;
  return jsonb_build_object('peran', v_peran, 'jumlah', jsonb_array_length(v), 'butir', v);
end $$;

revoke all on function public.lms_pengingat_saya() from public, anon;
grant execute on function public.lms_pengingat_saya() to authenticated;
