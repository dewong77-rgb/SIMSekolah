import { useState, type FormEvent } from 'react'
import { panggil } from '../lib/rpc'

type Pert = { id: string; judul: string; tanggal: string; tujuan: string | null; wajib_absen: boolean }

/** Ubah atau hapus satu pertemuan: untuk semua kelas yang berbagi pertemuan itu, atau kelas ini saja. */
export default function KelolaPertemuan({ kelasId, pertemuanId, setelahUbah, setelahHapus }: {
  kelasId: string; pertemuanId: string; setelahUbah: () => void | Promise<void>; setelahHapus: () => void | Promise<void>
}) {
  const [buka, setBuka] = useState(false)
  const [f, setF] = useState({ judul: '', tanggal: '', tujuan: '', wajib: true })
  const [semua, setSemua] = useState(true)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')

  async function mulai() {
    setGalat(''); setPesan('')
    try {
      const d = await panggil<Pert[]>('lms_pertemuan_daftar', { p_kelas: kelasId })
      const p = d.find((x) => x.id === pertemuanId)
      if (!p) { setGalat('Pertemuan tidak ditemukan.'); return }
      setF({ judul: p.judul, tanggal: p.tanggal, tujuan: p.tujuan ?? '', wajib: p.wajib_absen })
      setBuka(true)
    } catch (e) { setGalat((e as Error).message) }
  }
  async function simpan(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat(''); setPesan('')
    try {
      if (semua) {
        const n = await panggil<number>('lms_pertemuan_ubah_serentak', { p_pertemuan: pertemuanId, p_judul: f.judul, p_tanggal: f.tanggal || null, p_tujuan: f.tujuan || null, p_wajib_absen: f.wajib })
        setPesan(`Perubahan disimpan di ${n} kelas.`)
      } else {
        await panggil('lms_simpan_pertemuan', { p_kelas: kelasId, p_id: pertemuanId, p_judul: f.judul, p_tanggal: f.tanggal || null, p_tujuan: f.tujuan || null, p_wajib_absen: f.wajib, p_terbit: null })
        setPesan('Perubahan disimpan di kelas ini.')
      }
      setBuka(false)
      await setelahUbah()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  async function hapus(untukSemua: boolean) {
    const ket = untukSemua ? 'di SEMUA kelas yang berbagi pertemuan ini' : 'di kelas ini saja'
    if (!window.confirm(`Hapus pertemuan ${ket}? Materi, lembar kerja, latihan, dan forum di dalamnya ikut dihapus.`)) return
    setSibuk(true); setGalat(''); setPesan('')
    const fn = untukSemua ? 'lms_pertemuan_hapus_serentak' : 'lms_pertemuan_hapus'
    try {
      try { await panggil(fn, { p_pertemuan: pertemuanId, p_paksa: false }) } catch (er) {
        const m = (er as Error).message
        if (!m.startsWith('Pertemuan ini sudah punya aktivitas')) throw er
        if (!window.confirm(`${m}\n\nTetap hapus?`)) { setSibuk(false); return }
        await panggil(fn, { p_pertemuan: pertemuanId, p_paksa: true })
      }
      await setelahHapus()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  return (
    <div className="jarak">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {pesan && <p className="catatan" role="status"><strong>{pesan}</strong></p>}
      {!buka && (
        <div className="aksi">
          <button type="button" className="tombol" style={{ color: 'var(--warna-utama)' }} disabled={sibuk} onClick={() => void mulai()}>Ubah pertemuan</button>
          <button type="button" className="tombol" style={{ color: '#8a1f1f', borderColor: '#8a1f1f' }} disabled={sibuk} onClick={() => void hapus(true)}>Hapus di semua kelas</button>
          <button type="button" className="tombol" style={{ color: '#8a1f1f', borderColor: '#8a1f1f' }} disabled={sibuk} onClick={() => void hapus(false)}>Hapus di kelas ini saja</button>
        </div>
      )}
      {buka && (
        <form className="kartu form" onSubmit={simpan}>
          <h3>Ubah pertemuan</h3>
          <div className="grid grid-2">
            <label>Judul pertemuan<input required maxLength={200} value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} /></label>
            <label>Tanggal<input type="date" required value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value })} /></label>
          </div>
          <label>Tujuan pembelajaran (opsional)<textarea rows={2} maxLength={1000} value={f.tujuan} onChange={(e) => setF({ ...f, tujuan: e.target.value })} /></label>
          <label className="baris-centang"><input type="checkbox" checked={semua} onChange={(e) => setSemua(e.target.checked)} /> Terapkan di semua kelas yang berbagi pertemuan ini</label>
          {!semua && <p className="catatan">Bila judul diubah hanya di kelas ini, kelas ini terlepas dari kelompok dan tidak ikut absen serentak.</p>}
          <div className="aksi">
            <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan perubahan'}</button>
            <button type="button" className="tombol" onClick={() => setBuka(false)}>Batal</button>
          </div>
        </form>
      )}
    </div>
  )
}

const DURASI: [string, string][] = [['', 'Tanpa batas waktu'], ['1', '1 hari'], ['3', '3 hari'], ['7', '1 minggu'], ['14', '2 minggu'], ['30', '1 bulan'], ['tanggal', 'Sampai tanggal tertentu']]
const waktu = (x: string) => new Date(x).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

/** Buka atau tutup pertemuan di semua kelas yang berbagi pertemuan ini, manual atau dengan batas waktu. */
export function AksesPertemuan({ pertemuanId, status, ditutup, bukaSampai, setelah }: {
  pertemuanId: string; status: string; ditutup: boolean; bukaSampai: string | null; setelah: () => void | Promise<void>
}) {
  const [durasi, setDurasi] = useState('')
  const [tanggal, setTanggal] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const lewat = !!bukaSampai && new Date(bukaSampai).getTime() <= Date.now()
  const tertutup = ditutup || lewat

  async function kirim(buka: boolean) {
    setGalat(''); setPesan('')
    let sampai: string | null = null
    if (buka && durasi === 'tanggal') {
      if (!tanggal) { setGalat('Pilih tanggal dan jamnya.'); return }
      sampai = new Date(tanggal).toISOString()
    } else if (buka && durasi) sampai = new Date(Date.now() + Number(durasi) * 86400000).toISOString()
    setSibuk(true)
    try {
      const n = await panggil<number>('lms_pertemuan_akses', { p_pertemuan: pertemuanId, p_buka: buka, p_sampai: sampai })
      setPesan(buka ? `Dibuka di ${n} kelas.` : `Ditutup di ${n} kelas.`)
      await setelah()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  return (
    <div className="kartu jarak aktifkan-panel">
      <h3 style={{ marginTop: 0 }}>Akses siswa</h3>
      {status !== 'terbit' ? (
        <p>Belum aktif. Pertemuan aktif otomatis di semua kelas begitu bahan bacaan dan lembar kerja sudah ada.</p>
      ) : (
        <>
          <p>
            {tertutup
              ? <span className="status status-dibatalkan">{lewat && !ditutup ? 'Batas waktu berakhir' : 'Ditutup'}</span>
              : <span className="status status-selesai">Terbuka</span>}{' '}
            {!tertutup && bukaSampai ? <>sampai <strong>{waktu(bukaSampai)}</strong>.</> : null}
            {!tertutup && !bukaSampai ? 'Tanpa batas waktu.' : null}
            {tertutup ? ' Siswa tidak bisa membuka, mengerjakan, atau berdiskusi di pertemuan ini.' : ''}
          </p>
          <div className="grid grid-2">
            <label>{tertutup ? 'Buka lagi selama' : 'Atur batas waktu'}
              <select value={durasi} onChange={(e) => setDurasi(e.target.value)}>{DURASI.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            </label>
            {durasi === 'tanggal' && <label>Sampai<input type="datetime-local" value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></label>}
          </div>
          <div className="aksi">
            {tertutup
              ? <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={() => void kirim(true)}>Buka lagi</button>
              : <>
                  <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={() => void kirim(true)}>Terapkan batas waktu</button>
                  <button type="button" className="tombol" style={{ color: '#8a1f1f', borderColor: '#8a1f1f' }} disabled={sibuk} onClick={() => void kirim(false)}>Tutup sekarang</button>
                </>}
          </div>
          <p className="catatan">Berlaku di semua kelas yang berbagi pertemuan ini. Siswa wajib menuntaskan pertemuan yang masih terbuka sebelum membuka pertemuan berikutnya.</p>
        </>
      )}
      {pesan && <p className="catatan" role="status"><strong>{pesan}</strong></p>}
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
    </div>
  )
}
