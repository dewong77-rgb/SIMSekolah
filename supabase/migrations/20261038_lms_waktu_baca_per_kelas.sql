-- LMS: waktu baca minimal diatur guru per kelas (berlaku untuk semua pertemuan di kelas itu), bukan lagi tetap 10 menit.
-- 0 = tanpa jeda. Nilai awal 10 menit, jadi perilaku kelas yang sudah ada tidak berubah sampai guru mengubahnya.

alter table public.kelas_ajar
  add column if not exists baca_menit integer not null default 10 check (baca_menit between 0 and 60);

create or replace function private.lms_baca_menit(p_kelas uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select k.baca_menit from public.kelas_ajar k where k.id = p_kelas), 10)
$$;
revoke execute on function private.lms_baca_menit(uuid) from public, anon, authenticated;

create or replace function public.lms_baca_ambil(p_kelas uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return private.lms_baca_menit(p_kelas);
end $$;

-- p_semua = true: berlaku juga untuk semua kelas aktif milik guru pengampu yang sama.
create or replace function public.lms_baca_atur(p_kelas uuid, p_menit integer, p_semua boolean default false) returns integer
language plpgsql security definer set search_path = '' as $$
declare k public.kelas_ajar%rowtype; n integer;
begin
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_menit is null or p_menit not between 0 and 60 then
    raise exception 'Waktu baca 0 sampai 60 menit.' using errcode = '22023';
  end if;
  select * into k from public.kelas_ajar where id = p_kelas;
  if coalesce(p_semua, false) then
    update public.kelas_ajar set baca_menit = p_menit where ptk_id = k.ptk_id and npsn = k.npsn and aktif;
  else
    update public.kelas_ajar set baca_menit = p_menit where id = p_kelas;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.lms_baca_ambil(uuid) from public, anon;
revoke all on function public.lms_baca_atur(uuid, integer, boolean) from public, anon;
grant execute on function public.lms_baca_ambil(uuid) to authenticated;
grant execute on function public.lms_baca_atur(uuid, integer, boolean) to authenticated;

-- Server memakai pengaturan kelas saat siswa menandai bacaan selesai, dan mengirimnya ke siswa untuk hitung mundur.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.lms_tandai_selesai(uuid)'::regprocedure);
  n := d;
  if strpos(n, 'lms_baca_menit') = 0 then
    n := replace(n, 'v_sisa := 10 - extract', 'v_sisa := private.lms_baca_menit(v_kelas) - extract');
    n := replace(n, $a$'Baca dulu minimal 10 menit sebelum menandai selesai. Sisa % menit.', ceil(v_sisa)$a$,
                    $b$'Baca dulu minimal % menit sebelum menandai selesai. Sisa % menit.', private.lms_baca_menit(v_kelas), ceil(v_sisa)$b$);
    if strpos(n, 'private.lms_baca_menit(v_kelas) - extract') = 0 or strpos(n, 'minimal % menit sebelum') = 0 then
      raise exception 'patch lms_tandai_selesai gagal';
    end if;
    execute n;
  end if;

  d := pg_get_functiondef('public.lms_materi_buka(uuid)'::regprocedure);
  n := d;
  if strpos(n, 'menit_baca') = 0 then
    n := replace(n, $a$'mulai_pada', (select$a$, $b$'menit_baca', private.lms_baca_menit(t.kelas_ajar_id), 'mulai_pada', (select$b$);
    if strpos(n, 'menit_baca') = 0 then raise exception 'patch lms_materi_buka gagal'; end if;
    execute n;
  end if;
end $$;
