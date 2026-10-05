-- Durasi baca minimal 10 menit per bahan bacaan; lms_materi_buka mencatat waktu mulai sehingga harus VOLATILE.
create table if not exists public.progres_mulai (
  materi_id uuid not null references public.materi(id) on delete cascade,
  peserta_didik_id uuid not null,
  mulai_pada timestamptz not null default now(),
  primary key (materi_id, peserta_didik_id)
);
alter table public.progres_mulai enable row level security;
alter function public.lms_materi_buka(uuid) volatile;
do $$
declare d text;
begin
  d := pg_get_functiondef('public.lms_tandai_selesai(uuid)'::regprocedure);
  d := replace(d, 'v_sisa := 15 - extract', 'v_sisa := 10 - extract');
  d := replace(d, 'minimal 15 menit', 'minimal 10 menit');
  execute d;
end $$;
