-- Ajuan perbaikan data: operator melampirkan bukti hasil kerja (PDF atau tangkapan layar Dapodik).
-- Penyelesaian manual ("Sudah di Dapodik") wajib bukti. Penyelesaian otomatis lewat pencocokan unggahan Dapodik tidak memerlukannya.
-- Berkas: bucket privat "bukti-ajuan/{npsn}/{id ajuan}/{kode}.ext". Menulis: operator. Membaca: operator, pemutus ajuan (TU), dan pengaju.

alter table public.ajuan_perubahan
  add column if not exists bukti_path text,
  add column if not exists bukti_nama text,
  add column if not exists bukti_pada timestamptz;
alter table public.ajuan_perubahan drop constraint if exists ajuan_perubahan_bukti_path_check;
alter table public.ajuan_perubahan add constraint ajuan_perubahan_bukti_path_check
  check (bukti_path is null or bukti_path ~* '^[0-9]+/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(pdf|png|jpe?g|webp)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('bukti-ajuan', 'bukti-ajuan', false, 5242880, array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.ajuan_bukti_boleh(p_nama text, p_tulis boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and p_nama ~* '^[0-9]+/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(pdf|png|jpe?g|webp)$'
     and (storage.foldername(p_nama))[1] = private.npsn_saya()
     and exists (
       select 1 from public.ajuan_perubahan a
        where a.id::text = (storage.foldername(p_nama))[2] and a.npsn = private.npsn_saya()
          and (private.boleh_kerjakan()
               or (not p_tulis and (private.boleh_putuskan(a.jenis) or a.pengaju_user_id = auth.uid()))))
$$;

drop policy if exists ajuan_bukti_tulis on storage.objects;
create policy ajuan_bukti_tulis on storage.objects for insert to authenticated
  with check (bucket_id = 'bukti-ajuan' and (select private.ajuan_bukti_boleh(name, true)));
drop policy if exists ajuan_bukti_hapus on storage.objects;
create policy ajuan_bukti_hapus on storage.objects for delete to authenticated
  using (bucket_id = 'bukti-ajuan' and (select private.ajuan_bukti_boleh(name, true)));
drop policy if exists ajuan_bukti_baca on storage.objects;
create policy ajuan_bukti_baca on storage.objects for select to authenticated
  using (bucket_id = 'bukti-ajuan' and (select private.ajuan_bukti_boleh(name, false)));

create or replace function public.ajuan_bukti_simpan(p_id uuid, p_path text, p_nama text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.ajuan_perubahan%rowtype; v_nama text := left(nullif(btrim(coalesce(p_nama, '')), ''), 200);
begin
  if not private.boleh_kerjakan() then raise exception 'Hanya operator Dapodik yang dapat melampirkan bukti.'; end if;
  select * into a from public.ajuan_perubahan where id = p_id and npsn = private.npsn_saya() for update;
  if not found then raise exception 'Ajuan tidak ditemukan.'; end if;
  if a.status not in ('diteruskan','dikerjakan','selesai') then raise exception 'Bukti hanya untuk ajuan yang sudah berada di antrean operator.'; end if;
  if p_path is null or p_path !~* ('^' || a.npsn || '/' || a.id::text || '/[A-Za-z0-9._-]+\.(pdf|png|jpe?g|webp)$') then raise exception 'Berkas bukti tidak valid.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'bukti-ajuan' and name = p_path) then raise exception 'Berkas belum terunggah. Coba unggah ulang.'; end if;
  update public.ajuan_perubahan set bukti_path = p_path, bukti_nama = coalesce(v_nama, 'bukti'), bukti_pada = now() where id = p_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'ajuan_perubahan', 'BUKTI', jsonb_build_object('ajuan', p_id));
end $$;
revoke all on function public.ajuan_bukti_simpan(uuid, text, text) from public, anon;
grant execute on function public.ajuan_bukti_simpan(uuid, text, text) to authenticated;

-- Penyelesaian manual wajib bukti.
do $do$
declare d text; baru text;
begin
  d := pg_get_functiondef('public.kerjakan_ajuan(uuid,text,text)'::regprocedure);
  baru := replace(d, E'elsif p_aksi = ''selesai'' then\n    if a.status not in (''diteruskan'', ''dikerjakan'') then raise exception ''Ajuan ini tidak berada di antrean operator.''; end if;',
    E'elsif p_aksi = ''selesai'' then\n    if a.status not in (''diteruskan'', ''dikerjakan'') then raise exception ''Ajuan ini tidak berada di antrean operator.''; end if;\n    if a.bukti_path is null then raise exception ''Lampirkan bukti hasil kerja di Dapodik (PDF atau tangkapan layar) sebelum menandai selesai.''; end if;');
  if baru = d then raise exception 'kerjakan_ajuan: pola aksi selesai tidak ditemukan, perbarui migrasi ini.'; end if;
  execute baru;
end $do$;
