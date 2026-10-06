import type { ButtonHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import Ikon from './Ikon'

type Varian = 'biasa' | 'isi' | 'bahaya'

type Dasar = {
  /** Nama ikon di Ikon.tsx. */
  ikon: string
  /** Label singkat: jadi tooltip dan label baca-layar. Wajib. */
  label: string
  varian?: Varian
  /** Tampilkan teks di samping ikon (untuk aksi utama). */
  teks?: boolean
  ukuran?: number
}

const kelas = (v: Varian, teks?: boolean) =>
  `tb-ikon${v === 'isi' ? ' tb-ikon-isi' : v === 'bahaya' ? ' tb-ikon-bahaya' : ''}${teks ? ' tb-ikon-teks' : ''}`

/** Tombol aksi berbentuk ikon. Tooltip dan aria-label dari `label`. */
export default function TombolIkon({
  ikon, label, varian = 'biasa', teks, ukuran = 18, type = 'button', ...sisa
}: Dasar & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={kelas(varian, teks)} title={label} aria-label={label} {...sisa}>
      <Ikon nama={ikon} ukuran={ukuran} />
      {teks && <span>{label}</span>}
    </button>
  )
}

/** Versi tautan (Link) untuk aksi yang berpindah halaman. */
export function TautanIkon({
  ikon, label, to, varian = 'biasa', teks, ukuran = 18,
}: Dasar & { to: string }) {
  return (
    <Link to={to} className={kelas(varian, teks)} title={label} aria-label={label}>
      <Ikon nama={ikon} ukuran={ukuran} />
      {teks && <span>{label}</span>}
    </Link>
  )
}
