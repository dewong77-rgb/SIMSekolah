// Peminjaman alat (proyektor, sound system, dan sejenisnya): pengganti buku peminjaman manual.
// Staf atau Waka Sarpras mencatat peminjaman dan pengembalian. Kondisi alat saat kembali memperbarui inventaris.
import TombolIkon from '../../components/TombolIkon'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tgl } from '../../lib/rpc'
import { unduhCsv } from '../../lib/hubin'
import { STATUS_PINJAM, angka, label, type AlatPinjam, type Pinjam, type RekapPinjam } from '../../lib/sarpras'
import GerbangSarpras from './GerbangSarpras'

const hariIni = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
const awalBulan = () => hariIni().slice(0, 8) + '01'
const teks = (v: unknown) => (v == null ? '' : String(v))

type FormPinjam = { barang_id?: string; jumlah?: number | string; peminjam_ptk_id?: string; keperluan?: string; tanggal_pinjam?: string; rencana_kembali?: string }
type FormKembali = { id: string; rusak: string; berat: string; hilang: string; catatan: string; tanggal: string }

function kondisiKembali(k: Pinjam) {
  if (k.status !== 'dikembalikan') return ''
  const s = [`baik ${angka(k.kembali_baik)}`]
  if (Number(k.kembali_rusak)) s.push(`rusak ringan ${angka(k.kembali_rusak)}`)
  if (Number(k.kembali_rusak_berat)) s.push(`rusak berat ${angka(k.kembali_rusak_berat)}`)
  if (Number(k.kembali_hilang)) s.push(`hilang ${angka(k.kembali_hilang)}`)
  return s.join(', ')
}

function Isi({ izin }: { izin: string[] }) {
  const bisaCatat = izin.includes('kelola') || izin.includes('operasional')
  const [tab, setTab] = useState<'daftar' | 'rekap'>('daftar')
  const [daftar, setDaftar] = useState<Pinjam[]>([])
  const [alat, setAlat] = useState<AlatPinjam[]>([])
  const [rekap, setRekap] = useState<RekapPinjam | null>(null)
  const [ptk, setPtk] = useState<{ id: string; nama: string; jenis_ptk: string | null }[]>([])
  const [status, setStatus] = useState('')
  const [cari, setCari] = useState('')
  const [dari, setDari] = useState(awalBulan())
  const [sampai, setSampai] = useState(hariIni())
  const [form, setForm] = useState<FormPinjam | null>(null)
  const [kembali, setKembali] = useState<FormKembali | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [memuat, setMemuat] = useState(true)

  const baca = useCallback(async () => {
    try {
      const [d, a, r, g] = await Promise.all([
        panggil<Pinjam[]>('sarpras_pinjam_daftar', { p_status: status || null, p_cari: cari || null, p_dari: dari || null, p_sampai: sampai || null }),
        panggil<AlatPinjam[]>('sarpras_pinjam_alat'),
        panggil<RekapPinjam | null>('sarpras_pinjam_rekap', { p_dari: dari || null, p_sampai: sampai || null }),
        panggil<{ id: string; nama: string; jenis_ptk: string | null }[]>('sarpras_pinjam_ptk'),
      ])
      setDaftar(d ?? []); setAlat(a ?? []); setRekap(r); setPtk(g ?? [])
    } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [status, cari, dari, sampai])
  useEffect(() => { const t = setTimeout(() => { void baca() }, 250); return () => clearTimeout(t) }, [baca])

  const alatDipilih = alat.find((a) => a.id === form?.barang_id)
  const alatBisa = useMemo(() => alat.filter((a) => Number(a.tersedia) > 0), [alat])
  const pinjamKembali = daftar.find((x) => x.id === kembali?.id)

  function pinjamBaru() {
    setKembali(null); setGalat(''); setInfo('')
    setForm({ jumlah: 1, tanggal_pinjam: hariIni(), rencana_kembali: hariIni() })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function simpan(e: FormEvent) {
    e.preventDefault(); if (!form) return; setGalat(''); setInfo('')
    if (!form.barang_id) return setGalat('Pilih alat yang dipinjam.')
    if (!form.peminjam_ptk_id) return setGalat('Pilih peminjam dari daftar guru dan tenaga kependidikan.')
    const n = Number(form.jumlah ?? 0)
    if (!(n > 0)) return setGalat('Jumlah harus lebih dari nol.')
    if (alatDipilih && n > Number(alatDipilih.tersedia)) return setGalat(`Jumlah melebihi alat yang tersedia (${angka(alatDipilih.tersedia)}).`)
    setSibuk(true)
    try {
      await panggil('sarpras_pinjam_catat', { p: { barang_id: form.barang_id, jumlah: n, peminjam_ptk_id: form.peminjam_ptk_id, keperluan: form.keperluan || null, tanggal_pinjam: form.tanggal_pinjam || null, rencana_kembali: form.rencana_kembali || null } })
      setForm(null); setInfo('Peminjaman tercatat.'); await baca()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  async function simpanKembali() {
    if (!kembali) return; setGalat(''); setInfo('')
    setSibuk(true)
    try {
      await panggil('sarpras_pinjam_kembali', {
        p_id: kembali.id, p_rusak: Number(kembali.rusak || 0), p_berat: Number(kembali.berat || 0), p_hilang: Number(kembali.hilang || 0),
        p_catatan: kembali.catatan || null, p_tanggal: kembali.tanggal || null,
      })
      setKembali(null); setInfo('Pengembalian tercatat. Kondisi alat di inventaris sudah diperbarui.'); await baca()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  async function batalkan(k: Pinjam) {
    if (!window.confirm(`Batalkan catatan ${k.nomor}? Gunakan hanya untuk catatan yang salah input.`)) return
    setGalat(''); setInfo(''); setSibuk(true)
    try { await panggil('sarpras_pinjam_batal', { p_id: k.id }); setInfo('Catatan dibatalkan.'); await baca() }
    catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  function unduh() {
    if (tab === 'rekap' && rekap) {
      unduhCsv(`rekap-peminjaman-alat-${dari}-${sampai}`, [
        ['Rekap per alat', `${dari} s.d. ${sampai}`], ['Alat', 'Lokasi', 'Kali dipinjam', 'Sedang dipinjam', 'Tersedia', 'Baik', 'Rusak ringan', 'Rusak berat', 'Hilang'],
        ...rekap.per_alat.map((x) => [x.nama, x.lab_nama, x.kali, x.dipinjam, x.tersedia, x.jumlah_baik, x.jumlah_rusak, x.jumlah_rusak_berat, x.jumlah_hilang]),
        [], ['Rekap per peminjam'], ['Peminjam', 'Kali pinjam', 'Sedang dipinjam', 'Terlambat'],
        ...rekap.per_peminjam.map((x) => [x.nama, x.kali, x.sedang, x.terlambat]),
      ])
      return
    }
    unduhCsv(`peminjaman-alat-${dari}-${sampai}`, [
      ['Nomor', 'Alat', 'Jumlah', 'Peminjam', 'Keperluan', 'Tanggal pinjam', 'Rencana kembali', 'Status', 'Tanggal kembali', 'Kondisi saat kembali', 'Catatan', 'Dicatat oleh'],
      ...daftar.map((k) => [k.nomor, k.nama_barang, k.jumlah, k.peminjam_nama, k.keperluan, k.tanggal_pinjam, k.rencana_kembali,
        k.terlambat ? 'Terlambat' : label(STATUS_PINJAM, k.status), k.tanggal_kembali, kondisiKembali(k), k.catatan_kembali, k.dicatat_nama]),
    ])
  }

  if (memuat) return <Halaman judul="Peminjaman alat"><p className="catatan">Memuat data...</p></Halaman>
  const r = rekap?.ringkas
  return (
    <Halaman judul="Peminjaman alat" lead="Catatan peminjaman proyektor, sound system, dan alat lain oleh guru atau pegawai. Menggantikan buku manual. Alat yang kembali rusak atau hilang langsung memperbarui kondisi di inventaris.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}

      <div className="lencana-baris" style={{ marginBottom: 12 }}>
        <span className="lencana">Sedang dipinjam {angka(r?.sedang ?? 0)}</span>
        <span className="lencana">Terlambat {angka(r?.terlambat ?? 0)}</span>
        <span className="lencana">Peminjaman pada periode {angka(r?.periode ?? 0)}</span>
        <span className="lencana">Kembali bermasalah {angka(r?.bermasalah ?? 0)}</span>
      </div>

      {alat.length === 0 && (
        <p className="kartu" role="status">
          Belum ada alat di inventaris, jadi peminjaman belum bisa dicatat. Staf Sarpras perlu mengisi alat (kategori Alat, misalnya proyektor dan sound system) lebih dulu di <Link to="/portal/sarpras/inventaris">Inventaris</Link>.
        </p>
      )}
      {alat.length > 0 && alatBisa.length === 0 && <p className="catatan">Semua alat sedang dipinjam.</p>}
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={tab === 'daftar' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('daftar')}>Daftar peminjaman</button>
        <button className={tab === 'rekap' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('rekap')}>Rekap dan kondisi alat</button>
        {bisaCatat && alat.length > 0 && <button className="tombol tombol-isi" onClick={pinjamBaru}>Catat peminjaman</button>}
        <TombolIkon ikon="unduh" label="Unduh CSV" onClick={unduh} />
      </div>

      <div className="aksi" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Dari <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} /></label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Sampai <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} /></label>
        {tab === 'daftar' && (
          <>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">Semua status</option>
              {STATUS_PINJAM.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              <option value="terlambat">Terlambat</option>
            </select>
            <input type="search" placeholder="Cari alat, peminjam, atau nomor" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari" />
          </>
        )}
      </div>

      {form && (
        <form className="form kartu jarak" onSubmit={simpan} style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          <h3>Catat peminjaman</h3>
          <label>Alat
            <select value={form.barang_id ?? ''} onChange={(e) => setForm((x) => ({ ...x, barang_id: e.target.value }))}>
              <option value="">Pilih alat</option>
              {alatBisa.map((a) => <option key={a.id} value={a.id}>{a.nama}{a.kode_barang ? ` (${a.kode_barang})` : ''} · {a.lab_nama} · tersedia {angka(a.tersedia)} {a.satuan}</option>)}
            </select>
          </label>
          <div className="grid grid-2">
            <label>Peminjam
              <select value={teks(form.peminjam_ptk_id)} onChange={(e) => setForm((x) => ({ ...x, peminjam_ptk_id: e.target.value }))}>
                <option value="">Pilih guru atau tenaga kependidikan</option>
                {ptk.map((g) => <option key={g.id} value={g.id}>{g.nama}{g.jenis_ptk ? ` (${g.jenis_ptk})` : ''}</option>)}
              </select>
            </label>
            <label>Jumlah<input type="number" min={0} step="any" value={teks(form.jumlah)} onChange={(e) => setForm((x) => ({ ...x, jumlah: e.target.value }))} /></label>
          </div>
          <div className="grid grid-2">
            <label>Tanggal pinjam<input type="date" value={teks(form.tanggal_pinjam)} onChange={(e) => setForm((x) => ({ ...x, tanggal_pinjam: e.target.value }))} /></label>
            <label>Rencana kembali<input type="date" value={teks(form.rencana_kembali)} onChange={(e) => setForm((x) => ({ ...x, rencana_kembali: e.target.value }))} /></label>
          </div>
          <label>Keperluan (opsional)<input value={teks(form.keperluan)} onChange={(e) => setForm((x) => ({ ...x, keperluan: e.target.value }))} placeholder="Contoh: rapat orang tua, upacara, praktik kelas XI" /></label>
          <div className="aksi">
            <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
            <TombolIkon ikon="tutup" label="Batal" onClick={() => setForm(null)} />
          </div>
        </form>
      )}

      {kembali && pinjamKembali && (
        <div className="kartu jarak" style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
          <h3>Pengembalian: {pinjamKembali.nama_barang} ({pinjamKembali.nomor})</h3>
          <p className="catatan" style={{ margin: 0 }}>Dipinjam {pinjamKembali.peminjam_nama}, {angka(pinjamKembali.jumlah)} {pinjamKembali.satuan}. Kosongkan kolom kondisi bila semua kembali baik.</p>
          <div className="grid grid-2">
            <label>Tanggal kembali<input type="date" value={kembali.tanggal} onChange={(e) => setKembali({ ...kembali, tanggal: e.target.value })} /></label>
            <label>Rusak ringan<input type="number" min={0} step="any" value={kembali.rusak} onChange={(e) => setKembali({ ...kembali, rusak: e.target.value })} /></label>
            <label>Rusak berat<input type="number" min={0} step="any" value={kembali.berat} onChange={(e) => setKembali({ ...kembali, berat: e.target.value })} /></label>
            <label>Hilang<input type="number" min={0} step="any" value={kembali.hilang} onChange={(e) => setKembali({ ...kembali, hilang: e.target.value })} /></label>
          </div>
          <label>Catatan kondisi (wajib bila ada yang rusak atau hilang)<textarea rows={2} value={kembali.catatan} onChange={(e) => setKembali({ ...kembali, catatan: e.target.value })} /></label>
          <div className="aksi" style={{ marginTop: 0 }}>
            <button className="tombol tombol-isi" disabled={sibuk} onClick={simpanKembali}>Simpan pengembalian</button>
            <TombolIkon ikon="tutup" label="Batal" onClick={() => setKembali(null)} />
          </div>
        </div>
      )}

      {tab === 'daftar' && (
        <div className="jarak" style={{ display: 'grid', gap: 12 }}>
          {daftar.map((k) => (
            <article className="kartu" key={k.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>{k.nama_barang} <small>× {angka(k.jumlah)} {k.satuan}</small></h3>
                <span className="lencana">{k.terlambat ? 'Terlambat' : label(STATUS_PINJAM, k.status)}</span>
              </div>
              <p className="catatan" style={{ margin: '4px 0' }}>
                {k.nomor} · {k.peminjam_nama} · pinjam {tgl(k.tanggal_pinjam)}
                {k.rencana_kembali ? ` · rencana kembali ${tgl(k.rencana_kembali)}` : ''}
                {k.tanggal_kembali ? ` · kembali ${tgl(k.tanggal_kembali)}` : ''}
                {k.dicatat_nama ? ` · dicatat ${k.dicatat_nama}` : ''}
              </p>
              {k.keperluan && <p style={{ margin: '4px 0' }}>Keperluan: {k.keperluan}</p>}
              {k.status === 'dikembalikan' && <p style={{ margin: '4px 0' }}>Kondisi saat kembali: {kondisiKembali(k)}{k.catatan_kembali ? `. ${k.catatan_kembali}` : ''}</p>}
              {k.aksi.length > 0 && (
                <div className="aksi" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                  {k.aksi.includes('kembali') && <button className="tombol tombol-isi" disabled={sibuk} onClick={() => { setForm(null); setKembali({ id: k.id, rusak: '', berat: '', hilang: '', catatan: '', tanggal: hariIni() }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Catat pengembalian</button>}
                  {k.aksi.includes('batal') && <button className="tombol" disabled={sibuk} onClick={() => batalkan(k)}>Batalkan catatan</button>}
                </div>
              )}
            </article>
          ))}
          {daftar.length === 0 && <p className="catatan">Tidak ada catatan peminjaman yang cocok.</p>}
        </div>
      )}

      {tab === 'rekap' && rekap && (
        <>
          <h2 className="jarak">Per alat: frekuensi dipinjam dan kondisi saat ini</h2>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Alat</th><th>Lokasi</th><th>Kali dipinjam</th><th>Sedang dipinjam</th><th>Tersedia</th><th>Baik</th><th>Rusak ringan</th><th>Rusak berat</th><th>Hilang</th></tr></thead>
              <tbody>
                {rekap.per_alat.map((x) => <tr key={x.id}><td>{x.nama}</td><td>{x.lab_nama}</td><td>{angka(x.kali)}</td><td>{angka(x.dipinjam)}</td><td>{angka(x.tersedia)} {x.satuan}</td><td>{angka(x.jumlah_baik)}</td><td>{angka(x.jumlah_rusak)}</td><td>{angka(x.jumlah_rusak_berat)}</td><td>{angka(x.jumlah_hilang)}</td></tr>)}
                {rekap.per_alat.length === 0 && <tr><td colSpan={9} className="catatan">Belum ada alat yang dicatat di inventaris.</td></tr>}
              </tbody>
            </table>
          </div>
          <h2 className="jarak">Per peminjam</h2>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Peminjam</th><th>Kali pinjam</th><th>Sedang dipinjam</th><th>Terlambat</th></tr></thead>
              <tbody>
                {rekap.per_peminjam.map((x) => <tr key={x.nama}><td>{x.nama}</td><td>{angka(x.kali)}</td><td>{angka(x.sedang)}</td><td>{angka(x.terlambat)}</td></tr>)}
                {rekap.per_peminjam.length === 0 && <tr><td colSpan={4} className="catatan">Belum ada peminjaman.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

export default function SarprasPeminjaman() {
  return <GerbangSarpras perlu={['kelola', 'operasional', 'lihat']} judul="Peminjaman alat" aktif="/portal/sarpras/peminjaman">{(izin) => <Isi izin={izin} />}</GerbangSarpras>
}
