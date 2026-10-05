import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil } from '../lib/rpc'
import { DaftarKuis, labelJenisAsesmen, type JenisAsesmen, type PertemuanRingkas } from './LmsKuis'

type Kelas = { id: string; mapel: string; rombel: string; peran: 'pengelola' | 'siswa' }

const slug: Record<string, JenisAsesmen> = { kuis: 'kuis', uh: 'ulangan_harian', uts: 'ulangan_tengah', uas: 'ulangan_semester' }

function BagianKelas({ k, jenis }: { k: Kelas; jenis: JenisAsesmen }) {
  const [pt, setPt] = useState<PertemuanRingkas[]>([])
  useEffect(() => {
    panggil<PertemuanRingkas[]>('lms_pertemuan_daftar', { p_kelas: k.id }).then((d) => setPt(d.map((p) => ({ id: p.id, nomor: p.nomor, judul: p.judul })))).catch(() => setPt([]))
  }, [k.id])
  return (
    <section className="jarak">
      <div className="judul-bagian"><h2>{k.rombel}</h2><small>{k.mapel}</small></div>
      <DaftarKuis kelasId={k.id} kelola={k.peran === 'pengelola'} pertemuan={pt} jenisTetap={jenis} />
    </section>
  )
}

/** Satu jenis penilaian (kuis, ulangan harian, UTS, UAS) untuk semua kelas pengguna. */
export default function Penilaian() {
  const { jenis = '' } = useParams()
  const j = slug[jenis]
  const [kelas, setKelas] = useState<Kelas[] | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => { panggil<Kelas[]>('lms_kelas_saya').then(setKelas).catch((e: Error) => setGalat(e.message)) }, [])
  if (!j) return <Navigate to="/portal/lms" replace />
  return (
    <Halaman judul={labelJenisAsesmen[j]} lead="Semua kelas dalam satu halaman. Pilih kelas untuk membuat atau mengerjakan.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!kelas && !galat && <p className="catatan">Memuat...</p>}
      {kelas && kelas.length === 0 && <p className="catatan">Belum ada kelas.</p>}
      {(kelas ?? []).map((k) => <BagianKelas key={k.id} k={k} jenis={j} />)}
    </Halaman>
  )
}

