-- Mesin formulir rinci Dapodik (tahap 1b dan tahap 3).
-- Satu katalog (formulir_entitas, formulir_kolom) mendefinisikan tabel anak F-PTK dan F-PD (sertifikasi, pendidikan, anak, prestasi, dan lain-lain)
-- serta formulir Sarpras (F-TANAH, F-BANGUNAN, F-RUANG, Alat/Angkutan/Buku). Tiap entitas punya tabel public.fr_<kode>.
-- Tabel hanya diakses lewat fungsi (RLS aktif tanpa policy). Setiap simpanan berlaku langsung di SIMS dan membuat tagihan kerja
-- operator Dapodik (tabel ajuan_perubahan). Unggahan Dapodik tidak membaca tabel ini, jadi tidak menimpanya.
--
-- Hak akses:
--   ptk    : guru/tendik mengisi dan mengubah datanya sendiri; TU Kepegawaian dan admin TU melihat.
--   siswa  : siswa dan orang tua (anak yang ditautkan) mengisi; TU Kesiswaan dan admin TU melihat.
--   sarpras: pemegang izin sarpras.kelola mengisi; pemegang izin lihat sarpras melihat.

create table if not exists public.formulir_entitas (
  kode text primary key check (kode ~ '^[a-z][a-z_]*$'),
  domain text not null check (domain in ('ptk', 'siswa', 'sarpras')),
  judul text not null,
  kode_formulir text not null,
  tampilan text not null default 'tabel' check (tampilan in ('tabel', 'lembar')),
  tampil_kolom text not null,
  urutan integer not null default 0
);

create table if not exists public.formulir_kolom (
  entitas text not null references public.formulir_entitas (kode) on delete cascade,
  kunci text not null check (kunci ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  butir text,
  tipe text not null check (tipe in ('teks', 'angka', 'bulat', 'tanggal', 'pilihan', 'rujukan')),
  pilihan jsonb,
  rujukan text references public.formulir_entitas (kode),
  wajib boolean not null default false,
  bantuan text,
  satuan text,
  min_nilai numeric,
  maks_nilai numeric,
  urutan integer not null,
  primary key (entitas, kunci)
);

alter table public.formulir_entitas enable row level security;
alter table public.formulir_kolom enable row level security;
drop policy if exists formulir_entitas_baca on public.formulir_entitas;
drop policy if exists formulir_kolom_baca on public.formulir_kolom;
create policy formulir_entitas_baca on public.formulir_entitas for select to authenticated using (true);
create policy formulir_kolom_baca on public.formulir_kolom for select to authenticated using (true);
revoke all on public.formulir_entitas, public.formulir_kolom from anon;

alter table public.ajuan_perubahan drop constraint if exists ajuan_perubahan_jenis_check;
alter table public.ajuan_perubahan add constraint ajuan_perubahan_jenis_check
  check (jenis in ('ptk', 'siswa', 'rombel', 'pembelajaran', 'ekskul', 'sarpras'));

create or replace function private.set_bagian_ajuan() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.bagian := case new.jenis when 'ptk' then 'kepegawaian' when 'ekskul' then 'kesiswaan' when 'siswa' then 'kesiswaan'
                               when 'sarpras' then 'sarpras' else 'kurikulum' end;
  return new;
end $$;

-- Mendaftarkan entitas: mengisi katalog dari teks DSL dan membuat (atau melengkapi) tabel fr_<kode>.
-- Baris DSL: kunci|label|tipe[!]|butir|opsi|bantuan|satuan
--   tipe: teks, angka, bulat, tanggal, pilihan, rujukan. Tanda ! di belakang tipe berarti wajib.
--   opsi: pilihan = daftar dipisah titik koma; rujukan = kode entitas induk; angka/bulat = batas "min..maks" (boleh kosong).
create or replace function private.formulir_daftarkan(p_kode text, p_domain text, p_judul text, p_formulir text, p_tampilan text, p_tampil text, p_urutan integer, p_dsl text)
returns void
language plpgsql set search_path = ''
as $$
declare
  r record; f text[]; v_tipe text; v_wajib boolean; v_opsi text; v_n integer := 0;
  v_pil jsonb; v_ruj text; v_min numeric; v_maks numeric; v_tsql text; v_tabel text := 'fr_' || p_kode;
begin
  if p_kode !~ '^[a-z][a-z_]*$' then raise exception 'Kode entitas tidak valid.'; end if;
  insert into public.formulir_entitas (kode, domain, judul, kode_formulir, tampilan, tampil_kolom, urutan)
  values (p_kode, p_domain, p_judul, p_formulir, p_tampilan, p_tampil, p_urutan)
  on conflict (kode) do update set domain = excluded.domain, judul = excluded.judul, kode_formulir = excluded.kode_formulir,
    tampilan = excluded.tampilan, tampil_kolom = excluded.tampil_kolom, urutan = excluded.urutan;

  if to_regclass('public.' || v_tabel) is null then
    execute format('create table public.%I (id uuid primary key default gen_random_uuid(), npsn text not null, owner_id uuid, '
                   'dibuat_pada timestamptz not null default now(), diperbarui_pada timestamptz not null default now(), diubah_oleh uuid, dihapus_pada timestamptz)', v_tabel);
    execute format('alter table public.%I enable row level security', v_tabel);
    execute format('revoke all on public.%I from anon, authenticated', v_tabel);
    execute format('create index %I on public.%I (npsn, owner_id)', v_tabel || '_pemilik_idx', v_tabel);
  end if;

  for r in select btrim(l) as baris from regexp_split_to_table(p_dsl, E'\n') l where btrim(l) <> '' loop
    f := string_to_array(r.baris, '|');
    v_n := v_n + 1;
    v_tipe := btrim(coalesce(f[3], ''));
    v_wajib := right(v_tipe, 1) = '!';
    v_tipe := rtrim(v_tipe, '!');
    v_opsi := nullif(btrim(coalesce(f[5], '')), '');
    v_pil := null; v_ruj := null; v_min := null; v_maks := null;
    if v_tipe = 'pilihan' then
      select to_jsonb(array_agg(btrim(x))) into v_pil from unnest(string_to_array(v_opsi, ';')) x;
    elsif v_tipe = 'rujukan' then
      v_ruj := v_opsi;
    elsif v_tipe in ('angka', 'bulat') and v_opsi is not null then
      v_min := nullif(split_part(v_opsi, '..', 1), '')::numeric;
      v_maks := nullif(split_part(v_opsi, '..', 2), '')::numeric;
    end if;
    v_tsql := case v_tipe when 'angka' then 'numeric' when 'bulat' then 'integer' when 'tanggal' then 'date' when 'rujukan' then 'uuid' else 'text' end;

    insert into public.formulir_kolom (entitas, kunci, label, butir, tipe, pilihan, rujukan, wajib, bantuan, satuan, min_nilai, maks_nilai, urutan)
    values (p_kode, btrim(f[1]), btrim(f[2]), nullif(btrim(coalesce(f[4], '')), ''), v_tipe, v_pil, v_ruj, v_wajib,
            nullif(btrim(coalesce(f[6], '')), ''), nullif(btrim(coalesce(f[7], '')), ''), v_min, v_maks, v_n)
    on conflict (entitas, kunci) do update set label = excluded.label, butir = excluded.butir, tipe = excluded.tipe, pilihan = excluded.pilihan,
      rujukan = excluded.rujukan, wajib = excluded.wajib, bantuan = excluded.bantuan, satuan = excluded.satuan,
      min_nilai = excluded.min_nilai, maks_nilai = excluded.maks_nilai, urutan = excluded.urutan;

    if v_tipe = 'rujukan' then
      execute format('alter table public.%I add column if not exists %I uuid references public.%I (id) on delete set null', v_tabel, btrim(f[1]), 'fr_' || v_ruj);
    else
      execute format('alter table public.%I add column if not exists %I %s', v_tabel, btrim(f[1]), v_tsql);
    end if;
  end loop;
end $$;
revoke execute on function private.formulir_daftarkan(text, text, text, text, text, text, integer, text) from public, anon, authenticated;
