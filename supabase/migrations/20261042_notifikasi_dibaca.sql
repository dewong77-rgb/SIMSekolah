-- Notifikasi (lonceng di pojok kanan atas portal): menyimpan pengingat yang sudah ditandai dibaca oleh pengguna.
-- Pengingat LMS dihitung server saat dibuka dan tidak punya status baca, jadi yang disimpan adalah kunci stabilnya per pengguna.
-- Pesan dari kurikulum (lms_peringatan) sudah punya status baca sendiri.

create table if not exists public.notif_dibaca (
  user_id uuid not null,
  kunci text not null check (char_length(kunci) between 1 and 200),
  dibaca_pada timestamptz not null default now(),
  primary key (user_id, kunci)
);
alter table public.notif_dibaca enable row level security;
revoke all on table public.notif_dibaca from anon, authenticated;

create or replace function public.notif_dibaca_saya() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(kunci), '{}'::text[]) from public.notif_dibaca
  where user_id = auth.uid() and dibaca_pada > now() - interval '60 days'
$$;
revoke all on function public.notif_dibaca_saya() from public, anon;
grant execute on function public.notif_dibaca_saya() to authenticated;

create or replace function public.notif_tandai(p_kunci text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Perlu masuk.' using errcode = '28000'; end if;
  if coalesce(array_length(p_kunci, 1), 0) > 200 then raise exception 'Terlalu banyak.' using errcode = '22023'; end if;
  insert into public.notif_dibaca (user_id, kunci)
  select auth.uid(), left(k, 200) from unnest(p_kunci) k where btrim(coalesce(k, '')) <> ''
  on conflict (user_id, kunci) do update set dibaca_pada = now();
  delete from public.notif_dibaca where user_id = auth.uid() and dibaca_pada < now() - interval '90 days';
end $$;
revoke all on function public.notif_tandai(text[]) from public, anon;
grant execute on function public.notif_tandai(text[]) to authenticated;

notify pgrst, 'reload schema';
