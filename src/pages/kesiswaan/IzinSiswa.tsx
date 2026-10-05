// Izin siswa: sakit, izin, dispensasi, dan izin keluar. Diputuskan guru piket, wali kelas (rombelnya), atau TU Kesiswaan.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import CariSiswa from '../../components/CariSiswa'
import FormIzin from '../../components/FormIzin'
import { panggil, tgl } from '../../lib/rpc'
import { JENIS_IZIN, STATUS_IZIN, label, type RombelPilih, type SiswaCari } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Baris = {
  id: string; nama: string; nisn: string | null; rombel: string | null; jenis: string; tgl_mulai: string; tgl_selesai: string; jam_keluar: string | null
  jam_kembali: string | null; alasan: string; lampiran_url: string | null; status: string; diajukan_nama: string | null; catatan_keputusan: string | null
}

function Isi() {
  const [status, setStatus] = useState('diajukan')
  const [rombel, setRombel] = useState('')
  const [hariIniSaja, setHariIniSaja] = useState(false)
  const [cari, setCari] = useState('')
  const [halaman, setHalaman] = useState(0)
  const [rombels, setRombels] = useState<RombelPilih[]>([])
  const [data, setData] = useState<{ total: number; baris: Baris[] } | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [catatan, setCatatan] = useState<Record<string, string>>({})
  const [sibuk, setSibuk] = useState('')
  const [baru, setBaru] = useState(false)
  const [siswa, setSiswa] = useState<SiswaCari | null>(null)
  const BATAS = 50

  useEffect(() => { panggil<RombelPilih[]>('kesiswaan_rombel', { p_untuk: 'izin' }).then(setRombels).catch(() => setRombels([])) }, [])
  const muat = useCallback(async () => {
    try {
      setData(await panggil('izin_daftar', { p_status: status === 'semua' ? null : status, p_rombel: rombel || null, p_hari_ini: hariIniSaja, p_cari: cari.trim() || null, p_batas: BATAS, p_mulai: halaman * BATAS }))
      setGalat('')
    } catch (e) { setGalat((e as Error).message) }
  }, [status, rombel, hariIniSaja, cari, halaman])
  useEffect(() => { void muat() }, [muat])

  async function aksi(id: string, fn: string, args: Record<string, unknown>) {
    setSibuk(id); setGalat(''); setInfo('')
    try { await panggil(fn, { p_id: id, ...args }); await muat() } catch (e) { setGalat((e as Error).message) } finally { setSibuk('') }
  }

  return (
    <Halaman judul="Izin siswa" lead="Izin yang disetujui otomatis menjadi status kehadiran pada hari yang bersangkutan (Senin sampai Jumat). Izin yang dicatat petugas langsung berstatus disetujui.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setHalaman(0) }} aria-label="Status">
          <option value="semua">Semua status</option>
          {STATUS_IZIN.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <select value={rombel} onChange={(e) => { setRombel(e.target.value); setHalaman(0) }} aria-label="Rombel">
          <option value="">Semua rombel</option>
          {rombels.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
        <input type="search" placeholder="Cari nama atau NISN" value={cari} onChange={(e) => { setCari(e.target.value); setHalaman(0) }} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={hariIniSaja} onChange={(e) => { setHariIniSaja(e.target.checked); setHalaman(0) }} />Berlaku hari ini</label>
        <button className="tombol" onClick={() => setBaru((b) => !b)}>{baru ? 'Tutup form' : 'Catat izin siswa'}</button>
      </div>

      {baru && (
        <div className="jarak">
          <div className="kartu" style={{ maxWidth: 640 }}><CariSiswa untuk="izin" pilih={setSiswa} dipilih={siswa} /></div>
          {siswa && <div className="jarak"><FormIzin pd={siswa.id} namaSiswa={siswa.nama} mundur={60} sesudah={(p) => { setInfo(p); setBaru(false); setSiswa(null); void muat() }} /></div>}
        </div>
      )}

      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Siswa</th><th>Jenis</th><th>Tanggal</th><th>Alasan</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.baris.map((b) => (
              <tr key={b.id}>
                <td>{b.nama}<br /><small className="catatan">{b.rombel ?? '-'}</small></td>
                <td>{label(JENIS_IZIN, b.jenis)}</td>
                <td>{tgl(b.tgl_mulai)}{b.tgl_selesai !== b.tgl_mulai && ` sampai ${tgl(b.tgl_selesai)}`}
                  {b.jenis === 'izin_keluar' && <><br /><small className="catatan">Keluar {b.jam_keluar?.slice(0, 5)}{b.jam_kembali && `, kembali ${b.jam_kembali.slice(0, 5)}`}</small></>}</td>
                <td>{b.alasan}{b.lampiran_url && <><br /><a href={b.lampiran_url} target="_blank" rel="noopener noreferrer">Bukti</a></>}<br /><small className="catatan">Oleh {b.diajukan_nama ?? '-'}</small></td>
                <td>{label(STATUS_IZIN, b.status)}{b.catatan_keputusan && <><br /><small className="catatan">{b.catatan_keputusan}</small></>}</td>
                <td style={{ minWidth: 200 }}>
                  {b.status === 'diajukan' && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <input placeholder="Catatan (wajib bila ditolak)" value={catatan[b.id] ?? ''} onChange={(e) => setCatatan((c) => ({ ...c, [b.id]: e.target.value }))} />
                      <div className="aksi" style={{ marginTop: 0 }}>
                        <button className="tombol tombol-isi" disabled={sibuk === b.id} onClick={() => aksi(b.id, 'izin_putuskan', { p_setuju: true, p_catatan: catatan[b.id]?.trim() || null })}>Setujui</button>
                        <button className="tombol" disabled={sibuk === b.id} onClick={() => aksi(b.id, 'izin_putuskan', { p_setuju: false, p_catatan: catatan[b.id]?.trim() || null })}>Tolak</button>
                      </div>
                    </div>
                  )}
                  {(b.status === 'diajukan' || b.status === 'disetujui') && <button className="tombol-ikon" disabled={sibuk === b.id} onClick={() => aksi(b.id, 'izin_batalkan', {})}>Batalkan</button>}
                </td>
              </tr>
            ))}
            {data && data.baris.length === 0 && <tr><td colSpan={6} className="catatan">Tidak ada izin.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="aksi" style={{ alignItems: 'center' }}>
          <button className="tombol" disabled={halaman === 0} onClick={() => setHalaman((h) => h - 1)}>Sebelumnya</button>
          <span className="catatan">{data.total ? `${halaman * BATAS + 1} sampai ${Math.min((halaman + 1) * BATAS, data.total)} dari ${data.total}` : '0'}</span>
          <button className="tombol" disabled={(halaman + 1) * BATAS >= data.total} onClick={() => setHalaman((h) => h + 1)}>Berikutnya</button>
        </div>
      )}
      <p><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}

export default function IzinSiswa() {
  return <Gerbang perlu={['kesiswaan.izin']} judul="Izin siswa">{() => <Isi />}</Gerbang>
}
