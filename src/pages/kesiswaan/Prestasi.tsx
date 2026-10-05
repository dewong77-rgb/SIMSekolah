// Prestasi siswa: ajukan, verifikasi Waka, dan daftar.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import CariSiswa from '../../components/CariSiswa'
import { panggil, tgl } from '../../lib/rpc'
import { BIDANG_PRESTASI, STATUS_CATATAN, TINGKAT, hariIni, label, type SiswaCari } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Baris = {
  id: string; nama: string; nisn: string | null; rombel: string | null; nama_prestasi: string; bidang: string; tingkat: string; peringkat: string | null
  penyelenggara: string | null; tanggal: string; berkas_url: string | null; status: string; dicatat_nama: string | null; catatan_keputusan: string | null; bisa_tarik: boolean
}

function Form({ sesudah }: { sesudah: () => void }) {
  const [siswa, setSiswa] = useState<SiswaCari | null>(null)
  const [d, setD] = useState({ nama: '', bidang: 'akademik', tingkat: 'sekolah', peringkat: '', penyelenggara: '', tanggal: hariIni(), berkas: '' })
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }))

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    if (!siswa) { setGalat('Pilih siswa.'); return }
    setSibuk(true); setGalat(''); setInfo('')
    try {
      await panggil('prestasi_ajukan', {
        p_pd: siswa.id, p_nama: d.nama.trim(), p_bidang: d.bidang, p_tingkat: d.tingkat, p_peringkat: d.peringkat.trim() || null,
        p_penyelenggara: d.penyelenggara.trim() || null, p_tanggal: d.tanggal, p_berkas_url: d.berkas.trim() || null,
      })
      setInfo(`Prestasi ${siswa.nama} diajukan dan menunggu verifikasi.`)
      setSiswa(null); setD({ nama: '', bidang: 'akademik', tingkat: 'sekolah', peringkat: '', penyelenggara: '', tanggal: hariIni(), berkas: '' }); sesudah()
    } catch (x) { setGalat((x as Error).message) } finally { setSibuk(false) }
  }

  return (
    <form className="kartu form" style={{ maxWidth: 640 }} onSubmit={kirim}>
      <h3>Ajukan prestasi</h3>
      <CariSiswa untuk="catat" pilih={setSiswa} dipilih={siswa} />
      <label>Nama prestasi atau lomba<input value={d.nama} onChange={set('nama')} minLength={3} maxLength={200} required /></label>
      <div className="grid grid-2">
        <label>Bidang<select value={d.bidang} onChange={set('bidang')}>{BIDANG_PRESTASI.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Tingkat<select value={d.tingkat} onChange={set('tingkat')}>{TINGKAT.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Peringkat (misalnya Juara 1)<input value={d.peringkat} onChange={set('peringkat')} maxLength={60} /></label>
        <label>Tanggal<input type="date" value={d.tanggal} max={hariIni()} onChange={set('tanggal')} required /></label>
      </div>
      <label>Penyelenggara<input value={d.penyelenggara} onChange={set('penyelenggara')} maxLength={150} /></label>
      <label>Tautan bukti (sertifikat atau foto, harus https)<input type="url" value={d.berkas} onChange={set('berkas')} placeholder="https://" /></label>
      {galat && <p className="galat" role="alert">{galat}</p>}
      {info && <p role="status">{info}</p>}
      <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Mengirim...' : 'Ajukan'}</button>
    </form>
  )
}

function Daftar({ bisaPutuskan, ulang }: { bisaPutuskan: boolean; ulang: number }) {
  const [status, setStatus] = useState(bisaPutuskan ? 'diajukan' : 'semua')
  const [cari, setCari] = useState('')
  const [halaman, setHalaman] = useState(0)
  const [data, setData] = useState<{ total: number; baris: Baris[] } | null>(null)
  const [galat, setGalat] = useState('')
  const [catatan, setCatatan] = useState<Record<string, string>>({})
  const [sibuk, setSibuk] = useState('')
  const BATAS = 50

  const muat = useCallback(async () => {
    try { setData(await panggil('prestasi_daftar', { p_status: status, p_cari: cari.trim() || null, p_batas: BATAS, p_mulai: halaman * BATAS })); setGalat('') }
    catch (e) { setGalat((e as Error).message) }
  }, [status, cari, halaman])
  useEffect(() => { void muat() }, [muat, ulang])

  async function aksi(id: string, fn: string, args: Record<string, unknown>) {
    setSibuk(id); setGalat('')
    try { await panggil(fn, { p_id: id, ...args }); await muat() } catch (e) { setGalat((e as Error).message) } finally { setSibuk('') }
  }
  async function hapus(b: Baris) {
    const alasan = window.prompt(`Alasan menghapus prestasi ${b.nama_prestasi} (${b.nama})?`)
    if (alasan && alasan.trim().length >= 3) await aksi(b.id, 'prestasi_hapus', { p_alasan: alasan.trim() })
  }

  return (
    <div>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setHalaman(0) }} aria-label="Status">
          <option value="semua">Semua status</option>
          {STATUS_CATATAN.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <input type="search" placeholder="Cari nama atau NISN" value={cari} onChange={(e) => { setCari(e.target.value); setHalaman(0) }} />
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Siswa</th><th>Prestasi</th><th>Bidang dan tingkat</th><th>Tanggal</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.baris.map((b) => (
              <tr key={b.id}>
                <td>{b.nama}<br /><small className="catatan">{b.rombel ?? '-'}</small></td>
                <td>{b.nama_prestasi}{b.peringkat && ` (${b.peringkat})`}{b.penyelenggara && <><br /><small className="catatan">{b.penyelenggara}</small></>}
                  {b.berkas_url && <><br /><a href={b.berkas_url} target="_blank" rel="noopener noreferrer">Bukti</a></>}</td>
                <td>{label(BIDANG_PRESTASI, b.bidang)}<br /><small className="catatan">{label(TINGKAT, b.tingkat)}</small></td>
                <td>{tgl(b.tanggal)}</td>
                <td>{label(STATUS_CATATAN, b.status)}{b.catatan_keputusan && <><br /><small className="catatan">{b.catatan_keputusan}</small></>}</td>
                <td style={{ minWidth: 200 }}>
                  {bisaPutuskan && b.status === 'diajukan' && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <input placeholder="Catatan (wajib bila ditolak)" value={catatan[b.id] ?? ''} onChange={(e) => setCatatan((c) => ({ ...c, [b.id]: e.target.value }))} />
                      <div className="aksi" style={{ marginTop: 0 }}>
                        <button className="tombol tombol-isi" disabled={sibuk === b.id} onClick={() => aksi(b.id, 'prestasi_putuskan', { p_setuju: true, p_catatan: catatan[b.id]?.trim() || null })}>Verifikasi</button>
                        <button className="tombol" disabled={sibuk === b.id} onClick={() => aksi(b.id, 'prestasi_putuskan', { p_setuju: false, p_catatan: catatan[b.id]?.trim() || null })}>Tolak</button>
                      </div>
                    </div>
                  )}
                  {b.bisa_tarik && <button className="tombol-ikon" disabled={sibuk === b.id} onClick={() => aksi(b.id, 'prestasi_tarik', {})}>Tarik</button>}
                  {bisaPutuskan && b.status !== 'diajukan' && <button className="tombol-ikon" disabled={sibuk === b.id} onClick={() => hapus(b)}>Hapus</button>}
                </td>
              </tr>
            ))}
            {data && data.baris.length === 0 && <tr><td colSpan={6} className="catatan">Tidak ada catatan.</td></tr>}
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
    </div>
  )
}

function Isi({ izin }: { izin: string[] }) {
  const bisaCatat = izin.includes('kesiswaan.catat')
  const waka = izin.includes('kesiswaan.verifikasi')
  const [tab, setTab] = useState<'daftar' | 'ajukan'>(waka || !bisaCatat ? 'daftar' : 'ajukan')
  const [ulang, setUlang] = useState(0)
  return (
    <Halaman judul="Prestasi siswa" lead="Prestasi akademik, non-akademik, dan kejuruan. Prestasi baru menunggu verifikasi Waka Kesiswaan dan baru tampil ke siswa dan orang tua setelahnya.">
      <div className="aksi" style={{ marginTop: 0 }}>
        <button className={tab === 'daftar' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('daftar')}>Daftar prestasi</button>
        {bisaCatat && <button className={tab === 'ajukan' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('ajukan')}>Ajukan prestasi</button>}
      </div>
      <div className="jarak">
        {tab === 'daftar' ? <Daftar bisaPutuskan={waka} ulang={ulang} /> : <Form sesudah={() => setUlang((u) => u + 1)} />}
      </div>
      <p><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}

export default function Prestasi() {
  return <Gerbang perlu={['kesiswaan.catat', 'kesiswaan.pantau', 'kesiswaan.verifikasi']} judul="Prestasi siswa">{(izin) => <Isi izin={izin} />}</Gerbang>
}
