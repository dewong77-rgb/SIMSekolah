import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { useIzinKes } from '../../lib/kesiswaan'

/** Membatasi halaman Kesiswaan pada pemegang izin tertentu. Basis data tetap memeriksa ulang di setiap permintaan. */
export default function Gerbang({ perlu, judul, children }: { perlu: string[]; judul: string; children: (izin: string[]) => ReactNode }) {
  const { izin, memuat, punya } = useIzinKes()
  if (memuat) return <Halaman judul={judul}><p className="catatan">Memeriksa hak akses...</p></Halaman>
  if (!punya(...perlu)) {
    return (
      <Halaman judul="Tidak ada akses" lead="Halaman ini untuk Waka Kesiswaan, stafnya, guru piket, wali kelas, guru BK, dan pembina yang ditugaskan.">
        <Link to="/portal" className="tombol tombol-isi">Kembali ke portal</Link>
      </Halaman>
    )
  }
  return <>{children(izin)}</>
}
