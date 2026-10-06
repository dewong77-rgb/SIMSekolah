-- Kurikulum C: jadwal pelajaran per kelas, dengan penjagaan bentrok guru dan kuota JP per mapel.
-- Jam ke-n dihitung dari baris jenis 'pelajaran' di jam_bel (Senin sampai Kamis dan Jumat punya daftar sendiri).
-- Guru slot diambil dari pembagian di kur_beban. Mengosongkan slot mengosongkan mapel dan guru, tanpa menghapus baris.

create table if not exists public.kur_jadwal (
  id uuid primary key default gen_random_uuid(),
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  semester_id text not null,
  hari int not null check (hari between 1 and 6),
  jam_ke int not null check (jam_ke between 1 and 20),
  mapel_id uuid references public.kur_mapel(id),
  ptk_id uuid references public.ptk(id) on delete set null,
  diubah_oleh uuid default auth.uid(),
  diubah_pada timestamptz not null default now(),
  unique (rombel_id, hari, jam_ke)
);
create unique index if not exists kur_jadwal_guru_unik on public.kur_jadwal (semester_id, ptk_id, hari, jam_ke) where ptk_id is not null;
alter table public.kur_jadwal enable row level security;

create or replace function public.kur_jadwal_data(p_ta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'rombel_id', j.rombel_id, 'rombel', r.nama, 'hari', j.hari, 'jam_ke', j.jam_ke,
             'mapel_id', j.mapel_id, 'mapel', m.nama, 'ptk_id', j.ptk_id, 'guru', p.nama,
             'ptk_beban_id', b.ptk_id)
           order by r.nama, j.hari, j.jam_ke)
      from public.kur_jadwal j
      join public.rombel r on r.id = j.rombel_id and r.npsn = private.npsn_saya()
      join public.semester s on s.semester_id = r.semester_id and s.tahun_ajaran = p_ta
      left join public.kur_mapel m on m.id = j.mapel_id
      left join public.ptk p on p.id = j.ptk_id
      left join public.kur_beban b on b.rombel_id = j.rombel_id and b.mapel_id = j.mapel_id
     where j.mapel_id is not null), '[]'::jsonb) else null end
$$;

create or replace function public.kur_jadwal_set(p_rombel uuid, p_hari int, p_jam_ke int, p_mapel uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rombel; v_ta text; v_maks int; k record; v_pakai int; v_bentrok text;
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
  select tahun_ajaran into v_ta from public.semester where semester_id = r.semester_id;
  select * into k from private.kur_kebutuhan(v_ta) x where x.rombel_id = p_rombel and x.mapel_id = p_mapel;
  if k.rombel_id is null then raise exception 'Mapel ini belum ada dalam struktur kurikulum kelas tersebut.'; end if;
  if k.ptk_id is null then raise exception 'Mapel ini belum dibagi ke guru. Bagi dulu di Beban mengajar.'; end if;
  select count(*) into v_pakai from public.kur_jadwal
   where rombel_id = p_rombel and mapel_id = p_mapel and not (hari = p_hari and jam_ke = p_jam_ke);
  if v_pakai >= k.jp then raise exception 'Jam mapel ini sudah penuh (% JP per minggu).', k.jp; end if;
  select rr.nama into v_bentrok from public.kur_jadwal j join public.rombel rr on rr.id = j.rombel_id
   where j.semester_id = r.semester_id and j.ptk_id = k.ptk_id and j.hari = p_hari and j.jam_ke = p_jam_ke and j.rombel_id <> p_rombel limit 1;
  if v_bentrok is not null then raise exception 'Guru sudah mengajar di kelas % pada jam itu.', v_bentrok; end if;
  insert into public.kur_jadwal (rombel_id, semester_id, hari, jam_ke, mapel_id, ptk_id)
  values (p_rombel, r.semester_id, p_hari, p_jam_ke, p_mapel, k.ptk_id)
  on conflict (rombel_id, hari, jam_ke) do update
    set mapel_id = excluded.mapel_id, ptk_id = excluded.ptk_id, semester_id = excluded.semester_id, diubah_oleh = auth.uid(), diubah_pada = now();
end $$;

revoke execute on function public.kur_jadwal_data(text) from public, anon;
revoke execute on function public.kur_jadwal_set(uuid, int, int, uuid) from public, anon;
grant execute on function public.kur_jadwal_data(text) to authenticated;
grant execute on function public.kur_jadwal_set(uuid, int, int, uuid) to authenticated;
