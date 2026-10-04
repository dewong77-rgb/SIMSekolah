-- Profil dokumen rencana ajar (kop, dasar hukum, CP umum, pengesahan, fokus elemen, catatan). Satu baris per guru, mapel, tingkat.
create table if not exists public.rencana_profil (
  id uuid primary key default gen_random_uuid(),
  ptk_id uuid not null references public.ptk(id) on delete cascade,
  npsn text not null,
  mapel text not null,
  tingkat text not null,
  data jsonb not null default '{}'::jsonb,
  diubah_pada timestamptz not null default now(),
  unique (ptk_id, mapel, tingkat)
);
alter table public.rencana_profil enable row level security;
revoke all on table public.rencana_profil from anon, authenticated;

create or replace function public.lms_rencana_profil_simpan(p_mapel text, p_tingkat text, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya();
begin
  if v_ptk is null then raise exception 'Khusus guru.' using errcode = '42501'; end if;
  if jsonb_typeof(p_data) <> 'object' or length(p_data::text) > 60000 then raise exception 'Data profil tidak valid.' using errcode = '22023'; end if;
  insert into public.rencana_profil (ptk_id, npsn, mapel, tingkat, data)
  values (v_ptk, private.npsn_saya(), btrim(p_mapel), upper(btrim(p_tingkat)), p_data)
  on conflict (ptk_id, mapel, tingkat) do update set data = excluded.data, diubah_pada = now();
end $$;
revoke all on function public.lms_rencana_profil_simpan(text, text, jsonb) from public, anon;
grant execute on function public.lms_rencana_profil_simpan(text, text, jsonb) to authenticated;

-- lms_rencana_saya ikut mengembalikan profil.
do $$
declare d text := pg_get_functiondef('public.lms_rencana_saya()'::regprocedure);
        lama text := $a$return jsonb_build_object($a$;
        baru text := $b$return jsonb_build_object(
    'profil', coalesce((select jsonb_agg(jsonb_build_object('mapel', x.mapel, 'tingkat', x.tingkat, 'data', x.data)) from public.rencana_profil x where x.ptk_id = v_ptk), '[]'::jsonb),$b$;
begin
  if strpos(d, lama) = 0 then raise exception 'pola tidak ditemukan'; end if;
  execute replace(d, lama, baru);
end $$;
