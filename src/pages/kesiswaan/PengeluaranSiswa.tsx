// Usul pengeluaran siswa. TU Kesiswaan memilih siswa, alasan, dan tanggal keluar; operator sekolah atau super admin
// menanggapi dengan melampirkan bukti proses keluar dari Dapodik (PDF atau tangkapan layar). SIMS tidak mengubah status siswa.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import CariSiswa from '../../components/CariSiswa'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { panggil, tgl, tglJam } from '../../lib/rpc'
import { kodeBerkas } from '../../lib/gambar'
import { ALASAN_KELUAR, STATUS_KELUAR, hariIni, label, useAksesKes, type SiswaCari } from '../../lib/kesiswaan'

type Ajuan = {
  id: string; pd: string; nama: string; nisn: string | null; nipd: string | null; rombel: string | null; alasan: string; keterangan: string | null
  tgl_keluar: string; status: string; diajukan_nama: string | null; diajukan_pada: string; ditanggapi_nama: string | null; ditanggapi_pada: string | null
  catatan_tanggapan: string | null; bukti_path: string | null; bukti_nama: string | null; bisa_batal: boolean
  diproses_nama: string | null; diproses_pada: string | null; catatan_proses: string | null
}
const BATAS_BUKTI = 5 * 1024 * 1024
const JENIS_BUKTI: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
const ekstensi = (f: File) => f.name.split('.').pop()?.toLowerCase() ?? ''

function Ceklis({ ok, teks, ket }: { ok: boolean; teks: string; ket?: string }) {
  return <li style={{ listStyle: 'none' }}><span aria-hidden="true">{ok ? '☑' : '☐'}</span> <span style={{ fontWeight: ok ? 600 : 400 }}>{teks}</span>{ket && <small className="catatan"> · {ket}</small>}</li>
}

function FormAjuan({ selesai }: { selesai: () => void }) {
  const [siswa, setSiswa] = useState<SiswaCari | null>(null)
  const [alasan, setAlasan] = useState('')
  const [tglKeluar, setTglKeluar] = useState(hariIni())
  const [ket, setKet] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  async function ajukan() {
    if (!siswa) return setGalat('Pilih siswa terlebih dahulu.')
    if (!alasan) return setGalat('Pilih alasan keluar.')
    setSibuk(true); setGalat('')
    try {
      await panggil('keluar_ajukan', { p_pd: siswa.id, p_alasan: alasan, p_tgl: tglKeluar, p_keterangan: ket || null })
      setSiswa(null); setAlasan(''); setKet(''); selesai()
    } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }

  return (
    <div className="kartu">
      <h3 style={{ marginTop: 0 }}>Usulkan pengeluaran siswa</h3>
      <CariSiswa untuk="keluar" dipilih={siswa} pilih={setSiswa} />
      <div className="aksi" style={{ alignItems: 'center' }}>
        <select value={alasan} onChange={(e) => setAlasan(e.target.value)} aria-label="Alasan keluar">
          <option value="">Alasan keluar...</option>
          {ALASAN_KELUAR.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label>Tanggal keluar <input type="date" value={tglKeluar} onChange={(e) => setTglKeluar(e.target.value)} /></label>
      </div>
      <textarea rows={2} maxLength={500} placeholder="Keterangan (wajib untuk Dikeluarkan dan Lainnya)" value={ket} onChange={(e) => setKet(e.target.value)} style={{ width: '100%' }} aria-label="Keterangan" />
      {galat && <p className="galat" role="alert">{galat}</p>}
      <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk} onClick={ajukan}>{sibuk ? 'Mengajukan...' : 'Ajukan'}</button></div>
    </div>
  )
}

function KartuAjuan({ a, operator, muat }: { a: Ajuan; operator: boolean; muat: () => void }) {
  const { profil } = useAuth()
  const [mode, setMode] = useState<'' | 'proses' | 'selesai' | 'tolak'>('')
  const [catatan, setCatatan] = useState('')
  const [berkas, setBerkas] = useState<File | null>(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  async function proses() {
    setSibuk(true); setGalat('')
    try { await panggil('keluar_proses', { p_id: a.id, p_catatan: catatan || null }); setMode(''); setCatatan(''); muat() }
    catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }
  async function kirim() {
    setGalat('')
    const jenis = berkas ? JENIS_BUKTI[ekstensi(berkas)] : undefined
    if (mode === 'selesai') {
      if (!berkas) return setGalat('Lampirkan bukti hasil keluar dari Dapodik (PDF atau tangkapan layar).')
      if (!jenis) return setGalat('Bukti harus berupa PDF, PNG, JPG, atau WebP.')
      if (berkas.size > BATAS_BUKTI) return setGalat('Ukuran bukti maksimal 5 MB.')
    }
    setSibuk(true)
    let path: string | null = null
    try {
      if (mode === 'selesai' && berkas && jenis) {
        path = `${profil?.npsn}/${a.id}/bukti-${kodeBerkas()}.${ekstensi(berkas)}`
        const { error } = await supabase.storage.from('dokumen-keluar').upload(path, berkas, { contentType: jenis, upsert: false })
        if (error) throw new Error(error.message)
      }
      await panggil('keluar_tanggapi', { p_id: a.id, p_selesai: mode === 'selesai', p_catatan: catatan || null, p_bukti_path: path, p_bukti_nama: berkas?.name ?? null })
      setMode(''); setCatatan(''); setBerkas(null); muat()
    } catch (e) {
      if (path) await supabase.storage.from('dokumen-keluar').remove([path]).catch(() => undefined)
      setGalat((e as Error).message)
    } finally { setSibuk(false) }
  }
  async function batal() {
    if (!window.confirm(`Batalkan ajuan pengeluaran ${a.nama}?`)) return
    try { await panggil('keluar_batalkan', { p_id: a.id }); muat() } catch (e) { setGalat((e as Error).message) }
  }
  async function unduh() {
    if (!a.bukti_path) return
    const { data, error } = await supabase.storage.from('dokumen-keluar').createSignedUrl(a.bukti_path, 300, { download: a.bukti_nama ?? 'bukti-keluar' })
    if (error || !data) return setGalat(error?.message ?? 'Tautan berkas gagal dibuat.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <div className="kartu">
      <div className="aksi" style={{ marginTop: 0, justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{a.nama} <small className="catatan">{a.rombel ?? '-'}{a.nisn ? ` · NISN ${a.nisn}` : ''}</small></h3>
        <strong>{label(STATUS_KELUAR, a.status)}</strong>
      </div>
      <p style={{ margin: '6px 0' }}>{a.alasan}, keluar {tgl(a.tgl_keluar)}{a.keterangan ? `. ${a.keterangan}` : ''}</p>
      <small className="catatan">Diajukan {a.diajukan_nama ?? '-'}, {tglJam(a.diajukan_pada)}</small>
      {a.status !== 'dibatalkan' && a.status !== 'ditolak' && (
        <ul style={{ padding: 0, margin: '8px 0' }} aria-label="Tahapan">
          <Ceklis ok teks="Diajukan" ket={`${a.diajukan_nama ?? '-'}, ${tglJam(a.diajukan_pada)}`} />
          <Ceklis ok={a.status === 'diproses' || a.status === 'selesai'} teks="Diproses di Dapodik" ket={a.diproses_pada ? `${a.diproses_nama ?? '-'}, ${tglJam(a.diproses_pada)}${a.catatan_proses ? `. ${a.catatan_proses}` : ''}` : undefined} />
          <Ceklis ok={a.status === 'selesai'} teks="Selesai, bukti hasil kerja terlampir" ket={a.status === 'selesai' ? `${a.ditanggapi_nama ?? '-'}, ${tglJam(a.ditanggapi_pada)}${a.catatan_tanggapan ? `. ${a.catatan_tanggapan}` : ''}` : undefined} />
        </ul>
      )}
      {(a.status === 'dibatalkan' || a.status === 'ditolak') && <p className="catatan" style={{ margin: '6px 0 0' }}>{a.status === 'dibatalkan' ? 'Dibatalkan' : 'Ditolak'} oleh {a.ditanggapi_nama ?? '-'}, {tglJam(a.ditanggapi_pada)}{a.catatan_tanggapan ? `. ${a.catatan_tanggapan}` : ''}</p>}
      <div className="aksi">
        {a.bukti_path && <button className="tombol" onClick={unduh}>Lihat bukti hasil kerja</button>}
        {a.status === 'diajukan' && operator && mode === '' && <button className="tombol tombol-isi" onClick={() => setMode('proses')}>Tandai sedang diproses</button>}
        {(a.status === 'diajukan' || a.status === 'diproses') && operator && mode === '' && <>
          <button className="tombol tombol-isi" onClick={() => setMode('selesai')}>Selesaikan dengan bukti</button>
          <button className="tombol" onClick={() => setMode('tolak')}>Tolak</button>
        </>}
        {a.bisa_batal && mode === '' && <button className="tombol" onClick={batal}>Batalkan</button>}
      </div>
      {mode !== '' && (
        <div className="jarak">
          {mode === 'selesai' && <p className="catatan">Proses keluar siswa di Dapodik terlebih dahulu, lalu unggah hasilnya: PDF atau tangkapan layar (PNG, JPG, WebP), maksimal 5 MB.</p>}
          {mode === 'selesai' && <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} aria-label="Bukti hasil kerja" />}
          <textarea rows={2} maxLength={500} placeholder={mode === 'tolak' ? 'Alasan penolakan (wajib)' : 'Catatan (opsional)'} value={catatan} onChange={(e) => setCatatan(e.target.value)} style={{ width: '100%' }} aria-label="Catatan" />
          <div className="aksi">
            <button className="tombol tombol-isi" disabled={sibuk} onClick={mode === 'proses' ? proses : kirim}>{sibuk ? 'Mengirim...' : mode === 'selesai' ? 'Kirim bukti' : mode === 'proses' ? 'Tandai diproses' : 'Tolak ajuan'}</button>
            <button className="tombol" disabled={sibuk} onClick={() => { setMode(''); setGalat('') }}>Batal</button>
          </div>
        </div>
      )}
      {galat && <p className="galat" role="alert">{galat}</p>}
    </div>
  )
}

export default function PengeluaranSiswa() {
  const { punya, memuat } = useAksesKes()
  const boleh = punya('keluar')
  const operator = punya('keluar.tanggapi')
  const [status, setStatus] = useState('')
  const [data, setData] = useState<{ operator: boolean; baris: Ajuan[] } | null>(null)
  const [galat, setGalat] = useState('')

  const muat = useCallback(() => {
    panggil<{ operator: boolean; baris: Ajuan[] }>('keluar_daftar', { p_status: status || null })
      .then((x) => { setData(x); setGalat('') }).catch((e: Error) => setGalat(e.message))
  }, [status])
  useEffect(() => { if (boleh) muat() }, [boleh, muat])

  if (memuat) return <Halaman judul="Pengeluaran siswa"><p className="catatan">Memeriksa hak akses...</p></Halaman>
  if (!boleh) return <Halaman judul="Tidak ada akses" lead="Pengeluaran siswa untuk TU Kesiswaan, Waka Kesiswaan, dan operator sekolah."><Link to="/portal" className="tombol tombol-isi">Kembali ke portal</Link></Halaman>

  const menunggu = data?.baris.filter((b) => b.status === 'diajukan' || b.status === 'diproses').length ?? 0
  return (
    <Halaman judul="Pengeluaran siswa" lead="Usul pengeluaran dari TU Kesiswaan diteruskan ke operator sekolah. Operator memprosesnya di Dapodik, menandai tahapnya, lalu melampirkan bukti hasil kerja (PDF atau tangkapan layar). Status siswa di SIMS berubah lewat unggahan Dapodik berikutnya.">
      {!operator && <FormAjuan selesai={muat} />}
      <div className="aksi" style={{ alignItems: 'center' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Semua status</option>
          {STATUS_KELUAR.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        {data && <span className="catatan">{menunggu} belum selesai</span>}
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="jarak" style={{ display: 'grid', gap: 12 }}>
        {!data && !galat && <p className="catatan">Memuat...</p>}
        {data?.baris.map((a) => <KartuAjuan key={a.id} a={a} operator={operator} muat={muat} />)}
        {data?.baris.length === 0 && <p className="catatan">Belum ada ajuan.</p>}
      </div>
      <p className="catatan jarak"><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}
