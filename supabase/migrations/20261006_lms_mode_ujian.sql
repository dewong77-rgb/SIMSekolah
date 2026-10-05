-- Mode ujian (tampilan CBT): token, pencatatan pelanggaran (pindah tab, keluar layar penuh), kunci, pemantauan.
-- Aditif. Kuis lama tidak berubah: mode_ujian bawaan false.

alter table public.asesmen
  add column if not exists mode_ujian boolean not null default false,
  add column if not exists token_ujian text,
  add column if not exists maks_pelanggaran integer not null default 3,
  add column if not exists kunci_otomatis boolean not null default false;

alter table public.percobaan_asesmen
  add column if not exists pelanggaran integer not null default 0,
  add column if not exists terkunci boolean not null default false,
  add column if not exists ambang_kunci integer;

create table if not exists public.pelanggaran_ujian (
  id uuid primary key default gen_random_uuid(),
  percobaan_id uuid not null references public.percobaan_asesmen(id) on delete cascade,
  jenis text not null check (jenis in ('pindah_tab', 'keluar_layar')),
  dicatat_pada timestamptz not null default now()
);
create index if not exists pelanggaran_ujian_percobaan_idx on public.pelanggaran_ujian (percobaan_id, dicatat_pada);
alter table public.pelanggaran_ujian enable row level security;

-- Token 6 karakter tanpa huruf dan angka yang mudah tertukar (I, L, O, 0, 1).
create or replace function private.ujian_token_baru() returns text
language plpgsql volatile set search_path = '' as $$
declare s text := ''; abc text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i integer;
begin
  for i in 1..6 loop s := s || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
  return s;
end $$;

-- Guru: aktifkan atau matikan mode ujian, atur batas pelanggaran, buat token baru.
create or replace function public.lms_ujian_atur(p_asesmen uuid, p_aktif boolean, p_maks integer, p_kunci boolean, p_token_baru boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.asesmen%rowtype;
begin
  select * into a from public.asesmen where id = p_asesmen and not diarsipkan;
  if not found or not private.lms_kelola(a.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p_maks is null or p_maks not between 1 and 20 then raise exception 'Batas pelanggaran 1 sampai 20.' using errcode = '22023'; end if;
  if p_aktif is distinct from a.mode_ujian and exists (
       select 1 from public.percobaan_asesmen p where p.asesmen_id = a.id and p.selesai is null and p.batas_waktu + interval '5 seconds' > now()) then
    raise exception 'Ada siswa yang sedang mengerjakan. Ubah mode ujian setelah mereka selesai.' using errcode = 'P0001';
  end if;
  update public.asesmen set
    mode_ujian = coalesce(p_aktif, false),
    maks_pelanggaran = p_maks,
    kunci_otomatis = coalesce(p_kunci, false),
    token_ujian = case when coalesce(p_aktif, false) and (token_ujian is null or coalesce(p_token_baru, false)) then private.ujian_token_baru()
                       else token_ujian end
  where id = a.id
  returning * into a;
  return jsonb_build_object('mode_ujian', a.mode_ujian, 'token_ujian', a.token_ujian, 'maks_pelanggaran', a.maks_pelanggaran, 'kunci_otomatis', a.kunci_otomatis);
end $$;

-- Daftar asesmen: tambah kolom mode ujian. Token hanya terlihat pengelola.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.lms_asesmen_daftar(uuid)'::regprocedure);
  n := replace(d, '''jumlah_tampil'', a.jumlah_tampil, ''kkm'', a.kkm,',
    '''jumlah_tampil'', a.jumlah_tampil, ''kkm'', a.kkm, ''mode_ujian'', a.mode_ujian, ''maks_pelanggaran'', a.maks_pelanggaran, ''kunci_otomatis'', a.kunci_otomatis, ''token_ujian'', case when v_kelola then a.token_ujian end,');
  if n = d then raise exception 'patch lms_asesmen_daftar gagal'; end if;
  execute n;

  -- Jalur lama tidak boleh dipakai untuk asesmen bermode ujian (token wajib).
  d := pg_get_functiondef('public.lms_asesmen_mulai(uuid)'::regprocedure);
  n := replace(d, '  perform pg_advisory_xact_lock(hashtext(p_asesmen::text || v_pd::text));',
    '  if a.mode_ujian and coalesce(current_setting(''sims.ujian_ok'', true), '''') <> p_asesmen::text then
    raise exception ''Ujian ini memakai mode ujian dengan token.'' using errcode = ''P0001'';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_asesmen::text || v_pd::text));');
  if n = d then raise exception 'patch lms_asesmen_mulai gagal'; end if;
  execute n;

  -- Jawaban ditolak saat ujian dikunci.
  d := pg_get_functiondef('public.lms_jawab_isi(uuid,uuid,integer,text)'::regprocedure);
  n := replace(d, '  if p.selesai is not null then return jsonb_build_object(''ok'', false, ''habis'', true); end if;',
    '  if p.selesai is not null then return jsonb_build_object(''ok'', false, ''habis'', true); end if;
  if p.terkunci then return jsonb_build_object(''ok'', false, ''terkunci'', true); end if;');
  if n = d then raise exception 'patch lms_jawab_isi gagal'; end if;
  execute n;
end $$;

-- Siswa: mulai atau lanjutkan ujian. Token hanya diminta untuk percobaan baru, bukan saat memuat ulang halaman.
create or replace function public.lms_ujian_mulai(p_asesmen uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.asesmen%rowtype; p public.percobaan_asesmen%rowtype; r jsonb;
        v_pd uuid := private.pd_id_saya(); v_jalan boolean;
begin
  select * into a from public.asesmen where id = p_asesmen;
  if not found or v_pd is null or a.status <> 'terbit' or a.diarsipkan or not a.mode_ujian or not private.lms_anggota(a.kelas_ajar_id) then
    raise exception 'Tidak tersedia.' using errcode = '42501';
  end if;
  select exists (select 1 from public.percobaan_asesmen x where x.asesmen_id = p_asesmen and x.peserta_didik_id = v_pd
                 and x.selesai is null and x.batas_waktu + interval '5 seconds' > now()) into v_jalan;
  if not v_jalan and upper(btrim(coalesce(p_token, ''))) is distinct from a.token_ujian then
    raise exception 'Token salah. Minta token yang benar kepada pengawas.' using errcode = 'P0001';
  end if;
  perform set_config('sims.ujian_ok', p_asesmen::text, true);
  r := public.lms_asesmen_mulai(p_asesmen);
  perform set_config('sims.ujian_ok', '', true);
  select * into p from public.percobaan_asesmen where id = (r ->> 'percobaan')::uuid;
  return r || jsonb_build_object('pelanggaran', p.pelanggaran, 'terkunci', p.terkunci,
    'ambang', coalesce(p.ambang_kunci, a.maks_pelanggaran), 'kunci_otomatis', a.kunci_otomatis, 'jenis', a.jenis);
end $$;

-- Siswa: catat satu pelanggaran. Kejadian beruntun dalam 3 detik dihitung satu (pindah tab sering memicu beberapa peristiwa).
create or replace function public.lms_ujian_pelanggaran(p_percobaan uuid, p_jenis text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; a public.asesmen%rowtype;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan for update;
  if not found or p.peserta_didik_id is distinct from private.pd_id_saya() then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  if p_jenis not in ('pindah_tab', 'keluar_layar') then raise exception 'Jenis tidak valid.' using errcode = '22023'; end if;
  select * into a from public.asesmen where id = p.asesmen_id;
  if not a.mode_ujian then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  if p.selesai is null and now() <= p.batas_waktu + interval '5 seconds'
     and not exists (select 1 from public.pelanggaran_ujian where percobaan_id = p.id and dicatat_pada > now() - interval '3 seconds') then
    insert into public.pelanggaran_ujian (percobaan_id, jenis) values (p.id, p_jenis);
    update public.percobaan_asesmen set pelanggaran = pelanggaran + 1 where id = p.id returning * into p;
    if a.kunci_otomatis and not p.terkunci and p.pelanggaran >= coalesce(p.ambang_kunci, a.maks_pelanggaran) then
      update public.percobaan_asesmen set terkunci = true where id = p.id returning * into p;
    end if;
  end if;
  return jsonb_build_object('pelanggaran', p.pelanggaran, 'terkunci', p.terkunci, 'ambang', coalesce(p.ambang_kunci, a.maks_pelanggaran),
    'selesai', p.selesai is not null);
end $$;

-- Siswa: status ujian (dipakai saat layar terkunci, untuk tahu kapan pengawas membuka kunci).
create or replace function public.lms_ujian_status(p_percobaan uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; a public.asesmen%rowtype;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan;
  if not found or p.peserta_didik_id is distinct from private.pd_id_saya() then raise exception 'Tidak tersedia.' using errcode = '42501'; end if;
  select * into a from public.asesmen where id = p.asesmen_id;
  return jsonb_build_object('terkunci', p.terkunci, 'pelanggaran', p.pelanggaran, 'ambang', coalesce(p.ambang_kunci, a.maks_pelanggaran),
    'selesai', p.selesai is not null or now() > p.batas_waktu + interval '5 seconds', 'sekarang', now());
end $$;

-- Pengawas atau guru: kunci atau buka kunci satu siswa. Buka kunci memberi jatah pelanggaran baru sebesar batas awal.
create or replace function public.lms_ujian_kunci(p_percobaan uuid, p_kunci boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.percobaan_asesmen%rowtype; a public.asesmen%rowtype;
begin
  select * into p from public.percobaan_asesmen where id = p_percobaan for update;
  if not found then raise exception 'Tidak ditemukan.' using errcode = 'P0002'; end if;
  select * into a from public.asesmen where id = p.asesmen_id;
  if not private.lms_kelola(a.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  if p.selesai is not null then raise exception 'Siswa sudah selesai.' using errcode = 'P0001'; end if;
  if coalesce(p_kunci, false) then
    update public.percobaan_asesmen set terkunci = true where id = p.id;
  else
    update public.percobaan_asesmen set terkunci = false, ambang_kunci = pelanggaran + a.maks_pelanggaran where id = p.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Pengawas atau guru: pantau semua siswa kelas pada satu ujian.
create or replace function public.lms_ujian_pantau(p_asesmen uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.asesmen%rowtype;
begin
  select * into a from public.asesmen where id = p_asesmen;
  if not found or not private.lms_kelola(a.kelas_ajar_id) then raise exception 'Tidak berwenang.' using errcode = '42501'; end if;
  return jsonb_build_object('sekarang', now(), 'siswa', coalesce((
    select jsonb_agg(jsonb_build_object(
      'peserta_didik_id', pd.id, 'nama', pd.nama, 'no_urut', kr.no_urut,
      'percobaan_id', lp.id,
      'status', case when lp.id is null then 'belum'
                     when lp.selesai is null and lp.batas_waktu + interval '5 seconds' > now() then 'mengerjakan'
                     else 'selesai' end,
      'terjawab', case when lp.id is null then 0 else (select count(*) from public.jawaban_asesmen j where j.percobaan_id = lp.id
                   and (j.pilihan is not null or btrim(coalesce(j.jawaban_teks, '')) <> '')) end,
      'total_soal', case when lp.id is null then 0 else jsonb_array_length(lp.susunan) end,
      'pelanggaran', coalesce(lp.pelanggaran, 0),
      'terkunci', coalesce(lp.terkunci, false),
      'sisa_detik', case when lp.id is not null and lp.selesai is null and lp.batas_waktu > now() then extract(epoch from lp.batas_waktu - now())::int end,
      'kejadian', case when lp.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('jenis', v.jenis, 'waktu', v.dicatat_pada) order by v.dicatat_pada desc)
                   from (select jenis, dicatat_pada from public.pelanggaran_ujian where percobaan_id = lp.id order by dicatat_pada desc limit 20) v), '[]'::jsonb) end
    ) order by kr.no_urut nulls last, pd.nama)
    from public.keanggotaan_rombel kr
    join public.kelas_ajar k on k.rombel_id = kr.rombel_id
    join public.peserta_didik pd on pd.id = kr.peserta_didik_id
    left join lateral (select * from public.percobaan_asesmen p where p.asesmen_id = a.id and p.peserta_didik_id = pd.id order by p.ke desc limit 1) lp on true
    where k.id = a.kelas_ajar_id), '[]'::jsonb));
end $$;

revoke all on function private.ujian_token_baru() from public, anon;
revoke all on function public.lms_ujian_atur(uuid, boolean, integer, boolean, boolean) from public, anon;
revoke all on function public.lms_ujian_mulai(uuid, text) from public, anon;
revoke all on function public.lms_ujian_pelanggaran(uuid, text) from public, anon;
revoke all on function public.lms_ujian_status(uuid) from public, anon;
revoke all on function public.lms_ujian_kunci(uuid, boolean) from public, anon;
revoke all on function public.lms_ujian_pantau(uuid) from public, anon;
grant execute on function public.lms_ujian_atur(uuid, boolean, integer, boolean, boolean), public.lms_ujian_mulai(uuid, text),
  public.lms_ujian_pelanggaran(uuid, text), public.lms_ujian_status(uuid), public.lms_ujian_kunci(uuid, boolean),
  public.lms_ujian_pantau(uuid) to authenticated;
