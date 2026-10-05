-- Aturan nilai pertemuan versi final (keputusan Dewong, 2026-10-04):
-- tiga tahap wajib (absen otomatis, bahan bacaan minimal 10 menit, lembar kerja terkumpul) memberi nilai
-- otomatis sebesar KKTP TP terkait pertemuan. Guru masih bisa menilai isi lembar kerja untuk menaikkan nilai
-- di atas KKTP. Forum dan kuis memberi bonus tambahan di atas nilai dasar, total nilai dibatasi 100.

-- Jam mulai membaca per siswa per bahan bacaan, dipakai untuk menegakkan jeda baca minimal.
create table public.progres_mulai (
  materi_id uuid not null references public.materi(id) on delete cascade,
  peserta_didik_id uuid not null references public.peserta_didik(id),
  mulai_pada timestamptz not null default now(),
  primary key (materi_id, peserta_didik_id)
);
create index progres_mulai_pd_idx on public.progres_mulai(peserta_didik_id);
alter table public.progres_mulai enable row level security;
revoke all on table public.progres_mulai from anon, authenticated;

-- KKTP (nilai tuntas) tertinggi dari TP yang ditautkan ke satu pertemuan. 70 bila pertemuan tidak ditautkan rencana.
create or replace function private.lms_kktp_pertemuan(p_pertemuan uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; ka public.kelas_ajar%rowtype; v_tingkat text; v_max int;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found or t.tp_kode is null then return 70; end if;
  select * into ka from public.kelas_ajar where id = t.kelas_ajar_id;
  select upper(split_part(r.nama, ' ', 1)) into v_tingkat from public.rombel r where r.id = ka.rombel_id;
  select max(x.nilai_tuntas) into v_max from public.rencana_tp x
    where x.ptk_id = ka.ptk_id and lower(x.mapel) = lower(ka.mapel) and x.tingkat = v_tingkat
      and x.kode = any (select btrim(z) from unnest(string_to_array(t.tp_kode, ',')) z);
  return coalesce(v_max, 70);
end $$;
revoke all on function private.lms_kktp_pertemuan(uuid) from public, anon, authenticated;

-- lms_materi_buka: mencatat jam mulai baca (sekali, saat pertama dibuka) dan membawanya ke siswa untuk hitung mundur.
create or replace function public.lms_materi_buka(p_pertemuan uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.pertemuan%rowtype; v_kelola boolean; v_pd uuid;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  v_kelola := private.lms_kelola(t.kelas_ajar_id);
  if not v_kelola then
    if t.status <> 'terbit' or not private.lms_anggota(t.kelas_ajar_id) then
      raise exception 'Tidak tersedia.' using errcode = '42501';
    end if;
    if not private.lms_gerbang_lolos(p_pertemuan) then
      raise exception 'Pertemuan ini terkunci: selesaikan pertemuan sebelumnya atau tunggu guru membukanya.' using errcode = 'P0001', hint = 'gerbang_absen';
    end if;
  end if;
  v_pd := private.pd_id_saya();
  if v_pd is not null then
    insert into public.progres_mulai (materi_id, peserta_didik_id)
      select m.id, v_pd from public.materi m
      where m.pertemuan_id = p_pertemuan and m.untuk = 'siswa' and m.tugas_id is null
    on conflict do nothing;
  end if;
  return jsonb_build_object(
    'pertemuan', jsonb_build_object('id', t.id, 'nomor', t.nomor, 'judul', t.judul, 'tujuan', t.tujuan),
    'materi', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'urutan', m.urutan, 'jenis', m.jenis, 'judul', m.judul, 'isi', m.isi, 'url', m.url, 'format', m.format, 'untuk', m.untuk,
        'tugas_id', case when t.status = 'terbit' or v_kelola then m.tugas_id end,
        'selesai', exists (select 1 from public.progres_materi pm
                           where pm.materi_id = m.id and pm.peserta_didik_id = private.pd_id_saya()),
        'mulai_pada', (select pm2.mulai_pada from public.progres_mulai pm2 where pm2.materi_id = m.id and pm2.peserta_didik_id = v_pd))
        order by m.urutan, m.dibuat_pada)
      from public.materi m where m.pertemuan_id = p_pertemuan and (v_kelola or m.untuk = 'siswa')), '[]'::jsonb));
end $$;

-- lms_tandai_selesai: bahan bacaan baru bisa ditandai selesai setelah 10 menit sejak pertama dibuka.
-- Lembar kerja (tugas_id terisi) tidak kena jeda ini, alurnya lewat lms_lembar_kumpul.
create or replace function public.lms_tandai_selesai(p_materi uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_pert uuid; v_kelas uuid; v_pd uuid := private.pd_id_saya(); v_status text; v_tugas uuid; v_mulai timestamptz; v_sisa numeric;
begin
  select m.pertemuan_id, t.kelas_ajar_id, t.status, m.tugas_id into v_pert, v_kelas, v_status, v_tugas
  from public.materi m join public.pertemuan t on t.id = m.pertemuan_id where m.id = p_materi and m.untuk = 'siswa';
  if v_pert is null or v_pd is null or v_status <> 'terbit' or not private.lms_anggota(v_kelas) then
    raise exception 'Tidak tersedia.' using errcode = '42501';
  end if;
  if not private.lms_gerbang_lolos(v_pert) then
    raise exception 'Pertemuan ini terkunci: selesaikan pertemuan sebelumnya atau tunggu guru membukanya.' using errcode = 'P0001', hint = 'gerbang_absen';
  end if;
  if v_tugas is null then
    select mulai_pada into v_mulai from public.progres_mulai where materi_id = p_materi and peserta_didik_id = v_pd;
    if v_mulai is null then
      insert into public.progres_mulai (materi_id, peserta_didik_id) values (p_materi, v_pd) on conflict do nothing;
      v_mulai := now();
    end if;
    v_sisa := 10 - extract(epoch from (now() - v_mulai)) / 60;
    if v_sisa > 0 then
      raise exception 'Baca dulu minimal 10 menit sebelum menandai selesai. Sisa % menit.', ceil(v_sisa)
        using errcode = 'P0001', hint = 'durasi_kurang';
    end if;
  end if;
  insert into public.progres_materi (materi_id, peserta_didik_id) values (p_materi, v_pd)
  on conflict do nothing;
end $$;

-- lms_nilai_pertemuan_pd: nilai dasar = KKTP begitu tuntas (tidak menunggu guru menilai). Guru menilai isi
-- lembar kerja tetap dipakai kalau sudah lengkap dan hasilnya lebih tinggi dari KKTP. Bonus kuis (10 persen
-- nilai kuis terbaik, maksimal 10 poin) dan bonus forum (2 poin per kiriman bermakna minimal 20 karakter,
-- maksimal 5 poin) ditambahkan di atas nilai dasar, total dibatasi 100.
create or replace function private.lms_nilai_pertemuan_pd(p_pertemuan uuid, p_pd uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  t public.pertemuan%rowtype; v_hadir boolean; b_tot int; b_sel int; l_tot int; l_kum int; l_nil int;
  v_lembar numeric; v_kuis numeric; v_forum_n int; v_kktp numeric; v_dasar numeric;
  v_bonus_kuis numeric := 0; v_bonus_forum numeric := 0; v_tuntas boolean; v_nilai numeric;
begin
  select * into t from public.pertemuan where id = p_pertemuan;
  v_hadir := true;
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
  select count(*) into v_forum_n from (
    select ft.id from public.forum_topik ft join public.profil_pengguna u on u.user_id = ft.penulis_user
      where ft.pertemuan_id = t.id and not ft.dihapus and u.peserta_didik_id = p_pd and length(btrim(ft.isi)) >= 20
    union all
    select fb.id from public.forum_balasan fb join public.forum_topik ft2 on ft2.id = fb.topik_id
      join public.profil_pengguna u on u.user_id = fb.penulis_user
      where ft2.pertemuan_id = t.id and not fb.dihapus and u.peserta_didik_id = p_pd and length(btrim(fb.isi)) >= 20
  ) x;
  v_kktp := private.lms_kktp_pertemuan(p_pertemuan);
  v_tuntas := v_hadir and b_sel >= b_tot and l_kum >= l_tot and (b_tot + l_tot) > 0;
  if v_tuntas then
    v_dasar := case when l_tot > 0 and l_nil >= l_tot then greatest(v_kktp, v_lembar) else v_kktp end;
    v_bonus_kuis := least(10, round(coalesce(v_kuis, 0) * 0.1, 1));
    v_bonus_forum := least(5, v_forum_n * 2);
    v_nilai := least(100, round(v_dasar + v_bonus_kuis + v_bonus_forum, 1));
  end if;
  return jsonb_build_object('hadir', v_hadir, 'bacaan_total', b_tot, 'bacaan_selesai', b_sel, 'lembar_total', l_tot, 'lembar_terkumpul', l_kum,
    'lembar_dinilai', l_nil, 'nilai_lembar', round(v_lembar, 1), 'kktp', v_kktp, 'kuis', round(v_kuis, 1),
    'bonus_kuis', v_bonus_kuis, 'bonus_forum', v_bonus_forum, 'bonus', round(v_bonus_kuis + v_bonus_forum, 1),
    'tuntas', v_tuntas, 'nilai', v_nilai);
end $$;
revoke all on function private.lms_nilai_pertemuan_pd(uuid, uuid) from public, anon, authenticated;
