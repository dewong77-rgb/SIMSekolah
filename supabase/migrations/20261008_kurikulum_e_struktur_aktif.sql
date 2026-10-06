-- Kurikulum E: struktur kurikulum bisa dinonaktifkan tanpa dihapus (riwayat tetap ada), baris beban 0 JP tidak dihitung,
-- dan melepas guru dari mapel yang sudah tidak ada di struktur tetap diperbolehkan.

alter table public.kur_struktur add column if not exists aktif boolean not null default true;

create or replace function private.kur_butuh(p_ta text)
returns table (rombel_id uuid, rombel text, tingkat int, program text, mapel_id uuid, mapel text, kelompok text, urutan int, jp int, ptk_id uuid, jp_ptk int)
language sql stable security definer set search_path = '' as $$
  select k.rombel_id, k.rombel, k.tingkat, k.program, k.mapel_id, k.mapel, k.kelompok, k.urutan, k.jp, b.ptk_id, b.jp
    from (
      select distinct on (r.id, st.mapel_id) r.id rombel_id, r.nama rombel, r.tingkat, private.kur_program(r.nama) program,
             st.mapel_id, m.nama mapel, m.kelompok, m.urutan, st.jp_minggu jp
        from public.rombel r
        join public.semester s on s.semester_id = r.semester_id and s.tahun_ajaran = p_ta
        join public.kur_struktur st on st.tahun_ajaran = p_ta and st.tingkat = r.tingkat and st.aktif
                                   and (st.program = '*' or upper(st.program) = private.kur_program(r.nama))
        join public.kur_mapel m on m.id = st.mapel_id and m.aktif
       where r.jenis_rombel = 'Kelas Utama' and r.npsn = private.npsn_saya()
       order by r.id, st.mapel_id, (st.program = '*')
    ) k
    left join public.kur_beban b on b.rombel_id = k.rombel_id and b.mapel_id = k.mapel_id and b.jp > 0
$$;

create or replace function public.kur_struktur_daftar(p_ta text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.kur_boleh_lihat() then coalesce((
    select jsonb_agg(jsonb_build_object('id', st.id, 'tingkat', st.tingkat, 'program', st.program, 'mapel_id', st.mapel_id,
                                        'mapel', m.nama, 'kelompok', m.kelompok, 'jp_minggu', st.jp_minggu)
                     order by st.tingkat, st.program, m.urutan, m.nama)
      from public.kur_struktur st join public.kur_mapel m on m.id = st.mapel_id
     where st.tahun_ajaran = p_ta and st.aktif and m.aktif), '[]'::jsonb) else null end
$$;

create or replace function public.kur_struktur_salin(p_dari text, p_ke text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  if p_dari = p_ke then raise exception 'Tahun ajaran asal dan tujuan sama.'; end if;
  if p_ke !~ '^\d{4}/\d{4}$' then raise exception 'Tahun ajaran tujuan tidak valid.'; end if;
  if exists (select 1 from public.kur_struktur where tahun_ajaran = p_ke and aktif) then raise exception 'Tahun ajaran tujuan sudah punya struktur.'; end if;
  insert into public.kur_struktur (tahun_ajaran, tingkat, program, mapel_id, jp_minggu)
  select p_ke, tingkat, program, mapel_id, jp_minggu from public.kur_struktur where tahun_ajaran = p_dari and aktif
  on conflict (tahun_ajaran, tingkat, program, mapel_id) do update set jp_minggu = excluded.jp_minggu, aktif = true;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.kur_beban_atur(p_rombel uuid, p_mapel uuid, p_ptk uuid, p_jp int) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.rombel; v_ta text; k record; v_lain int;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  select * into r from public.rombel where id = p_rombel and npsn = private.npsn_saya() and jenis_rombel = 'Kelas Utama';
  if r.id is null then raise exception 'Rombel tidak ditemukan.'; end if;
  if coalesce(p_jp, 0) <= 0 then
    delete from public.kur_beban where rombel_id = p_rombel and mapel_id = p_mapel and ptk_id = p_ptk;
    return;
  end if;
  select tahun_ajaran into v_ta from public.semester where semester_id = r.semester_id;
  select * into k from private.kur_butuh(v_ta) x where x.rombel_id = p_rombel and x.mapel_id = p_mapel limit 1;
  if k.rombel_id is null then raise exception 'Mapel ini belum ada dalam struktur kurikulum untuk kelas tersebut.'; end if;
  if not exists (select 1 from public.ptk where id = p_ptk and npsn = r.npsn) then raise exception 'Guru tidak ditemukan.'; end if;
  select coalesce(sum(jp), 0) into v_lain from public.kur_beban where rombel_id = p_rombel and mapel_id = p_mapel and ptk_id <> p_ptk;
  if v_lain + p_jp > k.jp then raise exception 'Jumlah jam melebihi struktur (% JP per minggu, guru lain sudah % JP).', k.jp, v_lain; end if;
  insert into public.kur_beban (rombel_id, mapel_id, ptk_id, jp) values (p_rombel, p_mapel, p_ptk, p_jp)
  on conflict (rombel_id, mapel_id, ptk_id) do update set jp = excluded.jp, dibuat_oleh = auth.uid(), dibuat_pada = now();
end $$;

-- Simpan struktur tanpa penghapusan: baris kelompok (tahun ajaran, tingkat, program) dinonaktifkan lalu diaktifkan kembali bila ada di daftar baru.
-- Menggantikan versi di migrasi A yang memakai delete.
create or replace function public.kur_struktur_simpan(p_ta text, p_tingkat int, p_program text, p_baris jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not private.kur_boleh() then raise exception 'Anda tidak berwenang mengatur kurikulum.'; end if;
  if p_ta !~ '^\d{4}/\d{4}$' then raise exception 'Tahun ajaran tidak valid.'; end if;
  if p_tingkat not in (10, 11, 12) then raise exception 'Tingkat harus 10, 11, atau 12.'; end if;
  p_program := upper(btrim(coalesce(nullif(p_program, ''), '*')));
  if jsonb_typeof(p_baris) <> 'array' then raise exception 'Data struktur tidak valid.'; end if;
  if jsonb_array_length(p_baris) > 60 then raise exception 'Terlalu banyak mapel dalam satu struktur.'; end if;
  if exists (select 1 from jsonb_array_elements(p_baris) e group by e->>'mapel_id' having count(*) > 1) then
    raise exception 'Ada mapel yang dipilih dua kali.';
  end if;
  update public.kur_struktur set aktif = false where tahun_ajaran = p_ta and tingkat = p_tingkat and program = p_program;
  insert into public.kur_struktur (tahun_ajaran, tingkat, program, mapel_id, jp_minggu, aktif)
  select p_ta, p_tingkat, p_program, (e->>'mapel_id')::uuid, (e->>'jp_minggu')::int, true from jsonb_array_elements(p_baris) e
  on conflict (tahun_ajaran, tingkat, program, mapel_id) do update set jp_minggu = excluded.jp_minggu, aktif = true;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.kur_struktur_simpan(text,int,text,jsonb) from public, anon;
grant execute on function public.kur_struktur_simpan(text,int,text,jsonb) to authenticated;
