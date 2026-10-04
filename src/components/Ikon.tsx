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
  keluar: 'M10 4H5v16h5M16 8l4 4-4 4M20 12H9',
  kunci: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  tutup: 'M6 6l12 12M18 6L6 18',
  panah: 'M9 6l6 6-6 6',
  luar: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  lonceng: 'M6 17V11a6 6 0 0 1 12 0v6l2 2H4l2-2zM10 21h4',
  chat: 'M4 5h16v11H9l-5 4V5zM8 9h8M8 12.5h5',
  uang: 'M3 7h18v10H3zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
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
