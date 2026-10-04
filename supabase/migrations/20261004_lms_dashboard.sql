-- Dashboard pembelajaran guru: satu pertemuan yang sama di semua kelas yang diampu, dipantau sekaligus,
-- dengan absen serentak (satu kode untuk semua kelas). "Pertemuan yang sama" = judul sama (tanpa
-- memperhatikan huruf besar kecil) pada kelas ajar guru yang sama, mapel dan semester sama, dan aktif.

create or replace function private.lms_saudara(p_pertemuan uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select x.id
  from public.pertemuan t
  join public.kelas_ajar a on a.id = t.kelas_ajar_id
  join public.kelas_ajar b on b.ptk_id = a.ptk_id and b.mapel = a.mapel and b.semester_id = a.semester_id and b.aktif
  join public.pertemuan x on x.kelas_ajar_id = b.id and lower(btrim(x.judul)) = lower(btrim(t.judul))
  where t.id = p_pertemuan and private.lms_kelola(b.id)
$$;

create or replace function public.lms_absen_serentak(p_pertemuan uuid, p_menit integer, p_pakai_kode boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_kode text; v_tutup timestamptz; n int; v_lewat int;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_menit is null or p_menit not between 1 and 240 then raise exception 'Durasi absen 1 sampai 240 menit.' using errcode = '22023'; end if;
  v_kode := case when coalesce(p_pakai_kode, true) then lpad(floor(random() * 10000)::int::text, 4, '0') end;
  v_tutup := now() + make_interval(mins => p_menit);
  update public.pertemuan set absen_buka = now(), absen_tutup = v_tutup, kode_absen = v_kode
    where id in (select private.lms_saudara(p_pertemuan)) and status = 'terbit';
  get diagnostics n = row_count;
  select count(*) into v_lewat from private.lms_saudara(p_pertemuan) s where not exists (select 1 from public.pertemuan q where q.id = s and q.status = 'terbit');
  if n = 0 then raise exception 'Terbitkan pertemuan dulu sebelum membuka absen.' using errcode = '22023'; end if;
  return jsonb_build_object('kode', v_kode, 'tutup', v_tutup, 'kelas_dibuka', n, 'kelas_belum_terbit', v_lewat);
end $$;

create or replace function public.lms_tutup_absen_serentak(p_pertemuan uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; n int;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  update public.pertemuan set absen_tutup = now() where id in (select private.lms_saudara(p_pertemuan)) and absen_buka is not null and absen_tutup > now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Pantauan satu pertemuan di semua kelas.
create or replace function public.lms_dashboard_pertemuan(p_pertemuan uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v jsonb;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  with sd as (
    select p.id, p.kelas_ajar_id, p.status, p.absen_buka, p.absen_tutup, p.kode_absen, ka.rombel_id, r.nama rombel
    from public.pertemuan p join public.kelas_ajar ka on ka.id = p.kelas_ajar_id join public.rombel r on r.id = ka.rombel_id
    where p.id in (select private.lms_saudara(p_pertemuan))
  ), agt as (
    select sd.id pid, pd.id pd
    from sd join public.keanggotaan_rombel kr on kr.rombel_id = sd.rombel_id
    join public.peserta_didik pd on pd.id = kr.peserta_didik_id and pd.status_peserta_didik = 'aktif'
  ), k as (
    select sd.*,
      (select count(*) from agt where agt.pid = sd.id) total,
      (select count(*) from public.absensi_pertemuan a join agt on agt.pd = a.peserta_didik_id and agt.pid = sd.id where a.pertemuan_id = sd.id and a.status = 'hadir') hadir,
      (select count(*) from public.absensi_pertemuan a join agt on agt.pd = a.peserta_didik_id and agt.pid = sd.id where a.pertemuan_id = sd.id and a.status in ('izin', 'sakit')) izin_sakit,
      (select count(*) from public.absensi_pertemuan a join agt on agt.pd = a.peserta_didik_id and agt.pid = sd.id where a.pertemuan_id = sd.id and a.status = 'alpa') alpa,
      (select count(*) from public.materi m where m.pertemuan_id = sd.id and m.untuk = 'siswa') total_materi,
      (select count(*) from public.asesmen a where a.pertemuan_id = sd.id and not a.diarsipkan and a.status = 'terbit') total_latihan,
      (select count(*) from public.materi m where m.pertemuan_id = sd.id and m.tugas_id is not null) total_lembar
    from sd
  ), h as (
    select k.*,
      (select count(*) from agt where agt.pid = k.id and k.total_materi > 0 and
         (select count(*) from public.progres_materi pm join public.materi m on m.id = pm.materi_id
            where pm.peserta_didik_id = agt.pd and m.pertemuan_id = k.id and m.untuk = 'siswa') >= k.total_materi) materi_tuntas,
      (select count(*) from agt where agt.pid = k.id and
         exists (select 1 from public.progres_materi pm join public.materi m on m.id = pm.materi_id
            where pm.peserta_didik_id = agt.pd and m.pertemuan_id = k.id and m.untuk = 'siswa')) materi_mulai,
      (select count(*) from agt where agt.pid = k.id and k.total_latihan > 0 and
         (select count(distinct pa.asesmen_id) from public.percobaan_asesmen pa join public.asesmen a on a.id = pa.asesmen_id
            where pa.peserta_didik_id = agt.pd and a.pertemuan_id = k.id and not a.diarsipkan and a.status = 'terbit' and pa.selesai is not null) >= k.total_latihan) latihan_selesai,
      (select count(*) from agt where agt.pid = k.id and k.total_lembar > 0 and
         exists (select 1 from public.kumpul_tugas c join public.materi m on m.tugas_id = c.tugas_id
            where c.peserta_didik_id = agt.pd and m.pertemuan_id = k.id)) lembar_kumpul,
      (select count(*) from agt where agt.pid = k.id and (
         exists (select 1 from public.forum_topik f join public.profil_pengguna u on u.user_id = f.penulis_user
                   where f.pertemuan_id = k.id and not f.dihapus and u.peserta_didik_id = agt.pd)
         or exists (select 1 from public.forum_balasan b join public.forum_topik f on f.id = b.topik_id join public.profil_pengguna u on u.user_id = b.penulis_user
                   where f.pertemuan_id = k.id and not b.dihapus and u.peserta_didik_id = agt.pd))) forum_aktif
    from k
  )
  select jsonb_build_object(
    'judul', t.judul,
    'kelas', coalesce(jsonb_agg(jsonb_build_object(
      'pertemuan_id', h.id, 'kelas_id', h.kelas_ajar_id, 'rombel', h.rombel, 'status', h.status,
      'absen_terbuka', h.absen_buka is not null and now() between h.absen_buka and h.absen_tutup,
      'absen_tutup', h.absen_tutup, 'kode_absen', h.kode_absen,
      'total', h.total, 'hadir', h.hadir, 'izin_sakit', h.izin_sakit, 'alpa', h.alpa, 'belum', h.total - h.hadir - h.izin_sakit - h.alpa,
      'total_materi', h.total_materi, 'materi_mulai', h.materi_mulai, 'materi_tuntas', h.materi_tuntas,
      'total_latihan', h.total_latihan, 'latihan_selesai', h.latihan_selesai,
      'total_lembar', h.total_lembar, 'lembar_kumpul', h.lembar_kumpul, 'forum_aktif', h.forum_aktif
    ) order by h.rombel), '[]'::jsonb)) into v from h;
  return v;
end $$;

-- Daftar pertemuan (digabung per judul) untuk dipilih di dashboard.
create or replace function public.lms_dashboard_daftar()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya();
begin
  if v_ptk is null then raise exception 'Hanya untuk guru.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(g order by g->>'tanggal' desc, g->>'judul')
    from (
      select jsonb_build_object('pertemuan_id', (array_agg(p.id order by p.tanggal, p.nomor))[1], 'judul', min(p.judul), 'mapel', ka.mapel,
             'tanggal', max(p.tanggal), 'jumlah_kelas', count(*), 'terbit', count(*) filter (where p.status = 'terbit')) g
      from public.kelas_ajar ka join public.pertemuan p on p.kelas_ajar_id = ka.id
      where ka.ptk_id = v_ptk and ka.aktif
      group by ka.mapel, ka.semester_id, lower(btrim(p.judul))
      order by max(p.tanggal) desc limit 60
    ) s), '[]'::jsonb);
end $$;

revoke all on function private.lms_saudara(uuid) from public, anon;
revoke all on function public.lms_absen_serentak(uuid, integer, boolean) from public, anon;
revoke all on function public.lms_tutup_absen_serentak(uuid) from public, anon;
revoke all on function public.lms_dashboard_pertemuan(uuid) from public, anon;
revoke all on function public.lms_dashboard_daftar() from public, anon;
grant execute on function private.lms_saudara(uuid), public.lms_absen_serentak(uuid, integer, boolean), public.lms_tutup_absen_serentak(uuid),
  public.lms_dashboard_pertemuan(uuid), public.lms_dashboard_daftar() to authenticated;
