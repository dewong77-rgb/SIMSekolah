import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil } from '../lib/rpc'
import { unduhCsv } from './lmsUtil'

// Rekap guru: berapa siswa yang diajar, dan berapa yang sudah mengerjakan pertemuan LMS per kelas ajar dan per pertemuan.

type Pertemuan = { id: string; nomor: number; judul: string; tanggal: string; dikerjakan: number; belum: number }
type KelasAbsen = {
  kelas_id: string; mapel: string; rombel: string; jumlah_siswa: number; sesi: number
  dikerjakan: number; belum: number; siswa_belum: number; pertemuan: Pertemuan[]
}
type Data = { total_kelas: number; total_rombel: number; total_siswa: number; kelas: KelasAbsen[] }

const persen = (k: { dikerjakan: number; belum: number }) => {
  const t = k.dikerjakan + k.belum
  return t > 0 ? Math.round((k.dikerjakan / t) * 100) : null
}

export default function AbsensiGuru() {
  const [data, setData] = useState<Data | null>(null)
  const [galat, setGalat] = useState('')
  const [buka, setBuka] = useState<string | null>(null)
  useEffect(() => { panggil<Data>('lms_absensi_guru').then(setData).catch((e: Error) => setGalat(e.message)) }, [])

  function unduh() {
    if (!data) return
    unduhCsv('rekap-pengerjaan-lms', [
      ['Mata pelajaran', 'Rombel', 'Jumlah siswa', 'Pertemuan terbit', 'Dikerjakan', 'Belum dikerjakan', 'Persen dikerjakan', 'Siswa belum mengerjakan 3 pertemuan atau lebih'],
      ...data.kelas.map((k) => [k.mapel, k.rombel, k.jumlah_siswa, k.sesi, k.dikerjakan, k.belum, persen(k), k.siswa_belum]),
    ])
  }

  return (
    <Halaman judul="Rekap pengerjaan LMS" lead="Jumlah siswa yang Anda ajar dan berapa yang sudah mengerjakan pertemuan LMS, per kelas ajar dan per pertemuan.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!data && !galat && <p className="catatan">Memuat...</p>}
      {data && (
        <>
          <div className="grid grid-3">
            <div className="kartu"><small>Siswa yang diajar</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{data.total_siswa}</p><small>Siswa aktif, tanpa hitungan ganda</small></div>
            <div className="kartu"><small>Rombel</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{data.total_rombel}</p><small>Rombel yang diajar</small></div>
            <div className="kartu"><small>Kelas ajar</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{data.total_kelas}</p><small>Satu mata pelajaran di satu rombel</small></div>
          </div>
          {data.kelas.length === 0 && (
            <div className="kartu jarak"><p>Belum ada kelas ajar.</p><p className="catatan">Buat kelas ajar di <Link to="/portal/lms">Kelas saya (LMS)</Link>, lalu rekap muncul di sini.</p></div>
          )}
          {data.kelas.length > 0 && (
            <>
              <div className="aksi jarak"><button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={unduh}>Unduh CSV</button></div>
              <div className="tabel-bungkus jarak"><table>
                <thead><tr><th>Mata pelajaran</th><th>Rombel</th><th>Siswa</th><th>Pertemuan</th><th>Dikerjakan</th><th>Belum</th><th>% dikerjakan</th><th>Belum 3 pertemuan atau lebih</th><th></th></tr></thead>
                <tbody>
                  {data.kelas.map((k) => (
                    <tr key={k.kelas_id}>
                      <td><Link to={`/portal/lms/${k.kelas_id}`}>{k.mapel}</Link></td><td>{k.rombel}</td><td>{k.jumlah_siswa}</td><td>{k.sesi}</td>
                      <td>{k.dikerjakan}</td><td>{k.belum}</td>
                      <td>{persen(k) === null ? '-' : `${persen(k)}%`}</td><td>{k.siswa_belum} siswa</td>
                      <td><button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => setBuka(buka === k.kelas_id ? null : k.kelas_id)}>{buka === k.kelas_id ? 'Tutup' : 'Per pertemuan'}</button></td>
                    </tr>
                  ))}
                  <tr><td colSpan={2}><strong>Total</strong></td><td><strong>{data.total_siswa}</strong></td><td colSpan={6}><small>Jumlah siswa dihitung tanpa ganda bila satu siswa diajar di lebih dari satu kelas ajar.</small></td></tr>
                </tbody>
              </table></div>
              {data.kelas.filter((k) => k.kelas_id === buka).map((k) => (
                <div key={k.kelas_id} className="kartu jarak">
                  <h3 style={{ marginTop: 0 }}>{k.mapel} <small>{k.rombel}, {k.jumlah_siswa} siswa</small></h3>
                  {k.pertemuan.length === 0
                    ? <p className="catatan">Belum ada pertemuan terbit.</p>
                    : <div className="tabel-bungkus"><table>
                      <thead><tr><th>Pertemuan</th><th>Tanggal</th><th>Dikerjakan</th><th>Belum dikerjakan</th></tr></thead>
                      <tbody>{k.pertemuan.map((p) => (
                        <tr key={p.id}><td><Link to={`/portal/lms/${k.kelas_id}/pertemuan/${p.id}`}>{p.nomor}. {p.judul}</Link></td><td>{p.tanggal}</td>
                          <td>{p.dikerjakan}</td><td>{p.belum}</td></tr>
                      ))}</tbody>
                    </table></div>}
                </div>
              ))}
            </>
          )}
        </>
      )}
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
