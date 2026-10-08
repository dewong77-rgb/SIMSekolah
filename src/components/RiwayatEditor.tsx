// Bagian riwayat pada profil (anak, diklat, pendidikan formal, prestasi, dan seterusnya).
// Pemilik data menambah, mengubah, dan menghapus barisnya sendiri. Operator Dapodik menerima baris baru di antreannya.
import { useState, type FormEvent } from 'react'
import { panggil } from '../lib/rpc'
import { bagianUntuk, tampilIsi, type BagianRiwayat, type BarisRiwayat } from '../lib/formulir'
import TombolIkon from './TombolIkon'

type Props = {
  jenis: 'ptk' | 'siswa'
  subjekId: string
  baris: BarisRiwayat[]
  /** true bila pengguna boleh menambah dan mengubah (pemilik data atau orang tua). */
  bisaIsi: boolean
  muatUlang: () => void
}

function FormBaris({ bagian, awal, jenis, subjekId, id, tutup, muatUlang }: {
  bagian: BagianRiwayat; awal: Record<string, string>; jenis: string; subjekId: string; id?: string; tutup: () => void; muatUlang: () => void
}) {
  const [nilai, setNilai] = useState<Record<string, string>>(awal)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  async function simpan(e: FormEvent) {
    e.preventDefault()
    setGalat('')
    setSibuk(true)
    try {
      await panggil('riwayat_simpan', { p_jenis: jenis, p_subjek: subjekId, p_bagian: bagian.kunci, p_data: nilai, p_id: id ?? null })
      muatUlang()
      tutup()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  return (
    <form className="form kartu jarak" onSubmit={simpan}>
      <div className="grid grid-2">
        {bagian.kolom.map((c) => (
          <label key={c.kunci}>
            <span>{c.label}</span>
            {c.tipe === 'pilihan' ? (
              <select value={nilai[c.kunci] ?? ''} onChange={(e) => setNilai({ ...nilai, [c.kunci]: e.target.value })}>
                <option value="">(kosong)</option>
                {[...new Set([...(c.pilihan ?? []), ...(nilai[c.kunci] ? [nilai[c.kunci]] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={c.tipe === 'tanggal' ? 'date' : c.tipe === 'angka' ? 'number' : 'text'} min={c.tipe === 'angka' ? 0 : undefined} step={c.tipe === 'angka' ? 'any' : undefined}
                maxLength={200} autoComplete="off" value={nilai[c.kunci] ?? ''} onChange={(e) => setNilai({ ...nilai, [c.kunci]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
      <div aria-live="polite">{galat && <p className="catatan galat" role="alert">{galat}</p>}</div>
      <div className="aksi">
        <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        <TombolIkon ikon="tutup" label="Batal" onClick={tutup} />
      </div>
    </form>
  )
}

function Satu({ bagian, jenis, subjekId, baris, bisaIsi, muatUlang }: { bagian: BagianRiwayat; jenis: 'ptk' | 'siswa'; subjekId: string; baris: BarisRiwayat[]; bisaIsi: boolean; muatUlang: () => void }) {
  const [form, setForm] = useState<string | 'baru' | null>(null)
  const [galat, setGalat] = useState('')
  const hapus = async (id: string) => {
    if (!window.confirm('Hapus baris ini?')) return
    setGalat('')
    try { await panggil('riwayat_hapus', { p_id: id }); muatUlang() } catch (e) { setGalat((e as Error).message) }
  }
  if (!bisaIsi && baris.length === 0) return null
  return (
    <section className="kartu bagian-profil" aria-label={bagian.judul}>
      <h3>{bagian.judul}</h3>
      {baris.length === 0 && <p className="catatan"><span className="kosong">Belum diisi</span></p>}
      {baris.map((b, i) => (
        form === b.id ? (
          <FormBaris key={b.id} bagian={bagian} awal={b.data} jenis={jenis} subjekId={subjekId} id={b.id} tutup={() => setForm(null)} muatUlang={muatUlang} />
        ) : (
          <div key={b.id} className="baris-riwayat">
            <strong>{i + 1}.</strong>{' '}
            {bagian.kolom.filter((c) => b.data[c.kunci]).map((c) => (
              <span key={c.kunci} className="butir-riwayat"><small>{c.label}</small> {tampilIsi(b.data[c.kunci])}</span>
            ))}
            {b.sumber === 'mandiri' && <small className="petunjuk"> {b.status === 'baru' ? 'Menunggu diinput operator' : 'Sudah diinput ke Dapodik'}</small>}
            {bisaIsi && b.sumber === 'mandiri' && (
              <span className="aksi-ikon">
                <TombolIkon ikon="pena" label="Ubah baris" onClick={() => setForm(b.id)} />
                {b.status === 'baru' && <TombolIkon ikon="sampah" varian="bahaya" label="Hapus baris" onClick={() => hapus(b.id)} />}
              </span>
            )}
          </div>
        )
      ))}
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {bisaIsi && form === 'baru' && <FormBaris bagian={bagian} awal={{}} jenis={jenis} subjekId={subjekId} tutup={() => setForm(null)} muatUlang={muatUlang} />}
      {bisaIsi && form === null && <div className="aksi jarak"><button className="tombol" type="button" onClick={() => setForm('baru')}>Tambah baris</button></div>}
    </section>
  )
}

export default function RiwayatEditor({ jenis, subjekId, baris, bisaIsi, muatUlang }: Props) {
  return (
    <div className="grid grid-2 jarak">
      {bagianUntuk(jenis).map((b) => (
        <Satu key={b.kunci} bagian={b} jenis={jenis} subjekId={subjekId} baris={baris.filter((x) => x.bagian === b.kunci)} bisaIsi={bisaIsi} muatUlang={muatUlang} />
      ))}
    </div>
  )
}
