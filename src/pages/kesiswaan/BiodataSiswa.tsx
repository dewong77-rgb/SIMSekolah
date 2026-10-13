// Biodata siswa untuk Waka Kesiswaan dan TU Kesiswaan. Daftar dan pencarian di sini; formulir lengkap memakai halaman profil Dapodik.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import Pager, { efektif } from '../../components/Pager'
import { panggil, tgl } from '../../lib/rpc'
import { useAksesKes } from '../../lib/kesiswaan'

type Baris = { id: string; nama: string; nisn: string | null; nipd: string | null; jk: string | null; tempat_lahir: string | null; tanggal_lahir: string | null; status_peserta_didik: string; rombel: string | null }
type Rombel = { id: string; nama: string; jumlah: number }

export default function BiodataSiswa() {
  const { punya, memuat } = useAksesKes()
  const [rombels, setRombels] = useState<Rombel[]>([])
  const [rombel, setRombel] = useState('')
  const [status, setStatus] = useState('aktif')
  const [cari, setCari] = useState('')
  const [q, setQ] = useState('')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(20)
  const [data, setData] = useState<{ total: number; baris: Baris[] } | null>(null)
  const [galat, setGalat] = useState('')
  const boleh = punya('biodata')

  useEffect(() => { const t = setTimeout(() => { setQ(cari.trim()); setHal(1) }, 300); return () => clearTimeout(t) }, [cari])
  useEffect(() => { if (boleh) panggil<Rombel[]>('biodata_siswa_rombel').then(setRombels).catch(() => undefined) }, [boleh])
  useEffect(() => {
    if (!boleh) return
    let batal = false
    const per = efektif(ukuran)
    panggil<{ total: number; baris: Baris[] }>('biodata_siswa_daftar', { p_cari: q || null, p_rombel: rombel || null, p_status: status || null, p_batas: Math.min(per, 200), p_mulai: (hal - 1) * per })
      .then((x) => { if (!batal) { setData(x); setGalat('') } })
      .catch((e: Error) => { if (!batal) setGalat(e.message) })
    return () => { batal = true }
  }, [boleh, q, rombel, status, hal, ukuran])

  if (memuat) return <Halaman judul="Biodata siswa"><p className="catatan">Memeriksa hak akses...</p></Halaman>
  if (!boleh) return <Halaman judul="Tidak ada akses" lead="Biodata siswa untuk Waka Kesiswaan dan TU Kesiswaan."><Link to="/portal" className="tombol tombol-isi">Kembali ke portal</Link></Halaman>

  return (
    <Halaman judul="Biodata siswa" lead="Identitas, alamat, orang tua, dan data pribadi siswa seperti tercatat di Dapodik. Hanya baca; perbaikan data diajukan lewat alur ajuan.">
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setHal(1) }} aria-label="Status">
          <option value="aktif">Aktif</option><option value="lulus">Lulus</option><option value="mutasi">Mutasi</option><option value="">Semua status</option>
        </select>
        <select value={rombel} onChange={(e) => { setRombel(e.target.value); setHal(1) }} aria-label="Kelas">
          <option value="">Semua kelas</option>
          {rombels.map((r) => <option key={r.id} value={r.id}>{r.nama} ({r.jumlah})</option>)}
        </select>
        <input type="search" placeholder="Cari nama, NISN, atau NIPD" value={cari} onChange={(e) => setCari(e.target.value)} style={{ minWidth: 260 }} aria-label="Cari" />
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Nama</th><th>NISN</th><th>NIPD</th><th>JK</th><th>Tempat, tanggal lahir</th><th>Kelas</th><th>Status</th></tr></thead>
          <tbody>
            {!data && !galat && <tr><td colSpan={7} className="catatan">Memuat...</td></tr>}
            {data?.baris.length === 0 && <tr><td colSpan={7} className="catatan">Tidak ada data.</td></tr>}
            {data?.baris.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/portal/profil/siswa/${s.id}`}>{s.nama}</Link></td>
                <td>{s.nisn ?? '-'}</td><td>{s.nipd ?? '-'}</td><td>{s.jk ?? '-'}</td>
                <td>{s.tempat_lahir ?? '-'}, {tgl(s.tanggal_lahir)}</td><td>{s.rombel ?? '-'}</td><td>{s.status_peserta_didik}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={data?.total ?? 0} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} server />
      <p className="catatan jarak"><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}
