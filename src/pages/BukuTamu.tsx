import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil } from '../lib/rpc'
import { kategoriTamu, tujuanTamu } from '../lib/tamu'

/** Isian mandiri tamu, tanpa login. Hanya berlaku bila tautan memuat kode gerbang (dari QR di pos jaga). */
export default function BukuTamu() {
  const [q] = useSearchParams()
  const kode = q.get('k') ?? ''
  const [valid, setValid] = useState<boolean | null>(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [selesai, setSelesai] = useState<{ nama: string; urut: number } | null>(null)
  const [v, setV] = useState({
    nama: '', asal: '', kategori: 'orang_tua', tujuan: 'bertemu_guru', bertemu: '', keperluan: '', jumlah: 1, telepon: '', jebakan: '',
  })

  useEffect(() => {
    if (!kode) { setValid(false); return }
    panggil<boolean>('tamu_kode_valid', { p_kode: kode }).then(setValid).catch(() => setValid(false))
  }, [kode])

  async function kirim(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      const r = await panggil<{ nama: string; urut: number }>('tamu_isi_mandiri', {
        p_kode: kode, p_nama: v.nama, p_asal: v.asal, p_kategori: v.kategori, p_tujuan: v.tujuan,
        p_keperluan: v.keperluan || null, p_bertemu: v.bertemu || null, p_jumlah: v.jumlah, p_telepon: v.telepon || null, p_jebakan: v.jebakan,
      })
      setSelesai(r)
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  if (valid === null) return <Halaman judul="Buku tamu"><p className="catatan">Memuat...</p></Halaman>

  if (!valid) {
    return (
      <Halaman judul="Buku tamu" lead="Pencatatan pengunjung sekolah.">
        <div className="kartu">
          <p>Formulir ini dibuka lewat kode QR di pos jaga. Pindai kode tersebut, atau minta bantuan satpam atau guru piket untuk mengisikan data Anda.</p>
          <p className="catatan jarak"><Link to="/">Kembali ke beranda</Link></p>
        </div>
      </Halaman>
    )
  }

  if (selesai) {
    return (
      <Halaman judul="Terima kasih" lead={`Kunjungan ${selesai.nama} sudah tercatat.`}>
        <div className="kartu">
          <p>Silakan menuju petugas atau ruang yang dituju. Mohon lapor ke petugas saat meninggalkan sekolah.</p>
          <div className="aksi">
            <button className="tombol tombol-isi" onClick={() => { setSelesai(null); setV({ ...v, nama: '', asal: '', bertemu: '', keperluan: '', jumlah: 1, telepon: '' }) }}>Isi untuk tamu lain</button>
          </div>
        </div>
      </Halaman>
    )
  }

  return (
    <Halaman judul="Buku tamu" lead="Isi data singkat sebelum masuk. Petugas dapat membantu bila diperlukan.">
      <form className="kartu form" onSubmit={kirim}>
        <label>Nama lengkap<input required value={v.nama} onChange={(e) => setV({ ...v, nama: e.target.value })} maxLength={120} autoComplete="name" /></label>
        <label>Asal instansi, perusahaan, atau alamat<input required value={v.asal} onChange={(e) => setV({ ...v, asal: e.target.value })} maxLength={200} placeholder="Contoh: Dinas Pendidikan Kab. Bogor, atau Desa Gunung Sindur" /></label>
        <div className="grid grid-2">
          <label>Anda datang sebagai
            <select value={v.kategori} onChange={(e) => setV({ ...v, kategori: e.target.value })}>
              {Object.entries(kategoriTamu).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </label>
          <label>Tujuan
            <select value={v.tujuan} onChange={(e) => setV({ ...v, tujuan: e.target.value })}>
              {Object.entries(tujuanTamu).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </label>
        </div>
        <label>Ingin bertemu siapa atau bagian apa<input value={v.bertemu} onChange={(e) => setV({ ...v, bertemu: e.target.value })} maxLength={150} placeholder="Contoh: Kepala Sekolah, Tata Usaha, Bu Sari" /></label>
        <label>Keperluan singkat (opsional)<textarea value={v.keperluan} onChange={(e) => setV({ ...v, keperluan: e.target.value })} maxLength={500} rows={2} /></label>
        <div className="grid grid-2">
          <label>Jumlah orang<input type="number" min={1} max={200} value={v.jumlah} onChange={(e) => setV({ ...v, jumlah: Math.max(1, Number(e.target.value) || 1) })} /></label>
          <label>Nomor HP (opsional)<input type="tel" inputMode="tel" value={v.telepon} onChange={(e) => setV({ ...v, telepon: e.target.value })} maxLength={20} autoComplete="tel" /></label>
        </div>
        {/* Kolom jebakan: manusia tidak melihatnya, skrip pengisi otomatis biasanya mengisinya. */}
        <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
          <label>Jangan diisi<input tabIndex={-1} autoComplete="off" value={v.jebakan} onChange={(e) => setV({ ...v, jebakan: e.target.value })} /></label>
        </div>
        {galat && <p className="catatan galat" role="alert">{galat}</p>}
        <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Kirim'}</button></div>
        <p className="catatan">Data hanya untuk keamanan dan pelaporan kunjungan sekolah. Nomor HP hanya terlihat oleh petugas yang berwenang.</p>
      </form>
    </Halaman>
  )
}
