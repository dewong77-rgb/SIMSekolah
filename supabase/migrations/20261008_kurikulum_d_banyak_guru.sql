-- Kurikulum D: satu mapel pada satu rombel boleh diampu beberapa guru, masing-masing dengan JP sendiri (sesuai SK pembagian tugas).
-- kur_beban punya kolom jp dan unik per (rombel, mapel, guru). Fungsi baru: kur_butuh, kur_beban_atur, kur_jadwal_pasang.
-- Fungsi lama kur_beban_set dan kur_jadwal_set dipertahankan hanya untuk memberi pesan arahan.
-- Batas JP per mapel di kur_struktur dilonggarkan jadi 40 (konsentrasi keahlian SMK bisa 18 sampai 26 JP).

alter table public.kur_beban add column if not exists jp int not null default 0 check (jp between 0 and 40);
alter table public.kur_beban drop constraint if exists kur_beban_rombel_id_mapel_id_key;
alter table public.kur_beban add constraint kur_beban_unik unique (rombel_id, mapel_id, ptk_id);

create or replace function private.kur_butuh(p_ta text)
returns table (rombel_id uuid, rombel text, tingkat int, program text, mapel_id uuid, mapel text, kelompok text, urutan int, jp int, ptk_id uuid, jp_ptk int)
language sql stable security definer set search_path = '' as $$
  select k.rombel_id, k.rombel, k.tingkat, k.program, k.mapel_id, k.mapel, k.kelompok, k.urutan, k.jp, b.ptk_id, b.jp
    from (
      select distinct on (r.id, st.mapel_id) r.id rombel_id, r.nama rombel, r.tingkat, private.kur_program(r.nama) program,
             st.mapel_id, m.nama mapel, m.kelompok, m.urutan, st.jp_minggu jp
        from public.rombel r
        join public.semester s on s.semester_id = r.semester_id and s.tahun_ajaran = p_ta
        join public.kur_struktur st on st.tahun_ajaran = p_ta and st.tingkat = r.tingkat
                                   and (st.program = '*' or upper(st.program) = private.kur_program(r.nama))
        join public.kur_mapel m on m.id = st.mapel_id
       where r.jenis_rombel = 'Kelas Utama' and r.npsn = private.npsn_saya()
       order by r.id, st.mapel_id, (st.program = '*')
    ) k
    left join public.kur_beban b on b.rombel_id = k.rombel_id and b.mapel_id = k.mapel_id
$$;
revoke execute on function private.kur_butuh(text) from public, anon, authenticated;

create or replace function public.kur_beban_data(p_ta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'rombel_id', x.rombel_id, 'rombel', x.rombel, 'tingkat', x.tingkat, 'program', x.program,
             'mapel_id', x.mapel_id, 'mapel', x.mapel, 'kelompok', x.kelompok, 'jp', x.jp, 'jp_terbagi', x.jp_terbagi, 'guru', x.guru)
           order by x.tingkat, x.rombel, x.urutan, x.mapel)
      from (
        select k.rombel_id, k.rombel, k.tingkat, k.program, k.mapel_id, k.mapel, k.kelompok, k.urutan, k.jp,
               coalesce(sum(k.jp_ptk), 0) jp_terbagi,
               coalesce(jsonb_agg(jsonb_build_object('ptk_id', k.ptk_id, 'guru', p.nama, 'jp', k.jp_ptk,
                                                     'status', private.kur_status(k.ptk_id, k.mapel_id)) order by p.nama)
                        filter (where k.ptk_id is not null), '[]'::jsonb) guru
          from private.kur_butuh(p_ta) k left join public.ptk p on p.id = k.ptk_id
         group by k.rombel_id, k.rombel, k.tingkat, k.program, k.mapel_id, k.mapel, k.kelompok, k.urutan, k.jp
      ) x), '[]'::jsonb) else null end
$$;

create or replace function public.kur_guru_daftar(p_ta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'ptk_id', p.id, 'nama', p.nama, 'jenis_ptk', p.jenis_ptk, 'status_kepegawaian', p.status_kepegawaian,
             'kompetensi', p.kompetensi, 'sertifikasi', p.sertifikasi, 'jurusan_prodi', p.jurusan_prodi, 'mengajar', p.mengajar,
             'jjm_dapodik', p.jjm, 'tugas_tambahan', p.tugas_tambahan, 'jam_tugas_tambahan', p.jam_tugas_tambahan,
             'jp_total', coalesce(b.jp, 0), 'jumlah_rombel', coalesce(b.rombel, 0),
             'jp_tidak_linier', coalesce(b.tidak_linier, 0),
             'status', (select jsonb_object_agg(m.id, private.kur_status(p.id, m.id)) from public.kur_mapel m where m.aktif))
           order by p.nama)
      from public.ptk p
      left join (select kk.ptk_id, sum(kk.jp_ptk) jp, count(distinct kk.rombel_id) rombel,
                        sum(kk.jp_ptk) filter (where private.kur_status(kk.ptk_id, kk.mapel_id) in ('tidak_linier', 'manual_tidak', 'tanpa_data')) tidak_linier
                   from private.kur_butuh(p_ta) kk where kk.ptk_id is not null group by kk.ptk_id) b on b.ptk_id = p.id
     where p.npsn = private.npsn_saya()
       and (p.jenis_ptk in ('Guru', 'Kepala Sekolah') or b.ptk_id is not null)), '[]'::jsonb) else null end
$$;

create or replace function public.kur_beban_atur(p_rombel uuid, p_mapel uuid, p_ptk uuid, p_jp int) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rombel; v_ta text; k record; v_lain int;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  select * into r from public.rombel where id = p_rombel and npsn = private.npsn_saya() and jenis_rombel = 'Kelas Utama';
  if r.id is null then raise exception 'Rombel tidak ditemukan.'; end if;
  select tahun_ajaran into v_ta from public.semester where semester_id = r.semester_id;
  select * into k from private.kur_butuh(v_ta) x where x.rombel_id = p_rombel and x.mapel_id = p_mapel limit 1;
  if k.rombel_id is null then raise exception 'Mapel ini belum ada dalam struktur kurikulum untuk kelas tersebut.'; end if;
  if coalesce(p_jp, 0) <= 0 then
    delete from public.kur_beban where rombel_id = p_rombel and mapel_id = p_mapel and ptk_id = p_ptk;
    return;
  end if;
  if not exists (select 1 from public.ptk where id = p_ptk and npsn = r.npsn) then raise exception 'Guru tidak ditemukan.'; end if;
  select coalesce(sum(jp), 0) into v_lain from public.kur_beban where rombel_id = p_rombel and mapel_id = p_mapel and ptk_id <> p_ptk;
  if v_lain + p_jp > k.jp then raise exception 'Jumlah jam melebihi struktur (% JP per minggu, guru lain sudah % JP).', k.jp, v_lain; end if;
  insert into public.kur_beban (rombel_id, mapel_id, ptk_id, jp) values (p_rombel, p_mapel, p_ptk, p_jp)
  on conflict (rombel_id, mapel_id, ptk_id) do update set jp = excluded.jp, dibuat_oleh = auth.uid(), dibuat_pada = now();
end $$;

create or replace function public.kur_jadwal_pasang(p_rombel uuid, p_hari int, p_jam_ke int, p_mapel uuid, p_ptk uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rombel; v_maks int; b public.kur_beban; v_pakai int; v_bentrok text;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang menyusun jadwal.'; end if;
  select * into r from public.rombel where id = p_rombel and npsn = private.npsn_saya() and jenis_rombel = 'Kelas Utama';
  if r.id is null then raise exception 'Rombel tidak ditemukan.'; end if;
  if p_hari not between 1 and 6 then raise exception 'Hari tidak valid.'; end if;
  select count(*) into v_maks from public.jam_bel where aktif and jenis = 'pelajaran' and kelompok = case when p_hari = 5 then 'jumat' else 'senin_kamis' end;
  if p_jam_ke < 1 or p_jam_ke > v_maks then raise exception 'Jam ke-% tidak ada di jam bel hari itu (maksimal %).', p_jam_ke, v_maks; end if;
  if p_mapel is null then
    update public.kur_jadwal set mapel_id = null, ptk_id = null, diubah_oleh = auth.uid(), diubah_pada = now()
     where rombel_id = p_rombel and hari = p_hari and jam_ke = p_jam_ke;
    return;
  end if;
  select * into b from public.kur_beban where rombel_id = p_rombel and mapel_id = p_mapel and ptk_id = p_ptk;
  if b.id is null then raise exception 'Guru ini belum dibagi untuk mapel dan kelas tersebut. Atur dulu di Beban mengajar.'; end if;
  select count(*) into v_pakai from public.kur_jadwal
   where rombel_id = p_rombel and mapel_id = p_mapel and ptk_id = p_ptk and not (hari = p_hari and jam_ke = p_jam_ke);
  if v_pakai >= b.jp then raise exception 'Jam guru ini untuk mapel tersebut sudah penuh (% JP per minggu).', b.jp; end if;
  select rr.nama into v_bentrok from public.kur_jadwal j join public.rombel rr on rr.id = j.rombel_id
   where j.semester_id = r.semester_id and j.ptk_id = p_ptk and j.hari = p_hari and j.jam_ke = p_jam_ke and j.rombel_id <> p_rombel limit 1;
  if v_bentrok is not null then raise exception 'Guru sudah mengajar di kelas % pada jam itu.', v_bentrok; end if;
  insert into public.kur_jadwal (rombel_id, semester_id, hari, jam_ke, mapel_id, ptk_id)
  values (p_rombel, r.semester_id, p_hari, p_jam_ke, p_mapel, p_ptk)
  on conflict (rombel_id, hari, jam_ke) do update
    set mapel_id = excluded.mapel_id, ptk_id = excluded.ptk_id, semester_id = excluded.semester_id, diubah_oleh = auth.uid(), diubah_pada = now();
end $$;

create or replace function public.kur_jadwal_data(p_ta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'rombel_id', j.rombel_id, 'rombel', r.nama, 'hari', j.hari, 'jam_ke', j.jam_ke,
             'mapel_id', j.mapel_id, 'mapel', m.nama, 'ptk_id', j.ptk_id, 'guru', p.nama,
             'valid', exists (select 1 from public.kur_beban b where b.rombel_id = j.rombel_id and b.mapel_id = j.mapel_id and b.ptk_id = j.ptk_id))
           order by r.nama, j.hari, j.jam_ke)
      from public.kur_jadwal j
      join public.rombel r on r.id = j.rombel_id and r.npsn = private.npsn_saya()
      join public.semester s on s.semester_id = r.semester_id and s.tahun_ajaran = p_ta
      left join public.kur_mapel m on m.id = j.mapel_id
      left join public.ptk p on p.id = j.ptk_id
     where j.mapel_id is not null), '[]'::jsonb) else null end
$$;

create or replace function public.kur_jadwal_set(p_rombel uuid, p_hari int, p_jam_ke int, p_mapel uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Fungsi lama. Gunakan kur_jadwal_pasang (menyertakan guru).';
end $$;
create or replace function public.kur_beban_set(p_rombel uuid, p_mapel uuid, p_ptk uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Fungsi lama. Gunakan kur_beban_atur (menyertakan jumlah jam).';
end $$;

revoke execute on function public.kur_beban_atur(uuid, uuid, uuid, int) from public, anon;
revoke execute on function public.kur_jadwal_pasang(uuid, int, int, uuid, uuid) from public, anon;
grant execute on function public.kur_beban_atur(uuid, uuid, uuid, int) to authenticated;
grant execute on function public.kur_jadwal_pasang(uuid, int, int, uuid, uuid) to authenticated;
