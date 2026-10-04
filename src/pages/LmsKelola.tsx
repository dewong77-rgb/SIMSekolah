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
          <label className="baris-centang"><input type="checkbox" checked={f.wajib} onChange={(e) => setF({ ...f, wajib: e.target.checked })} /> Siswa wajib absen sebelum membuka materi</label>
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
