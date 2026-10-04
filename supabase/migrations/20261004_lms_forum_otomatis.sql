-- Topik diskusi pembuka dibuat otomatis begitu pertemuan punya bahan bacaan dan lembar kerja (tanpa menunggu terbit).
create or replace function private.lms_forum_pastikan(p_pertemuan uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.pertemuan%rowtype;
begin
  if auth.uid() is null then return; end if;
  select * into t from public.pertemuan where id = p_pertemuan;
  if not found then return; end if;
  if not coalesce((private.lms_kelengkapan(p_pertemuan)->>'lengkap')::boolean, false) then return; end if;
  if exists (select 1 from public.forum_topik f where f.pertemuan_id = p_pertemuan and not f.dihapus and f.penulis_peran = 'guru') then return; end if;
  insert into public.forum_topik (pertemuan_id, kelas_ajar_id, penulis_user, penulis_nama, penulis_peran, judul, isi)
  values (t.id, t.kelas_ajar_id, auth.uid(), private.lms_nama_saya(), 'guru', 'Diskusi: ' || left(t.judul, 150),
          'Punya pertanyaan atau komentar tentang bahan bacaan dan lembar kerja pertemuan ini? Tulis di sini, dan balas juga teman yang bertanya.');
end $$;

create or replace function private.lms_forum_dari_materi()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.pertemuan_id is not null and new.untuk = 'siswa' then perform private.lms_forum_pastikan(new.pertemuan_id); end if;
  return new;
end $$;
create or replace trigger trg_materi_forum after insert or update on public.materi
  for each row execute function private.lms_forum_dari_materi();
