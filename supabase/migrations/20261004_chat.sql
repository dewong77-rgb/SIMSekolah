-- Fitur chat SIMS: ruang Kelas, Tanya guru, Ruang guru dan kanal jabatan.
-- Pola sama dengan LMS: RLS aktif tanpa policy, akses lewat fungsi security definer untuk role authenticated.
-- Sudah terpasang di Supabase lewat migrasi chat_tabel_v1, chat_fungsi_v1, dan chat_pelengkap_v1. Berkas ini salinan untuk repo.

alter table public.kelas_ajar
  add column if not exists tanya_mode text not null default 'tertutup'
  check (tanya_mode in ('tertutup','dibuka','selalu'));

create table if not exists public.chat_ruang (
  id uuid primary key default gen_random_uuid(),
  npsn text not null,
  jenis text not null check (jenis in ('kelas','tanya','guru','kanal')),
  kelas_ajar_id uuid references public.kelas_ajar(id),
  rombel_id uuid references public.rombel(id),
  guru_ptk_id uuid references public.ptk(id),
  siswa_id uuid references public.peserta_didik(id),
  kanal_kode text,
  judul text not null,
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  pesan_terakhir_pada timestamptz,
  check (
    (jenis='kelas' and kelas_ajar_id is not null) or
    (jenis='tanya' and guru_ptk_id is not null and siswa_id is not null and rombel_id is not null) or
    (jenis in ('guru','kanal'))
  )
);
create unique index if not exists chat_ruang_kelas_uq on public.chat_ruang(kelas_ajar_id) where jenis='kelas';
create unique index if not exists chat_ruang_tanya_uq on public.chat_ruang(guru_ptk_id, siswa_id) where jenis='tanya';
create unique index if not exists chat_ruang_kanal_uq on public.chat_ruang(npsn, jenis, coalesce(kanal_kode,'')) where jenis in ('guru','kanal');
create index if not exists chat_ruang_rombel_idx on public.chat_ruang(rombel_id);
create index if not exists chat_ruang_siswa_idx on public.chat_ruang(siswa_id);
create index if not exists chat_ruang_guru_idx on public.chat_ruang(guru_ptk_id);

create table if not exists public.chat_pesan (
  id uuid primary key default gen_random_uuid(),
  ruang_id uuid not null references public.chat_ruang(id) on delete cascade,
  pengirim_user_id uuid not null,
  isi text not null check (char_length(isi) between 1 and 2000),
  dibuat_pada timestamptz not null default now(),
  dihapus_pada timestamptz,
  dihapus_oleh uuid
);
create index if not exists chat_pesan_ruang_waktu_idx on public.chat_pesan(ruang_id, dibuat_pada desc);
create index if not exists chat_pesan_pengirim_idx on public.chat_pesan(pengirim_user_id, dibuat_pada desc);

create table if not exists public.chat_baca (
  ruang_id uuid not null references public.chat_ruang(id) on delete cascade,
  user_id uuid not null,
  terakhir_dibaca_pada timestamptz not null default now(),
  primary key (ruang_id, user_id)
);

create table if not exists public.chat_laporan (
  id uuid primary key default gen_random_uuid(),
  pesan_id uuid not null references public.chat_pesan(id) on delete cascade,
  pelapor_user_id uuid not null,
  alasan text not null check (char_length(alasan) between 3 and 500),
  status text not null default 'baru' check (status in ('baru','ditinjau','selesai')),
  catatan_tinjau text,
  ditinjau_oleh uuid,
  dibuat_pada timestamptz not null default now(),
  unique (pesan_id, pelapor_user_id)
);
create index if not exists chat_laporan_status_idx on public.chat_laporan(status, dibuat_pada desc);

create table if not exists public.chat_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  ruang_id uuid not null references public.chat_ruang(id) on delete cascade,
  aksi text not null,
  dibuat_pada timestamptz not null default now()
);
create index if not exists chat_audit_ruang_idx on public.chat_audit(ruang_id, dibuat_pada desc);

alter table public.chat_ruang enable row level security;
alter table public.chat_pesan enable row level security;
alter table public.chat_baca enable row level security;
alter table public.chat_laporan enable row level security;
alter table public.chat_audit enable row level security;

-- ===== helper di schema private =====
create or replace function private.chat_wali(p_rombel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_rombel is not null and private.ptk_id_saya() is not null and (
    exists (select 1 from public.rombel r where r.id = p_rombel and r.wali_kelas_ptk_id = private.ptk_id_saya())
    or exists (select 1 from public.penugasan p where p.ptk_id = private.ptk_id_saya() and p.status = 'aktif'
               and p.jabatan_kode = 'wali_kelas' and p.lingkup_id = p_rombel::text
               and p.tahun_ajaran = public.tahun_ajaran_sekarang())
  )
$$;

create or replace function private.chat_wali_dari(p_ptk uuid, p_rombel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rombel r where r.id = p_rombel and r.wali_kelas_ptk_id = p_ptk)
      or exists (select 1 from public.penugasan p where p.ptk_id = p_ptk and p.status = 'aktif'
                 and p.jabatan_kode = 'wali_kelas' and p.lingkup_id = p_rombel::text)
$$;

create or replace function private.chat_staf() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.peran_saya() in ('guru','staf','admin_tu') or private.adalah_super()
$$;

-- hasil: 'peserta' | 'pemantau' | 'audit' | null
create or replace function private.chat_akses(p_ruang uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r public.chat_ruang%rowtype; k public.kelas_ajar%rowtype; v text := null;
begin
  select * into r from public.chat_ruang where id = p_ruang;
  if not found then return null; end if;
  if not private.adalah_super() and r.npsn is distinct from private.npsn_saya() then return null; end if;
  if r.jenis = 'kelas' then
    select * into k from public.kelas_ajar where id = r.kelas_ajar_id;
    if k.ptk_id = private.ptk_id_saya() or private.lms_anggota(k.id) then v := 'peserta';
    elsif private.chat_wali(k.rombel_id) then v := 'pemantau'; end if;
  elsif r.jenis = 'tanya' then
    if r.guru_ptk_id = private.ptk_id_saya() or r.siswa_id = private.pd_id_saya() then v := 'peserta';
    elsif private.chat_wali(r.rombel_id) then v := 'pemantau'; end if;
  elsif r.jenis = 'guru' then
    if private.chat_staf() then v := 'peserta'; end if;
  elsif r.jenis = 'kanal' then
    if private.chat_staf() and exists (select 1 from public.penugasan p where p.ptk_id = private.ptk_id_saya()
       and p.status = 'aktif' and p.jabatan_kode = r.kanal_kode and p.tahun_ajaran = public.tahun_ajaran_sekarang()) then v := 'peserta'; end if;
  end if;
  if v is null and private.adalah_super() then v := 'audit'; end if;
  return v;
end $$;

create or replace function private.chat_nama(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select t.nama from public.profil_pengguna pp join public.ptk t on t.id = pp.ptk_id where pp.user_id = p_user),
    (select d.nama from public.profil_pengguna pp join public.peserta_didik d on d.id = pp.peserta_didik_id where pp.user_id = p_user),
    'Pengguna')
$$;

create or replace function private.chat_tanya_boleh(p_guru uuid, p_siswa uuid, out ok boolean, out rombel_hasil uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  ok := false; rombel_hasil := null;
  select r.id into rombel_hasil from public.rombel r
    join public.keanggotaan_rombel kr on kr.rombel_id = r.id and kr.peserta_didik_id = p_siswa
    where private.chat_wali_dari(p_guru, r.id)
    limit 1;
  if rombel_hasil is not null then ok := true; return; end if;
  select k.rombel_id into rombel_hasil from public.kelas_ajar k
    join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id and kr.peserta_didik_id = p_siswa
    where k.ptk_id = p_guru and k.aktif and k.tanya_mode in ('dibuka','selalu')
    limit 1;
  ok := rombel_hasil is not null;
end $$;

create or replace function private.chat_tenang() returns boolean
language sql stable set search_path = '' as $$
  select (extract(hour from (now() at time zone 'Asia/Jakarta')) >= 21)
      or (extract(hour from (now() at time zone 'Asia/Jakarta')) < 5)
$$;

create or replace function private.chat_tinjau_boleh(p_ruang uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.adalah_super()
      or (private.npsn_saya() = (select c.npsn from public.chat_ruang c where c.id = p_ruang)
          and (private.peran_saya() = 'admin_tu'
               or private.punya_izin('profil.setujui_siswa')
               or private.chat_wali((select c.rombel_id from public.chat_ruang c where c.id = p_ruang))))
$$;

-- ===== fungsi publik =====
create or replace function public.chat_ruang_daftar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_npsn text := private.npsn_saya(); uid uuid := auth.uid(); hasil jsonb;
begin
  if uid is null or v_npsn is null then return '[]'::jsonb; end if;
  insert into public.chat_ruang(npsn, jenis, kelas_ajar_id, rombel_id, judul)
  select k.npsn, 'kelas', k.id, k.rombel_id, k.mapel || ' - ' || r.nama
    from public.kelas_ajar k join public.rombel r on r.id = k.rombel_id
   where k.aktif and k.npsn = v_npsn
     and (k.ptk_id = private.ptk_id_saya() or private.lms_anggota(k.id) or private.chat_wali(k.rombel_id))
  on conflict do nothing;
  if private.chat_staf() then
    insert into public.chat_ruang(npsn, jenis, judul) values (v_npsn, 'guru', 'Ruang guru dan staf') on conflict do nothing;
    insert into public.chat_ruang(npsn, jenis, kanal_kode, judul)
    select v_npsn, 'kanal', p.jabatan_kode, 'Kanal ' || replace(p.jabatan_kode, '_', ' ')
      from public.penugasan p
     where p.ptk_id = private.ptk_id_saya() and p.status = 'aktif' and p.tahun_ajaran = public.tahun_ajaran_sekarang()
       and p.jabatan_kode in ('kepala_sekolah','waka_kurikulum','waka_kesiswaan','waka_hubin','waka_sarpras','tu_kesiswaan','tu_kepegawaian','kaprog','kepala_bengkel')
    on conflict do nothing;
  end if;

  select coalesce(jsonb_agg(s.x order by s.x->>'pesan_terakhir_pada' desc nulls last), '[]'::jsonb) into hasil from (
    select jsonb_build_object(
      'id', c.id, 'jenis', c.jenis, 'akses', a.akses,
      'judul', case when c.jenis = 'tanya' then
                 case when a.akses = 'pemantau' then 'Tanya guru: ' || coalesce(g.nama,'?') || ' dan ' || coalesce(d.nama,'?')
                      when c.siswa_id = private.pd_id_saya() then 'Guru: ' || coalesce(g.nama,'?')
                      else 'Siswa: ' || coalesce(d.nama,'?') end
               else c.judul end,
      'pesan_terakhir_pada', c.pesan_terakhir_pada,
      'pesan_terakhir', (select case when m.dihapus_pada is null then left(m.isi, 80) else 'Pesan dihapus' end
                           from public.chat_pesan m where m.ruang_id = c.id order by m.dibuat_pada desc limit 1),
      'belum_dibaca', (select count(*) from public.chat_pesan m
                        where m.ruang_id = c.id and m.pengirim_user_id <> uid and m.dihapus_pada is null
                          and m.dibuat_pada > coalesce((select b.terakhir_dibaca_pada from public.chat_baca b where b.ruang_id = c.id and b.user_id = uid), '-infinity'))
    ) as x
    from public.chat_ruang c
    cross join lateral (select private.chat_akses(c.id) as akses) a
    left join public.ptk g on g.id = c.guru_ptk_id
    left join public.peserta_didik d on d.id = c.siswa_id
    where c.aktif and c.npsn = v_npsn and a.akses in ('peserta','pemantau')
  ) s;
  return hasil;
end $$;

create or replace function public.chat_mulai_tanya(p_guru uuid, p_siswa uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sw uuid; gr uuid; v_ok boolean; rb uuid; rid uuid; v_npsn text := private.npsn_saya();
begin
  if auth.uid() is null or v_npsn is null then raise exception 'Perlu masuk dulu'; end if;
  if private.pd_id_saya() is not null then
    sw := private.pd_id_saya(); gr := p_guru;
  elsif private.ptk_id_saya() is not null and p_siswa is not null then
    sw := p_siswa; gr := private.ptk_id_saya();
  else raise exception 'Tidak berwenang'; end if;

  select t.ok, t.rombel_hasil into v_ok, rb from private.chat_tanya_boleh(gr, sw) t;
  if not v_ok and private.pd_id_saya() is null then
    select k.rombel_id into rb from public.kelas_ajar k
      join public.keanggotaan_rombel kr on kr.rombel_id = k.rombel_id and kr.peserta_didik_id = sw
     where k.ptk_id = gr and k.aktif limit 1;
    v_ok := rb is not null;
  end if;
  if not v_ok then raise exception 'Jam tanya belum dibuka untuk guru ini'; end if;

  insert into public.chat_ruang(npsn, jenis, guru_ptk_id, siswa_id, rombel_id, judul)
  values (v_npsn, 'tanya', gr, sw, rb, 'Tanya guru')
  on conflict (guru_ptk_id, siswa_id) where jenis = 'tanya' do update set aktif = true
  returning id into rid;
  return rid;
end $$;

create or replace function public.chat_guru_untuk_saya() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('ptk_id', g.id, 'nama', g.nama, 'mapel', g.mapel, 'wali', g.wali, 'terbuka', g.terbuka)), '[]'::jsonb)
  from (
    select t.id, t.nama,
           string_agg(distinct k.mapel, ', ') filter (where k.id is not null and k.ptk_id = t.id) as mapel,
           bool_or(private.chat_wali_dari(t.id, kr.rombel_id)) as wali,
           bool_or(coalesce(k.tanya_mode in ('dibuka','selalu') and k.ptk_id = t.id, false) or private.chat_wali_dari(t.id, kr.rombel_id)) as terbuka
      from public.keanggotaan_rombel kr
      left join public.kelas_ajar k on k.rombel_id = kr.rombel_id and k.aktif
      join public.ptk t on t.id = k.ptk_id
         or t.id = (select r.wali_kelas_ptk_id from public.rombel r where r.id = kr.rombel_id)
     where kr.peserta_didik_id = private.pd_id_saya()
     group by t.id, t.nama
  ) g
$$;

create or replace function public.chat_kirim(p_ruang uuid, p_isi text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.chat_ruang%rowtype; isi text := btrim(coalesce(p_isi,'')); n int; pid uuid; v_ok boolean;
begin
  if uid is null then raise exception 'Perlu masuk dulu'; end if;
  if char_length(isi) = 0 then raise exception 'Pesan kosong'; end if;
  if char_length(isi) > 2000 then raise exception 'Pesan terlalu panjang (maksimal 2000 karakter)'; end if;
  if private.chat_akses(p_ruang) is distinct from 'peserta' then raise exception 'Tidak berwenang di ruang ini'; end if;
  select * into r from public.chat_ruang where id = p_ruang and aktif;
  if not found then raise exception 'Ruang tidak aktif'; end if;
  if r.jenis = 'tanya' and r.siswa_id = private.pd_id_saya() then
    select t.ok into v_ok from private.chat_tanya_boleh(r.guru_ptk_id, r.siswa_id) t;
    if not v_ok then raise exception 'Jam tanya sedang ditutup'; end if;
  end if;
  select count(*) into n from public.chat_pesan where pengirim_user_id = uid and dibuat_pada > now() - interval '1 minute';
  if n >= 20 then raise exception 'Terlalu cepat, tunggu sebentar'; end if;
  insert into public.chat_pesan(ruang_id, pengirim_user_id, isi) values (p_ruang, uid, isi) returning id into pid;
  update public.chat_ruang set pesan_terakhir_pada = now() where id = p_ruang;
  insert into public.chat_baca(ruang_id, user_id) values (p_ruang, uid)
    on conflict (ruang_id, user_id) do update set terakhir_dibaca_pada = now();
  return jsonb_build_object('id', pid, 'tenang', private.chat_tenang());
end $$;

create or replace function public.chat_pesan_daftar(p_ruang uuid, p_sebelum timestamptz default null, p_sejak timestamptz default null, p_batas int default 50)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a text := private.chat_akses(p_ruang); uid uuid := auth.uid(); hasil jsonb; lim int := least(greatest(coalesce(p_batas,50),1),100);
begin
  if a is null then raise exception 'Tidak berwenang di ruang ini'; end if;
  if a in ('pemantau','audit') and p_sejak is null and p_sebelum is null
     and not exists (select 1 from public.chat_audit x where x.user_id = uid and x.ruang_id = p_ruang and x.aksi = a
                      and x.dibuat_pada > now() - interval '30 minutes') then
    insert into public.chat_audit(user_id, ruang_id, aksi) values (uid, p_ruang, a);
  end if;
  select coalesce(jsonb_agg(s.j order by (s.j->>'dibuat_pada') asc), '[]'::jsonb) into hasil from (
    select jsonb_build_object(
      'id', m.id, 'dibuat_pada', m.dibuat_pada,
      'pengirim', private.chat_nama(m.pengirim_user_id),
      'saya', m.pengirim_user_id = uid,
      'dihapus', m.dihapus_pada is not null,
      'isi', case when m.dihapus_pada is null or a = 'audit' then m.isi else null end) as j
    from public.chat_pesan m
    where m.ruang_id = p_ruang
      and (p_sebelum is null or m.dibuat_pada < p_sebelum)
      and (p_sejak is null or m.dibuat_pada > p_sejak)
    order by m.dibuat_pada desc limit lim
  ) s;
  return jsonb_build_object('akses', a, 'pesan', hasil);
end $$;

create or replace function public.chat_tandai_baca(p_ruang uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.chat_akses(p_ruang) is null then return; end if;
  insert into public.chat_baca(ruang_id, user_id) values (p_ruang, auth.uid())
  on conflict (ruang_id, user_id) do update set terakhir_dibaca_pada = now();
end $$;

create or replace function public.chat_ringkasan() returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null or private.npsn_saya() is null then return 0; end if;
  select coalesce(sum(case when private.chat_akses(c.id) = 'peserta' then
      (select count(*) from public.chat_pesan m where m.ruang_id = c.id and m.pengirim_user_id <> uid and m.dihapus_pada is null
         and m.dibuat_pada > coalesce((select b.terakhir_dibaca_pada from public.chat_baca b where b.ruang_id = c.id and b.user_id = uid), '-infinity')) else 0 end), 0)
    into n from public.chat_ruang c where c.aktif and c.npsn = private.npsn_saya();
  return n;
end $$;

create or replace function public.chat_hapus(p_pesan uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.chat_pesan%rowtype; r public.chat_ruang%rowtype; boleh boolean := false; k public.kelas_ajar%rowtype;
begin
  select * into m from public.chat_pesan where id = p_pesan;
  if not found then return; end if;
  if private.chat_akses(m.ruang_id) is distinct from 'peserta' then raise exception 'Tidak berwenang'; end if;
  select * into r from public.chat_ruang where id = m.ruang_id;
  if m.pengirim_user_id = auth.uid() then boleh := true;
  elsif r.jenis = 'tanya' and r.guru_ptk_id = private.ptk_id_saya() then boleh := true;
  elsif r.jenis = 'kelas' then
    select * into k from public.kelas_ajar where id = r.kelas_ajar_id;
    boleh := k.ptk_id = private.ptk_id_saya();
  end if;
  if not boleh then raise exception 'Tidak berwenang menghapus pesan ini'; end if;
  update public.chat_pesan set dihapus_pada = now(), dihapus_oleh = auth.uid() where id = p_pesan and dihapus_pada is null;
end $$;

create or replace function public.chat_lapor(p_pesan uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.chat_pesan%rowtype; a text := btrim(coalesce(p_alasan,''));
begin
  if char_length(a) < 3 or char_length(a) > 500 then raise exception 'Alasan 3 sampai 500 karakter'; end if;
  select * into m from public.chat_pesan where id = p_pesan;
  if not found then raise exception 'Pesan tidak ditemukan'; end if;
  if private.chat_akses(m.ruang_id) not in ('peserta','pemantau') then raise exception 'Tidak berwenang'; end if;
  insert into public.chat_laporan(pesan_id, pelapor_user_id, alasan) values (p_pesan, auth.uid(), a)
  on conflict (pesan_id, pelapor_user_id) do nothing;
end $$;

create or replace function public.chat_laporan_daftar(p_status text default 'baru') returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'status', l.status, 'alasan', l.alasan, 'dibuat_pada', l.dibuat_pada, 'catatan', l.catatan_tinjau,
    'ruang_id', m.ruang_id, 'ruang', c.judul, 'jenis', c.jenis,
    'pelapor', private.chat_nama(l.pelapor_user_id),
    'pengirim', private.chat_nama(m.pengirim_user_id),
    'isi', m.isi, 'dibuat_pesan', m.dibuat_pada) order by l.dibuat_pada desc), '[]'::jsonb)
  from public.chat_laporan l
  join public.chat_pesan m on m.id = l.pesan_id
  join public.chat_ruang c on c.id = m.ruang_id
  where (p_status is null or l.status = p_status) and private.chat_tinjau_boleh(c.id)
$$;

create or replace function public.chat_laporan_tinjau(p_laporan uuid, p_status text, p_catatan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
  if p_status not in ('ditinjau','selesai') then raise exception 'Status tidak valid'; end if;
  select m.ruang_id into rid from public.chat_laporan l join public.chat_pesan m on m.id = l.pesan_id where l.id = p_laporan;
  if rid is null or not private.chat_tinjau_boleh(rid) then raise exception 'Tidak berwenang'; end if;
  update public.chat_laporan set status = p_status, catatan_tinjau = left(p_catatan, 500), ditinjau_oleh = auth.uid() where id = p_laporan;
  insert into public.chat_audit(user_id, ruang_id, aksi) values (auth.uid(), rid, 'tinjau_laporan');
end $$;

create or replace function public.chat_tanya_atur(p_kelas uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_mode not in ('tertutup','dibuka','selalu') then raise exception 'Mode tidak valid'; end if;
  if not private.lms_kelola(p_kelas) then raise exception 'Tidak berwenang'; end if;
  update public.kelas_ajar set tanya_mode = p_mode where id = p_kelas;
end $$;

-- ===== pelengkap untuk halaman (chat_pelengkap_v1) =====
-- Kelas ajar milik guru yang sedang masuk, beserta mode jam tanya.
create or replace function public.chat_tanya_pengaturan() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'mapel', k.mapel, 'rombel', r.nama, 'mode', k.tanya_mode)
                            order by r.nama, k.mapel), '[]'::jsonb)
  from public.kelas_ajar k join public.rombel r on r.id = k.rombel_id
  where k.aktif and k.ptk_id = private.ptk_id_saya()
$$;

-- Siswa yang boleh dihubungi guru: anggota rombel yang diajar atau diwalikan guru itu.
create or replace function public.chat_siswa_saya() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'nama', d.nama, 'rombel', r.nama) order by r.nama, d.nama), '[]'::jsonb)
  from public.rombel r
  join public.keanggotaan_rombel kr on kr.rombel_id = r.id
  join public.peserta_didik d on d.id = kr.peserta_didik_id
  where private.ptk_id_saya() is not null and r.npsn = private.npsn_saya()
    and (exists (select 1 from public.kelas_ajar k where k.rombel_id = r.id and k.ptk_id = private.ptk_id_saya() and k.aktif)
         or private.chat_wali_dari(private.ptk_id_saya(), r.id))
$$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'chat\_%' loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
