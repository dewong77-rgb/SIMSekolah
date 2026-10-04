-- Alur belajar tiga tahap (keputusan Dewong, 2026-10-04): absen, bahan bacaan wajib dibaca, lembar kerja.
-- Tiga tahap itu membentuk nilai pertemuan. Forum diskusi mengikuti. Kuis atau latihan soal opsional, nilai tambah.
-- Kelengkapan terbit: bahan bacaan dan lembar kerja. Forum pembuka dibuat otomatis saat terbit.

create or replace function private.lms_kelengkapan(p_pertemuan uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with h as (
    select
      (select count(*) from public.materi m where m.pertemuan_id = p_pertemuan and m.untuk = 'siswa' and m.tugas_id is null) materi,
      (select count(*) from public.materi m where m.pertemuan_id = p_pertemuan and m.untuk = 'siswa' and m.tugas_id is not null) lembar,
      (select count(*) from public.asesmen a where a.pertemuan_id = p_pertemuan and not a.diarsipkan
         and exists (select 1 from public.soal s where s.asesmen_id = a.id and not s.dihapus)) latihan,
      (select count(*) from public.forum_topik f where f.pertemuan_id = p_pertemuan and not f.dihapus) forum
  )
  select jsonb_build_object(
    'materi', materi, 'lembar', lembar, 'latihan', latihan, 'forum', forum,
    'lengkap', materi > 0 and lembar > 0,
    'kurang', to_jsonb(array_remove(array[
      case when materi = 0 then 'bahan bacaan' end,
      case when lembar = 0 then 'lembar kerja' end], null)))
  from h
$$;

-- Forum pembuka otomatis saat pertemuan terbit.
create or replace function private.lms_forum_awal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'terbit' and auth.uid() is not null
     and not exists (select 1 from public.forum_topik f where f.pertemuan_id = new.id and not f.dihapus and f.penulis_peran = 'guru') then
    insert into public.forum_topik (pertemuan_id, kelas_ajar_id, penulis_user, penulis_nama, penulis_peran, judul, isi)
    values (new.id, new.kelas_ajar_id, auth.uid(), private.lms_nama_saya(), 'guru', 'Diskusi: ' || left(new.judul, 150),
            'Punya pertanyaan atau komentar tentang bahan bacaan dan lembar kerja pertemuan ini? Tulis di sini, dan balas juga teman yang bertanya.');
  end if;
  return new;
end $$;
create or replace trigger trg_pertemuan_forum_awal after insert or update of status on public.pertemuan
  for each row execute function private.lms_forum_awal();

-- Lembar kerja baru bisa diisi setelah semua bahan bacaan pertemuan itu ditandai selesai.
do $$
declare lama text := $a$  return t;
end$a$;
        baru text := $b$  if t.pertemuan_id is not null and exists (
       select 1 from public.materi m
       where m.pertemuan_id = t.pertemuan_id and m.untuk = 'siswa' and m.tugas_id is null
         and not exists (select 1 from public.progres_materi pm where pm.materi_id = m.id and pm.peserta_didik_id = v_pd)) then
    raise exception 'Baca semua bahan bacaan dulu sebelum mengerjakan lembar kerja.' using errcode = 'P0001', hint = 'gerbang_baca';
  end if;
  return t;
end$b$;
        d text := pg_get_functiondef('private.lms_lembar_siswa(uuid)'::regprocedure);
begin
  if strpos(d, lama) = 0 then raise exception 'pola tidak ditemukan'; end if;
  execute replace(d, lama, baru);
end $$;

-- Nilai pertemuan satu siswa. Tuntas = hadir, semua bahan bacaan dibaca, semua lembar kerja dikumpulkan.
-- Nilai = rata-rata nilai lembar kerja (skala 100), baru ada setelah tuntas dan dinilai guru.
-- Bonus kuis opsional = 10 persen dari rata-rata nilai terbaik kuis, paling banyak 10 poin. Total paling tinggi 100.
create or replace function private.lms_nilai_pertemuan_pd(p_pertemuan uuid, p_pd uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_hadir boolean; b_tot int; b_sel int; l_tot int; l_kum int; l_nil int; v_lembar numeric; v_kuis numeric; v_bonus numeric := 0; v_tuntas boolean; v_nilai numeric;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  v_hadir := (not t.wajib_absen) or exists (select 1 from public.absensi_pertemuan a where a.pertemuan_id = t.id and a.peserta_didik_id = p_pd and a.status <> 'alpa');
  select count(*), count(*) filter (where exists (select 1 from public.progres_materi pm where pm.materi_id = m.id and pm.peserta_didik_id = p_pd))
    into b_tot, b_sel from public.materi m where m.pertemuan_id = t.id and m.untuk = 'siswa' and m.tugas_id is null;
  select count(*), count(c.tugas_id), count(c.nilai), avg(c.nilai::numeric / nullif(g.nilai_maks, 0) * 100)
    into l_tot, l_kum, l_nil, v_lembar
    from public.materi m join public.tugas g on g.id = m.tugas_id and not g.dihapus
    left join public.kumpul_tugas c on c.tugas_id = g.id and c.peserta_didik_id = p_pd
    where m.pertemuan_id = t.id and m.untuk = 'siswa';
  select avg(x.n) into v_kuis from (select max(p.nilai) n from public.percobaan_asesmen p join public.asesmen a on a.id = p.asesmen_id
      where a.pertemuan_id = t.id and a.status = 'terbit' and not a.diarsipkan and p.peserta_didik_id = p_pd and p.selesai is not null and p.nilai is not null
      group by p.asesmen_id) x;
  v_tuntas := v_hadir and b_sel >= b_tot and l_kum >= l_tot and (b_tot + l_tot) > 0;
  if v_tuntas and l_tot > 0 and l_nil >= l_tot then
    v_bonus := least(10, round(coalesce(v_kuis, 0) * 0.1, 1));
    v_nilai := least(100, round(v_lembar + v_bonus, 1));
  end if;
  return jsonb_build_object('hadir', v_hadir, 'bacaan_total', b_tot, 'bacaan_selesai', b_sel, 'lembar_total', l_tot, 'lembar_terkumpul', l_kum,
    'lembar_dinilai', l_nil, 'nilai_lembar', round(v_lembar, 1), 'kuis', round(v_kuis, 1), 'bonus', v_bonus, 'tuntas', v_tuntas, 'nilai', v_nilai);
end $$;
revoke all on function private.lms_nilai_pertemuan_pd(uuid, uuid) from public, anon, authenticated;

create or replace function public.lms_nilai_pertemuan(p_pertemuan uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or not private.lms_kelola(t.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('peserta_didik_id', pd.id, 'nama', pd.nama, 'no_urut', kr.no_urut,
      'nilai', private.lms_nilai_pertemuan_pd(t.id, pd.id)) order by kr.no_urut nulls last, pd.nama)
    from public.kelas_ajar k join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id
    join public.peserta_didik pd on pd.id = kr.peserta_didik_id
    where k.id = t.kelas_ajar_id and pd.status_peserta_didik = 'aktif'), '[]'::jsonb);
end $$;
revoke all on function public.lms_nilai_pertemuan(uuid) from public, anon;
grant execute on function public.lms_nilai_pertemuan(uuid) to authenticated;

-- Langkah siswa membawa nilai pertemuan.
do $$
declare lama text := $a$  return r;
end$a$;
        baru text := $b$  return r || jsonb_build_object('nilai', private.lms_nilai_pertemuan_pd(p_pertemuan, v_pd));
end$b$;
        d text := pg_get_functiondef('public.lms_langkah_siswa(uuid)'::regprocedure);
begin
  if strpos(d, lama) = 0 then raise exception 'pola tidak ditemukan'; end if;
  execute replace(d, lama, baru);
end $$;
