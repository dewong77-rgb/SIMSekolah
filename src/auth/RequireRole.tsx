import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import Halaman from '../components/Halaman'
import type { Peran } from '../lib/supabase'
import { useAuth } from './AuthContext'

export default function RequireRole({ peran, superAdmin = false, children }: { peran: Peran[]; superAdmin?: boolean; children: ReactNode }) {
  const { session, profil, superAdmin: adalahSuper, memuat, keluar } = useAuth()
  const lokasi = useLocation()

  if (memuat) {
    return (
      <Halaman judul="Memuat...">
        <p className="catatan">Memeriksa sesi masuk.</p>
      </Halaman>
    )
  }

  if (!session) {
    return <Navigate to="/masuk" replace state={{ dari: lokasi.pathname }} />
  }

  if (!profil) {
    return (
      <Halaman judul="Akun belum terdaftar" lead="Email Anda sudah terverifikasi, tetapi belum ditautkan ke peran di sekolah.">
        <div className="kartu">
          <p>Minta admin TU sekolah untuk mendaftarkan akun ini. Setelah itu muat ulang halaman.</p>
          <button className="tombol tombol-isi" onClick={keluar}>Keluar</button>
        </div>
      </Halaman>
    )
  }

  const wajibGanti = !!(session.user.app_metadata as Record<string, unknown> | undefined)?.wajib_ganti_sandi
  if (wajibGanti && lokasi.pathname !== '/portal/ganti-sandi') {
    return <Navigate to="/portal/ganti-sandi" replace />
  }

  if (!peran.includes(profil.peran) || (superAdmin && !adalahSuper)) {
    return (
      <Halaman judul="Tidak ada akses" lead="Peran akun Anda tidak dapat membuka halaman ini.">
        <Link to="/portal" className="tombol tombol-isi">Kembali ke portal</Link>
      </Halaman>
    )
  }

  return <>{children}</>
}
