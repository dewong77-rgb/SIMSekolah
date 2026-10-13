-- Impor buku fisik dari Excel. Aplikasi membaca berkas di browser, memeriksa tiap baris, lalu mengirim paling banyak 200 baris per permintaan.
-- Satu baris = satu judul beserta jumlah eksemplarnya. Judul yang sudah ada (ISBN sama, atau judul dan penulis sama) tidak digandakan:
-- eksemplar baru ditambahkan ke judul itu. Baris yang gagal dilaporkan per baris dan tidak menggagalkan baris lain.

create or replace function public.perpus_fisik_impor(p_baris jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_npsn text := private.npsn_saya(); v_id uuid; v_jumlah int; v_isbn text; v_no text;
        v_baru int := 0; v_ada int := 0; v_eks int := 0; v_gagal jsonb := '[]'::jsonb;
begin
  if not private.boleh_kelola_perpus() then raise exception 'Hanya pengelola perpustakaan yang dapat mengimpor koleksi.' using errcode = '42501'; end if;
  if p_baris is null or jsonb_typeof(p_baris) <> 'array' then raise exception 'Format data tidak valid.' using errcode = '22023'; end if;
  if jsonb_array_length(p_baris) > 200 then raise exception 'Maksimal 200 baris per permintaan.' using errcode = '22023'; end if;
  for r in select e from jsonb_array_elements(p_baris) e loop
    begin
      v_no := r ->> 'baris';
      v_jumlah := coalesce(nullif(r ->> 'jumlah', '')::int, 1);
      if v_jumlah < 0 or v_jumlah > 500 then raise exception 'Jumlah eksemplar 0 sampai 500.'; end if;
      v_isbn := nullif(regexp_replace(coalesce(r ->> 'isbn', ''), '[^0-9Xx]', '', 'g'), '');
      v_id := null;
      select id into v_id from public.perpus_fisik
       where npsn = v_npsn and (
             (v_isbn is not null and regexp_replace(coalesce(isbn, ''), '[^0-9Xx]', '', 'g') = v_isbn)
          or (v_isbn is null and lower(btrim(judul)) = lower(btrim(coalesce(r ->> 'judul', '')))
              and lower(btrim(coalesce(penulis, ''))) = lower(btrim(coalesce(r ->> 'penulis', '')))))
       order by dibuat_pada limit 1;
      if v_id is not null then
        if v_jumlah > 0 then perform public.perpus_eksemplar_tambah(v_id, v_jumlah, r); v_eks := v_eks + v_jumlah; end if;
        v_ada := v_ada + 1;
      else
        perform public.perpus_fisik_simpan(null, r || jsonb_build_object('jumlah_awal', v_jumlah));
        v_baru := v_baru + 1; v_eks := v_eks + v_jumlah;
      end if;
    exception when others then
      v_gagal := v_gagal || jsonb_build_object('baris', v_no, 'alasan', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('judul_baru', v_baru, 'judul_ada', v_ada, 'eksemplar', v_eks, 'gagal', v_gagal);
end $$;

revoke all on function public.perpus_fisik_impor(jsonb) from public, anon;
grant execute on function public.perpus_fisik_impor(jsonb) to authenticated;
