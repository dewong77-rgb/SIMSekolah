import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { panggil } from '../lib/rpc'
import { DaftarKuis, labelJenisAsesmen, type JenisAsesmen, type PertemuanRingkas } from './LmsKuis'

type Kelas = { id: string; mapel: string; rombel: string; peran: 'pengelola' | 'siswa' }

const slug: Record<string, JenisAsesmen> = { kuis: 'kuis', uh: 'ulangan_harian', uts: 'ulangan_tengah', uas: 'ulangan_semester' }
const tab: [string, string][] = [['kuis', 'Kuis'], ['uh', 'Ulangan harian'], ['uts', 'UTS'], ['uas', 'UAS']]

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
  const { profil } = useAuth()
  const j = slug[jenis]
  const [kelas, setKelas] = useState<Kelas[] | null>(null)
  const [galat, setGalat] = useState('')
  const [mapel, setMapel] = useState('')
  useEffect(() => { panggil<Kelas[]>('lms_kelas_saya').then(setKelas).catch((e: Error) => setGalat(e.message)) }, [])
  if (!j) return <Navigate to="/portal/lms" replace />
  return (
    <Halaman judul={labelJenisAsesmen[j]} lead={profil?.peran === 'siswa' ? 'Dari semua kelas Anda. Pilih yang ingin dikerjakan.' : 'Semua kelas dalam satu halaman. Buat dan kelola di bawah kelas masing-masing.'}>
      <nav className="tab-bar" aria-label="Jenis penilaian">
        {tab.map(([k, nama]) => <Link key={k} to={`/portal/penilaian/${k}`} className={`tab-item${k === jenis ? ' aktif' : ''}`} aria-current={k === jenis ? 'page' : undefined}>{nama}</Link>)}
      </nav>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!kelas && !galat && <p className="catatan">Memuat...</p>}
      {kelas && kelas.length === 0 && <p className="catatan">Belum ada kelas.</p>}
      {kelas && [...new Set(kelas.map((k) => k.mapel))].length > 1 && (
        <div className="chip-bar" role="tablist" aria-label="Mata pelajaran">
          {['', ...new Set(kelas.map((k) => k.mapel))].map((m) => (
            <button key={m || 'semua'} type="button" role="tab" aria-selected={mapel === m} className={'chip' + (mapel === m ? ' aktif' : '')} onClick={() => setMapel(m)}>{m || 'Semua'}</button>
          ))}
        </div>
      )}
      {(kelas ?? []).filter((k) => !mapel || k.mapel === mapel).map((k) => <BagianKelas key={k.id} k={k} jenis={j} />)}
    </Halaman>
  )
}

