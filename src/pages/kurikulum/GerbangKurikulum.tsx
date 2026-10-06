import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { usePengaturanKurikulum, type Pengaturan } from '../../lib/kurikulum'

const TAUTAN = [
  { to: '/portal/kurikulum/struktur', nama: 'Struktur kurikulum' },
  { to: '/portal/kurikulum/beban', nama: 'Beban mengajar' },
  { to: '/portal/jam-pelajaran', nama: 'Jam pelajaran' },
  { to: '/portal/kalender', nama: 'Kalender sekolah' },
]

/** Pembungkus halaman Kurikulum: tautan antarbagian dan pemeriksaan akses baca. Basis data memeriksa ulang setiap permintaan. */
export default function GerbangKurikulum({ judul, aktif, children }: {
  judul: string; aktif: string; children: (p: Pengaturan, muatUlang: () => void) => ReactNode
}) {
  const { pengaturan, memuat, muatUlang } = usePengaturanKurikulum()
  if (memuat) return <Halaman judul={judul}><p className="catatan">Memeriksa hak akses...</p></Halaman>
  if (!pengaturan) {
    return (
      <Halaman judul="Tidak ada akses" lead="Halaman ini untuk guru dan staf sekolah.">
        <Link to="/portal" className="tombol tombol-isi">Kembali ke portal</Link>
      </Halaman>
    )
  }
  return (
    <>
      <nav className="wadah" aria-label="Bagian kurikulum" style={{ display: 'flex', gap: 8, paddingTop: 12, flexWrap: 'wrap' }}>
        {TAUTAN.map((t) => <Link key={t.to} to={t.to} className={t.to === aktif ? 'tombol tombol-isi' : 'tombol'}>{t.nama}</Link>)}
      </nav>
      {children(pengaturan, muatUlang)}
    </>
  )
}
