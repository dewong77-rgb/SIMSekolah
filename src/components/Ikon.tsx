// Ikon garis sederhana (24x24). Tanpa pustaka luar agar berkas tetap ringan.
const jalur: Record<string, string> = {
  beranda: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  buku: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM19 19v2H6',
  grafik: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pengguna: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  kotak: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h4l1 2h6l1-2h4',
  kelompok: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14a7 7 0 0 1 4 6',
  sekolah: 'M2 9l10-5 10 5-10 5-10-5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5',
  unggah: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  riwayat: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2',
  surat: 'M3 6h18v12H3zM3 7l9 7 9-7',
  dokumen: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  tautan: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  perisai: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4',
  tas: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  kalender: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  centang: 'M5 12l5 5L20 7',
  pena: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  sampah: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  keluar: 'M10 4H5v16h5M16 8l4 4-4 4M20 12H9',
  kunci: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  tutup: 'M6 6l12 12M18 6L6 18',
  panah: 'M9 6l6 6-6 6',
  luar: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  lonceng: 'M6 17V11a6 6 0 0 1 12 0v6l2 2H4l2-2zM10 21h4',
  chat: 'M4 5h16v11H9l-5 4V5zM8 9h8M8 12.5h5',
  uang: 'M3 7h18v10H3zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  unduh: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  salin: 'M9 9h11v11H9zM5 15H4V4h11v1',
  buka: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
  mata: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  simpan: 'M5 4h12l2 2v14H5zM8 4v5h7V4M8 20v-6h8v6',
  tambah: 'M12 5v14M5 12h14',
  jam: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  tolak: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6',
  setuju: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  kembali: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  kirim: 'M4 12l16-8-6 16-3-7-7-1z',
  suka: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
  gambar: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01',
  cetak: 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  muat: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  cari: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
}

export type NamaIkon = keyof typeof jalur

export default function Ikon({ nama, ukuran = 20 }: { nama: string; ukuran?: number }) {
  return (
    <svg
      width={ukuran}
      height={ukuran}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="ikon"
    >
      <path d={jalur[nama] ?? jalur.dokumen} />
    </svg>
  )
}
