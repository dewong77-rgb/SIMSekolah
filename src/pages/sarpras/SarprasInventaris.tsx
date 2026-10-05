// Buku inventaris sarana dan prasarana per bengkel atau laboratorium.
// Kepala bengkel mencatat barang di bengkelnya. Waka Sarpras mengelola semuanya, termasuk daftar bengkel dan bangunan.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil } from '../../lib/rpc'
import { unduhCsv } from '../../lib/hubin'
import { JENIS_LAB, KATEGORI, angka, label, rupiah, type Barang, type Lab } from '../../lib/sarpras'
import GerbangSarpras from './GerbangSarpras'

type FormBarang = Partial<Barang> & { jumlah_baik?: number | string; jumlah_rusak?: number | string }
type FormLab = Partial<Lab>
const teks = (v: unknown) => (v == null ? '' : String(v))

function Isi({ kelola }: { kelola: boolean }) {
  const [lab, setLab] = useState<Lab[]>([])
  const [barang, setBarang] = useState<Barang[]>([])
  const [labPilih, setLabPilih] = useState('')
  const [kat, setKat] = useState('')
  const [cari, setCari] = useState('')
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [formB, setFormB] = useState<FormBarang | null>(null)
  const [formL, setFormL] = useState<FormLab | null>(null)
  const [memuat, setMemuat] = useState(true)

  const baca = useCallback(async () => {
    try {
      const [l, b] = await Promise.all([panggil<Lab[]>('sarpras_lab_daftar'), panggil<Barang[]>('sarpras_barang_daftar')])
      setLab(l ?? []); setBarang(b ?? [])
    } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [])
  useEffect(() => { void baca() }, [baca])

  const labBisaCatat = useMemo(() => lab.filter((x) => x.boleh_catat && x.aktif), [lab])
  const q = cari.trim().toLowerCase()
  const tampil = barang.filter((x) =>
    (!labPilih || (labPilih === 'umum' ? x.lab_id === null : x.lab_id === labPilih))
    && (!kat || x.kategori === kat)
    && (!q || `${x.nama} ${x.kode_barang ?? ''} ${x.spesifikasi ?? ''} ${x.merek_tipe ?? ''}`.toLowerCase().includes(q)))
  const jumlahBaik = tampil.reduce((a, x) => a + Number(x.jumlah_baik), 0)
  const jumlahRusak = tampil.reduce((a, x) => a + Number(x.jumlah_rusak), 0)

  function barangBaru() {
    setFormL(null); setInfo(''); setGalat('')
    const awal = labPilih && labPilih !== 'umum' && labBisaCatat.some((x) => x.id === labPilih) ? labPilih : labBisaCatat.length === 1 ? labBisaCatat[0].id : ''
    setFormB({ lab_id: awal || null, kategori: 'alat', satuan: 'unit', jumlah_baik: 0, jumlah_rusak: 0 })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function simpanBarang(e: FormEvent) {
    e.preventDefault(); if (!formB) return; setGalat(''); setInfo('')
    if (!formB.nama?.trim()) return setGalat('Nama barang wajib diisi.')
    if (!formB.lab_id && !kelola) return setGalat('Pilih bengkel atau laboratorium.')
    const baik = Number(formB.jumlah_baik ?? 0), rusak = Number(formB.jumlah_rusak ?? 0)
    if (!(baik >= 0) || !(rusak >= 0)) return setGalat('Jumlah baik dan rusak tidak boleh negatif.')
    setSibuk(true)
    try {
      await panggil('sarpras_barang_simpan', {
        p_id: formB.id ?? null,
        p: {
          lab_id: formB.lab_id ?? null, kategori: formB.kategori, kode_barang: formB.kode_barang, nama: formB.nama, merek_tipe: formB.merek_tipe,
          spesifikasi: formB.spesifikasi, satuan: formB.satuan, jumlah_baik: baik, jumlah_rusak: rusak, tahun_perolehan: formB.tahun_perolehan,
          sumber_dana: formB.sumber_dana, harga_satuan: formB.harga_satuan, luas_m2: formB.luas_m2, keterangan: formB.keterangan,
        },
      })
      setFormB(null); setInfo('Barang tersimpan.'); await baca()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  async function hapusBarang(b: FormBarang) {
    if (!b.id || !window.confirm(`Hapus ${b.nama} dari buku inventaris? Riwayat perubahan tetap tersimpan.`)) return
    setGalat(''); setInfo('')
    try { await panggil('sarpras_barang_hapus', { p_id: b.id }); setFormB(null); setInfo('Barang dihapus dari buku inventaris.'); await baca() }
    catch (er) { setGalat((er as Error).message) }
  }

  async function simpanLab(e: FormEvent) {
    e.preventDefault(); if (!formL) return; setGalat(''); setInfo('')
    if (!formL.nama?.trim()) return setGalat('Nama wajib diisi.')
    setSibuk(true)
    try {
      await panggil('sarpras_lab_simpan', {
        p_id: formL.id ?? null,
        p: { nama: formL.nama, jenis: formL.jenis ?? 'bengkel', program: formL.program, kode: formL.kode, keterangan: formL.keterangan, aktif: formL.aktif ?? true, prasarana_id: formL.prasarana_id ?? null },
      })
      setFormL(null); setInfo('Bengkel atau laboratorium tersimpan.'); await baca()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  function unduh() {
    unduhCsv('inventaris-sarpras', [
      ['Bengkel atau lab', 'Kategori', 'Kode', 'Nama', 'Merek atau tipe', 'Spesifikasi', 'Satuan', 'Baik', 'Rusak', 'Total', 'Tahun', 'Sumber dana', 'Harga satuan', 'Keterangan'],
      ...tampil.map((x) => [x.lab_nama ?? 'Umum', label(KATEGORI, x.kategori), x.kode_barang, x.nama, x.merek_tipe, x.spesifikasi, x.satuan,
        x.jumlah_baik, x.jumlah_rusak, x.jumlah_total, x.tahun_perolehan, x.sumber_dana, x.harga_satuan, x.keterangan]),
    ])
  }

  const B = (k: keyof FormBarang, nm: string, tipe = 'text') => (
    <label>{nm}<input type={tipe} min={tipe === 'number' ? 0 : undefined} step={tipe === 'number' ? 'any' : undefined} value={teks(formB?.[k])} onChange={(e) => setFormB((x) => ({ ...x, [k]: e.target.value }))} /></label>
  )

  if (memuat) return <Halaman judul="Inventaris sarana dan prasarana"><p className="catatan">Memuat data...</p></Halaman>
  return (
    <Halaman judul="Inventaris sarana dan prasarana" lead={kelola ? 'Buku inventaris seluruh bengkel, laboratorium, dan bangunan. Kepala bengkel mencatat barang di bengkelnya, Waka Sarpras mengelola semuanya.' : 'Catat alat, bahan, dan aset di bengkel atau laboratorium yang Anda pegang. Kebutuhan baru atau perbaikan diajukan lewat Usulan.'}>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      {lab.length === 0 && <p className="kartu">Belum ada bengkel atau laboratorium yang terhubung ke akun ini. {kelola ? 'Tambahkan di bagian Bengkel dan laboratorium di bawah.' : 'Minta Waka Sarpras menambahkan penugasan Kepala Bengkel dengan lingkup bengkel Anda.'}</p>}

      <div className="lencana-baris" style={{ marginBottom: 12 }}>
        <span className="lencana">Jenis barang {tampil.length}</span>
        <span className="lencana">Baik {angka(jumlahBaik)}</span>
        <span className="lencana">Rusak {angka(jumlahRusak)}</span>
      </div>

      <div className="aksi" style={{ marginTop: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={labPilih} onChange={(e) => setLabPilih(e.target.value)} aria-label="Bengkel atau laboratorium">
          <option value="">Semua bengkel dan lab</option>
          {lab.map((x) => <option key={x.id} value={x.id}>{x.nama}{x.aktif ? '' : ' (nonaktif)'}</option>)}
          {kelola && <option value="umum">Umum (tanpa bengkel)</option>}
        </select>
        <select value={kat} onChange={(e) => setKat(e.target.value)} aria-label="Kategori">
          <option value="">Semua kategori</option>
          {KATEGORI.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="search" placeholder="Cari nama, kode, spesifikasi..." value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari" />
        {(kelola || labBisaCatat.length > 0) && <button className="tombol tombol-isi" onClick={barangBaru}>Tambah barang</button>}
        <button className="tombol" onClick={unduh} disabled={!tampil.length}>Unduh CSV</button>
      </div>

      {formB && (
        <form className="form kartu jarak" onSubmit={simpanBarang} style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          <h3>{formB.id ? 'Ubah barang' : 'Barang baru'}</h3>
          <label>Bengkel atau laboratorium
            <select value={formB.lab_id ?? ''} onChange={(e) => setFormB((x) => ({ ...x, lab_id: e.target.value || null }))}>
              {kelola && <option value="">Umum (tanpa bengkel)</option>}
              {!kelola && <option value="">Pilih bengkel atau laboratorium</option>}
              {(kelola ? lab : labBisaCatat).map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}
            </select>
          </label>
          <label>Kategori
            <select value={formB.kategori ?? 'alat'} onChange={(e) => setFormB((x) => ({ ...x, kategori: e.target.value }))}>
              {KATEGORI.filter(([k]) => kelola || k !== 'bangunan').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {B('nama', 'Nama barang')}
          <div className="grid grid-2">{B('kode_barang', 'Kode barang')}{B('merek_tipe', 'Merek atau tipe')}</div>
          <label>Spesifikasi<textarea rows={2} value={teks(formB.spesifikasi)} onChange={(e) => setFormB((x) => ({ ...x, spesifikasi: e.target.value }))} /></label>
          <div className="grid grid-2">{B('satuan', 'Satuan')}{B('tahun_perolehan', 'Tahun perolehan', 'number')}</div>
          <div className="grid grid-2">{B('jumlah_baik', 'Jumlah kondisi baik', 'number')}{B('jumlah_rusak', 'Jumlah rusak', 'number')}</div>
          <div className="grid grid-2">{B('sumber_dana', 'Sumber dana')}{B('harga_satuan', 'Harga satuan (Rp)', 'number')}</div>
          {formB.kategori === 'bangunan' && B('luas_m2', 'Luas (m²)', 'number')}
          <label>Keterangan<textarea rows={2} value={teks(formB.keterangan)} onChange={(e) => setFormB((x) => ({ ...x, keterangan: e.target.value }))} /></label>
          <div className="aksi">
            <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
            <button type="button" className="tombol" onClick={() => setFormB(null)}>Batal</button>
            {kelola && formB.id && <button type="button" className="tombol-ikon tombol-ikon-bahaya" onClick={() => hapusBarang(formB)}>Hapus</button>}
          </div>
        </form>
      )}

      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Barang</th><th>Bengkel atau lab</th><th>Kategori</th><th>Baik</th><th>Rusak</th><th>Total</th><th>Harga satuan</th><th /></tr></thead>
          <tbody>
            {tampil.map((x) => (
              <tr key={x.id}>
                <td><strong>{x.nama}</strong>{x.kode_barang ? <small> · {x.kode_barang}</small> : null}{x.spesifikasi ? <><br /><small>{x.spesifikasi}</small></> : null}</td>
                <td>{x.lab_nama ?? 'Umum'}</td>
                <td>{label(KATEGORI, x.kategori)}</td>
                <td>{angka(x.jumlah_baik)} {x.satuan}</td>
                <td>{angka(x.jumlah_rusak)}</td>
                <td>{angka(x.jumlah_total)}</td>
                <td>{rupiah(x.harga_satuan)}</td>
                <td>{x.boleh_ubah && <button className="tombol-ikon" onClick={() => { setFormL(null); setFormB(x); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Ubah</button>}</td>
              </tr>
            ))}
            {tampil.length === 0 && <tr><td colSpan={8} className="catatan">Belum ada barang yang cocok.</td></tr>}
          </tbody>
        </table>
      </div>

      {kelola && (
        <section className="jarak">
          <h2>Bengkel dan laboratorium</h2>
          <p className="catatan">Kepala program dihubungkan lewat kolom Program (sama dengan lingkup penugasan Kepala Program, misalnya Teknik Pemesinan). Kepala bengkel dihubungkan lewat Penugasan dengan lingkup bengkel ini.</p>
          <div className="aksi" style={{ marginTop: 0 }}><button className="tombol" onClick={() => { setFormB(null); setFormL({ jenis: 'bengkel', aktif: true }) }}>Tambah bengkel atau laboratorium</button></div>
          {formL && (
            <form className="form kartu jarak" onSubmit={simpanLab} style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
              <h3>{formL.id ? 'Ubah bengkel atau laboratorium' : 'Bengkel atau laboratorium baru'}</h3>
              <label>Nama<input value={teks(formL.nama)} onChange={(e) => setFormL((x) => ({ ...x, nama: e.target.value }))} /></label>
              <div className="grid grid-2">
                <label>Jenis
                  <select value={formL.jenis ?? 'bengkel'} onChange={(e) => setFormL((x) => ({ ...x, jenis: e.target.value }))}>
                    {JENIS_LAB.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label>Kode<input value={teks(formL.kode)} onChange={(e) => setFormL((x) => ({ ...x, kode: e.target.value }))} /></label>
              </div>
              <label>Program keahlian (untuk jalur Kepala Program)<input value={teks(formL.program)} onChange={(e) => setFormL((x) => ({ ...x, program: e.target.value }))} /></label>
              <label>Keterangan<textarea rows={2} value={teks(formL.keterangan)} onChange={(e) => setFormL((x) => ({ ...x, keterangan: e.target.value }))} /></label>
              <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={formL.aktif ?? true} onChange={(e) => setFormL((x) => ({ ...x, aktif: e.target.checked }))} /> Aktif</label>
              <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button><button type="button" className="tombol" onClick={() => setFormL(null)}>Batal</button></div>
            </form>
          )}
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>Nama</th><th>Jenis</th><th>Program</th><th>Barang</th><th>Baik</th><th>Rusak</th><th /></tr></thead>
              <tbody>
                {lab.map((x) => (
                  <tr key={x.id}>
                    <td>{x.nama}{x.aktif ? '' : ' (nonaktif)'}</td><td>{label(JENIS_LAB, x.jenis)}</td><td>{x.program ?? '-'}</td>
                    <td>{angka(x.jenis_barang)}</td><td>{angka(x.baik)}</td><td>{angka(x.rusak)}</td>
                    <td><button className="tombol-ikon" onClick={() => { setFormB(null); setFormL(x); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Ubah</button></td>
                  </tr>
                ))}
                {lab.length === 0 && <tr><td colSpan={7} className="catatan">Belum ada.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function SarprasInventaris() {
  return <GerbangSarpras perlu={['kelola', 'catat_lab', 'lihat']} judul="Inventaris sarana dan prasarana" aktif="/portal/sarpras/inventaris">{(izin) => <Isi kelola={izin.includes('kelola')} />}</GerbangSarpras>
}
