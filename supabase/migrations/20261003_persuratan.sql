-- Persuratan: register surat masuk dan keluar, disposisi dari pimpinan, penerusan, dan jejaknya.
-- Tabel tanpa policy; semua akses lewat fungsi yang memeriksa izin (surat.catat, surat.baca_semua, surat.disposisi, surat.teruskan).

create table if not exists public.surat (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah(npsn),
  arah text not null check (arah in ('masuk','keluar')),
  kategori text not null check (kategori in ('permintaan','undangan','edaran','pemberitahuan','lainnya')),
  sifat text not null default 'biasa' check (sifat in ('biasa','penting','rahasia')),
  nomor_agenda text not null,
  nomor_surat text,
  tanggal_surat date,
  tanggal_catat date not null default ((now() at time zone 'Asia/Jakarta')::date),
  pihak text not null,
  perihal text not null,
  ringkasan text,
  tautan_berkas text,
  dicatat_oleh uuid not null,
  status text not null default 'baru' check (status in ('baru','didisposisi','selesai','diarsipkan')),
  dibuat_pada timestamptz not null default now(),
  unique (npsn, nomor_agenda)
);
create index if not exists surat_npsn_idx on public.surat (npsn, dibuat_pada desc);

create table if not exists public.surat_nomor (
  npsn text not null, arah text not null, tahun int not null, terakhir int not null default 0,
  primary key (npsn, arah, tahun)
);

create table if not exists public.disposisi (
  id uuid primary key default gen_random_uuid(),
  surat_id uuid not null references public.surat(id) on delete cascade,
  npsn text not null,
  dari_user uuid not null,
  dari_nama text not null,
  ke_ptk_id uuid not null references public.ptk(id),
  ke_nama text not null,
  instruksi text not null,
  urgensi text not null default 'biasa' check (urgensi in ('biasa','segera','sangat_segera')),
  tenggat date,
  induk_id uuid references public.disposisi(id),
  status text not null default 'menunggu' check (status in ('menunggu','dibaca','dikerjakan','selesai')),
  dibaca_pada timestamptz,
  selesai_pada timestamptz,
  tanggapan text,
  dibuat_pada timestamptz not null default now()
);
create index if not exists disposisi_surat_idx on public.disposisi (surat_id);
create index if not exists disposisi_ke_idx on public.disposisi (ke_ptk_id, status);
create index if not exists disposisi_induk_idx on public.disposisi (induk_id);

alter table public.surat enable row level security;
alter table public.surat_nomor enable row level security;
alter table public.disposisi enable row level security;

create or replace function private.boleh_baca_surat(p_surat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.surat s
     where s.id = p_surat and s.npsn = private.npsn_saya()
       and (private.adalah_super()
            or s.dicatat_oleh = (select auth.uid())
            or exists (select 1 from public.disposisi d where d.surat_id = s.id and d.ke_ptk_id = private.ptk_id_saya())
            or private.punya_izin('surat.disposisi')
            or (s.sifat <> 'rahasia' and private.punya_izin('surat.baca_semua')))), false)
$$;

create or replace function public.surat_catat(
  p_arah text, p_kategori text, p_sifat text, p_nomor_surat text, p_tanggal_surat date,
  p_pihak text, p_perihal text, p_ringkasan text default null, p_tautan text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_npsn text := private.npsn_saya(); v_tahun int := extract(year from (now() at time zone 'Asia/Jakarta'))::int; v_n int; v_id uuid;
begin
  if not private.punya_izin('surat.catat') then raise exception 'Anda tidak berwenang mencatat surat.'; end if;
  if p_arah not in ('masuk','keluar') then raise exception 'Arah surat tidak valid.'; end if;
  if length(btrim(coalesce(p_perihal,''))) < 3 or length(p_perihal) > 300 then raise exception 'Perihal wajib diisi (3 sampai 300 karakter).'; end if;
  if length(btrim(coalesce(p_pihak,''))) < 2 or length(p_pihak) > 200 then raise exception 'Pengirim atau tujuan wajib diisi.'; end if;
  if length(coalesce(p_ringkasan,'')) > 2000 then raise exception 'Ringkasan terlalu panjang.'; end if;
  if p_tautan is not null and p_tautan <> '' and p_tautan !~ '^https://[^\s]{4,500}$' then raise exception 'Tautan berkas harus diawali https://.'; end if;
  insert into public.surat_nomor (npsn, arah, tahun, terakhir) values (v_npsn, p_arah, v_tahun, 1)
    on conflict (npsn, arah, tahun) do update set terakhir = public.surat_nomor.terakhir + 1
    returning terakhir into v_n;
  insert into public.surat (npsn, arah, kategori, sifat, nomor_agenda, nomor_surat, tanggal_surat, pihak, perihal, ringkasan, tautan_berkas, dicatat_oleh)
  values (v_npsn, p_arah, p_kategori, coalesce(p_sifat,'biasa'),
          (case when p_arah = 'masuk' then 'M' else 'K' end) || '-' || lpad(v_n::text, 3, '0') || '/' || v_tahun,
          nullif(btrim(coalesce(p_nomor_surat,'')),''), p_tanggal_surat, btrim(p_pihak), btrim(p_perihal),
          nullif(btrim(coalesce(p_ringkasan,'')),''), nullif(btrim(coalesce(p_tautan,'')),''), (select auth.uid()))
  returning id into v_id;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'surat', 'CATAT', jsonb_build_object('surat', v_id, 'arah', p_arah, 'sifat', p_sifat));
  return v_id;
end $$;

create or replace function public.surat_daftar(
  p_arah text default null, p_cari text default null, p_status text default null, p_hal int default 1, p_ukuran int default 10
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ukuran int := least(greatest(coalesce(p_ukuran, 10), 1), 1000); v_hal int := greatest(coalesce(p_hal, 1), 1); v_k text := nullif(btrim(coalesce(p_cari,'')),''); v_total int; v_baris jsonb;
begin
  select count(*) into v_total from public.surat s
   where s.npsn = private.npsn_saya() and (p_arah is null or s.arah = p_arah) and (p_status is null or s.status = p_status)
     and (v_k is null or s.perihal ilike '%'||v_k||'%' or s.pihak ilike '%'||v_k||'%' or s.nomor_agenda ilike '%'||v_k||'%' or coalesce(s.nomor_surat,'') ilike '%'||v_k||'%')
     and private.boleh_baca_surat(s.id);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.dibuat_pada desc), '[]'::jsonb) into v_baris from (
    select s.id, s.arah, s.kategori, s.sifat, s.nomor_agenda, s.nomor_surat, s.tanggal_surat, s.tanggal_catat, s.pihak, s.perihal, s.status, s.dibuat_pada,
           (select count(*) from public.disposisi d where d.surat_id = s.id) as jml_disposisi,
           (select count(*) from public.disposisi d where d.surat_id = s.id and d.status <> 'selesai') as disposisi_terbuka
      from public.surat s
     where s.npsn = private.npsn_saya() and (p_arah is null or s.arah = p_arah) and (p_status is null or s.status = p_status)
       and (v_k is null or s.perihal ilike '%'||v_k||'%' or s.pihak ilike '%'||v_k||'%' or s.nomor_agenda ilike '%'||v_k||'%' or coalesce(s.nomor_surat,'') ilike '%'||v_k||'%')
       and private.boleh_baca_surat(s.id)
     order by s.dibuat_pada desc offset (v_hal - 1) * v_ukuran limit v_ukuran) t;
  return jsonb_build_object('total', v_total, 'baris', v_baris);
end $$;

create or replace function public.surat_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya();
begin
  if not private.boleh_baca_surat(p_id) then raise exception 'Surat tidak ditemukan atau Anda tidak berhak membacanya.'; end if;
  return jsonb_build_object(
    'surat', (select to_jsonb(s) - 'npsn' - 'dicatat_oleh' from public.surat s where s.id = p_id),
    'disposisi', (select coalesce(jsonb_agg((to_jsonb(d) - 'npsn' - 'dari_user') || jsonb_build_object('untuk_saya', d.ke_ptk_id = v_ptk) order by d.dibuat_pada), '[]'::jsonb)
                    from public.disposisi d where d.surat_id = p_id),
    'boleh_disposisi', private.punya_izin('surat.disposisi'),
    'boleh_teruskan', private.punya_izin('surat.teruskan') and exists (select 1 from public.disposisi d where d.surat_id = p_id and d.ke_ptk_id = v_ptk));
end $$;

create or replace function public.disposisi_buat(
  p_surat uuid, p_ke uuid[], p_instruksi text, p_urgensi text default 'biasa', p_tenggat date default null, p_induk uuid default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_ptk uuid := private.ptk_id_saya(); v_dari text; v_n int := 0; v_id uuid; r record;
begin
  if not private.boleh_baca_surat(p_surat) then raise exception 'Surat tidak ditemukan.'; end if;
  if p_induk is null then
    if not private.punya_izin('surat.disposisi') then raise exception 'Hanya kepala sekolah dan wakil kepala sekolah yang dapat membuat disposisi.'; end if;
  else
    if not (private.punya_izin('surat.disposisi')
            or (private.punya_izin('surat.teruskan') and exists (select 1 from public.disposisi d where d.id = p_induk and d.surat_id = p_surat and d.ke_ptk_id = v_ptk))) then
      raise exception 'Anda tidak berwenang meneruskan disposisi ini.';
    end if;
  end if;
  if length(btrim(coalesce(p_instruksi,''))) < 3 or length(p_instruksi) > 1000 then raise exception 'Instruksi wajib diisi (3 sampai 1000 karakter).'; end if;
  if p_urgensi not in ('biasa','segera','sangat_segera') then raise exception 'Tingkat urgensi tidak valid.'; end if;
  if p_ke is null or coalesce(array_length(p_ke, 1), 0) not between 1 and 20 then raise exception 'Pilih 1 sampai 20 penerima.'; end if;
  select coalesce((select nama from public.ptk where id = v_ptk), (select nama_lengkap from public.profil_admin where user_id = (select auth.uid())), 'Admin') into v_dari;
  for r in select id, nama from public.ptk where id = any(p_ke) and npsn = private.npsn_saya() loop
    insert into public.disposisi (surat_id, npsn, dari_user, dari_nama, ke_ptk_id, ke_nama, instruksi, urgensi, tenggat, induk_id)
    values (p_surat, private.npsn_saya(), (select auth.uid()), v_dari, r.id, r.nama, btrim(p_instruksi), p_urgensi, p_tenggat, p_induk)
    returning id into v_id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Penerima tidak ditemukan.'; end if;
  update public.surat set status = 'didisposisi' where id = p_surat and status in ('baru','selesai');
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'disposisi', 'BUAT', jsonb_build_object('surat', p_surat, 'penerima', v_n, 'induk', p_induk));
  return v_n;
end $$;

create or replace function public.disposisi_saya(p_status text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.dibuat_pada desc), '[]'::jsonb) from (
    select d.id, d.surat_id, d.dari_nama, d.instruksi, d.urgensi, d.tenggat, d.status, d.tanggapan, d.dibuat_pada, d.selesai_pada,
           s.perihal, s.nomor_agenda, s.sifat, s.pihak, s.kategori, s.arah
      from public.disposisi d join public.surat s on s.id = d.surat_id
     where d.ke_ptk_id = private.ptk_id_saya() and d.npsn = private.npsn_saya() and (p_status is null or d.status = p_status)
     order by d.dibuat_pada desc limit 200) t
$$;

create or replace function public.disposisi_tanggapi(p_id uuid, p_status text, p_tanggapan text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.disposisi; v_t text := nullif(btrim(coalesce(p_tanggapan,'')),'');
begin
  select * into d from public.disposisi where id = p_id and ke_ptk_id = private.ptk_id_saya() for update;
  if not found then raise exception 'Disposisi tidak ditemukan.'; end if;
  if p_status not in ('dibaca','dikerjakan','selesai') then raise exception 'Status tidak valid.'; end if;
  if d.status = 'selesai' then raise exception 'Disposisi ini sudah selesai.'; end if;
  if p_status = 'selesai' and v_t is null then raise exception 'Tulis tanggapan atau hasil tindak lanjut.'; end if;
  if length(coalesce(v_t,'')) > 1000 then raise exception 'Tanggapan terlalu panjang.'; end if;
  update public.disposisi set status = p_status, tanggapan = coalesce(v_t, tanggapan),
         dibaca_pada = coalesce(dibaca_pada, now()), selesai_pada = case when p_status = 'selesai' then now() end
   where id = p_id;
  if p_status = 'selesai' and not exists (select 1 from public.disposisi x where x.surat_id = d.surat_id and x.status <> 'selesai') then
    update public.surat set status = 'selesai' where id = d.surat_id and status = 'didisposisi';
  end if;
  insert into public.audit_log (user_id, tabel, aksi, ringkasan) values ((select auth.uid()), 'disposisi', upper(p_status), jsonb_build_object('disposisi', p_id));
end $$;

create or replace function public.surat_arsipkan(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.punya_izin('surat.catat') or private.punya_izin('surat.disposisi')) then raise exception 'Tidak berwenang.'; end if;
  update public.surat set status = 'diarsipkan' where id = p_id and npsn = private.npsn_saya() and status in ('baru','selesai');
  if not found then raise exception 'Surat tidak ditemukan atau masih dalam proses disposisi.'; end if;
end $$;

-- Daftar penerima disposisi: nama dan jabatan aktif, tanpa data pribadi.
create or replace function public.disposisi_penerima() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.punya_izin('surat.disposisi') or private.punya_izin('surat.teruskan')) then raise exception 'Tidak berwenang.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.nama, 'jenis', p.jenis_ptk,
            'jabatan', (select string_agg(distinct j.nama, ', ') from public.penugasan pn join public.jabatan j on j.kode = pn.jabatan_kode
                         where pn.ptk_id = p.id and pn.status = 'aktif' and pn.tahun_ajaran = public.tahun_ajaran_sekarang())) order by p.nama), '[]'::jsonb)
            from public.ptk p where p.npsn = private.npsn_saya());
end $$;

create or replace function public.surat_ringkasan() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'disposisi_menunggu', (select count(*) from public.disposisi d where d.ke_ptk_id = private.ptk_id_saya() and d.status in ('menunggu','dibaca','dikerjakan')),
    'belum_disposisi', case when private.punya_izin('surat.disposisi')
        then (select count(*) from public.surat s where s.npsn = private.npsn_saya() and s.arah = 'masuk' and s.status = 'baru') else 0 end,
    'boleh_catat', private.punya_izin('surat.catat'),
    'boleh_baca', private.punya_izin('surat.catat') or private.punya_izin('surat.baca_semua') or private.punya_izin('surat.disposisi'))
$$;

do $do$
declare f text;
begin
  foreach f in array array[
    'public.surat_catat(text,text,text,text,date,text,text,text,text)','public.surat_daftar(text,text,text,int,int)','public.surat_detail(uuid)',
    'public.disposisi_buat(uuid,uuid[],text,text,date,uuid)','public.disposisi_saya(text)','public.disposisi_tanggapi(uuid,text,text)',
    'public.surat_arsipkan(uuid)','public.disposisi_penerima()','public.surat_ringkasan()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $do$;
