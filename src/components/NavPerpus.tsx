import { Link } from 'react-router-dom'

/** Pindah antara perpustakaan digital dan fisik. */
export default function NavPerpus({ aktif }: { aktif: 'digital' | 'fisik' }) {
  return (
    <nav className="aksi" style={{ marginTop: 0 }} aria-label="Jenis perpustakaan">
      <Link to="/portal/perpustakaan" className={aktif === 'digital' ? 'tombol tombol-isi' : 'tombol'} aria-current={aktif === 'digital' ? 'page' : undefined}>Perpustakaan digital</Link>
      <Link to="/portal/perpustakaan/fisik" className={aktif === 'fisik' ? 'tombol tombol-isi' : 'tombol'} aria-current={aktif === 'fisik' ? 'page' : undefined}>Perpustakaan fisik</Link>
    </nav>
  )
}
