import { useCallback, useEffect, useState } from 'react'
import Halaman from '../components/Halaman'
import { panggil } from '../lib/rpc'
import { unduhCsv } from './lmsUtil'

// Waka Kurikulum memantau guru yang sedang atau sudah mengakses LMS. Data dari denyut tiap 2 menit (lms_denyut).
// Ini kehadiran di LMS, bukan presensi fisik di sekolah.

type Guru = { ptk_id: string; nama: string; jumlah_kelas: number; pertama_akses: string | null; terakhir_akses: string | null; jumlah_denyut: number | null; online: boolean }
type Data = { tanggal: string; sekarang: string; guru: Guru[] }
type Saring = 'semua' | 'online' | 'sudah' | 'belum'

const jam = (x: string | null) => (x ? new Date(x).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-')
const hariIni = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })

function kapital(n: string): string {
  return n.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
}

function status(g: Guru): { kunci: Exclude<Saring, 'semua'>; label: string; kelas: string } {
  if (g.online) return { kunci: 'online', label: 'Online', kelas: 'status-selesai' }
  if (g.pertama_akses) return { kunci: 'sudah', label: 'Sudah akses', kelas: 'status-menunggu' }
  return { kunci: 'belum', label: 'Belum akses', kelas: 'status-dibatalkan' }
}

export default function KehadiranGuruLms() {
  const [tanggal, setTanggal] = useState(hariIni)
  const [data, setData] = useState<Data | null>(null)
  const [galat, setGalat] = useState('')
  const [saring, setSaring] = useState<Saring>('semua')
  const [cari, setCari] = useState('')
  const [langsung, setLangsung] = useState(true)
  const hariIniDipilih = tanggal === hariIni()

  const muat = useCallback(async () => {
    try { setData(await panggil<Data>('lms_kehadiran_guru', { p_tanggal: tanggal })); setGalat('') } catch (e) { setGalat((e as Error).message) }
  }, [tanggal])
  useEffect(() => { setData(null); void muat() }, [muat])
  useEffect(() => {
    if (!langsung || !hariIniDipilih) return
    const j = window.setInterval(() => { if (document.visibilityState === 'visible') void muat() }, 30_000)
    return () => window.clearInterval(j)
  }, [langsung, hariIniDipilih, muat])

  const semua = data?.guru ?? []
  const n = (k: Saring) => semua.filter((g) => status(g).kunci === k).length
  const tampil = semua
    .filter((g) => saring === 'semua' || status(g).kunci === saring)
    .filter((g) => !cari || g.nama.toLowerCase().includes(cari.toLowerCase()))

  function unduh() {
    unduhCsv(`kehadiran-guru-lms-${tanggal}.csv`, [
      ['Nama', 'Jumlah kelas', 'Status', 'Akses pertama', 'Akses terakhir'],
      ...semua.map((g) => [kapital(g.nama), g.jumlah_kelas, status(g).label, jam(g.pertama_akses), jam(g.terakhir_akses)]),
    ])
  }

  return (
    <Halaman judul="Kehadiran guru di LMS" lead="Guru yang sedang atau sudah membuka LMS. Online berarti aktif dalam 5 menit terakhir.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi">
        <label>Tanggal<input type="date" value={tanggal} max={hariIni()} onChange={(e) => e.target.value && setTanggal(e.target.value)} /></label>
        <label>Tampilkan
          <select value={saring} onChange={(e) => setSaring(e.target.value as Saring)}>
            <option value="semua">Semua guru</option><option value="online">Online sekarang</option>
            <option value="sudah">Sudah akses</option><option value="belum">Belum akses</option>
          </select>
        </label>
        <label>Cari nama<input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama guru" /></label>
      </div>
      {data && (
        <div className="grid grid-3 jarak">
          <div className="kartu"><small>Online sekarang</small><p style={{ margin: 0, fontSize: '1.6rem' }}>{n('online')}</p></div>
          <div className="kartu"><small>Sudah akses hari ini</small><p style={{ margin: 0, fontSize: '1.6rem' }}>{n('online') + n('sudah')} <small>dari {semua.length} guru</small></p></div>
          <div className="kartu"><small>Belum akses</small><p style={{ margin: 0, fontSize: '1.6rem' }}>{n('belum')}</p></div>
        </div>
      )}
      <div className="aksi jarak">
        <button className="tombol" style={{ color: 'var(--warna-utama)' }} disabled={!data} onClick={unduh}>Unduh CSV</button>
        {hariIniDipilih && <label className="baris-centang"><input type="checkbox" checked={langsung} onChange={(e) => setLangsung(e.target.checked)} /> Pantau langsung (segar tiap 30 detik)</label>}
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>No</th><th>Guru</th><th>Kelas diampu</th><th>Status</th><th>Akses pertama</th><th>Akses terakhir</th></tr></thead>
          <tbody>
            {!data && !galat && <tr><td colSpan={6}>Memuat...</td></tr>}
            {data && tampil.length === 0 && <tr><td colSpan={6}>Tidak ada guru yang cocok.</td></tr>}
            {tampil.map((g, i) => {
              const s = status(g)
              return (
                <tr key={g.ptk_id}>
                  <td>{i + 1}</td>
                  <td>{kapital(g.nama)}</td>
                  <td>{g.jumlah_kelas}</td>
                  <td><span className={`status ${s.kelas}`}>{s.label}</span></td>
                  <td>{jam(g.pertama_akses)}</td>
                  <td>{jam(g.terakhir_akses)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="catatan">Pencatatan dimulai sejak fitur ini aktif, jadi tanggal sebelumnya kosong. Ini kehadiran di LMS, bukan presensi fisik di sekolah.</p>
    </Halaman>
  )
}
