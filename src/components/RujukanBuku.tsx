import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { panggil } from '../lib/rpc'
import { alamatBaca, formatSitasi, rentangHalaman, type BukuPerpus, type Rujukan } from '../lib/perpustakaan'

/**
 * Bacaan dari perpustakaan digital pada satu pertemuan atau tugas.
 * - `kelola`: guru melampirkan atau melepas buku, dengan rentang halaman dan catatan.
 * - `sisip`: siswa mengutip buku (yang dilampirkan guru atau buku lain) ke kolom jawaban.
 */
export default function RujukanBuku({ jenis, id, kelola = false, sisip }: {
  jenis: 'pertemuan' | 'tugas'; id: string; kelola?: boolean; sisip?: (teks: string) => void
}) {
  const [daftar, setDaftar] = useState<Rujukan[] | null>(null)
  const [buku, setBuku] = useState<BukuPerpus[] | null>(null)
  const [galat, setGalat] = useState('')
  const [buka, setBuka] = useState(false)
  const [pilih, setPilih] = useState({ buku: '', mulai: '', akhir: '', catatan: '' })
  const [sibuk, setSibuk] = useState(false)
  const [kutip, setKutip] = useState({ buku: '', hal: '' })

  const muat = useCallback(async () => {
    try { setDaftar(await panggil<Rujukan[]>('perpus_rujukan_daftar', { p_jenis: jenis, p_id: id })) } catch (e) { setGalat((e as Error).message) }
  }, [jenis, id])
  useEffect(() => { void muat() }, [muat])
  useEffect(() => {
    if (!buka && !sisip) return
    if (buku) return
    panggil<BukuPerpus[]>('perpus_buku_daftar', { p_q: null, p_kategori: null, p_semua: false }).then(setBuku).catch(() => setBuku([]))
  }, [buka, sisip, buku])

  async function lampirkan(e: FormEvent) {
    e.preventDefault()
    setGalat(''); setSibuk(true)
    try {
      await panggil('perpus_rujukan_simpan', {
        p_jenis: jenis, p_id: id, p_buku: pilih.buku, p_mulai: pilih.mulai ? Number(pilih.mulai) : null,
        p_akhir: pilih.akhir ? Number(pilih.akhir) : null, p_catatan: pilih.catatan || null,
      })
      setPilih({ buku: '', mulai: '', akhir: '', catatan: '' }); setBuka(false); await muat()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  async function lepas(r: Rujukan) {
    if (!window.confirm(`Lepas "${r.judul}" dari ${jenis === 'tugas' ? 'tugas' : 'pertemuan'} ini?`)) return
    try { await panggil('perpus_rujukan_hapus', { p_rujukan: r.id }); await muat() } catch (er) { setGalat((er as Error).message) }
  }
  function kutipLain(e: FormEvent) {
    e.preventDefault()
    const b = (buku ?? []).find((x) => x.id === kutip.buku)
    if (b && sisip) { sisip(formatSitasi(b, kutip.hal || null)); setKutip({ buku: '', hal: '' }) }
  }

  if (!kelola && !sisip && (!daftar || daftar.length === 0)) return galat ? <p className="catatan galat" role="alert">{galat}</p> : null

  return (
    <div className="kartu jarak rujukan">
      <h3>Bacaan dari perpustakaan</h3>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {daftar?.length === 0 && <p className="catatan">{kelola ? 'Belum ada buku yang dilampirkan.' : 'Guru belum melampirkan buku.'}</p>}
      <ul className="rujukan-daftar">
        {(daftar ?? []).map((r) => (
          <li key={r.id}>
            <div>
              <Link to={alamatBaca(r.buku_id, r.hal_mulai)}><strong>{r.judul}</strong></Link>
              <small> {[r.penulis, rentangHalaman(r)].filter(Boolean).join(' · ')}</small>
              {r.catatan && <div className="catatan">{r.catatan}</div>}
            </div>
            <div className="aksi" style={{ marginTop: 0 }}>
              <Link to={alamatBaca(r.buku_id, r.hal_mulai)} className="tombol">Baca</Link>
              {sisip && <button type="button" className="tombol" onClick={() => sisip(formatSitasi(r, r.hal_mulai ? rentangHalaman(r).replace('hlm. ', '') : null))}>Kutip ke jawaban</button>}
              {kelola && <button type="button" className="tombol" style={{ color: '#8a1f1f', borderColor: '#8a1f1f' }} onClick={() => void lepas(r)}>Lepas</button>}
            </div>
          </li>
        ))}
      </ul>

      {kelola && !buka && <div className="aksi"><button type="button" className="tombol tombol-isi" onClick={() => setBuka(true)}>Lampirkan buku</button></div>}
      {kelola && buka && (
        <form className="form" onSubmit={lampirkan}>
          <label>Buku
            <select required value={pilih.buku} onChange={(e) => setPilih({ ...pilih, buku: e.target.value })}>
              <option value="">{buku ? 'Pilih buku' : 'Memuat...'}</option>
              {(buku ?? []).map((b) => <option key={b.id} value={b.id}>{b.judul}{b.penulis ? ` (${b.penulis})` : ''}</option>)}
            </select>
          </label>
          {buku?.length === 0 && <p className="catatan">Belum ada buku terbit di perpustakaan.</p>}
          <div className="grid grid-2">
            <label>Dari halaman (opsional)<input inputMode="numeric" pattern="[0-9]*" value={pilih.mulai} onChange={(e) => setPilih({ ...pilih, mulai: e.target.value.replace(/\D/g, '') })} /></label>
            <label>Sampai halaman (opsional)<input inputMode="numeric" pattern="[0-9]*" value={pilih.akhir} onChange={(e) => setPilih({ ...pilih, akhir: e.target.value.replace(/\D/g, '') })} /></label>
          </div>
          <label>Catatan untuk siswa (opsional)<input maxLength={300} value={pilih.catatan} onChange={(e) => setPilih({ ...pilih, catatan: e.target.value })} placeholder="Baca bab 2 sebelum mengerjakan nomor 3" /></label>
          <div className="aksi">
            <button className="tombol tombol-isi" disabled={sibuk || !pilih.buku}>{sibuk ? 'Menyimpan...' : 'Lampirkan'}</button>
            <button type="button" className="tombol" onClick={() => setBuka(false)}>Batal</button>
          </div>
        </form>
      )}

      {sisip && (
        <form className="form jarak" onSubmit={kutipLain}>
          <strong>Kutip buku lain dari perpustakaan</strong>
          <div className="grid grid-2">
            <label>Buku
              <select required value={kutip.buku} onChange={(e) => setKutip({ ...kutip, buku: e.target.value })}>
                <option value="">{buku ? 'Pilih buku' : 'Memuat...'}</option>
                {(buku ?? []).map((b) => <option key={b.id} value={b.id}>{b.judul}</option>)}
              </select>
            </label>
            <label>Halaman (opsional)<input value={kutip.hal} maxLength={20} onChange={(e) => setKutip({ ...kutip, hal: e.target.value })} placeholder="12 atau 12-14" /></label>
          </div>
          <div className="aksi"><button className="tombol" disabled={!kutip.buku}>Sisipkan rujukan ke jawaban</button></div>
        </form>
      )}
    </div>
  )
}
