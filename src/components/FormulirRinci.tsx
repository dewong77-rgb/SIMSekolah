// Panel isian formulir rinci Dapodik (tabel anak F-PTK dan F-PD, formulir Sarpras), digerakkan oleh katalog di basis data.
// Setiap simpan dan hapus berlaku langsung di SIMS dan menjadi tagihan kerja operator Dapodik.
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { panggil } from '../lib/rpc'
import { muatKatalog, tampilNilai, type BarisF, type EntitasF, type KolomF } from '../lib/formulir'
import CetakFormulir, { TandaTangan } from './CetakFormulir'

type Props = {
  entitas: EntitasF
  semua: EntitasF[]
  owner: string | null
  bisaUbah: boolean
  /** Teks di bawah judul cetakan, misalnya nama pemilik data. */
  subjudul?: string
  /** Jabatan penandatangan kiri pada cetakan (Sarpras: Wakil Sarana Prasarana). */
  penandatanganKiri?: string
  tambahan?: React.ReactNode
  /** Dipanggil setelah data berubah, agar pemanggil dapat memuat ulang bila perlu. */
  berubah?: () => void
}

function Isian({ k, nilai, ubah, rujukan, induk }: { k: KolomF; nilai: string; ubah: (v: string) => void; rujukan: Record<string, BarisF[]>; induk: EntitasF[] }) {
  const id = `fr-${k.kunci}`
  if (k.tipe === 'pilihan') {
    const opsi = [...new Set([...(k.pilihan ?? []), ...(nilai ? [nilai] : [])])]
    return <select id={id} value={nilai} onChange={(e) => ubah(e.target.value)} required={k.wajib}><option value="">{k.wajib ? 'Pilih...' : '(kosong)'}</option>{opsi.map((o) => <option key={o}>{o}</option>)}</select>
  }
  if (k.tipe === 'rujukan') {
    const kolom = induk.find((e) => e.kode === k.rujukan)?.tampil_kolom ?? 'id'
    return (
      <select id={id} value={nilai} onChange={(e) => ubah(e.target.value)} required={k.wajib}>
        <option value="">(kosong)</option>
        {(rujukan[k.rujukan ?? ''] ?? []).map((b) => <option key={b.id} value={b.id}>{String(b[kolom] ?? b.id)}</option>)}
      </select>
    )
  }
  if (k.tipe === 'tanggal') return <input id={id} type="date" value={nilai} onChange={(e) => ubah(e.target.value)} required={k.wajib} />
  if (k.tipe === 'angka' || k.tipe === 'bulat') {
    return (
      <input id={id} type="number" inputMode="decimal" step={k.tipe === 'bulat' ? 1 : 'any'} min={k.min_nilai ?? 0} max={k.maks_nilai ?? undefined}
        value={nilai} onChange={(e) => ubah(e.target.value)} required={k.wajib} />
    )
  }
  return <input id={id} value={nilai} maxLength={300} autoComplete="off" onChange={(e) => ubah(e.target.value)} required={k.wajib} />
}

export default function EntitasPanel({ entitas, semua, owner, bisaUbah, subjudul, penandatanganKiri, tambahan, berubah }: Props) {
  const [baris, setBaris] = useState<BarisF[] | null>(null)
  const [rujukan, setRujukan] = useState<Record<string, BarisF[]>>({})
  const [edit, setEdit] = useState<BarisF | 'baru' | null>(null)
  const [nilai, setNilai] = useState<Record<string, string>>({})
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [cetak, setCetak] = useState(false)

  const rujukanKode = useMemo(() => [...new Set(entitas.kolom.filter((k) => k.tipe === 'rujukan' && k.rujukan).map((k) => k.rujukan as string))], [entitas])

  const muat = useCallback(async () => {
    try {
      const x = await panggil<BarisF[] | null>('formulir_daftar', { p_entitas: entitas.kode, p_owner: owner })
      setBaris(x ?? [])
      setGalat('')
      const r: Record<string, BarisF[]> = {}
      for (const kode of rujukanKode) r[kode] = (await panggil<BarisF[] | null>('formulir_daftar', { p_entitas: kode, p_owner: null })) ?? []
      setRujukan(r)
    } catch (e) { setGalat((e as Error).message); setBaris([]) }
  }, [entitas.kode, owner, rujukanKode])
  useEffect(() => { setBaris(null); setEdit(null); setInfo(''); void muat() }, [muat])

  function buka(b: BarisF | 'baru') {
    const awal: Record<string, string> = {}
    for (const k of entitas.kolom) {
      const v = b === 'baru' ? '' : b[k.kunci]
      awal[k.kunci] = v === null || v === undefined ? '' : k.tipe === 'tanggal' ? String(v).slice(0, 10) : String(v)
    }
    setNilai(awal); setEdit(b); setGalat(''); setInfo('')
  }

  /** Luas dihitung dari panjang x lebar selama pengguna belum mengetik luas sendiri. */
  function ubahIsian(kunci: string, v: string) {
    setNilai((n) => {
      const baru = { ...n, [kunci]: v }
      const luas = entitas.kolom.some((k) => k.kunci === 'luas_tapak') ? 'luas_tapak' : entitas.kolom.some((k) => k.kunci === 'luas') ? 'luas' : null
      if (luas && (kunci === 'panjang' || kunci === 'lebar')) {
        const p = Number(baru.panjang), l = Number(baru.lebar)
        const lama = Number(n.panjang) * Number(n.lebar)
        const otomatis = !n[luas] || Number(n[luas]) === Math.round(lama * 100) / 100
        if (otomatis && p > 0 && l > 0) baru[luas] = String(Math.round(p * l * 100) / 100)
      }
      return baru
    })
  }

  async function simpan(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat(''); setInfo('')
    try {
      await panggil('formulir_simpan', { p_entitas: entitas.kode, p_id: edit === 'baru' || !edit ? null : edit.id, p_owner: owner, p_data: nilai })
      setInfo('Tersimpan. Perubahan sudah berlaku di SIMS dan masuk antrean operator Dapodik.')
      setEdit(null); await muat(); berubah?.()
    } catch (x) { setGalat((x as Error).message) }
    setSibuk(false)
  }
  async function hapus(b: BarisF) {
    const nama = String(b[entitas.tampil_kolom] ?? 'baris ini')
    if (!window.confirm(`Hapus "${nama}"? Penghapusan juga menjadi tagihan operator Dapodik.`)) return
    setSibuk(true); setGalat(''); setInfo('')
    try { await panggil('formulir_hapus', { p_entitas: entitas.kode, p_id: b.id }); setInfo('Dihapus dari SIMS dan dicatat untuk operator Dapodik.'); await muat(); berubah?.() }
    catch (x) { setGalat((x as Error).message) }
    setSibuk(false)
  }

  const kolomTabel = entitas.kolom.filter((k) => k.tipe !== 'rujukan' || k.rujukan).slice(0, entitas.tampilan === 'lembar' ? 5 : 6)
  const sel = (k: KolomF, b: BarisF) => tampilNilai(k, b, rujukan, semua)

  return (
    <section aria-label={entitas.judul}>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {info && <p className="catatan sukses" role="status">{info}</p>}
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        {bisaUbah && !edit && <button className="tombol tombol-isi" onClick={() => buka('baru')}>Tambah {entitas.judul.toLowerCase()}</button>}
        <button className="tombol" disabled={!baris || baris.length === 0} onClick={() => setCetak(true)}>Cetak {entitas.kode_formulir}</button>
        {tambahan}
        <small className="catatan">{baris ? `${baris.length} baris` : 'Memuat...'}</small>
      </div>

      {edit && (
        <form className="kartu form jarak" onSubmit={simpan}>
          <h3>{edit === 'baru' ? `Tambah ${entitas.judul.toLowerCase()}` : `Ubah ${entitas.judul.toLowerCase()}`} <small className="catatan">({entitas.kode_formulir})</small></h3>
          <div className="grid grid-2">
            {entitas.kolom.map((k) => (
              <label key={k.kunci} htmlFor={`fr-${k.kunci}`}>
                <span>{k.butir ? `${k.butir}. ` : ''}{k.label}{k.wajib ? ' *' : ''}{k.satuan ? ` (${k.satuan})` : ''}</span>
                <Isian k={k} nilai={nilai[k.kunci] ?? ''} ubah={(v) => ubahIsian(k.kunci, v)} rujukan={rujukan} induk={semua} />
                {k.bantuan && <small className="petunjuk">{k.bantuan}</small>}
              </label>
            ))}
          </div>
          <div className="aksi">
            <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
            <button type="button" className="tombol" onClick={() => setEdit(null)}>Batal</button>
          </div>
        </form>
      )}

      {baris && baris.length > 0 && (
        <div className="tabel-bungkus jarak">
          <table>
            <thead><tr>{kolomTabel.map((k) => <th key={k.kunci}>{k.label}</th>)}{bisaUbah && <th />}</tr></thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.id}>
                  {kolomTabel.map((k) => <td key={k.kunci}>{sel(k, b) || <span className="catatan">-</span>}</td>)}
                  {bisaUbah && <td style={{ whiteSpace: 'nowrap' }}><button className="tombol" disabled={sibuk} onClick={() => buka(b)}>Ubah</button>{' '}<button className="tombol" disabled={sibuk} onClick={() => hapus(b)}>Hapus</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {baris && baris.length === 0 && !edit && <p className="catatan jarak">Belum ada data. {bisaUbah ? 'Pilih "Tambah" untuk mengisi.' : ''}</p>}

      {cetak && baris && (
        <CetakFormulir judul={entitas.tampilan === 'lembar' ? `Formulir ${entitas.judul}` : `${entitas.judul} (${entitas.kode_formulir})`} kode={entitas.kode_formulir} tutup={() => setCetak(false)}>
          {subjudul && <p style={{ margin: '0 0 6px', textAlign: 'center' }}>{subjudul}</p>}
          {entitas.tampilan === 'lembar' ? (
            baris.map((b, i) => (
              <Fragment key={b.id}>
                <div style={i > 0 ? { breakBefore: 'page', pageBreakBefore: 'always' } : undefined}>
                  <table>
                    <thead><tr><th style={{ width: 60 }}>No</th><th style={{ width: '34%' }}>Isian</th><th>Nilai</th></tr></thead>
                    <tbody>
                      {entitas.kolom.map((k) => (
                        <tr key={k.kunci}><td>{k.butir ?? ''}</td><td>{k.label}</td><td>{sel(k, b)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <TandaTangan jabatan="Kepala Sekolah" jabatanKiri={penandatanganKiri} />
                </div>
              </Fragment>
            ))
          ) : (
            <>
              <table>
                <thead><tr><th style={{ width: 36 }}>No</th>{entitas.kolom.filter((k) => k.tipe !== 'rujukan').map((k) => <th key={k.kunci}>{k.label}</th>)}</tr></thead>
                <tbody>
                  {baris.map((b, i) => <tr key={b.id}><td>{i + 1}</td>{entitas.kolom.filter((k) => k.tipe !== 'rujukan').map((k) => <td key={k.kunci}>{sel(k, b)}</td>)}</tr>)}
                </tbody>
              </table>
              <TandaTangan jabatan={entitas.domain === 'siswa' ? 'Orang Tua / Wali Siswa' : entitas.domain === 'ptk' ? 'Pendidik dan Tenaga Kependidikan' : 'Kepala Sekolah'} jabatanKiri={penandatanganKiri} />
            </>
          )}
        </CetakFormulir>
      )}
    </section>
  )
}

/** Data rinci F-PTK atau F-PD di bawah profil: satu tab per tabel anak. */
export function DataRinci({ domain, owner, bisaUbah, subjudul }: { domain: 'ptk' | 'siswa'; owner: string; bisaUbah: boolean; subjudul?: string }) {
  const [semua, setSemua] = useState<EntitasF[] | null>(null)
  const [aktif, setAktif] = useState('')
  const [galat, setGalat] = useState('')
  useEffect(() => { muatKatalog().then(setSemua).catch((e: Error) => setGalat(e.message)) }, [])
  const daftar = useMemo(() => (semua ?? []).filter((e) => e.domain === domain), [semua, domain])
  useEffect(() => { if (daftar.length && !daftar.some((e) => e.kode === aktif)) setAktif(daftar[0].kode) }, [daftar, aktif])
  if (galat) return <p className="catatan galat" role="alert">{galat}</p>
  if (!semua || daftar.length === 0) return null
  const e = daftar.find((x) => x.kode === aktif) ?? daftar[0]
  return (
    <section className="kartu jarak" aria-label="Data rinci formulir Dapodik">
      <h3>Data rinci ({domain === 'ptk' ? 'F-PTK' : 'F-PD'})</h3>
      <p className="catatan">{bisaUbah ? 'Isi atau perbaiki sesuai formulir Dapodik. Perubahan langsung tersimpan di SIMS dan diteruskan ke operator Dapodik untuk disalin ke Dapodik.' : 'Data rinci sesuai formulir Dapodik, hanya baca.'}</p>
      <div className="pilih-peran" role="tablist" style={{ flexWrap: 'wrap' }}>
        {daftar.map((x) => <button key={x.kode} role="tab" aria-selected={x.kode === e.kode} className={x.kode === e.kode ? 'aktif' : ''} onClick={() => setAktif(x.kode)}>{x.judul}</button>)}
      </div>
      <EntitasPanel key={e.kode + owner} entitas={e} semua={semua} owner={owner} bisaUbah={bisaUbah} subjudul={subjudul} />
    </section>
  )
}
