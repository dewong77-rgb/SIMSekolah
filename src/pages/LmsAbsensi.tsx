import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil } from '../lib/rpc'
import { unduhCsv } from './lmsUtil'

// Absensi guru: berapa siswa yang diajar, dan bagaimana kehadiran mereka per kelas ajar dan per pertemuan.

type Pertemuan = { id: string; nomor: number; judul: string; tanggal: string; hadir: number; izin: number; sakit: number; alpa: number }
type KelasAbsen = {
  kelas_id: string; mapel: string; rombel: string; jumlah_siswa: number; sesi: number
  hadir: number; izin: number; sakit: number; alpa: number; siswa_alpa: number; pertemuan: Pertemuan[]
}
type Data = { total_kelas: number; total_rombel: number; total_siswa: number; kelas: KelasAbsen[] }

const persen = (k: { hadir: number; izin: number; sakit: number; alpa: number }) => {
  const t = k.hadir + k.izin + k.sakit + k.alpa
  return t > 0 ? Math.round((k.hadir / t) * 100) : null
}

export default function AbsensiGuru() {
  const [data, setData] = useState<Data | null>(null)
  const [galat, setGalat] = useState('')
  const [buka, setBuka] = useState<string | null>(null)
  useEffect(() => { panggil<Data>('lms_absensi_guru').then(setData).catch((e: Error) => setGalat(e.message)) }, [])

  function unduh() {
    if (!data) return
    unduhCsv('rekap-absensi-guru', [
      ['Mata pelajaran', 'Rombel', 'Jumlah siswa', 'Pertemuan dengan absen', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persen hadir', 'Siswa alpa 3 kali atau lebih'],
      ...data.kelas.map((k) => [k.mapel, k.rombel, k.jumlah_siswa, k.sesi, k.hadir, k.izin, k.sakit, k.alpa, persen(k), k.siswa_alpa]),
    ])
  }

  return (
    <Halaman judul="Absensi" lead="Jumlah siswa yang Anda ajar dan rekap kehadiran per kelas ajar dan per pertemuan.">
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
            <div className="kartu jarak"><p>Belum ada kelas ajar.</p><p className="catatan">Buat kelas ajar di <Link to="/portal/lms">Ruang belajar (LMS)</Link>, lalu rekap muncul di sini.</p></div>
          )}
          {data.kelas.length > 0 && (
            <>
              <div className="aksi jarak"><button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={unduh}>Unduh CSV</button></div>
              <div className="tabel-bungkus jarak"><table>
                <thead><tr><th>Mata pelajaran</th><th>Rombel</th><th>Siswa</th><th>Pertemuan</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alpa</th><th>% hadir</th><th>Alpa 3 kali atau lebih</th><th></th></tr></thead>
                <tbody>
                  {data.kelas.map((k) => (
                    <tr key={k.kelas_id}>
                      <td><Link to={`/portal/lms/${k.kelas_id}`}>{k.mapel}</Link></td><td>{k.rombel}</td><td>{k.jumlah_siswa}</td><td>{k.sesi}</td>
                      <td>{k.hadir}</td><td>{k.izin}</td><td>{k.sakit}</td><td>{k.alpa}</td>
                      <td>{persen(k) === null ? '-' : `${persen(k)}%`}</td><td>{k.siswa_alpa} siswa</td>
                      <td><button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => setBuka(buka === k.kelas_id ? null : k.kelas_id)}>{buka === k.kelas_id ? 'Tutup' : 'Per pertemuan'}</button></td>
                    </tr>
                  ))}
                  <tr><td colSpan={2}><strong>Total</strong></td><td><strong>{data.total_siswa}</strong></td><td colSpan={8}><small>Jumlah siswa dihitung tanpa ganda bila satu siswa diajar di lebih dari satu kelas ajar.</small></td></tr>
                </tbody>
              </table></div>
              {data.kelas.filter((k) => k.kelas_id === buka).map((k) => (
                <div key={k.kelas_id} className="kartu jarak">
                  <h3 style={{ marginTop: 0 }}>{k.mapel} <small>{k.rombel}, {k.jumlah_siswa} siswa</small></h3>
                  {k.pertemuan.length === 0
                    ? <p className="catatan">Belum ada pertemuan dengan absen dibuka.</p>
                    : <div className="tabel-bungkus"><table>
                      <thead><tr><th>Pertemuan</th><th>Tanggal</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alpa</th><th>Belum dicatat</th></tr></thead>
                      <tbody>{k.pertemuan.map((p) => (
                        <tr key={p.id}><td><Link to={`/portal/lms/${k.kelas_id}/pertemuan/${p.id}`}>{p.nomor}. {p.judul}</Link></td><td>{p.tanggal}</td>
                          <td>{p.hadir}</td><td>{p.izin}</td><td>{p.sakit}</td><td>{p.alpa}</td>
                          <td>{Math.max(0, k.jumlah_siswa - p.hadir - p.izin - p.sakit - p.alpa)}</td></tr>
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
