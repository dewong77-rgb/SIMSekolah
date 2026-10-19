// Edge Function "drive": jembatan antara SIMS dan Google Drive milik sekolah.
// Browser tidak pernah memegang kunci Drive. Semua izin diperiksa lewat fungsi basis data
// (berkas_siapkan, berkas_akses, berkas_kelola) memakai JWT pengguna.
//
// Secret yang dibutuhkan: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY disediakan Supabase otomatis.
//
// Struktur folder: {Nama Sekolah}/{Guru|Tenaga Kependidikan|Siswa|Sekolah}/... Jalurnya disusun
// fungsi basis data private.berkas_jalur, Edge Function hanya membuat folder sesuai jalur itu.
//
// Aksi (POST JSON, field "aksi"):
//   status   super admin: cek sambungan Drive dan folder induk
//   siapkan  super admin: buat folder induk SIMS di Drive (sekali, otomatis juga saat unggah pertama)
//   rapikan  super admin: ganti nama folder induk jadi nama sekolah, pindahkan berkas lama ke struktur
//            baru per kelompok (maks 20 berkas) -> {dipindah, gagal, sisa}; ulangi sampai sisa 0
//   mulai    {kategori, nama, mime, ukuran, rujukan?} -> {berkas_id, sesi_url}; browser mengunggah ke sesi_url
//   selesai  {berkas_id, drive_file_id} -> memverifikasi ke Drive lalu menandai tersimpan
//   unduh    {berkas_id} -> mengalirkan isi berkas bila pengguna berhak
//   hapus    {berkas_id} -> memindahkan ke tempat sampah Drive, menandai dihapus

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const G_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const G_REFRESH = Deno.env.get("GOOGLE_REFRESH_TOKEN");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
class Galat extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

const FOLDER = "application/vnd.google-apps.folder";
const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ---------- token Google ----------
let tokenCache: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (!G_ID || !G_SECRET || !G_REFRESH) throw new Galat(503, "Drive belum disambungkan. Isi secret Google di Supabase.");
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: G_ID, client_secret: G_SECRET, refresh_token: G_REFRESH, grant_type: "refresh_token",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    console.error("token google gagal", r.status, d.error, d.error_description);
    throw new Galat(502, d.error === "invalid_grant"
      ? "Izin Google kedaluwarsa atau dicabut. Buat refresh token baru."
      : "Gagal meminta token Google.");
  }
  tokenCache = { token: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}
async function drive(path: string, init: RequestInit = {}, base = "https://www.googleapis.com/drive/v3") {
  const t = await accessToken();
  return fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${t}`, ...(init.headers ?? {}) } });
}

// ---------- folder ----------
async function buatFolder(nama: string, parent?: string): Promise<string> {
  const r = await drive("/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nama, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
  });
  const d = await r.json();
  if (!r.ok) { console.error("buat folder gagal", r.status, d); throw new Galat(502, "Gagal membuat folder di Drive."); }
  return d.id;
}
async function namaSekolah(): Promise<string> {
  const { data } = await service.from("sekolah").select("nama").limit(1).maybeSingle();
  return (data?.nama ?? "").replace(/[\u0000-\u001f\\/]+/g, " ").trim() || "SIMS Sekolah";
}
async function folderInduk(): Promise<string> {
  const { data } = await service.from("drive_pengaturan").select("nilai").eq("kunci", "root_folder_id").maybeSingle();
  if (data?.nilai) return data.nilai;
  const baru = await buatFolder(await namaSekolah());
  await service.from("drive_pengaturan").upsert({ kunci: "root_folder_id", nilai: baru }, { onConflict: "kunci", ignoreDuplicates: true });
  const { data: akhir } = await service.from("drive_pengaturan").select("nilai").eq("kunci", "root_folder_id").single();
  if (akhir!.nilai !== baru) {
    await drive(`/files/${baru}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
  }
  return akhir!.nilai;
}
async function folderJalur(jalur: string): Promise<string> {
  let parent = await folderInduk();
  const segmen = jalur.split("/").map((s) => s.trim()).filter(Boolean);
  let kunci = "";
  for (const s of segmen) {
    kunci = kunci ? `${kunci}/${s}` : s;
    const { data } = await service.from("drive_folder").select("drive_id").eq("jalur", kunci).maybeSingle();
    if (data?.drive_id) { parent = data.drive_id; continue; }
    const baru = await buatFolder(s, parent);
    await service.from("drive_folder").upsert({ jalur: kunci, drive_id: baru }, { onConflict: "jalur", ignoreDuplicates: true });
    const { data: akhir } = await service.from("drive_folder").select("drive_id").eq("jalur", kunci).single();
    if (akhir!.drive_id !== baru) {
      await drive(`/files/${baru}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    }
    parent = akhir!.drive_id;
  }
  return parent;
}
async function lupakanJalur(jalur: string) {
  const segmen = jalur.split("/").filter(Boolean);
  const kunci: string[] = [];
  let k = "";
  for (const s of segmen) { k = k ? `${k}/${s}` : s; kunci.push(k); }
  if (kunci.length) await service.from("drive_folder").delete().in("jalur", kunci);
}

// Memindahkan satu berkas ke folder jalur baru. Mengembalikan true bila berhasil.
async function pindahBerkas(driveFileId: string, jalurBaru: string): Promise<boolean> {
  const tujuan = await folderJalur(jalurBaru);
  const g = await drive(`/files/${driveFileId}?fields=parents,trashed`);
  if (g.status === 404) return false;
  const info = await g.json().catch(() => ({}));
  if (!g.ok) return false;
  const lama: string[] = info.parents ?? [];
  if (lama.length === 1 && lama[0] === tujuan) return true;
  const q = new URLSearchParams({ addParents: tujuan, fields: "id" });
  if (lama.length) q.set("removeParents", lama.join(","));
  const r = await drive(`/files/${driveFileId}?${q}`, { method: "PATCH" });
  if (!r.ok) console.error("pindah berkas gagal", r.status, await r.text().catch(() => ""));
  return r.ok;
}

// ---------- utilitas ----------
const bersih = (s: string) => s.replace(/[\u0000-\u001f\\/]+/g, "_").slice(0, 150);
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Gunakan POST." }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const pengguna = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const { data: u } = await pengguna.auth.getUser();
    if (!u?.user) throw new Galat(401, "Harus masuk dulu.");
    const uid = u.user.id;

    const b = await req.json().catch(() => ({}));
    const aksi = String(b.aksi ?? "");

    const adalahSuper = async () => {
      const { data } = await service.from("super_admin").select("user_id").eq("user_id", uid).maybeSingle();
      return !!data;
    };

    if (aksi === "status" || aksi === "siapkan") {
      if (!(await adalahSuper())) throw new Galat(403, "Hanya super admin.");
      if (aksi === "status" && (!G_ID || !G_SECRET || !G_REFRESH)) {
        return json({ terhubung: false, alasan: "Secret Google belum diisi." });
      }
      await accessToken();
      const root = await folderInduk();
      const r = await drive(`/about?fields=storageQuota,user(emailAddress)`);
      const about = await r.json().catch(() => ({}));
      const q = about.storageQuota ?? {};
      return json({
        terhubung: true, folder_induk: root, akun: about.user?.emailAddress ?? null,
        kuota_byte: q.limit ? Number(q.limit) : null, terpakai_byte: q.usage ? Number(q.usage) : null,
      });
    }

    if (aksi === "rapikan") {
      if (!(await adalahSuper())) throw new Galat(403, "Hanya super admin.");
      const root = await folderInduk();
      const nama = await namaSekolah();
      const rn = await drive(`/files/${root}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nama }),
      });
      if (!rn.ok) console.error("ganti nama folder induk gagal", rn.status);
      const { data: daftar, error } = await service.rpc("berkas_rapikan_daftar", { p_batas: 20 });
      if (error) throw new Galat(500, "Gagal membaca daftar berkas.");
      let dipindah = 0, gagal = 0;
      for (const d of daftar ?? []) {
        let ok = false;
        try { ok = await pindahBerkas(d.drive_file_id, d.jalur_baru); } catch (e) { console.error("rapikan", d.id, e); }
        if (ok) {
          await service.from("berkas").update({ jalur: d.jalur_baru }).eq("id", d.id);
          dipindah++;
        } else gagal++;
      }
      const sisa = Math.max(0, Number(daftar?.[0]?.sisa ?? 0) - dipindah);
      return json({ folder_induk: nama, dipindah, gagal, sisa });
    }

    if (aksi === "mulai") {
      const { data: siap, error } = await pengguna.rpc("berkas_siapkan", {
        p_kategori: b.kategori, p_nama: b.nama, p_mime: b.mime, p_ukuran: b.ukuran, p_rujukan: b.rujukan ?? null,
      });
      if (error) throw new Galat(error.code === "42501" ? 403 : 400, error.message);
      const berkasId: string = siap.id;
      const mulaiSesi = async () => {
        const folder = await folderJalur(siap.jalur);
        const r = await drive(
          "/files?uploadType=resumable&fields=id",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=UTF-8",
              "X-Upload-Content-Type": siap.mime,
              "X-Upload-Content-Length": String(siap.ukuran),
              ...(req.headers.get("origin") ? { Origin: req.headers.get("origin")! } : {}),
            },
            body: JSON.stringify({
              name: `${berkasId.slice(0, 8)}_${bersih(siap.nama)}`,
              parents: [folder], mimeType: siap.mime, appProperties: { berkas_id: berkasId },
            }),
          },
          "https://www.googleapis.com/upload/drive/v3",
        );
        return r;
      };
      let r = await mulaiSesi();
      if (r.status === 404) { await lupakanJalur(siap.jalur); r = await mulaiSesi(); }
      const sesi = r.headers.get("location");
      if (!r.ok || !sesi) {
        console.error("sesi unggah gagal", r.status, await r.text().catch(() => ""));
        await service.from("berkas").update({ status: "gagal" }).eq("id", berkasId);
        throw new Galat(502, "Drive menolak membuat sesi unggah.");
      }
      return json({ berkas_id: berkasId, sesi_url: sesi });
    }

    if (aksi === "selesai") {
      if (!uuidRe.test(b.berkas_id ?? "") || typeof b.drive_file_id !== "string" || !/^[\w-]{10,100}$/.test(b.drive_file_id)) {
        throw new Galat(400, "Data tidak valid.");
      }
      const { data: row } = await service.from("berkas").select("*").eq("id", b.berkas_id).eq("pemilik_user_id", uid).maybeSingle();
      if (!row) throw new Galat(404, "Berkas tidak ditemukan.");
      if (row.status === "tersimpan") return json({ ok: true, id: row.id });
      if (row.status !== "menunggu_unggah") throw new Galat(409, "Berkas sudah tidak bisa diselesaikan.");
      const r = await drive(`/files/${b.drive_file_id}?fields=id,size,trashed,appProperties`);
      const f = await r.json().catch(() => ({}));
      const cocok = r.ok && !f.trashed && f.appProperties?.berkas_id === row.id && Number(f.size) === Number(row.ukuran);
      if (!cocok) {
        console.error("verifikasi berkas gagal", r.status, f);
        await service.from("berkas").update({ status: "gagal" }).eq("id", row.id);
        if (r.ok && f.id) {
          await drive(`/files/${f.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
        }
        throw new Galat(422, "Berkas di Drive tidak cocok dengan yang diajukan.");
      }
      await service.from("berkas").update({
        drive_file_id: f.id, status: "tersimpan", selesai_pada: new Date().toISOString(),
      }).eq("id", row.id);
      return json({ ok: true, id: row.id });
    }

    if (aksi === "unduh") {
      if (!uuidRe.test(b.berkas_id ?? "")) throw new Galat(400, "Data tidak valid.");
      const { data: a } = await pengguna.rpc("berkas_akses", { p_id: b.berkas_id });
      if (!a?.drive_file_id) throw new Galat(403, "Tidak berhak atau berkas tidak ada.");
      const r = await drive(`/files/${a.drive_file_id}?alt=media`);
      if (!r.ok || !r.body) { console.error("unduh gagal", r.status); throw new Galat(502, "Gagal mengambil berkas dari Drive."); }
      const tampil = a.mime === "application/pdf" || String(a.mime).startsWith("image/");
      return new Response(r.body, {
        headers: {
          ...CORS,
          "Content-Type": a.mime,
          "Content-Disposition": `${tampil && b.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.nama)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (aksi === "hapus") {
      if (!uuidRe.test(b.berkas_id ?? "")) throw new Galat(400, "Data tidak valid.");
      const { data: k } = await pengguna.rpc("berkas_kelola", { p_id: b.berkas_id });
      if (!k) throw new Galat(403, "Tidak berhak atau berkas tidak ada.");
      if (k.drive_file_id) {
        const r = await drive(`/files/${k.drive_file_id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }),
        });
        if (!r.ok && r.status !== 404) throw new Galat(502, "Gagal memindahkan berkas di Drive.");
      }
      await service.from("berkas").update({ status: "dihapus", dihapus_pada: new Date().toISOString() }).eq("id", k.id);
      return json({ ok: true });
    }

    throw new Galat(400, "Aksi tidak dikenal.");
  } catch (e) {
    if (e instanceof Galat) return json({ error: e.message }, e.status);
    console.error("drive error", e);
    return json({ error: "Terjadi kesalahan di server." }, 500);
  }
});
