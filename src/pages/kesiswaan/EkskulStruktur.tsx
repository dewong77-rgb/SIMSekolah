// Struktur organisasi satu ekskul (bagan berjenjang) dan penambahan anggota per rombel.
import { useEffect, useState } from 'react'
import TombolIkon from '../../components/TombolIkon'
import { supabase } from '../../lib/supabase'
import { panggil } from '../../lib/rpc'

export type Simpul = {
  id: string; induk_id: string | null; jabatan: string; urutan: number
  anggota_id: string | null; ptk_id: string | null; pemegang: string | null; rombel: string | null; jenis_pemegang: 'siswa' | 'guru' | null
}
type AnggotaRingkas = { id: string; nama: string; rombel: string | null; aktif: boolean }

type Draf = { id: string | null; induk: string; jabatan: string; urutan: number; pemegang: string }

function FormJabatan({ draf, simpul, anggota, guru, simpan, batal }: {
  draf: Draf; simpul: Simpul[]; anggota: AnggotaRingkas[]; guru: { id: string; nama: string }[]
  simpan: (d: Draf) => void; batal: () => void
}) {
  const [d, setD] = useState(draf)
  return (
    <form className="kartu form" style={{ maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); simpan(d) }}>
      <h4 style={{ margin: 0 }}>{d.id ? 'Ubah jabatan' : 'Jabatan baru'}</h4>
      <label>Nama jabatan<input value={d.jabatan} onChange={(e) => setD({ ...d, jabatan: e.target.value })} minLength={2} maxLength={80} required /></label>
      <label>Atasan langsung
        <select value={d.induk} onChange={(e) => setD({ ...d, induk: e.target.value })}>
          <option value="">Puncak struktur</option>
          {simpul.filter((s) => s.id !== d.id).map((s) => <option key={s.id} value={s.id}>{s.jabatan}</option>)}
        </select>
      </label>
      <label>Pemegang jabatan
        <select value={d.pemegang} onChange={(e) => setD({ ...d, pemegang: e.target.value })}>
          <option value="">Belum diisi</option>
          <optgroup label="Anggota (siswa)">
            {anggota.filter((a) => a.aktif).map((a) => <option key={a.id} value={`s:${a.id}`}>{a.nama}{a.rombel ? ` (${a.rombel})` : ''}</option>)}
          </optgroup>
          <optgroup label="Guru dan tenaga kependidikan">
            {guru.map((g) => <option key={g.id} value={`g:${g.id}`}>{g.nama}</option>)}
          </optgroup>
        </select>
      </label>
      <label>Urutan tampil<input type="number" min={0} max={999} value={d.urutan} onChange={(e) => setD({ ...d, urutan: Number(e.target.value) })} /></label>
      <p className="catatan" style={{ margin: 0 }}>Siswa harus terdaftar sebagai anggota aktif lebih dulu.</p>
      <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi">Simpan</button><button type="button" className="tombol" onClick={batal}>Batal</button></div>
    </form>
  )
}

function Cabang({ induk, semua, ubahBoleh, aksi }: {
  induk: string | null; semua: Simpul[]; ubahBoleh: boolean
  aksi: { tambah: (induk: string) => void; ubah: (s: Simpul) => void; hapus: (s: Simpul) => void }
}) {
  const anak = semua.filter((s) => s.induk_id === induk).sort((a, b) => a.urutan - b.urutan || a.jabatan.localeCompare(b.jabatan))
  if (anak.length === 0) return null
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: induk ? '0 0 0 18px' : 0, borderLeft: induk ? '2px solid var(--garis)' : 'none' }}>
      {anak.map((s) => (
        <li key={s.id} style={{ margin: '8px 0' }}>
          <div className="aksi" style={{ marginTop: 0, alignItems: 'center', gap: 8 }}>
            <div>
              <strong>{s.jabatan}</strong>
              <br />
              {s.pemegang
                ? <span>{s.pemegang}{s.jenis_pemegang === 'siswa' && s.rombel ? <small className="catatan"> · {s.rombel}</small> : null}{s.jenis_pemegang === 'guru' ? <small className="catatan"> · guru</small> : null}</span>
                : <small className="catatan">belum diisi</small>}
            </div>
            {ubahBoleh && <>
              <TombolIkon ikon="tambah" label="Tambah bawahan" onClick={() => aksi.tambah(s.id)} />
              <TombolIkon ikon="pena" label="Ubah" onClick={() => aksi.ubah(s)} />
              <TombolIkon ikon="sampah" label="Hapus" varian="bahaya" onClick={() => aksi.hapus(s)} />
            </>}
          </div>
          <Cabang induk={s.id} semua={semua} ubahBoleh={ubahBoleh} aksi={aksi} />
        </li>
      ))}
    </ul>
  )
}

export function StrukturOrganisasi({ ekskulId, struktur, anggota, ubahBoleh, muatUlang }: {
  ekskulId: string; struktur: Simpul[]; anggota: AnggotaRingkas[]; ubahBoleh: boolean; muatUlang: () => Promise<void>
}) {
  const [guru, setGuru] = useState<{ id: string; nama: string }[]>([])
  const [form, setForm] = useState<Draf | null>(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => {
    if (!ubahBoleh) return
    supabase.from('ptk').select('id,nama').order('nama').limit(1000).then(({ data }) => setGuru(data ?? []))
  }, [ubahBoleh])

  async function jalan(fn: () => Promise<unknown>) {
    setSibuk(true); setGalat('')
    try { await fn(); await muatUlang() } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }
  const simpan = (d: Draf) => jalan(async () => {
    await panggil('ekskul_struktur_simpan', {
      p_ekskul: ekskulId, p_id: d.id, p_induk: d.induk || null, p_jabatan: d.jabatan, p_urutan: d.urutan,
      p_anggota: d.pemegang.startsWith('s:') ? d.pemegang.slice(2) : null,
      p_ptk: d.pemegang.startsWith('g:') ? d.pemegang.slice(2) : null,
    })
    setForm(null)
  })
  const hapus = (s: Simpul) => {
    const bawahan = struktur.some((x) => x.induk_id === s.id)
    if (!window.confirm(`Hapus jabatan "${s.jabatan}"${bawahan ? ' beserta seluruh bawahannya' : ''}?`)) return
    void jalan(() => panggil('ekskul_struktur_hapus', { p_id: s.id }))
  }
  const standar = () => jalan(() => panggil('ekskul_struktur_standar', { p_ekskul: ekskulId }))
  const draf = (p: Partial<Draf>): Draf => ({ id: null, induk: '', jabatan: '', urutan: struktur.length + 1, pemegang: '', ...p })
  const aksi = {
    tambah: (induk: string) => setForm(draf({ induk })),
    ubah: (s: Simpul) => setForm(draf({ id: s.id, induk: s.induk_id ?? '', jabatan: s.jabatan, urutan: s.urutan, pemegang: s.anggota_id ? `s:${s.anggota_id}` : s.ptk_id ? `g:${s.ptk_id}` : '' })),
    hapus,
  }

  return (
    <div className="kartu">
      <h3>Struktur organisasi</h3>
      {galat && <p className="galat" role="alert">{galat}</p>}
      {struktur.length === 0 ? (
        <>
          <p className="catatan">Belum ada struktur untuk tahun ajaran ini.</p>
          {ubahBoleh && <button className="tombol tombol-isi" disabled={sibuk} onClick={standar}>Buat struktur standar</button>}
        </>
      ) : <Cabang induk={null} semua={struktur} ubahBoleh={ubahBoleh} aksi={aksi} />}
      {ubahBoleh && struktur.length > 0 && !form && <div className="aksi"><button className="tombol" onClick={() => setForm(draf({}))}>Tambah jabatan</button></div>}
      {form && <div className="jarak"><FormJabatan draf={form} simpul={struktur} anggota={anggota} guru={guru} simpan={simpan} batal={() => setForm(null)} /></div>}
    </div>
  )
}

type Rombel = { id: string; nama: string; tingkat: string | null; jumlah: number; sudah: number }

export function TambahPerRombel({ ekskulId, ubahDaftar }: { ekskulId: string; ubahDaftar: () => Promise<void> }) {
  const [rombel, setRombel] = useState<Rombel[]>([])
  const [pilih, setPilih] = useState('')
  const [pesan, setPesan] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muat = () => panggil<Rombel[]>('ekskul_rombel', { p_ekskul: ekskulId }).then(setRombel).catch((e: Error) => setGalat(e.message))
  useEffect(() => { void muat() }, [ekskulId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function tambah() {
    const r = rombel.find((x) => x.id === pilih)
    if (!r || !window.confirm(`Masukkan seluruh siswa aktif ${r.nama} (${r.jumlah} siswa) sebagai anggota?`)) return
    setSibuk(true); setGalat(''); setPesan('')
    try {
      const n = await panggil<number>('ekskul_anggota_tambah_rombel', { p_ekskul: ekskulId, p_rombel: pilih })
      setPesan(`${n} siswa ditambahkan dari ${r.nama}.`)
      await ubahDaftar(); await muat()
    } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }

  return (
    <div className="form">
      <label>Tambah satu rombel sekaligus
        <select value={pilih} onChange={(e) => setPilih(e.target.value)}>
          <option value="">Pilih rombel</option>
          {rombel.map((r) => <option key={r.id} value={r.id}>{r.nama} · {r.sudah}/{r.jumlah} sudah anggota</option>)}
        </select>
      </label>
      <button className="tombol" disabled={!pilih || sibuk} onClick={() => void tambah()}>Tambahkan seluruh rombel</button>
      {pesan && <p role="status" style={{ margin: 0 }}>{pesan}</p>}
      {galat && <p className="galat" role="alert" style={{ margin: 0 }}>{galat}</p>}
    </div>
  )
}
