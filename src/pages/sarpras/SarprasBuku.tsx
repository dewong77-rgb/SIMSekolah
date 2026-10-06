// Pembukuan sarana dan prasarana: ringkasan per kategori dan per bengkel, status usulan, dan pembanding data Dapodik.
import TombolIkon from '../../components/TombolIkon'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil } from '../../lib/rpc'
import { unduhCsv } from '../../lib/hubin'
import { KATEGORI, STATUS_USULAN, angka, label, rupiah, type Buku } from '../../lib/sarpras'
import GerbangSarpras from './GerbangSarpras'

function Isi() {
  const [buku, setBuku] = useState<Buku | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => { panggil<Buku | null>('sarpras_buku').then(setBuku).catch((e: Error) => setGalat(e.message)) }, [])

  if (galat) return <Halaman judul="Pembukuan sarana dan prasarana"><p className="kartu galat" role="alert">{galat}</p></Halaman>
  if (!buku) return <Halaman judul="Pembukuan sarana dan prasarana"><p className="catatan">Memuat data...</p></Halaman>

  const total = buku.per_kategori.reduce((a, x) => ({ baik: a.baik + Number(x.baik), rusak: a.rusak + Number(x.rusak), nilai: a.nilai + Number(x.nilai) }), { baik: 0, rusak: 0, nilai: 0 })
  const pctRusak = total.baik + total.rusak ? Math.round((total.rusak / (total.baik + total.rusak)) * 100) : 0

  function unduh() {
    if (!buku) return
    unduhCsv('pembukuan-sarpras', [
      ['Per kategori'], ['Kategori', 'Jenis barang', 'Baik', 'Rusak', 'Nilai (Rp)'],
      ...buku.per_kategori.map((x) => [label(KATEGORI, x.kategori), x.jenis_barang, x.baik, x.rusak, x.nilai]),
      [], ['Per bengkel atau lab'], ['Bengkel atau lab', 'Program', 'Jenis barang', 'Baik', 'Rusak', 'Nilai (Rp)'],
      ...buku.per_lab.map((x) => [x.lab_nama, x.program, x.jenis_barang, x.baik, x.rusak, x.nilai]),
    ])
  }

  return (
    <Halaman judul="Pembukuan sarana dan prasarana" lead="Ringkasan buku inventaris yang dicatat di aplikasi ini. Angka Dapodik ditampilkan terpisah sebagai pembanding, bukan dijumlahkan.">
      <div className="lencana-baris" style={{ marginBottom: 12 }}>
        <span className="lencana">Kondisi baik {angka(total.baik)}</span>
        <span className="lencana">Rusak {angka(total.rusak)} ({pctRusak}%)</span>
        <span className="lencana">Nilai tercatat {rupiah(total.nilai)}</span>
      </div>
      <div className="aksi" style={{ marginTop: 0 }}><TombolIkon ikon="unduh" label="Unduh CSV" onClick={unduh} /></div>

      <h2 className="jarak">Per kategori</h2>
      <div className="tabel-bungkus">
        <table>
          <thead><tr><th>Kategori</th><th>Jenis barang</th><th>Baik</th><th>Rusak</th><th>Nilai</th></tr></thead>
          <tbody>
            {buku.per_kategori.map((x) => <tr key={x.kategori}><td>{label(KATEGORI, x.kategori)}</td><td>{angka(x.jenis_barang)}</td><td>{angka(x.baik)}</td><td>{angka(x.rusak)}</td><td>{rupiah(x.nilai)}</td></tr>)}
            {buku.per_kategori.length === 0 && <tr><td colSpan={5} className="catatan">Belum ada barang yang dicatat.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="jarak">Per bengkel dan laboratorium</h2>
      <div className="tabel-bungkus">
        <table>
          <thead><tr><th>Bengkel atau lab</th><th>Program</th><th>Jenis barang</th><th>Baik</th><th>Rusak</th><th>Nilai</th></tr></thead>
          <tbody>
            {buku.per_lab.map((x) => <tr key={x.lab_nama}><td>{x.lab_nama}</td><td>{x.program ?? '-'}</td><td>{angka(x.jenis_barang)}</td><td>{angka(x.baik)}</td><td>{angka(x.rusak)}</td><td>{rupiah(x.nilai)}</td></tr>)}
            {buku.per_lab.length === 0 && <tr><td colSpan={6} className="catatan">Belum ada barang yang dicatat.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="jarak">Usulan</h2>
      <div className="lencana-baris">
        {STATUS_USULAN.map(([k, v]) => <span key={k} className="lencana">{v} {angka(buku.usulan[k] ?? 0)}</span>)}
      </div>

      <h2 className="jarak">Pembanding: data Dapodik</h2>
      <p className="catatan">Dari unggahan terakhir. Dapodik menghitung ruang dan sarana per ruang, jadi tidak otomatis sama dengan buku inventaris di atas.</p>
      <div className="lencana-baris">
        <span className="lencana">Ruang {angka(buku.dapodik.ruang)}</span>
        <span className="lencana">Luas ruang {angka(buku.dapodik.luas_m2)} m²</span>
        <span className="lencana">Jenis sarana {angka(buku.dapodik.jenis_sarana)}</span>
        <span className="lencana">Laik {angka(buku.dapodik.sarana_laik)}</span>
        <span className="lencana">Tidak laik {angka(buku.dapodik.sarana_tidak_laik)}</span>
      </div>
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function SarprasBuku() {
  return <GerbangSarpras perlu={['kelola', 'lihat']} judul="Pembukuan sarana dan prasarana" aktif="/portal/sarpras/buku">{() => <Isi />}</GerbangSarpras>
}
