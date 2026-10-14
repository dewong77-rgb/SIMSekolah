import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { panggil } from '../lib/rpc'
import { DaftarKuis, labelJenisAsesmen, type JenisAsesmen, type PertemuanRingkas } from './LmsKuis'

type Kelas = { id: string; mapel: string; rombel: string; peran: 'pengelola' | 'siswa' }


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

/** Kuis dari semua kelas pengguna. Ulangan harian, UTS, dan UAS tidak lagi di menu: UTS dan UAS lewat Asesmen digital (CBT). */
export default function Penilaian() {
  const { jenis = '' } = useParams()
  const { profil } = useAuth()
  const j: JenisAsesmen = 'kuis'
  const [kelas, setKelas] = useState<Kelas[] | null>(null)
  const [galat, setGalat] = useState('')
  const [mapel, setMapel] = useState('')
  useEffect(() => { panggil<Kelas[]>('lms_kelas_saya').then(setKelas).catch((e: Error) => setGalat(e.message)) }, [])
  if (jenis !== 'kuis') return <Navigate to="/portal/penilaian/kuis" replace />
  return (
    <Halaman judul={labelJenisAsesmen[j]} lead={profil?.peran === 'siswa' ? 'Dari semua kelas Anda. Pilih yang ingin dikerjakan.' : 'Semua kelas dalam satu halaman. Buat dan kelola di bawah kelas masing-masing.'}>
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

