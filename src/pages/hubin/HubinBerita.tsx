// Redaksi berita sekolah. Penulis membuat draf dan mengajukan; penerbitan oleh pemegang izin hubin.kelola_humas (Waka Hubinmas).
import TombolIkon from '../../components/TombolIkon'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tglJam } from '../../lib/rpc'
import { KATEGORI_BERITA, namaKategori, type BeritaKelola } from '../../lib/hubin'
import Gerbang from './Gerbang'

const NAMA_STATUS: Record<string, string> = { draf: 'Draf', diajukan: 'Menunggu terbit', terbit: 'Terbit', diarsipkan: 'Diarsipkan' }
type Form = { id?: string; judul: string; kategori: string; ringkasan: string; isi: string; gambar_url: string; gambar_keterangan: string; unggulan: boolean; status: string }
const BARU: Form = { judul: '', kategori: 'kegiatan', ringkasan: '', isi: '', gambar_url: '', gambar_keterangan: '', unggulan: false, status: 'draf' }

function Isi() {
  const [daftar, setDaftar] = useState<BeritaKelola[]>([])
  const [bisa, setBisa] = useState({ tulis: false, terbitkan: false })
  const [status, setStatus] = useState('semua')
  const [form, setForm] = useState<Form | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const baca = useCallback(async () => {
    try {
      const [b, d] = await Promise.all([panggil<{ tulis: boolean; terbitkan: boolean }>('berita_boleh'), panggil<BeritaKelola[]>('berita_kelola_daftar', { p_status: status })])
      setBisa(b); setDaftar(d)
    } catch (e) { setGalat((e as Error).message) }
  }, [status])
  useEffect(() => { void baca() }, [baca])

  async function ubah(b: BeritaKelola) {
    setGalat(''); setInfo('')
    try {
      const x = await panggil<Record<string, unknown>>('berita_ambil', { p_id: b.id })
      setForm({
        id: b.id, judul: String(x.judul ?? ''), kategori: String(x.kategori ?? 'kegiatan'), ringkasan: String(x.ringkasan ?? ''), isi: String(x.isi ?? ''),
        gambar_url: String(x.gambar_url ?? ''), gambar_keterangan: String(x.gambar_keterangan ?? ''), unggulan: !!x.unggulan, status: String(x.status ?? 'draf'),
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setGalat((e as Error).message) }
  }

  async function simpan(e: FormEvent, statusBaru?: string) {
    e.preventDefault(); if (!form) return
    setGalat(''); setInfo('')
    if (form.gambar_url.trim() && !/^https:\/\/\S+$/i.test(form.gambar_url.trim())) return setGalat('Tautan gambar harus diawali https://')
    setSibuk(true)
    try {
      await panggil('berita_simpan', { p_id: form.id ?? null, p_data: { ...form, status: statusBaru ?? form.status } })
      setForm(null); setInfo(statusBaru === 'terbit' ? 'Berita terbit di situs publik.' : statusBaru === 'diajukan' ? 'Berita diajukan ke Waka Hubinmas.' : 'Tersimpan.')
      void baca()
    } catch (er) { setGalat((er as Error).message) } finally { setSibuk(false) }
  }

  async function pindah(b: BeritaKelola, s: string) {
    setGalat(''); setInfo('')
    try { await panggil('berita_status', { p_id: b.id, p_status: s }); void baca() } catch (e) { setGalat((e as Error).message) }
  }

  const u = (k: keyof Form, v: string | boolean) => setForm((x) => (x ? { ...x, [k]: v } : x))

  return (
    <Halaman judul="Berita dan kegiatan" lead="Tulis, ajukan, dan terbitkan berita sekolah. Berita terbit tampil di beranda dan halaman Berita.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      {!bisa.terbitkan && bisa.tulis && <p className="catatan">Anda dapat menulis dan mengajukan berita. Penerbitan oleh Waka Hubinmas.</p>}
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <button className="tombol tombol-isi" onClick={() => { setForm(BARU); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Tulis berita</button>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
          <option value="semua">Semua status</option>
          {Object.entries(NAMA_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {form && (
        <form className="form kartu jarak" onSubmit={(e) => simpan(e)} style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          <h3>{form.id ? 'Ubah berita' : 'Berita baru'}</h3>
          <label>Judul<input value={form.judul} maxLength={150} onChange={(e) => u('judul', e.target.value)} required /></label>
          <label>Kategori
            <select value={form.kategori} onChange={(e) => u('kategori', e.target.value)}>
              {KATEGORI_BERITA.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Ringkasan<textarea rows={2} maxLength={300} value={form.ringkasan} onChange={(e) => u('ringkasan', e.target.value)} /><small className="catatan">{form.ringkasan.length}/300. Tampil di daftar berita.</small></label>
          <label>Isi berita<textarea rows={12} value={form.isi} onChange={(e) => u('isi', e.target.value)} required /><small className="catatan">Teks biasa. Pisahkan paragraf dengan baris kosong.</small></label>
          <label>Tautan gambar (https)<input type="url" value={form.gambar_url} onChange={(e) => u('gambar_url', e.target.value)} placeholder="https://" /></label>
          <label>Keterangan gambar<input value={form.gambar_keterangan} maxLength={200} onChange={(e) => u('gambar_keterangan', e.target.value)} /></label>
          {bisa.terbitkan && <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={form.unggulan} onChange={(e) => u('unggulan', e.target.checked)} /> Berita unggulan (tampil paling atas)</label>}
          <div className="aksi">
            <button className="tombol" disabled={sibuk}>Simpan {form.status === 'terbit' ? 'perubahan' : 'sebagai draf'}</button>
            {!bisa.terbitkan && form.status !== 'terbit' && <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={(e) => simpan(e, 'diajukan')}>Ajukan untuk terbit</button>}
            {bisa.terbitkan && form.status !== 'terbit' && <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={(e) => simpan(e, 'terbit')}>Terbitkan</button>}
            <TombolIkon ikon="tutup" label="Batal" onClick={() => setForm(null)} />
          </div>
        </form>
      )}

      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Judul</th><th>Kategori</th><th>Status</th><th>Penulis</th><th>Diperbarui</th><th /></tr></thead>
          <tbody>
            {daftar.map((b) => (
              <tr key={b.id}>
                <td>{b.unggulan && '★ '}{b.status === 'terbit' ? <Link to={`/berita/${b.slug}`} target="_blank">{b.judul}</Link> : b.judul}</td>
                <td>{namaKategori(b.kategori)}</td><td>{NAMA_STATUS[b.status] ?? b.status}</td><td>{b.penulis_nama}</td><td>{tglJam(b.diperbarui_pada)}</td>
                <td>
                  <div className="aksi-ikon">
                    {b.bisa_ubah && <TombolIkon ikon="pena" label="Ubah" onClick={() => ubah(b)} />}
                    {bisa.terbitkan && b.status !== 'terbit' && b.status !== 'diarsipkan' && <TombolIkon ikon="kirim" label="Terbitkan" onClick={() => pindah(b, 'terbit')} />}
                    {bisa.terbitkan && b.status === 'terbit' && <TombolIkon ikon="kembali" label="Tarik" varian="bahaya" onClick={() => pindah(b, 'diarsipkan')} />}
                    {bisa.terbitkan && b.status === 'diarsipkan' && <TombolIkon ikon="muat" label="Pulihkan" onClick={() => pindah(b, 'draf')} />}
                    {!bisa.terbitkan && b.bisa_ubah && b.status === 'draf' && <TombolIkon ikon="kirim" label="Ajukan" onClick={() => pindah(b, 'diajukan')} />}
                    {!bisa.terbitkan && b.bisa_ubah && b.status === 'diajukan' && <TombolIkon ikon="kembali" label="Tarik ke draf" onClick={() => pindah(b, 'draf')} />}
                  </div>
                </td>
              </tr>
            ))}
            {daftar.length === 0 && <tr><td colSpan={6} className="catatan">Belum ada berita.</td></tr>}
          </tbody>
        </table>
      </div>
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function HubinBerita() {
  return <Gerbang perlu={['hubin.tulis_berita', 'hubin.kelola_humas']} judul="Berita dan kegiatan">{() => <Isi />}</Gerbang>
}
