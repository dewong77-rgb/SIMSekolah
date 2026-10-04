-- LMS otomatis: absen tercatat dari aktivitas siswa, pertemuan aktif otomatis saat bahan bacaan dan lembar kerja ada,
-- urutan wajib antarpertemuan, buka/tutup manual atau berbatas waktu.

alter table public.pertemuan add column if not exists ditutup boolean not null default false;
alter table public.pertemuan add column if not exists buka_sampai timestamptz;

-- Terbuka: terbit, tidak ditutup guru, dan belum lewat batas waktu.
create or replace function private.lms_terbuka(p_pertemuan uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select t.status = 'terbit' and not t.ditutup and (t.buka_sampai is null or t.buka_sampai > now())
                   from public.pertemuan t where t.id = p_pertemuan), false)
$$;

-- Urutan: semua pertemuan lebih awal yang masih terbuka harus sudah dituntaskan siswa.
create or replace function private.lms_urut_lolos(p_pertemuan uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.pertemuan t
    join public.pertemuan q on q.kelas_ajar_id = t.kelas_ajar_id and q.nomor < t.nomor
    where t.id = p_pertemuan and private.lms_terbuka(q.id)
      and not coalesce((private.lms_nilai_pertemuan_pd(q.id, private.pd_id_saya())->>'tuntas')::boolean, false))
$$;

create or replace function private.lms_gerbang_lolos(p_pertemuan uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.lms_terbuka(t.id) and private.lms_urut_lolos(t.id) from public.pertemuan t where t.id = p_pertemuan), false)
$$;

-- Absen tercatat otomatis dari aktivitas siswa (baca, lembar kerja, forum).
create or replace function private.lms_absen_otomatis(p_pertemuan uuid, p_pd uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_pertemuan is null or p_pd is null then return; end if;
  insert into public.absensi_pertemuan (pertemuan_id, peserta_didik_id, status, sumber)
  values (p_pertemuan, p_pd, 'hadir', 'mandiri')
  on conflict (pertemuan_id, peserta_didik_id) do update set status = 'hadir', sumber = 'mandiri', dicatat_pada = now()
    where public.absensi_pertemuan.status = 'alpa';
end $$;

create or replace function private.lms_absen_dari_progres() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.lms_absen_otomatis((select m.pertemuan_id from public.materi m where m.id = new.materi_id), new.peserta_didik_id);
  return new;
end $$;
create or replace trigger trg_progres_absen after insert on public.progres_materi for each row execute function private.lms_absen_dari_progres();

create or replace function private.lms_absen_dari_kumpul() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.lms_absen_otomatis((select g.pertemuan_id from public.tugas g where g.id = new.tugas_id), new.peserta_didik_id);
  return new;
end $$;
create or replace trigger trg_kumpul_absen after insert or update on public.kumpul_tugas for each row execute function private.lms_absen_dari_kumpul();

create or replace function private.lms_absen_dari_forum() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pert uuid; v_pd uuid;
begin
  if new.penulis_peran <> 'siswa' then return new; end if;
  select u.peserta_didik_id into v_pd from public.profil_pengguna u where u.user_id = new.penulis_user;
  if tg_table_name = 'forum_topik' then v_pert := new.pertemuan_id;
  else select f.pertemuan_id into v_pert from public.forum_topik f where f.id = new.topik_id; end if;
  perform private.lms_absen_otomatis(v_pert, v_pd);
  return new;
end $$;
create or replace trigger trg_forum_topik_absen after insert on public.forum_topik for each row execute function private.lms_absen_dari_forum();
create or replace trigger trg_forum_balasan_absen after insert on public.forum_balasan for each row execute function private.lms_absen_dari_forum();

-- Pertemuan aktif otomatis begitu ada bahan bacaan dan lembar kerja untuk siswa.
create or replace function private.lms_aktif_otomatis(p_pertemuan uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((private.lms_kelengkapan(p_pertemuan)->>'lengkap')::boolean, false) then return; end if;
  update public.tugas set status = 'terbit' where pertemuan_id = p_pertemuan and not dihapus and status <> 'terbit'
    and id in (select tugas_id from public.materi where pertemuan_id = p_pertemuan and tugas_id is not null);
  update public.pertemuan set status = 'terbit' where id = p_pertemuan and status = 'draf';
end $$;

create or replace function private.lms_forum_dari_materi()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pertemuan_id is not null and new.untuk = 'siswa' then
    perform private.lms_aktif_otomatis(new.pertemuan_id);
    perform private.lms_forum_pastikan(new.pertemuan_id);
  end if;
  return new;
end $$;

-- Buka atau tutup pertemuan di semua kelas sekaligus. Batas waktu opsional (kosong berarti tanpa batas).
create or replace function public.lms_pertemuan_akses(p_pertemuan uuid, p_buka boolean, p_sampai timestamptz default null)
returns int language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; n int;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if t.status <> 'terbit' then raise exception 'Pertemuan belum aktif. Lengkapi bahan bacaan dan lembar kerja dulu.' using errcode = 'P0001'; end if;
  if p_buka and p_sampai is not null and p_sampai <= now() then raise exception 'Batas waktu harus di masa depan.' using errcode = '22023'; end if;
  update public.pertemuan set ditutup = not p_buka, buka_sampai = case when p_buka then p_sampai else buka_sampai end
    where id in (select private.lms_saudara(p_pertemuan)) and status = 'terbit';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.lms_pertemuan_akses(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.lms_pertemuan_akses(uuid, boolean, timestamptz) to authenticated;

-- Penambalan fungsi lama.
do $$
declare
  rec record; d text; n text;
  pesan text := $m$'Pertemuan ini terkunci: selesaikan pertemuan sebelumnya atau tunggu guru membukanya.'$m$;
begin
  -- hadir otomatis: tuntas tidak lagi bergantung absen manual
  d := pg_get_functiondef('private.lms_nilai_pertemuan_pd(uuid,uuid)'::regprocedure);
  n := replace(d, $a$v_hadir := (not t.wajib_absen) or exists (select 1 from public.absensi_pertemuan a where a.pertemuan_id = t.id and a.peserta_didik_id = p_pd and a.status <> 'alpa');$a$, 'v_hadir := true;');
  if n = d then raise exception 'pola nilai tidak ditemukan'; end if;
  execute n;

  -- pesan gerbang
  for rec in select p.oid::regprocedure fn from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             where p.proname in ('lms_materi_buka', 'lms_tandai_selesai', 'lms_tugas_kumpul', 'lms_lembar_siswa', 'lms_asesmen_mulai', 'lms_forum_daftar') and s.nspname in ('public', 'private') loop
    d := pg_get_functiondef(rec.fn);
    n := regexp_replace(d, $r$'Absen dulu[^']*'$r$, pesan, 'g');
    n := replace(n, $r$'Forum terbuka setelah Anda absen.'$r$, pesan);
    if n <> d then execute n; end if;
  end loop;

  d := pg_get_functiondef('public.lms_langkah_siswa(uuid)'::regprocedure);
  n := replace(d, $a$'perlu', t.wajib_absen or t.absen_buka is not null,$a$, $b$'perlu', false,$b$);
  n := replace(n, $a$return r || jsonb_build_object('nilai', private.lms_nilai_pertemuan_pd(p_pertemuan, v_pd));$a$,
    $b$return r || jsonb_build_object('nilai', private.lms_nilai_pertemuan_pd(p_pertemuan, v_pd),
    'akses', jsonb_build_object('boleh', private.lms_gerbang_lolos(p_pertemuan), 'ditutup', not private.lms_terbuka(p_pertemuan), 'buka_sampai', t.buka_sampai,
      'sebelumnya', (select jsonb_build_object('id', q.id, 'nomor', q.nomor, 'judul', q.judul) from public.pertemuan q
         where q.kelas_ajar_id = t.kelas_ajar_id and q.nomor < t.nomor and private.lms_terbuka(q.id)
           and not coalesce((private.lms_nilai_pertemuan_pd(q.id, v_pd)->>'tuntas')::boolean, false) order by q.nomor limit 1)));$b$);
  if strpos(n, '''akses''') = 0 or strpos(n, $a$'perlu', false$a$) = 0 then raise exception 'pola langkah tidak ditemukan'; end if;
  execute n;

  d := pg_get_functiondef('public.lms_pertemuan_daftar(uuid)'::regprocedure);
  n := replace(d, $a$'status', t.status, 'wajib_absen', t.wajib_absen,$a$,
    $b$'status', t.status, 'wajib_absen', t.wajib_absen, 'ditutup', t.ditutup, 'buka_sampai', t.buka_sampai, 'terbuka', private.lms_terbuka(t.id),
      'boleh', case when not v_kelola then private.lms_gerbang_lolos(t.id) end,
      'tuntas_saya', case when not v_kelola then coalesce((private.lms_nilai_pertemuan_pd(t.id, private.pd_id_saya())->>'tuntas')::boolean, false) end,$b$);
  if n = d then raise exception 'pola daftar tidak ditemukan'; end if;
  execute n;

  d := pg_get_functiondef('public.lms_beranda_siswa()'::regprocedure);
  n := replace(d, $a$left join lateral (select * from public.pertemuan q where q.kelas_ajar_id = ka.id and q.status = 'terbit' order by q.tanggal desc, q.nomor desc limit 1) p on true$a$,
    $b$left join lateral (select * from public.pertemuan q where q.kelas_ajar_id = ka.id and q.status = 'terbit' and private.lms_terbuka(q.id)
        order by coalesce((private.lms_nilai_pertemuan_pd(q.id, v_pd)->>'tuntas')::boolean, false),
                 case when coalesce((private.lms_nilai_pertemuan_pd(q.id, v_pd)->>'tuntas')::boolean, false) then -q.nomor else q.nomor end limit 1) p on true$b$);
  n := replace(n, $a$'perlu_absen', p.wajib_absen) x$a$, $b$'perlu_absen', false, 'tuntas', coalesce((private.lms_nilai_pertemuan_pd(p.id, v_pd)->>'tuntas')::boolean, false)) x$b$);
  if strpos(n, 'lms_terbuka') = 0 or strpos(n, '''tuntas''') = 0 then raise exception 'pola beranda tidak ditemukan'; end if;
  execute n;

  d := pg_get_functiondef('public.lms_dashboard_pertemuan(uuid)'::regprocedure);
  n := replace(d, $a$select p.id, p.kelas_ajar_id, p.status, p.absen_buka,$a$, $b$select p.id, p.kelas_ajar_id, p.status, p.ditutup, p.buka_sampai, p.absen_buka,$b$);
  n := replace(n, $a$'rombel', h.rombel, 'status', h.status,$a$, $b$'rombel', h.rombel, 'status', h.status, 'ditutup', h.ditutup, 'buka_sampai', h.buka_sampai, 'terbuka', private.lms_terbuka(h.id),$b$);
  if strpos(n, 'h.buka_sampai') = 0 or strpos(n, 'p.ditutup') = 0 then raise exception 'pola dashboard tidak ditemukan'; end if;
  execute n;
end $$;

-- Salinan ke kelas lain tidak menggandakan topik pembuka yang sudah dibuat otomatis.
do $$
declare d text := pg_get_functiondef('public.lms_salin_pertemuan(uuid,uuid[])'::regprocedure);
        lama text := $a$where f.pertemuan_id = t.id and not f.dihapus and f.penulis_peran = 'guru' order by f.dibuat_pada;$a$;
        baru text := $b$where f.pertemuan_id = t.id and not f.dihapus and f.penulis_peran = 'guru'
          and not exists (select 1 from public.forum_topik x where x.pertemuan_id = baru and not x.dihapus and x.penulis_peran = 'guru' and x.judul = f.judul)
        order by f.dibuat_pada;$b$;
begin
  if strpos(d, lama) = 0 then raise exception 'pola salin forum tidak ditemukan'; end if;
  execute replace(d, lama, baru);
end $$;
