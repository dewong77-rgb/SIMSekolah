-- Koreksi kehadiran harian. Kasus: siswa tercatat alpa, lalu wali kelas atau guru piket mengonfirmasi bahwa ia sebenarnya
-- hadir, terlambat, sakit, izin, atau dispensasi. Setiap koreksi wajib beralasan dan menyebut siapa yang mengonfirmasi;
-- riwayatnya disimpan. Jendela koreksi: 62 hari (Waka 90 hari) agar bulan lalu yang dipakai penilaian pemanggilan orang tua masih bisa dibetulkan.
-- Izin yang sudah disetujui mengalahkan catatan petugas; koreksi tidak menimpanya.

create table if not exists public.kehadiran_koreksi (
  id uuid primary key default gen_random_uuid(),
  npsn text not null references public.sekolah (npsn),
  peserta_didik_id uuid not null references public.peserta_didik (id),
  rombel_id uuid references public.rombel (id),
  tanggal date not null,
  status_lama text,
  status_baru text not null check (status_baru in ('hadir','terlambat','sakit','izin','dispensasi','alpa')),
  alasan text not null check (char_length(alasan) between 3 and 300),
  dikonfirmasi_oleh text not null check (char_length(dikonfirmasi_oleh) between 3 and 100),
  dicatat_oleh uuid not null,
  dicatat_nama text,
  dicatat_pada timestamptz not null default now()
);
alter table public.kehadiran_koreksi enable row level security;
revoke all on table public.kehadiran_koreksi from anon, authenticated;
create index if not exists koreksi_pd_idx on public.kehadiran_koreksi (peserta_didik_id, tanggal);
create index if not exists koreksi_waktu_idx on public.kehadiran_koreksi (npsn, dicatat_pada desc);

-- Daftar siswa-hari menurut status akhir (mis. semua yang alpa) untuk dikoreksi.
create or replace function public.kehadiran_koreksi_cari(p_dari date, p_sampai date, p_status text default 'alpa', p_rombel uuid default null, p_cari text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_semua boolean := private.kes_semua(array['kesiswaan.izin']);
  v_rombel uuid[] := private.kes_rombel_saya(array['kesiswaan.izin']);
  v_cari text := nullif(btrim(coalesce(p_cari, '')), '');
begin
  if auth.uid() is null or not (v_semua or cardinality(v_rombel) > 0) then raise exception 'Anda tidak berwenang mengoreksi kehadiran.'; end if;
  if p_dari is null or p_sampai is null or p_sampai < p_dari or p_sampai - p_dari > 62 then raise exception 'Rentang tanggal 1 sampai 62 hari.'; end if;
  if p_status not in ('hadir','terlambat','sakit','izin','dispensasi','alpa') then raise exception 'Status tidak dikenal.'; end if;
  if p_rombel is not null and not (v_semua or p_rombel = any (v_rombel)) then raise exception 'Anda tidak berwenang membuka rombel ini.'; end if;
  return (
    select jsonb_build_object('total', count(*), 'baris', coalesce(jsonb_agg(to_jsonb(x) order by x.tanggal desc, x.rombel, x.nama) filter (where x.n <= 300), '[]'::jsonb))
      from (
        select s.pd, pd.nama, pd.nisn, r.id as rombel_id, r.nama as rombel, s.tanggal, s.status,
               exists (select 1 from public.izin_siswa i where i.peserta_didik_id = s.pd and i.status = 'disetujui' and i.jenis <> 'izin_keluar'
                        and i.tgl_mulai <= s.tanggal and i.tgl_selesai >= s.tanggal) as dari_izin,
               (select count(*) from public.kehadiran_koreksi q where q.peserta_didik_id = s.pd and q.tanggal = s.tanggal) as koreksi,
               row_number() over (order by s.tanggal desc, r.nama, pd.nama) as n
          from private.kes_status_hari(p_dari, p_sampai) s
          join public.peserta_didik pd on pd.id = s.pd and pd.npsn = private.npsn_saya() and pd.status_peserta_didik = 'aktif'
          join public.rombel r on r.id = private.kes_rombel_pd(s.pd)
         where s.status = p_status
           and (p_rombel is null or r.id = p_rombel)
           and (v_semua or r.id = any (v_rombel))
           and (v_cari is null or pd.nama ilike '%' || v_cari || '%' or pd.nisn = v_cari)) x);
end $$;

create or replace function public.kehadiran_koreksi(p_pd uuid, p_tanggal date, p_status text, p_alasan text, p_konfirmasi text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hari date := private.kes_hari();
  v_batas int := case when private.kes_waka() then 90 else 62 end;
  v_alasan text := btrim(coalesce(p_alasan, ''));
  v_konf text := btrim(coalesce(p_konfirmasi, ''));
  v_lama text;
  v_rombel uuid;
  v_pang int;
begin
  if auth.uid() is null or not private.kes_pd_boleh(array['kesiswaan.izin'], p_pd) then raise exception 'Anda tidak berwenang mengoreksi kehadiran siswa ini.'; end if;
  if not exists (select 1 from public.peserta_didik where id = p_pd and npsn = private.npsn_saya() and status_peserta_didik = 'aktif') then raise exception 'Siswa tidak ditemukan atau sudah tidak aktif.'; end if;
  if p_tanggal is null or p_tanggal > v_hari then raise exception 'Tanggal tidak boleh di masa depan.'; end if;
  if p_tanggal < v_hari - v_batas then raise exception 'Tanggal terlalu lampau untuk dikoreksi (maksimal % hari).', v_batas; end if;
  if extract(isodow from p_tanggal) >= 6 then raise exception 'Sabtu dan Minggu bukan hari sekolah.'; end if;
  if p_status is null or p_status not in ('hadir','terlambat','sakit','izin','dispensasi','alpa') then raise exception 'Status tidak dikenal.'; end if;
  if char_length(v_alasan) < 3 or char_length(v_alasan) > 300 then raise exception 'Alasan koreksi 3 sampai 300 karakter.'; end if;
  if char_length(v_konf) < 3 or char_length(v_konf) > 100 then raise exception 'Tulis siapa yang mengonfirmasi (wali kelas atau guru piket).'; end if;
  if exists (select 1 from public.izin_siswa i where i.peserta_didik_id = p_pd and i.status = 'disetujui' and i.jenis <> 'izin_keluar'
              and i.tgl_mulai <= p_tanggal and i.tgl_selesai >= p_tanggal) then
    raise exception 'Tanggal ini tercakup izin yang sudah disetujui, yang mengalahkan catatan kehadiran. Batalkan izinnya bila keliru.';
  end if;
  select status into v_lama from public.kehadiran_harian where peserta_didik_id = p_pd and tanggal = p_tanggal;
  if v_lama is not distinct from p_status then raise exception 'Status sudah % pada tanggal itu.', p_status; end if;
  v_rombel := private.kes_rombel_pd(p_pd);
  insert into public.kehadiran_harian (peserta_didik_id, tanggal, rombel_id, status, dicatat_oleh)
  values (p_pd, p_tanggal, v_rombel, p_status, auth.uid())
  on conflict (peserta_didik_id, tanggal) do update set status = excluded.status, rombel_id = excluded.rombel_id, dicatat_oleh = excluded.dicatat_oleh, diperbarui_pada = now();
  insert into public.kehadiran_koreksi (npsn, peserta_didik_id, rombel_id, tanggal, status_lama, status_baru, alasan, dikonfirmasi_oleh, dicatat_oleh, dicatat_nama)
  values (private.npsn_saya(), p_pd, v_rombel, p_tanggal, v_lama, p_status, v_alasan, v_konf, auth.uid(), private.lms_nama_saya());
  perform private.kes_audit('kehadiran_harian', 'KOREKSI', jsonb_build_object('pd', p_pd, 'tanggal', p_tanggal, 'dari', v_lama, 'ke', p_status));
  select count(*) into v_pang from public.pemanggilan_ortu where peserta_didik_id = p_pd and status = 'dijadwalkan';
  return jsonb_build_object('status_lama', v_lama, 'status_baru', p_status, 'pemanggilan_terjadwal', v_pang);
end $$;

create or replace function public.kehadiran_koreksi_riwayat(p_batas int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_semua boolean := private.kes_semua(array['kesiswaan.izin']);
  v_rombel uuid[] := private.kes_rombel_saya(array['kesiswaan.izin']);
begin
  if auth.uid() is null or not (v_semua or cardinality(v_rombel) > 0) then raise exception 'Anda tidak berwenang membuka riwayat koreksi.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'nama', pd.nama, 'rombel', r.nama, 'tanggal', q.tanggal, 'dari', q.status_lama, 'ke', q.status_baru, 'alasan', q.alasan,
      'dikonfirmasi_oleh', q.dikonfirmasi_oleh, 'dicatat_nama', q.dicatat_nama, 'dicatat_pada', q.dicatat_pada) order by q.dicatat_pada desc), '[]'::jsonb)
    from (select * from public.kehadiran_koreksi k where k.npsn = private.npsn_saya() and (v_semua or k.rombel_id = any (v_rombel))
           order by k.dicatat_pada desc limit least(greatest(coalesce(p_batas, 100), 1), 300)) q
    join public.peserta_didik pd on pd.id = q.peserta_didik_id
    left join public.rombel r on r.id = q.rombel_id);
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (array['kehadiran_koreksi_cari','kehadiran_koreksi','kehadiran_koreksi_riwayat'])
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated', r.f);
  end loop;
end $$;
