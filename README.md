# SIMS SMKN 1 Gunung Sindur: situs publik

Tahap prototipe. Semua halaman memakai data contoh di `src/data/contoh.ts`. Belum ada sambungan ke Supabase.

## Menjalankan

    npm install
    npm run dev       # http://localhost:5173
    npm run build     # uji build produksi

## Struktur

- `src/data/menu.ts`: susunan menu. Ubah di sini, header ikut berubah.
- `src/data/contoh.ts`: data contoh (profil, jurusan, berita, kalender, mitra, koleksi).
- `src/pages/`: Beranda dan halaman lain.
- `src/lib/alumni.ts`: stub pencarian alumni. Ganti isinya dengan `supabase.rpc('cek_data_alumni', ...)`.
- `src/styles.css`: dua warna utama ada di bagian `:root`.
- `vercel.json`: mengarahkan semua alamat ke `index.html` agar routing berjalan.

## Memasang

1. Dorong folder ini ke repo GitHub.
2. Di Vercel: Add New Project, pilih repo. Pengaturan Vite terdeteksi otomatis.
3. Setelah alamat Vercel ada, isi Site URL dan Redirect URLs di Supabase (Authentication, URL Configuration).

## Tahap berikutnya

1. Klien Supabase dengan kunci publik, login `signInWithOtp`, penjaga rute per peran.
2. Halaman unggah Dapodik (port `dapodik_import.py` ke TypeScript).
3. Halaman alumni tersambung ke RPC.
4. LMS (dirancang di percakapan terpisah).
