import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { unduhCsv } from '../../lib/hubin'
import {
  DDC, JENIS_BUKU, KATEGORI_UMUM, KONDISI, STATUS_EKSEMPLAR, SUMBER, TINGKAT, labelDari, labelJenis, nomorPanggil, type Eksemplar, type Fisik,
} from '../../lib/perpustakaan'
import { panggil, tgl } from '../../lib/rpc'

// Pendataan koleksi fisik: judul, eksemplar (jumlah, kondisi, status), dan ringkasan ketersediaan.

const kosong = {
  judul: '', penulis: '', penerbit: '', tahun_terbit: '', isbn: '', jenis_buku: 'buku_teks', kategori: 'Buku teks pelajaran', klasifikasi: '', nomor_panggil: '',
  edisi: '', kota_terbit: '', bahasa: 'Indonesia', subjek: '', mapel: '', tingkat: 'Semua', deskripsi: '', rak: '',
  jumlah_awal: '1', sumber_perolehan: 'beli', tanggal_perolehan: '', harga: '',
}

function FormFisik({ awal, selesai, batal }: { awal: Fisik | null; selesai: () => Promise<void>; batal: () => void }) {
  const [v, setV] = useState(awal ? {
    ...kosong, judul: awal.judul, penulis: awal.penulis ?? '', penerbit: awal.penerbit ?? '', tahun_terbit: awal.tahun_terbit?.toString() ?? '', isbn: awal.isbn ?? '',
    jenis_buku: awal.jenis_buku, kategori: awal.kategori, klasifikasi: awal.klasifikasi ?? '', nomor_panggil: awal.nomor_panggil ?? '', edisi: awal.edisi ?? '',
    kota_terbit: awal.kota_terbit ?? '', bahasa: awal.bahasa, subjek: awal.subjek ?? '', mapel: awal.mapel ?? '', tingkat: awal.tingkat ?? 'Semua',
    deskripsi: awal.deskripsi ?? '', rak: awal.rak ?? '',
  } : kosong)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const ubah = (k: keyof typeof kosong, x: string) => setV((p) => ({ ...p, [k]: x }))
  async function kirim(e: FormEvent) {
    e.preventDefault(); setGalat(''); setSibuk(true)
    try { await panggil('perpus_fisik_simpan', { p_id: awal?.id ?? null, p_data: v }); await selesai() } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <form className="kartu form jarak" onSubmit={kirim}>
      <h3>{awal ? 'Ubah data judul' : 'Tambah judul buku fisik'}</h3>
      <label>Judul<input required minLength={3} maxLength={200} value={v.judul} onChange={(e) => ubah('judul', e.target.value)} /></label>
      <div className="grid grid-2">
        <label>Penulis<input maxLength={200} value={v.penulis} onChange={(e) => ubah('penulis', e.target.value)} /></label>
        <label>Penerbit<input maxLength={200} value={v.penerbit} onChange={(e) => ubah('penerbit', e.target.value)} /></label>
        <label>Tahun terbit<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={v.tahun_terbit} onChange={(e) => ubah('tahun_terbit', e.target.value)} /></label>
        <label>ISBN<input maxLength={30} value={v.isbn} onChange={(e) => ubah('isbn', e.target.value)} /></label>
        <label>Jenis buku<select value={v.jenis_buku} onChange={(e) => ubah('jenis_buku', e.target.value)}>{JENIS_BUKU.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Kategori atau subjek<input list="kategori-fisik" required maxLength={60} value={v.kategori} onChange={(e) => ubah('kategori', e.target.value)} />
          <datalist id="kategori-fisik">{KATEGORI_UMUM.map((k) => <option key={k} value={k} />)}</datalist></label>
        <label>Kelas utama DDC
          <select value={v.klasifikasi ? v.klasifikasi.slice(0, 1) + '00' : ''} onChange={(e) => ubah('klasifikasi', e.target.value)}>
            <option value="">Pilih kelas</option>{DDC.map(([k, n]) => <option key={k} value={k}>{k} {n}</option>)}
          </select></label>
        <label>Nomor klasifikasi (DDC)<input inputMode="decimal" pattern="[0-9]{3}(\.[0-9]{1,8})?" maxLength={12} value={v.klasifikasi} onChange={(e) => ubah('klasifikasi', e.target.value)} placeholder="510 atau 005.133" /></label>
        <label>Nomor panggil
          <input maxLength={60} value={v.nomor_panggil} onChange={(e) => ubah('nomor_panggil', e.target.value)} placeholder="510 TIM m" />
          <button type="button" className="tombol" style={{ justifySelf: 'start' }} onClick={() => ubah('nomor_panggil', nomorPanggil(v.klasifikasi, v.penulis, v.judul))}>Susun otomatis</button></label>
        <label>Letak rak<input maxLength={60} value={v.rak} onChange={(e) => ubah('rak', e.target.value)} placeholder="A-2" /></label>
        <label>Edisi atau cetakan<input maxLength={60} value={v.edisi} onChange={(e) => ubah('edisi', e.target.value)} /></label>
        <label>Kota terbit<input maxLength={80} value={v.kota_terbit} onChange={(e) => ubah('kota_terbit', e.target.value)} /></label>
        <label>Bahasa<input maxLength={40} value={v.bahasa} onChange={(e) => ubah('bahasa', e.target.value)} /></label>
        <label>Mata pelajaran (opsional)<input maxLength={80} value={v.mapel} onChange={(e) => ubah('mapel', e.target.value)} /></label>
        <label>Tingkat<select value={v.tingkat} onChange={(e) => ubah('tingkat', e.target.value)}>{TINGKAT.map((t) => <option key={t} value={t}>{t === 'Semua' ? 'Semua tingkat' : `Kelas ${t}`}</option>)}</select></label>
      </div>
      <label>Kata kunci atau subjek tambahan<input maxLength={300} value={v.subjek} onChange={(e) => ubah('subjek', e.target.value)} /></label>
      <label>Deskripsi singkat<textarea rows={2} maxLength={2000} value={v.deskripsi} onChange={(e) => ubah('deskripsi', e.target.value)} /></label>
      {!awal && (
        <fieldset className="kartu form" style={{ margin: 0 }}>
          <legend>Eksemplar awal</legend>
          <div className="grid grid-2">
            <label>Jumlah eksemplar<input inputMode="numeric" required value={v.jumlah_awal} onChange={(e) => ubah('jumlah_awal', e.target.value.replace(/\D/g, ''))} />
              <span className="petunjuk">Nomor induk dibuat otomatis (FIS/tahun/0001). Isi 0 bila eksemplar didata nanti.</span></label>
            <label>Sumber perolehan<select value={v.sumber_perolehan} onChange={(e) => ubah('sumber_perolehan', e.target.value)}>{SUMBER.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label>Tanggal perolehan<input type="date" value={v.tanggal_perolehan} onChange={(e) => ubah('tanggal_perolehan', e.target.value)} /></label>
            <label>Harga satuan (Rp)<input inputMode="decimal" value={v.harga} onChange={(e) => ubah('harga', e.target.value.replace(/[^0-9.]/g, ''))} /></label>
          </div>
        </fieldset>
      )}
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      <div className="aksi">
        <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        <button type="button" className="tombol" onClick={batal} disabled={sibuk}>Batal</button>
      </div>
    </form>
  )
}

function BarisEksemplar({ e, muat }: { e: Eksemplar; muat: () => Promise<void> }) {
  const [kondisi, setKondisi] = useState<string>(e.kondisi)
  const [status, setStatus] = useState<string>(e.status)
  const [catatan, setCatatan] = useState(e.catatan ?? '')
  const [galat, setGalat] = useState('')
  const dipinjam = e.status === 'dipinjam'
  const berubah = kondisi !== e.kondisi || status !== e.status || catatan !== (e.catatan ?? '')
  async function simpan() {
    setGalat('')
    try { await panggil('perpus_eksemplar_ubah', { p_id: e.id, p_kondisi: kondisi, p_status: status, p_catatan: catatan }); await muat() } catch (er) { setGalat((er as Error).message) }
  }
  return (
    <tr>
      <td>{e.nomor_induk}<br /><small>{labelDari(SUMBER, e.sumber_perolehan)}{e.tanggal_perolehan ? ` · ${tgl(e.tanggal_perolehan)}` : ''}</small></td>
      <td>
        {dipinjam
          ? <><span className={`status ${e.terlambat ? 'status-ditolak' : 'status-menunggu'}`}>Dipinjam</span><br /><small>{e.peminjam}, jatuh tempo {tgl(e.jatuh_tempo)}</small></>
          : <select value={status} onChange={(x) => setStatus(x.target.value)} aria-label={`Status ${e.nomor_induk}`}>{STATUS_EKSEMPLAR.filter((s) => s[0] !== 'dipinjam').map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>}
      </td>
      <td><select value={kondisi} disabled={dipinjam} onChange={(x) => setKondisi(x.target.value)} aria-label={`Kondisi ${e.nomor_induk}`}>{KONDISI.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></td>
      <td><input value={catatan} maxLength={300} disabled={dipinjam} onChange={(x) => setCatatan(x.target.value)} aria-label={`Catatan ${e.nomor_induk}`} style={{ width: '100%' }} /></td>
      <td>
        {!dipinjam && <button type="button" className="tombol" disabled={!berubah} onClick={() => void simpan()}>Simpan</button>}
        {galat && <p className="catatan galat" role="alert">{galat}</p>}
      </td>
    </tr>
  )
}

function PanelEksemplar({ f, selesai }: { f: Fisik; selesai: () => Promise<void> }) {
  const [daftar, setDaftar] = useState<Eksemplar[] | null>(null)
  const [galat, setGalat] = useState('')
  const [tambah, setTambah] = useState({ jumlah: '1', sumber_perolehan: 'beli', tanggal_perolehan: '', harga: '', kondisi: 'baik' })
  const [sibuk, setSibuk] = useState(false)
  const muat = useCallback(async () => {
    try { setDaftar(await panggil<Eksemplar[]>('perpus_eksemplar_daftar', { p_fisik: f.id })); await selesai() } catch (e) { setGalat((e as Error).message) }
  }, [f.id, selesai])
  useEffect(() => { void muat() }, [muat])
  async function tambahkan(e: FormEvent) {
    e.preventDefault(); setGalat(''); setSibuk(true)
    try {
      await panggil('perpus_eksemplar_tambah', { p_fisik: f.id, p_jumlah: Number(tambah.jumlah), p_data: tambah })
      setTambah({ ...tambah, jumlah: '1' }); await muat()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <div className="kartu jarak">
      <h3>Eksemplar: {f.judul}</h3>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      <div className="tabel-bungkus"><table>
        <thead><tr><th>Nomor induk</th><th>Status</th><th>Kondisi</th><th>Catatan</th><th>Aksi</th></tr></thead>
        <tbody>
          {!daftar && <tr><td colSpan={5}>Memuat...</td></tr>}
          {daftar?.length === 0 && <tr><td colSpan={5} className="catatan">Belum ada eksemplar. Tambahkan di bawah.</td></tr>}
          {(daftar ?? []).map((e) => <BarisEksemplar key={`${e.id}-${e.status}-${e.kondisi}-${e.catatan}`} e={e} muat={muat} />)}
        </tbody>
      </table></div>
      <form className="form jarak" onSubmit={tambahkan}>
        <strong>Tambah eksemplar</strong>
        <div className="grid grid-3">
          <label>Jumlah<input inputMode="numeric" required value={tambah.jumlah} onChange={(e) => setTambah({ ...tambah, jumlah: e.target.value.replace(/\D/g, '') })} /></label>
          <label>Sumber<select value={tambah.sumber_perolehan} onChange={(e) => setTambah({ ...tambah, sumber_perolehan: e.target.value })}>{SUMBER.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label>Kondisi<select value={tambah.kondisi} onChange={(e) => setTambah({ ...tambah, kondisi: e.target.value })}>{KONDISI.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label>Tanggal perolehan<input type="date" value={tambah.tanggal_perolehan} onChange={(e) => setTambah({ ...tambah, tanggal_perolehan: e.target.value })} /></label>
          <label>Harga satuan (Rp)<input inputMode="decimal" value={tambah.harga} onChange={(e) => setTambah({ ...tambah, harga: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
        </div>
        <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk || !Number(tambah.jumlah)}>{sibuk ? 'Menambah...' : 'Tambah eksemplar'}</button></div>
      </form>
    </div>
  )
}

export default function KelolaFisik() {
  const [daftar, setDaftar] = useState<Fisik[] | null>(null)
  const [galat, setGalat] = useState('')
  const [form, setForm] = useState<Fisik | 'baru' | null>(null)
  const [buka, setBuka] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const muat = useCallback(async () => {
    try { setDaftar(await panggil<Fisik[]>('perpus_fisik_daftar', { p_q: null, p_semua: true })); setGalat('') } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])

  async function aktif(f: Fisik, a: boolean) {
    setGalat('')
    try { await panggil('perpus_fisik_aktif', { p_id: f.id, p_aktif: a }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  const t = (daftar ?? []).reduce((a, f) => ({
    jumlah: a.jumlah + Number(f.jumlah), tersedia: a.tersedia + Number(f.tersedia), dipinjam: a.dipinjam + Number(f.dipinjam), rusak: a.rusak + Number(f.rusak), hilang: a.hilang + Number(f.hilang),
  }), { jumlah: 0, tersedia: 0, dipinjam: 0, rusak: 0, hilang: 0 })
  const kata = q.trim().toLowerCase()
  const tampil = (daftar ?? []).filter((f) => !kata || [f.judul, f.penulis, f.rak, f.nomor_panggil, f.isbn].some((x) => x?.toLowerCase().includes(kata)))

  function unduh() {
    unduhCsv('koleksi-fisik', [
      ['Judul', 'Penulis', 'Penerbit', 'Tahun', 'ISBN', 'Jenis', 'Kategori', 'DDC', 'Nomor panggil', 'Rak', 'Eksemplar', 'Tersedia', 'Dipinjam', 'Rusak', 'Hilang', 'Status judul'],
      ...(daftar ?? []).map((f) => [f.judul, f.penulis, f.penerbit, f.tahun_terbit, f.isbn, labelJenis(f.jenis_buku), f.kategori, f.klasifikasi, f.nomor_panggil, f.rak, f.jumlah, f.tersedia, f.dipinjam, f.rusak, f.hilang, f.aktif ? 'Aktif' : 'Nonaktif']),
    ])
  }

  return (
    <div className="jarak">
      <div className="lencana-baris">
        <span className="lencana">{daftar?.length ?? 0} judul</span>
        <span className="lencana">{t.jumlah} eksemplar</span>
        <span className="lencana">{t.tersedia} tersedia</span>
        <span className="lencana">{t.dipinjam} dipinjam</span>
        <span className="lencana">{t.rusak} rusak</span>
        <span className="lencana">{t.hilang} hilang</span>
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {form
        ? <FormFisik key={form === 'baru' ? 'baru' : form.id} awal={form === 'baru' ? null : form} selesai={async () => { setForm(null); await muat() }} batal={() => setForm(null)} />
        : <div className="aksi"><button type="button" className="tombol tombol-isi" onClick={() => setForm('baru')}>Tambah judul</button><button type="button" className="tombol" onClick={unduh} disabled={!daftar}>Unduh CSV</button></div>}
      <label className="form" style={{ display: 'grid', gap: 6, fontWeight: 600 }}>Cari judul<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Judul, penulis, rak, ISBN" style={{ font: 'inherit', padding: '10px 12px', border: '1px solid #b9c1cd', borderRadius: 8 }} /></label>

      {!daftar && !galat && <p className="catatan">Memuat...</p>}
      {daftar?.length === 0 && !form && <div className="kartu jarak"><p className="catatan" style={{ margin: 0 }}>Belum ada buku fisik yang didata. Tekan Tambah judul, isi data, dan jumlah eksemplar.</p></div>}
      <div className="tabel-bungkus jarak"><table>
        <thead><tr><th>Judul</th><th>Rak</th><th>Eksemplar</th><th>Tersedia</th><th>Dipinjam</th><th>Rusak / hilang</th><th>Aksi</th></tr></thead>
        <tbody>
          {tampil.map((f) => (
            <tr key={f.id} style={f.aktif ? undefined : { opacity: 0.6 }}>
              <td><strong>{f.judul}</strong>{!f.aktif && <span className="status status-dibatalkan"> Nonaktif</span>}<br /><small>{[f.penulis, f.tahun_terbit, f.nomor_panggil].filter(Boolean).join(' · ')}</small></td>
              <td>{f.rak ?? '-'}</td><td>{f.jumlah}</td><td>{f.tersedia}</td><td>{f.dipinjam}</td><td>{f.rusak} / {f.hilang}</td>
              <td>
                <div className="aksi" style={{ marginTop: 0 }}>
                  <button type="button" className="tombol" onClick={() => setBuka(buka === f.id ? null : f.id)}>{buka === f.id ? 'Tutup eksemplar' : 'Eksemplar'}</button>
                  <button type="button" className="tombol" onClick={() => { setForm(f); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Ubah</button>
                  <button type="button" className="tombol" onClick={() => void aktif(f, !f.aktif)}>{f.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {buka && daftar?.find((f) => f.id === buka) && <PanelEksemplar f={daftar.find((f) => f.id === buka)!} selesai={muat} />}
    </div>
  )
}
