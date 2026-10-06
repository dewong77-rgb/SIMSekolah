// Kartu inventaris yang dapat dicetak: KIR (Kartu Inventaris Ruang, per bengkel atau lab) dan KIB (Kartu Inventaris Barang, per barang).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tgl, tglJam } from '../../lib/rpc'
import { useSekolah } from '../../lib/profilSekolah'
import { unduhCsv } from '../../lib/hubin'
import { KATEGORI, STATUS_KERUSAKAN, TINGKAT_RUSAK, angka, label, rupiah, type Barang, type Kerusakan, type Lab, type RiwayatBarang } from '../../lib/sarpras'
import GerbangSarpras from './GerbangSarpras'

const AKSI_LOG: Record<string, string> = { tambah: 'Dicatat', ubah: 'Diubah', hapus: 'Dihapus' }
const namaAksi = (a: string) => AKSI_LOG[a] ?? (a.startsWith('kerusakan_') ? 'Kerusakan ' + a.slice(10) : a.startsWith('pulih_') ? 'Pulih dari ' + a.slice(6) : a.startsWith('keluar_') ? 'Keluar (' + a.slice(7) + ')' : a.startsWith('masuk_') ? 'Masuk (' + a.slice(6) + ')' : a === 'rusak_berat' ? 'Menjadi rusak berat' : a)
const kodeRuang = (l: Lab) => l.kode || l.nama

function Kop({ sekolah, judul }: { sekolah: ReturnType<typeof useSekolah>; judul: string }) {
  return (
    <header className="kartu-kop">
      <strong>{sekolah.nama}</strong>
      <span>NPSN {sekolah.npsn}{sekolah.alamat ? ` · ${sekolah.alamat}` : ''}</span>
      <h2>{judul}</h2>
    </header>
  )
}

function Isi() {
  const sekolah = useSekolah()
  const [mode, setMode] = useState<'kir' | 'kib'>('kir')
  const [lab, setLab] = useState<Lab[]>([])
  const [barang, setBarang] = useState<Barang[]>([])
  const [labId, setLabId] = useState('')
  const [barangId, setBarangId] = useState('')
  const [riwayat, setRiwayat] = useState<RiwayatBarang[]>([])
  const [rusak, setRusak] = useState<Kerusakan[]>([])
  const [galat, setGalat] = useState('')
  const [memuat, setMemuat] = useState(true)

  useEffect(() => {
    Promise.all([panggil<Lab[]>('sarpras_lab_daftar'), panggil<Barang[]>('sarpras_barang_daftar')])
      .then(([l, b]) => { setLab(l ?? []); setBarang(b ?? []); if ((l ?? []).length) setLabId((l ?? [])[0].id) })
      .catch((e: Error) => setGalat(e.message)).finally(() => setMemuat(false))
  }, [])

  const labTerpilih = lab.find((x) => x.id === labId)
  const barangLab = useMemo(() => barang.filter((b) => b.lab_id === labId), [barang, labId])
  const barangKib = barang.find((b) => b.id === barangId)
  const labKib = lab.find((x) => x.id === barangKib?.lab_id)

  useEffect(() => {
    if (!barangId) { setRiwayat([]); setRusak([]); return }
    let batal = false
    Promise.all([panggil<RiwayatBarang[]>('sarpras_barang_riwayat', { p_id: barangId }), panggil<Kerusakan[]>('sarpras_kerusakan_daftar', { p_barang: barangId })])
      .then(([r, k]) => { if (!batal) { setRiwayat(r ?? []); setRusak(k ?? []) } })
      .catch(() => { if (!batal) { setRiwayat([]); setRusak([]) } })
    return () => { batal = true }
  }, [barangId])

  const total = barangLab.reduce((a, b) => a + Number(b.jumlah_total) * Number(b.harga_satuan ?? 0), 0)
  const hari = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  function unduhKir() {
    if (!labTerpilih) return
    unduhCsv(`KIR-${kodeRuang(labTerpilih)}`, [
      ['No', 'Kode barang', 'Nama barang', 'Merek atau tipe', 'Spesifikasi', 'Tahun', 'Satuan', 'Baik', 'Rusak ringan', 'Rusak berat', 'Hilang', 'Total', 'Harga satuan', 'Sumber dana', 'Keterangan'],
      ...barangLab.map((b, i) => [i + 1, b.kode_barang, b.nama, b.merek_tipe, b.spesifikasi, b.tahun_perolehan, b.satuan, b.jumlah_baik, b.jumlah_rusak, b.jumlah_rusak_berat, b.jumlah_hilang, b.jumlah_total, b.harga_satuan, b.sumber_dana, b.keterangan]),
    ])
  }

  if (memuat) return <Halaman judul="Kartu inventaris"><p className="catatan">Memuat data...</p></Halaman>
  return (
    <Halaman judul="Kartu inventaris" lead="KIR memuat seluruh barang di satu bengkel atau laboratorium. KIB memuat data lengkap satu barang beserta riwayat perubahan dan kerusakannya. Cetak atau simpan sebagai PDF.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <nav className="aksi tanpa-cetak" style={{ marginTop: 0, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Jenis kartu">
        <button className={mode === 'kir' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setMode('kir')}>KIR: per ruang</button>
        <button className={mode === 'kib' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setMode('kib')}>KIB: per barang</button>
        {mode === 'kir' && (
          <select value={labId} onChange={(e) => setLabId(e.target.value)} aria-label="Bengkel atau laboratorium">
            {lab.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
          </select>
        )}
        {mode === 'kib' && (
          <select value={barangId} onChange={(e) => setBarangId(e.target.value)} aria-label="Barang">
            <option value="">Pilih barang</option>
            {barang.map((b) => <option key={b.id} value={b.id}>{b.nama}{b.kode_barang ? ` (${b.kode_barang})` : ''} · {b.lab_nama ?? 'Umum'}</option>)}
          </select>
        )}
        <button className="tombol" onClick={() => window.print()} disabled={mode === 'kir' ? !labTerpilih : !barangKib}>Cetak atau simpan PDF</button>
        {mode === 'kir' && <button className="tombol" onClick={unduhKir} disabled={!labTerpilih}>Unduh CSV</button>}
      </nav>

      {mode === 'kir' && labTerpilih && (
        <section className="kartu kartu-cetak jarak">
          <Kop sekolah={sekolah} judul="KARTU INVENTARIS RUANG (KIR)" />
          <dl className="kartu-data">
            <div><dt>Ruang</dt><dd>{labTerpilih.nama}</dd></div>
            <div><dt>Kode</dt><dd>{labTerpilih.kode ?? '-'}</dd></div>
            <div><dt>Program keahlian</dt><dd>{labTerpilih.program ?? '-'}</dd></div>
            <div><dt>Per tanggal</dt><dd>{hari}</dd></div>
          </dl>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>No</th><th>Kode</th><th>Nama barang</th><th>Merek atau tipe, spesifikasi</th><th>Tahun</th><th>Baik</th><th>Rusak ringan</th><th>Rusak berat</th><th>Hilang</th><th>Total</th><th>Nilai</th></tr></thead>
              <tbody>
                {barangLab.map((b, i) => (
                  <tr key={b.id}>
                    <td>{i + 1}</td><td>{b.kode_barang ?? '-'}</td><td>{b.nama}<br /><small>{label(KATEGORI, b.kategori)}</small></td>
                    <td>{[b.merek_tipe, b.spesifikasi].filter(Boolean).join(', ') || '-'}</td><td>{b.tahun_perolehan ?? '-'}</td>
                    <td>{angka(b.jumlah_baik)} {b.satuan}</td><td>{angka(b.jumlah_rusak)}</td><td>{angka(b.jumlah_rusak_berat)}</td><td>{angka(b.jumlah_hilang)}</td>
                    <td>{angka(b.jumlah_total)}</td><td>{rupiah(Number(b.jumlah_total) * Number(b.harga_satuan ?? 0))}</td>
                  </tr>
                ))}
                {barangLab.length === 0 && <tr><td colSpan={11} className="catatan">Belum ada barang yang dicatat di ruang ini.</td></tr>}
              </tbody>
              {barangLab.length > 0 && <tfoot><tr><td colSpan={10}><strong>Total nilai tercatat</strong></td><td><strong>{rupiah(total)}</strong></td></tr></tfoot>}
            </table>
          </div>
          <div className="kartu-tanda-tangan">
            <div>Kepala {labTerpilih.jenis === 'laboratorium' ? 'Laboratorium' : 'Bengkel'}<br /><br /><br />(............................)</div>
            <div>Waka Sarana dan Prasarana<br /><br /><br />(............................)</div>
          </div>
        </section>
      )}

      {mode === 'kib' && !barangKib && <p className="catatan">Pilih barang untuk menampilkan kartunya.</p>}
      {mode === 'kib' && barangKib && (
        <section className="kartu kartu-cetak jarak">
          <Kop sekolah={sekolah} judul="KARTU INVENTARIS BARANG (KIB)" />
          <dl className="kartu-data">
            <div><dt>Nama barang</dt><dd>{barangKib.nama}</dd></div>
            <div><dt>Kode barang</dt><dd>{barangKib.kode_barang ?? '-'}</dd></div>
            <div><dt>Kategori</dt><dd>{label(KATEGORI, barangKib.kategori)}</dd></div>
            <div><dt>Lokasi</dt><dd>{barangKib.lab_nama ?? 'Umum'}{labKib?.program ? ` (${labKib.program})` : ''}</dd></div>
            <div><dt>Merek atau tipe</dt><dd>{barangKib.merek_tipe ?? '-'}</dd></div>
            <div><dt>Spesifikasi</dt><dd>{barangKib.spesifikasi ?? '-'}</dd></div>
            <div><dt>Tahun perolehan</dt><dd>{barangKib.tahun_perolehan ?? '-'}</dd></div>
            <div><dt>Sumber dana</dt><dd>{barangKib.sumber_dana ?? '-'}</dd></div>
            <div><dt>Harga satuan</dt><dd>{rupiah(barangKib.harga_satuan)}</dd></div>
            <div><dt>Satuan</dt><dd>{barangKib.satuan}</dd></div>
            {barangKib.luas_m2 != null && <div><dt>Luas</dt><dd>{angka(barangKib.luas_m2)} m²</dd></div>}
            {barangKib.stok_minimum != null && <div><dt>Stok minimum</dt><dd>{angka(barangKib.stok_minimum)}</dd></div>}
          </dl>
          <h3>Kondisi saat ini</h3>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Baik</th><th>Rusak ringan</th><th>Rusak berat</th><th>Hilang</th><th>Total</th><th>Nilai tercatat</th></tr></thead>
              <tbody><tr>
                <td>{angka(barangKib.jumlah_baik)}</td><td>{angka(barangKib.jumlah_rusak)}</td><td>{angka(barangKib.jumlah_rusak_berat)}</td><td>{angka(barangKib.jumlah_hilang)}</td>
                <td>{angka(barangKib.jumlah_total)} {barangKib.satuan}</td><td>{rupiah(Number(barangKib.jumlah_total) * Number(barangKib.harga_satuan ?? 0))}</td>
              </tr></tbody>
            </table>
          </div>
          {barangKib.keterangan && <p><small>Keterangan: {barangKib.keterangan}</small></p>}
          <h3>Riwayat kerusakan</h3>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Nomor</th><th>Tanggal</th><th>Tingkat</th><th>Jumlah</th><th>Uraian</th><th>Status</th></tr></thead>
              <tbody>
                {rusak.map((k) => <tr key={k.id}><td>{k.nomor}</td><td>{tgl(k.tanggal_kejadian ?? k.dibuat_pada)}</td><td>{label(TINGKAT_RUSAK, k.tingkat)}</td><td>{angka(k.jumlah)}</td><td>{k.uraian}</td><td>{label(STATUS_KERUSAKAN, k.status)}</td></tr>)}
                {rusak.length === 0 && <tr><td colSpan={6} className="catatan">Tidak ada laporan kerusakan.</td></tr>}
              </tbody>
            </table>
          </div>
          <h3>Riwayat perubahan</h3>
          <ol style={{ paddingLeft: 18 }}>
            {riwayat.map((r, i) => <li key={i}><small>{tglJam(r.waktu)} · {namaAksi(r.aksi)}</small></li>)}
            {riwayat.length === 0 && <li><small>Belum ada riwayat.</small></li>}
          </ol>
          <div className="kartu-tanda-tangan">
            <div>Staf Sarana dan Prasarana<br /><br /><br />(............................)</div>
            <div>Waka Sarana dan Prasarana<br /><br /><br />(............................)</div>
          </div>
        </section>
      )}
      <p className="tanpa-cetak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function SarprasKartu() {
  return <GerbangSarpras perlu={['kelola', 'operasional', 'catat_lab', 'verifikasi_program', 'lihat']} judul="Kartu inventaris" aktif="/portal/sarpras/kartu">{() => <Isi />}</GerbangSarpras>
}
