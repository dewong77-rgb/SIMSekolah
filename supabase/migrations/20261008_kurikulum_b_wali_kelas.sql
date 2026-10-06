-- Kurikulum B: usulan dan persetujuan wali kelas.
-- Waka atau Staf Kurikulum mengusulkan, Kepala Sekolah memutuskan. Hasil yang disetujui menjadi dasar SK dan dibandingkan dengan wali kelas di Dapodik.
-- Tidak ada penghapusan: usulan lama diberi status 'diganti' atau 'ditarik' agar riwayat tetap ada. Data Dapodik tidak diubah.

insert into public.izin (kode, nama, bidang) values
  ('kurikulum.setujui', 'Menyetujui wali kelas dan keputusan kurikulum', 'Kurikulum')
on conflict (kode) do nothing;
insert into public.jabatan_izin (jabatan_kode, izin_kode) values ('kepala_sekolah', 'kurikulum.setujui')
on conflict do nothing;

create table if not exists public.kur_wali (
  id uuid primary key default gen_random_uuid(),
  rombel_id uuid not null references public.rombel(id) on delete cascade,
  ptk_id uuid not null references public.ptk(id) on delete cascade,
  tahun_ajaran text not null check (tahun_ajaran ~ '^\d{4}/\d{4}$'),
  status text not null default 'usulan' check (status in ('usulan', 'disetujui', 'ditolak', 'diganti', 'ditarik')),
  catatan text check (char_length(catatan) <= 500),
  dibuat_oleh uuid default auth.uid(),
  dibuat_pada timestamptz not null default now(),
  diputuskan_oleh uuid,
  diputuskan_pada timestamptz
);
create unique index if not exists kur_wali_rombel_aktif on public.kur_wali (rombel_id) where status in ('usulan', 'disetujui');
create unique index if not exists kur_wali_guru_aktif on public.kur_wali (ptk_id, tahun_ajaran) where status in ('usulan', 'disetujui');
alter table public.kur_wali enable row level security;

create or replace function private.kur_boleh_setuju() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.punya_izin('kurikulum.setujui', null)
$$;

create or replace function public.kur_wali_izin() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat()
    then jsonb_build_object('usul', private.kur_boleh(), 'setuju', private.kur_boleh_setuju()) else null end
$$;

-- Satu baris per rombel Kelas Utama: wali di Dapodik, usulan aktif, dan usulan terakhir yang ditolak.
create or replace function public.kur_wali_data(p_ta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'rombel_id', r.id, 'rombel', r.nama, 'tingkat', r.tingkat, 'program', private.kur_program(r.nama),
             'jumlah_siswa', coalesce(r.jumlah_l_profil, 0) + coalesce(r.jumlah_p_profil, 0),
             'wali_dapodik_id', r.wali_kelas_ptk_id, 'wali_dapodik', coalesce(pd.nama, r.wali_kelas_nama),
             'usulan_id', w.id, 'ptk_id', w.ptk_id, 'wali', pw.nama, 'status', w.status, 'catatan', w.catatan,
             'diputuskan_pada', w.diputuskan_pada)
           order by r.tingkat, r.nama)
      from public.rombel r
      join public.semester s on s.semester_id = r.semester_id and s.tahun_ajaran = p_ta
      left join public.ptk pd on pd.id = r.wali_kelas_ptk_id
      left join lateral (select x.* from public.kur_wali x where x.rombel_id = r.id and x.status in ('usulan', 'disetujui', 'ditolak')
                          order by (x.status <> 'ditolak') desc, x.dibuat_pada desc limit 1) w on true
      left join public.ptk pw on pw.id = w.ptk_id
     where r.jenis_rombel = 'Kelas Utama' and r.npsn = private.npsn_saya()), '[]'::jsonb) else null end
$$;

create or replace function public.kur_wali_usulkan(p_rombel uuid, p_ptk uuid, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rombel; v_ta text; v_lama public.kur_wali;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengusulkan wali kelas.'; end if;
  select * into r from public.rombel where id = p_rombel and npsn = private.npsn_saya() and jenis_rombel = 'Kelas Utama';
  if r.id is null then raise exception 'Rombel tidak ditemukan.'; end if;
  select tahun_ajaran into v_ta from public.semester where semester_id = r.semester_id;
  select * into v_lama from public.kur_wali where rombel_id = p_rombel and status in ('usulan', 'disetujui');
  if p_ptk is null then
    if v_lama.id is not null then
      update public.kur_wali set status = 'ditarik', diputuskan_oleh = auth.uid(), diputuskan_pada = now() where id = v_lama.id;
    end if;
    return;
  end if;
  if not exists (select 1 from public.ptk where id = p_ptk and npsn = r.npsn) then raise exception 'Guru tidak ditemukan.'; end if;
  if v_lama.id is not null and v_lama.ptk_id = p_ptk then return; end if;
  if exists (select 1 from public.kur_wali where ptk_id = p_ptk and tahun_ajaran = v_ta and status in ('usulan', 'disetujui') and rombel_id <> p_rombel) then
    raise exception 'Guru ini sudah diusulkan atau ditetapkan sebagai wali kelas lain pada tahun ajaran yang sama.';
  end if;
  if v_lama.id is not null then
    update public.kur_wali set status = 'diganti', diputuskan_oleh = auth.uid(), diputuskan_pada = now() where id = v_lama.id;
  end if;
  insert into public.kur_wali (rombel_id, ptk_id, tahun_ajaran, catatan) values (p_rombel, p_ptk, v_ta, left(btrim(p_catatan), 500));
end $$;

create or replace function public.kur_wali_putuskan(p_id uuid, p_setuju boolean, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare w public.kur_wali;
begin
  if not private.kur_boleh_setuju() then raise exception 'Hanya Kepala Sekolah yang dapat memutuskan wali kelas.'; end if;
  select x.* into w from public.kur_wali x join public.rombel r on r.id = x.rombel_id where x.id = p_id and r.npsn = private.npsn_saya();
  if w.id is null then raise exception 'Usulan tidak ditemukan.'; end if;
  if w.status <> 'usulan' then raise exception 'Usulan ini sudah diputuskan.'; end if;
  if not p_setuju and nullif(btrim(p_catatan), '') is null then raise exception 'Alasan penolakan wajib diisi.'; end if;
  update public.kur_wali set status = case when p_setuju then 'disetujui' else 'ditolak' end, catatan = coalesce(nullif(left(btrim(p_catatan), 500), ''), catatan),
         diputuskan_oleh = auth.uid(), diputuskan_pada = now()
   where id = p_id;
end $$;

revoke execute on function public.kur_wali_izin() from public, anon;
revoke execute on function public.kur_wali_data(text) from public, anon;
revoke execute on function public.kur_wali_usulkan(uuid, uuid, text) from public, anon;
revoke execute on function public.kur_wali_putuskan(uuid, boolean, text) from public, anon;
grant execute on function public.kur_wali_izin() to authenticated;
grant execute on function public.kur_wali_data(text) to authenticated;
grant execute on function public.kur_wali_usulkan(uuid, uuid, text) to authenticated;
grant execute on function public.kur_wali_putuskan(uuid, boolean, text) to authenticated;
