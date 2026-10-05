import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { useIzinSarpras, type IzinSarpras } from '../../lib/sarpras'

const TAUTAN: { to: string; nama: string; perlu: IzinSarpras[] }[] = [
  { to: '/portal/sarpras/inventaris', nama: 'Inventaris', perlu: ['kelola', 'catat_lab', 'lihat'] },
  { to: '/portal/sarpras/usulan', nama: 'Usulan', perlu: ['kelola', 'catat_lab', 'verifikasi_program', 'lihat'] },
  { to: '/portal/sarpras/buku', nama: 'Pembukuan', perlu: ['kelola', 'lihat'] },
]

/** Membatasi halaman Sarpras pada pemegang izin. Basis data tetap memeriksa ulang di setiap permintaan. */
export default function GerbangSarpras({ perlu, judul, aktif, children }: {
  perlu: IzinSarpras[]; judul: string; aktif: string; children: (izin: string[]) => ReactNode
}) {
  const { izin, memuat, punya } = useIzinSarpras()
  if (memuat) return <Halaman judul={judul}><p className="catatan">Memeriksa hak akses...</p></Halaman>
  if (!punya(...perlu)) {
    return (
      <Halaman judul="Tidak ada akses" lead="Halaman ini untuk Waka Sarana dan Prasarana, kepala program keahlian, dan kepala bengkel atau laboratorium.">
        <Link to="/portal" className="tombol tombol-isi">Kembali ke portal</Link>
      </Halaman>
    )
  }
  return (
    <>
      <nav className="wadah" aria-label="Bagian sarana dan prasarana" style={{ display: 'flex', gap: 8, paddingTop: 12, flexWrap: 'wrap' }}>
        {TAUTAN.filter((t) => punya(...t.perlu)).map((t) => (
          <Link key={t.to} to={t.to} className={t.to === aktif ? 'tombol tombol-isi' : 'tombol'}>{t.nama}</Link>
        ))}
      </nav>
      {children(izin)}
    </>
  )
}
