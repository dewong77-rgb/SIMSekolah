import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { useIzinSpmi } from '../../lib/spmi'

/** Membatasi halaman SPMI pada pemegang izin. Basis data tetap memeriksa ulang di setiap permintaan. */
export default function GerbangSpmi({ judul, children }: { judul: string; children: (izin: string[]) => ReactNode }) {
  const { izin, memuat, punya } = useIzinSpmi()
  if (memuat) return <Halaman judul={judul}><p className="catatan">Memeriksa hak akses...</p></Halaman>
  if (!punya('kelola', 'catat', 'lihat')) {
    return (
      <Halaman judul="Tidak ada akses" lead="Halaman ini untuk Kepala Sekolah serta Ketua dan anggota Satuan Penjamin Mutu Internal (SPMI).">
        <Link to="/portal" className="tombol tombol-isi">Kembali ke portal</Link>
      </Halaman>
    )
  }
  return <>{children(izin)}</>
}
