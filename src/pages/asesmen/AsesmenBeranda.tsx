import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { UjianDaftar } from './AsesmenAdmin'
import { JadwalSiswa } from './AsesmenSiswa'

export default function AsesmenBeranda() {
  const { profil, superAdmin } = useAuth()
  if (!profil) return null
  if (profil.peran === 'siswa') return <JadwalSiswa />
  if (profil.peran === 'admin_ujian' || superAdmin) return <UjianDaftar />
  return (
    <>
      <h1>Asesmen Digital</h1>
      <p className="lead">Ujian tengah dan akhir semester lintas kelas, dengan token, ruang, dan pengawas.</p>
      <div className="as-kisi">
        <Link to="/asesmen/bank" className="kartu tautan"><h3 style={{ marginTop: 0 }}>Bank soal</h3><p className="as-kecil" style={{ margin: 0 }}>Tulis atau impor soal mata pelajaran Anda. Panitia merakitnya menjadi paket ujian.</p></Link>
        <Link to="/asesmen/pengawas" className="kartu tautan"><h3 style={{ marginTop: 0 }}>Pengawasan</h3><p className="as-kecil" style={{ margin: 0 }}>Buka token, pantau siswa di ruang, buka kunci layar, dan akhiri ujian bila perlu.</p></Link>
      </div>
    </>
  )
}
