-- LMS: pantau guru yang hadir dan mengakses LMS (untuk Waka Kurikulum).
-- Halaman LMS guru mengirim denyut tiap 2 menit selama tab terbuka. Denyut disimpan per guru per hari:
-- akses pertama, akses terakhir, dan jumlah denyut. Guru dianggap online bila denyut terakhir kurang dari 5 menit lalu.
-- Tabel tanpa policy; akses lewat fungsi security definer.

create table if not exists public.lms_kehadiran_guru (
  ptk_id uuid not null references public.ptk(id) on delete cascade,
  tanggal date not null default ((now() at time zone 'Asia/Jakarta')::date),
  pertama_akses timestamptz not null default now(),
  terakhir_akses timestamptz not null default now(),
  jumlah_denyut integer not null default 1,
  primary key (ptk_id, tanggal)
);
alter table public.lms_kehadiran_guru enable row level security;
revoke all on table public.lms_kehadiran_guru from anon, authenticated;

insert into public.izin (kode, nama, bidang) values
  ('lms.pantau_guru', 'Memantau kehadiran guru di LMS', 'Kurikulum')
on conflict (kode) do nothing;
insert into public.jabatan_izin (jabatan_kode, izin_kode) values
  ('waka_kurikulum', 'lms.pantau_guru'), ('staf_kurikulum', 'lms.pantau_guru'), ('kepala_sekolah', 'lms.pantau_guru')
on conflict do nothing;

create or replace function public.lms_denyut() returns void
language plpgsql security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya();
begin
  if auth.uid() is null or v_ptk is null then return; end if;
  insert into public.lms_kehadiran_guru (ptk_id) values (v_ptk)
  on conflict (ptk_id, tanggal) do update
    set terakhir_akses = now(), jumlah_denyut = public.lms_kehadiran_guru.jumlah_denyut + 1;
end $$;
revoke all on function public.lms_denyut() from public, anon;
grant execute on function public.lms_denyut() to authenticated;

-- Daftar guru sekolah: yang mengampu kelas ajar aktif, ditambah yang mengakses LMS pada tanggal itu.
create or replace function public.lms_kehadiran_guru(p_tanggal date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tgl date := coalesce(p_tanggal, (now() at time zone 'Asia/Jakarta')::date);
begin
  if not (private.adalah_super() or private.punya_izin('lms.pantau_guru')) then
    raise exception 'Tidak berwenang.' using errcode = '42501';
  end if;
  return jsonb_build_object('tanggal', v_tgl, 'sekarang', now(), 'guru', coalesce((
    select jsonb_agg(jsonb_build_object(
        'ptk_id', x.id, 'nama', x.nama, 'jumlah_kelas', x.kelas,
        'pertama_akses', h.pertama_akses, 'terakhir_akses', h.terakhir_akses, 'jumlah_denyut', h.jumlah_denyut,
        'online', coalesce(v_tgl = (now() at time zone 'Asia/Jakarta')::date and h.terakhir_akses > now() - interval '5 minutes', false)
      ) order by x.nama)
    from (
      select p.id, p.nama, count(k.id) filter (where k.aktif) kelas
      from public.ptk p
      left join public.kelas_ajar k on k.ptk_id = p.id
      where (private.adalah_super() or p.npsn = private.npsn_saya())
      group by p.id, p.nama
      having count(k.id) filter (where k.aktif) > 0
          or exists (select 1 from public.lms_kehadiran_guru z where z.ptk_id = p.id and z.tanggal = v_tgl)
    ) x
    left join public.lms_kehadiran_guru h on h.ptk_id = x.id and h.tanggal = v_tgl), '[]'::jsonb));
end $$;
revoke all on function public.lms_kehadiran_guru(date) from public, anon;
grant execute on function public.lms_kehadiran_guru(date) to authenticated;

notify pgrst, 'reload schema';
