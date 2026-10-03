-- Profil sekolah yang diatur manual oleh super admin: kontak, koordinat, media sosial, visi, misi.
-- Terpisah dari public.sekolah (diisi unggahan Dapodik) agar unggahan ulang tidak menimpa isian ini.
-- Situs publik membaca lewat public.profil_sekolah_publik(): isian manual menang, kosong jatuh ke data Dapodik.

create table if not exists public.profil_sekolah_manual (
  npsn text primary key,
  singkatan text,
  slogan text,
  tentang text,
  visi text,
  misi text,
  sejarah text,
  akreditasi text,
  tahun_berdiri int check (tahun_berdiri between 1800 and 2100),
  alamat_tampil text,
  telepon text,
  email text,
  whatsapp text,
  jam_layanan text,
  lintang numeric check (lintang between -90 and 90),
  bujur numeric check (bujur between -180 and 180),
  website text check (website is null or website ~ '^https?://'),
  instagram text check (instagram is null or instagram ~ '^https?://'),
  facebook text check (facebook is null or facebook ~ '^https?://'),
  youtube text check (youtube is null or youtube ~ '^https?://'),
  tiktok text check (tiktok is null or tiktok ~ '^https?://'),
  x_twitter text check (x_twitter is null or x_twitter ~ '^https?://'),
  diperbarui_pada timestamptz not null default now(),
  diperbarui_oleh uuid
);
alter table public.profil_sekolah_manual enable row level security;
drop policy if exists profil_sekolah_super on public.profil_sekolah_manual;
create policy profil_sekolah_super on public.profil_sekolah_manual for all to authenticated
  using ((select private.adalah_super())) with check ((select private.adalah_super()));

create or replace function private.jejak_profil_sekolah() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.diperbarui_pada := now();
  new.diperbarui_oleh := auth.uid();
  return new;
end $$;
drop trigger if exists jejak_profil_sekolah on public.profil_sekolah_manual;
create trigger jejak_profil_sekolah before insert or update on public.profil_sekolah_manual
  for each row execute function private.jejak_profil_sekolah();

create or replace function public.profil_sekolah_publik()
returns jsonb language sql security definer stable set search_path = '' as $$
  select jsonb_build_object(
    'npsn', s.npsn,
    'nama', s.nama,
    'singkatan', nullif(p.singkatan, ''),
    'slogan', nullif(p.slogan, ''),
    'tentang', nullif(p.tentang, ''),
    'visi', nullif(p.visi, ''),
    'misi', nullif(p.misi, ''),
    'sejarah', nullif(p.sejarah, ''),
    'akreditasi', nullif(p.akreditasi, ''),
    'tahun_berdiri', p.tahun_berdiri,
    'jenjang', s.jenjang,
    'status_sekolah', s.status_sekolah,
    'alamat', coalesce(nullif(p.alamat_tampil, ''), nullif(concat_ws(', ',
        nullif(s.alamat, ''),
        case when coalesce(s.rt, '') <> '' or coalesce(s.rw, '') <> '' then 'RT ' || coalesce(s.rt, '-') || ' RW ' || coalesce(s.rw, '-') end,
        nullif(s.kelurahan, ''), nullif(s.kecamatan, ''), nullif(s.kabupaten_kota, ''), nullif(s.provinsi, ''), nullif(s.kode_pos, '')), '')),
    'kecamatan', s.kecamatan,
    'kabupaten_kota', s.kabupaten_kota,
    'provinsi', s.provinsi,
    'telepon', coalesce(nullif(p.telepon, ''), nullif(s.telepon, '')),
    'email', coalesce(nullif(p.email, ''), nullif(s.email, '')),
    'website', coalesce(nullif(p.website, ''), nullif(s.website, '')),
    'whatsapp', nullif(p.whatsapp, ''),
    'jam_layanan', nullif(p.jam_layanan, ''),
    'lintang', coalesce(p.lintang, s.lintang),
    'bujur', coalesce(p.bujur, s.bujur),
    'instagram', p.instagram, 'facebook', p.facebook, 'youtube', p.youtube, 'tiktok', p.tiktok, 'x_twitter', p.x_twitter
  )
  from public.sekolah s
  left join public.profil_sekolah_manual p on p.npsn = s.npsn
  order by s.diperbarui_pada desc nulls last
  limit 1
$$;
revoke all on function public.profil_sekolah_publik() from public;
grant execute on function public.profil_sekolah_publik() to anon, authenticated;
