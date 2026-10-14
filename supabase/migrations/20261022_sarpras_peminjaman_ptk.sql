-- Peminjaman alat: peminjam dipilih dari daftar guru dan tenaga kependidikan (PTK), bukan teks bebas.
-- Nama peminjam disalin ke catatan agar rekap tetap utuh bila data PTK berubah.

alter table public.sarpras_pinjam add column if not exists peminjam_ptk_id uuid references public.ptk(id) on delete set null;
create index if not exists sarpras_pinjam_ptk_idx on public.sarpras_pinjam (peminjam_ptk_id);

create or replace function public.sarpras_pinjam_ptk() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(r order by r.nama), '[]'::jsonb) from (
    select p.id, p.nama, p.jenis_ptk
    from public.ptk p
    where p.npsn = private.npsn_saya() and private.sarpras_boleh_lihat()
    limit 1000
  ) r
$fn$;

create or replace function public.sarpras_pinjam_catat(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_npsn text := private.npsn_saya();
  v_b public.sarpras_barang;
  v_ptk public.ptk;
  v_jumlah numeric := coalesce(nullif(p->>'jumlah','')::numeric, 1);
  v_tgl date := coalesce(nullif(p->>'tanggal_pinjam','')::date, (now() at time zone 'Asia/Jakarta')::date);
  v_rencana date := nullif(p->>'rencana_kembali','')::date;
  v_dipinjam numeric;
  v_id uuid;
begin
  if auth.uid() is null or v_npsn is null then raise exception 'Perlu masuk terlebih dahulu'; end if;
  if not private.sarpras_boleh_operasional() then raise exception 'Hanya Staf atau Waka Sarpras yang dapat mencatat peminjaman'; end if;
  select * into v_ptk from public.ptk where id = nullif(p->>'peminjam_ptk_id','')::uuid and npsn = v_npsn;
  if not found then raise exception 'Pilih peminjam dari daftar guru dan tenaga kependidikan'; end if;
  if v_jumlah <= 0 then raise exception 'Jumlah harus lebih dari nol'; end if;
  if v_rencana is not null and v_rencana < v_tgl then raise exception 'Rencana kembali tidak boleh sebelum tanggal pinjam'; end if;
  select * into v_b from public.sarpras_barang
   where id = nullif(p->>'barang_id','')::uuid and npsn = v_npsn and dihapus_pada is null and kategori = 'alat' for update;
  if not found then raise exception 'Alat belum ada di inventaris. Staf Sarpras perlu mencatatnya lebih dulu di menu Inventaris'; end if;
  select coalesce(sum(jumlah), 0) into v_dipinjam from public.sarpras_pinjam where barang_id = v_b.id and status = 'dipinjam';
  if v_jumlah > v_b.jumlah_baik - v_dipinjam then
    raise exception 'Jumlah melebihi alat yang tersedia (%)', greatest(v_b.jumlah_baik - v_dipinjam, 0);
  end if;
  insert into public.sarpras_pinjam(npsn, nomor, barang_id, nama_barang, jumlah, peminjam_nama, peminjam_ptk_id, keperluan, tanggal_pinjam, rencana_kembali, dicatat_oleh, dicatat_nama)
  values (v_npsn, private.sarpras_pinjam_nomor(v_npsn), v_b.id, v_b.nama, v_jumlah, v_ptk.nama, v_ptk.id,
          nullif(btrim(coalesce(p->>'keperluan','')), ''), v_tgl, v_rencana, auth.uid(), public.nama_saya())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $fn$;

revoke execute on function public.sarpras_pinjam_ptk() from public, anon;
grant execute on function public.sarpras_pinjam_ptk() to authenticated;
