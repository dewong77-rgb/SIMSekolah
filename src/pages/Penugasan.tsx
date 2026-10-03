// Penugasan jabatan (super admin): usulan dari Dapodik, penugasan aktif, tambah manual, pengaturan jabatan, riwayat.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import Pager, { efektif } from '../components/Pager'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

type Jabatan = {
  kode: string; nama: string; kelompok: string; lingkup: 'sekolah' | 'kompetensi' | 'ruang' | 'rombel' | 'ekskul' | 'siswa'
  induk_kode: string | null; urutan: number; tampil_publik: boolean; satu_pemegang: boolean; bagan: boolean
  keterangan?: string | null; kedalaman?: number
}

// Urutan hierarki: jabatan tertinggi dulu, bawahan mengikuti atasannya, saudara menurut kolom urutan.
function urutkanHierarki(daftar: Jabatan[]): Jabatan[] {
  const ada = new Set(daftar.map((j) => j.kode))
  const anak = new Map<string | null, Jabatan[]>()
  for (const j of daftar) {
    const i = j.induk_kode && ada.has(j.induk_kode) && j.induk_kode !== j.kode ? j.induk_kode : null
    anak.set(i, [...(anak.get(i) ?? []), j])
  }
  const hasil: Jabatan[] = []
  const lihat = new Set<string>()
  const telusur = (i: string | null, d: number) => {
    for (const j of (anak.get(i) ?? []).sort((a, b) => a.urutan - b.urutan || a.nama.localeCompare(b.nama, 'id'))) {
      if (lihat.has(j.kode)) continue
      lihat.add(j.kode)
      hasil.push({ ...j, kedalaman: d })
      telusur(j.kode, d + 1)
    }
  }
  telusur(null, 0)
  for (const j of daftar) if (!lihat.has(j.kode)) hasil.push({ ...j, kedalaman: 0 })
  return hasil
}
type Ptk = { id: string; nama: string; jenis_ptk: string | null }
type Tugas = {
  id: string; ptk_id: string; jabatan_kode: string; lingkup_id: string | null; lingkup_label: string | null
  tahun_ajaran: string; sumber: string; status: 'usulan' | 'aktif' | 'selesai' | 'ditolak'
}
type Opsi = { id: string; label: string }
type Audit = { id: number; waktu: string; aksi: string; ringkasan: Record<string, string | null> | null }

const tahunAjaranSekarang = () => {
  const n = new Date()
  const y = n.getFullYear()
  return n.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}
const butuhLingkup = (j?: Jabatan) => !!j && ['kompetensi', 'ruang', 'rombel', 'ekskul'].includes(j.lingkup)
const namaLingkup: Record<string, string> = { kompetensi: 'Kompetensi keahlian', ruang: 'Nama bengkel atau laboratorium', rombel: 'Rombel', ekskul: 'Nama ekstrakurikuler' }
const TAB = ['usulan', 'aktif', 'tambah', 'jabatan', 'riwayat'] as const
type Tab = (typeof TAB)[number]
const judulTab: Record<Tab, string> = { usulan: 'Usulan', aktif: 'Penugasan aktif', tambah: 'Tambah', jabatan: 'Jabatan', riwayat: 'Riwayat' }

export default function PenugasanHalaman() {
  const { profil } = useAuth()
  const [tab, setTab] = useState<Tab>('usulan')
  const [ta, setTa] = useState(tahunAjaranSekarang())
  const [jabatan, setJabatan] = useState<Jabatan[]>([])
  const [izinJabatan, setIzinJabatan] = useState<Map<string, string[]>>(new Map())
  const [ptk, setPtk] = useState<Ptk[]>([])
  const [tugas, setTugas] = useState<Tugas[]>([])
  const [rombel, setRombel] = useState<Opsi[]>([])
  const [kompetensi, setKompetensi] = useState<Opsi[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [daftarTa, setDaftarTa] = useState<string[]>([tahunAjaranSekarang()])
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const mJabatan = useMemo(() => new Map(jabatan.map((j) => [j.kode, j])), [jabatan])
  const mPtk = useMemo(() => new Map(ptk.map((p) => [p.id, p])), [ptk])

  const muat = useCallback(async () => {
    const [j, ji, p, t, r, k, a, tas] = await Promise.all([
      supabase.from('jabatan').select('*').order('urutan'),
      supabase.from('jabatan_izin').select('jabatan_kode,izin_kode'),
      supabase.from('ptk').select('id,nama,jenis_ptk').order('nama').limit(1000),
      supabase.from('penugasan').select('id,ptk_id,jabatan_kode,lingkup_id,lingkup_label,tahun_ajaran,sumber,status').eq('tahun_ajaran', ta).limit(1000),
      supabase.from('rombel').select('id,nama').eq('jenis_rombel', 'Kelas Utama').order('nama').limit(300),
      supabase.from('kompetensi_keahlian').select('kompetensi_keahlian').order('kompetensi_keahlian').limit(100),
      supabase.from('audit_log').select('id,waktu,aksi,ringkasan').order('id', { ascending: false }).limit(100),
      supabase.from('penugasan').select('tahun_ajaran').limit(1000),
    ])
    const e = [j, ji, p, t, r, k, a, tas].find((x) => x.error)
    if (e?.error) { setGalat(e.error.message); return }
    setJabatan(urutkanHierarki((j.data ?? []) as Jabatan[]))
    const m = new Map<string, string[]>()
    for (const x of (ji.data ?? []) as { jabatan_kode: string; izin_kode: string }[]) m.set(x.jabatan_kode, [...(m.get(x.jabatan_kode) ?? []), x.izin_kode])
    setIzinJabatan(m)
    setPtk((p.data ?? []) as Ptk[])
    setTugas((t.data ?? []) as Tugas[])
    setRombel(((r.data ?? []) as { id: string; nama: string }[]).map((x) => ({ id: x.id, label: x.nama })))
    setKompetensi(((k.data ?? []) as { kompetensi_keahlian: string }[]).map((x) => ({ id: x.kompetensi_keahlian, label: x.kompetensi_keahlian })))
    setAudit((a.data ?? []) as Audit[])
    setDaftarTa([...new Set([tahunAjaranSekarang(), ...((tas.data ?? []) as { tahun_ajaran: string }[]).map((x) => x.tahun_ajaran)])].sort().reverse())
    setGalat('')
  }, [ta])
  useEffect(() => { void muat() }, [muat])

  async function jalankan(fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) {
    setSibuk(true); setInfo('')
    const { error } = await fn()
    if (error) setGalat(error.message)
    else { setGalat(''); if (ok) setInfo(ok); await muat() }
    setSibuk(false)
  }

  async function sinkron() {
    setSibuk(true); setInfo(''); setGalat('')
    const { data, error } = await supabase.rpc('sinkron_penugasan_dapodik')
    if (error) setGalat(error.message)
    else {
      const d = data as { wali_kelas_baru: number; wali_kelas_selesai: number; usulan_baru: number }
      setInfo(`Sinkron selesai: ${d.wali_kelas_baru} wali kelas baru, ${d.wali_kelas_selesai} wali kelas diakhiri, ${d.usulan_baru} usulan baru.`)
      await muat()
    }
    setSibuk(false)
  }

  const opsiLingkup = (j?: Jabatan): Opsi[] | null => (j?.lingkup === 'rombel' ? rombel : j?.lingkup === 'kompetensi' ? kompetensi : null)
  const usulan = tugas.filter((t) => t.status === 'usulan')
  const aktif = tugas.filter((t) => t.status === 'aktif')

  return (
    <Halaman judul="Penugasan" lead="Jabatan tambahan guru dan tendik, lengkap dengan lingkup dan tahun ajaran. Izin akses mengikuti jabatan.">
      <div className="aksi" style={{ alignItems: 'center' }}>
        <select value={ta} onChange={(e) => setTa(e.target.value)} aria-label="Tahun ajaran">
          {daftarTa.map((x) => <option key={x} value={x}>Tahun ajaran {x}</option>)}
        </select>
        <button className="tombol tombol-isi" disabled={sibuk || !profil} onClick={sinkron}>Sinkron dari Dapodik</button>
        <span className="catatan">Wali kelas diambil dari rombel. Tugas tambahan masuk sebagai usulan.</span>
      </div>
      {galat && <p className="kartu jarak" role="alert">Galat: {galat}</p>}
      {info && <p className="kartu jarak" role="status">{info}</p>}

      <div role="tablist" aria-label="Bagian penugasan" className="pilih-peran jarak">
        {TAB.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'aktif' : ''} onClick={() => setTab(t)}>
            {judulTab[t]}{t === 'usulan' && usulan.length > 0 ? ` (${usulan.length})` : t === 'aktif' ? ` (${aktif.length})` : ''}
          </button>
        ))}
      </div>

      <div className="jarak">
        {tab === 'usulan' && <TabUsulan usulan={usulan} mJabatan={mJabatan} mPtk={mPtk} opsiLingkup={opsiLingkup} sibuk={sibuk} jalankan={jalankan} setGalat={setGalat} setInfo={setInfo} muat={muat} />}
        {tab === 'aktif' && <TabAktif aktif={aktif} jabatan={jabatan} mJabatan={mJabatan} mPtk={mPtk} sibuk={sibuk} jalankan={jalankan} />}
        {tab === 'tambah' && <TabTambah ptk={ptk} jabatan={jabatan} ta={ta} npsn={profil?.npsn ?? ''} opsiLingkup={opsiLingkup} sibuk={sibuk} jalankan={jalankan} />}
        {tab === 'jabatan' && <TabJabatan jabatan={jabatan} izinJabatan={izinJabatan} sibuk={sibuk} jalankan={jalankan} />}
        {tab === 'riwayat' && <TabRiwayat audit={audit} mJabatan={mJabatan} mPtk={mPtk} />}
      </div>
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

type Umum = { sibuk: boolean; jalankan: (fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => Promise<void> }
type Peta = { mJabatan: Map<string, Jabatan>; mPtk: Map<string, Ptk> }

// ------------------------------------------------------------------ usulan
function TabUsulan({ usulan, mJabatan, mPtk, opsiLingkup, sibuk, jalankan, setGalat, setInfo, muat }: Peta & Umum & {
  usulan: Tugas[]; opsiLingkup: (j?: Jabatan) => Opsi[] | null; setGalat: (s: string) => void; setInfo: (s: string) => void; muat: () => Promise<void>
}) {
  const [pilih, setPilih] = useState<Record<string, string>>({})
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [cari, setCari] = useState('')
  const k = cari.trim().toLowerCase()
  const tampil = usulan.filter((t) => !k || [mPtk.get(t.ptk_id)?.nama, mJabatan.get(t.jabatan_kode)?.nama].some((x) => (x ?? '').toLowerCase().includes(k)))
  const per = efektif(ukuran)
  const irisan = tampil.slice((hal - 1) * per, hal * per)

  const lingkupDari = (t: Tugas) => pilih[t.id] ?? t.lingkup_id ?? ''
  const siap = (t: Tugas) => !butuhLingkup(mJabatan.get(t.jabatan_kode)) || lingkupDari(t) !== ''

  function labelDari(t: Tugas, id: string) {
    const o = opsiLingkup(mJabatan.get(t.jabatan_kode))?.find((x) => x.id === id)
    return o?.label ?? id
  }
  const setujui = (t: Tugas) => jalankan(() => {
    const id = lingkupDari(t)
    return supabase.from('penugasan').update({ status: 'aktif', lingkup_id: id || null, lingkup_label: id ? labelDari(t, id) : null }).eq('id', t.id)
  })
  const tolak = (t: Tugas) => jalankan(() => supabase.from('penugasan').update({ status: 'ditolak' }).eq('id', t.id))

  async function setujuiSemuaSiap() {
    const daftar = usulan.filter(siap)
    if (daftar.length === 0 || !window.confirm(`Setujui ${daftar.length} usulan yang sudah siap?`)) return
    setGalat(''); setInfo('')
    let ok = 0
    const gagal: string[] = []
    for (const t of daftar) {
      const id = lingkupDari(t)
      const { error } = await supabase.from('penugasan').update({ status: 'aktif', lingkup_id: id || null, lingkup_label: id ? labelDari(t, id) : null }).eq('id', t.id)
      if (error) gagal.push(`${mPtk.get(t.ptk_id)?.nama ?? '?'}: ${error.message}`)
      else ok++
    }
    setInfo(`${ok} usulan disetujui.${gagal.length ? ` ${gagal.length} gagal: ${gagal.slice(0, 3).join('; ')}` : ''}`)
    await muat()
  }

  return (
    <>
      <p className="catatan">Usulan berasal dari kolom tugas tambahan di Dapodik. Usulan yang membutuhkan lingkup (kompetensi, bengkel, ekskul) harus dilengkapi dulu sebelum disetujui.</p>
      <div className="aksi">
        <input type="search" placeholder="Cari nama atau jabatan" value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ minWidth: 260 }} aria-label="Cari" />
        <button className="tombol tombol-isi" disabled={sibuk || !usulan.some(siap)} onClick={setujuiSemuaSiap}>Setujui semua yang siap ({usulan.filter(siap).length})</button>
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Nama</th><th>Jabatan</th><th>Lingkup</th><th>Aksi</th></tr></thead>
          <tbody>
            {tampil.length === 0 && <tr><td colSpan={4}>Tidak ada usulan.</td></tr>}
            {irisan.map((t) => {
              const j = mJabatan.get(t.jabatan_kode)
              const opsi = opsiLingkup(j)
              return (
                <tr key={t.id}>
                  <td>{mPtk.get(t.ptk_id)?.nama ?? '-'}</td>
                  <td>{j?.nama ?? t.jabatan_kode}</td>
                  <td>
                    {!butuhLingkup(j) ? (j?.lingkup === 'siswa' ? <small>Daftar siswa asuh menyusul</small> : '-') : opsi ? (
                      <select value={lingkupDari(t)} onChange={(e) => setPilih({ ...pilih, [t.id]: e.target.value })} aria-label={`Lingkup ${mPtk.get(t.ptk_id)?.nama}`}>
                        <option value="">Pilih {namaLingkup[j!.lingkup].toLowerCase()}</option>
                        {opsi.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input value={lingkupDari(t)} placeholder={namaLingkup[j!.lingkup]} onChange={(e) => setPilih({ ...pilih, [t.id]: e.target.value })} aria-label={`Lingkup ${mPtk.get(t.ptk_id)?.nama}`} />
                    )}
                  </td>
                  <td>
                    <button className="tombol" style={{ padding: '4px 10px', color: 'var(--warna-utama)' }} disabled={sibuk || !siap(t)} onClick={() => setujui(t)}>Setujui</button>{' '}
                    <button className="tombol" style={{ padding: '4px 10px', color: '#a11' }} disabled={sibuk} onClick={() => tolak(t)}>Tolak</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={tampil.length} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} />
    </>
  )
}

// ------------------------------------------------------------------ aktif
function TabAktif({ aktif, jabatan, mJabatan, mPtk, sibuk, jalankan }: Peta & Umum & { aktif: Tugas[]; jabatan: Jabatan[] }) {
  const [filter, setFilter] = useState('')
  const [cari, setCari] = useState('')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const k = cari.trim().toLowerCase()
  const tampil = aktif
    .filter((t) => !filter || t.jabatan_kode === filter)
    .filter((t) => !k || [mPtk.get(t.ptk_id)?.nama, t.lingkup_label, mJabatan.get(t.jabatan_kode)?.nama].some((x) => (x ?? '').toLowerCase().includes(k)))
    .sort((a, b) => (mJabatan.get(a.jabatan_kode)?.urutan ?? 0) - (mJabatan.get(b.jabatan_kode)?.urutan ?? 0) || (a.lingkup_label ?? '').localeCompare(b.lingkup_label ?? '', 'id', { numeric: true }))
  const per = efektif(ukuran)
  const irisan = tampil.slice((hal - 1) * per, hal * per)
  return (
    <>
      <div className="aksi">
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setHal(1) }} aria-label="Filter jabatan">
          <option value="">Semua jabatan</option>
          {jabatan.map((j) => <option key={j.kode} value={j.kode}>{j.nama}</option>)}
        </select>
        <input type="search" placeholder="Cari nama, jabatan, atau lingkup" value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ minWidth: 260 }} aria-label="Cari" />
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Nama</th><th>Jabatan</th><th>Lingkup</th><th>Sumber</th><th>Aksi</th></tr></thead>
          <tbody>
            {tampil.length === 0 && <tr><td colSpan={5}>Tidak ada penugasan.</td></tr>}
            {irisan.map((t) => (
              <tr key={t.id}>
                <td>{mPtk.get(t.ptk_id)?.nama ?? '-'}</td>
                <td>{mJabatan.get(t.jabatan_kode)?.nama ?? t.jabatan_kode}</td>
                <td>{t.lingkup_label ?? '-'}</td>
                <td>{t.sumber === 'dapodik' ? 'Dapodik' : 'Manual'}</td>
                <td>
                  <button className="tombol" style={{ padding: '4px 10px', color: 'var(--warna-utama)' }} disabled={sibuk}
                    onClick={() => window.confirm('Akhiri penugasan ini?') && jalankan(() => supabase.from('penugasan').update({ status: 'selesai' }).eq('id', t.id))}>Akhiri</button>{' '}
                  <button className="tombol" style={{ padding: '4px 10px', color: '#a11' }} disabled={sibuk}
                    onClick={() => window.confirm('Hapus penugasan ini?') && jalankan(() => supabase.from('penugasan').delete().eq('id', t.id))}>Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={tampil.length} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} />
    </>
  )
}

// ------------------------------------------------------------------ tambah
function TabTambah({ ptk, jabatan, ta, npsn, opsiLingkup, sibuk, jalankan }: Umum & {
  ptk: Ptk[]; jabatan: Jabatan[]; ta: string; npsn: string; opsiLingkup: (j?: Jabatan) => Opsi[] | null
}) {
  const [cariPtk, setCariPtk] = useState('')
  const [ptkId, setPtkId] = useState('')
  const [kode, setKode] = useState('')
  const [lingkup, setLingkup] = useState('')
  const j = jabatan.find((x) => x.kode === kode)
  const opsi = opsiLingkup(j)
  const k = cariPtk.trim().toLowerCase()
  const daftarPtk = ptk.filter((p) => !k || p.nama.toLowerCase().includes(k))

  async function simpan() {
    const label = lingkup ? (opsi?.find((o) => o.id === lingkup)?.label ?? lingkup) : null
    await jalankan(() => supabase.from('penugasan').insert({ npsn, ptk_id: ptkId, jabatan_kode: kode, lingkup_id: lingkup || null, lingkup_label: label, tahun_ajaran: ta, sumber: 'manual', status: 'aktif' }), 'Penugasan ditambahkan.')
    setLingkup('')
  }

  return (
    <div className="kartu form" style={{ maxWidth: 560 }}>
      <h3>Tambah penugasan, tahun ajaran {ta}</h3>
      <label>Cari nama PTK<input type="search" value={cariPtk} onChange={(e) => setCariPtk(e.target.value)} placeholder="Ketik sebagian nama" /></label>
      <label>PTK
        <select value={ptkId} onChange={(e) => setPtkId(e.target.value)}>
          <option value="">Pilih PTK ({daftarPtk.length})</option>
          {daftarPtk.map((p) => <option key={p.id} value={p.id}>{p.nama}{p.jenis_ptk ? ` (${p.jenis_ptk})` : ''}</option>)}
        </select>
      </label>
      <label>Jabatan
        <select value={kode} onChange={(e) => { setKode(e.target.value); setLingkup('') }}>
          <option value="">Pilih jabatan</option>
          {jabatan.map((x) => <option key={x.kode} value={x.kode}>{x.nama}</option>)}
        </select>
      </label>
      {butuhLingkup(j) && (
        <label>{namaLingkup[j!.lingkup]}
          {opsi ? (
            <select value={lingkup} onChange={(e) => setLingkup(e.target.value)}>
              <option value="">Pilih</option>
              {opsi.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          ) : <input value={lingkup} onChange={(e) => setLingkup(e.target.value)} />}
        </label>
      )}
      {j?.lingkup === 'siswa' && <p className="catatan">Guru wali ditetapkan lebih dulu. Daftar siswa asuh ditambahkan bersama modul kesiswaan.</p>}
      {j?.satu_pemegang && <p className="catatan">Jabatan ini hanya boleh dipegang satu orang{j.lingkup !== 'sekolah' ? ' untuk setiap lingkup' : ''}.</p>}
      <button className="tombol tombol-isi" disabled={sibuk || !ptkId || !kode || (butuhLingkup(j) && !lingkup)} onClick={simpan}>Simpan penugasan</button>
    </div>
  )
}

// ------------------------------------------------------------------ jabatan
function TabJabatan({ jabatan, izinJabatan, sibuk, jalankan }: Umum & { jabatan: Jabatan[]; izinJabatan: Map<string, string[]> }) {
  const [saring, setSaring] = useState<'semua' | 'tampil' | 'sembunyi'>('semua')
  const [cari, setCari] = useState('')
  const ubah = (kode: string, nilai: Partial<Jabatan>) => jalankan(() => supabase.from('jabatan').update(nilai).eq('kode', kode))
  const [bukaForm, setBukaForm] = useState(false)
  const nTampil = jabatan.filter((j) => j.tampil_publik).length
  const k = cari.trim().toLowerCase()
  const daftar = jabatan.filter((j) =>
    (saring === 'semua' || (saring === 'tampil') === j.tampil_publik) && (!k || j.nama.toLowerCase().includes(k)))
  return (
    <>
      <p className="catatan">
        Sakelar Tampil/Sembunyi menentukan apakah jabatan muncul di halaman publik Struktur Organisasi. Jabatan yang disembunyikan tetap bisa diberi penugasan dan tetap memberi izin. Bawahannya naik ke bawah Kepala Sekolah.
      </p>
      <div className="jarak">
        <button type="button" className="tombol tombol-isi" aria-expanded={bukaForm} onClick={() => setBukaForm(!bukaForm)}>{bukaForm ? 'Tutup formulir' : 'Tambah jabatan baru'}</button>
      </div>
      {bukaForm && <FormJabatan jabatan={jabatan} sibuk={sibuk} jalankan={jalankan} selesai={() => setBukaForm(false)} />}
      <div className="bilah-filter jarak" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari jabatan" aria-label="Cari jabatan" />
        {([['semua', `Semua (${jabatan.length})`], ['tampil', `Tampil (${nTampil})`], ['sembunyi', `Disembunyikan (${jabatan.length - nTampil})`]] as const).map(([v, t]) => (
          <button key={v} type="button" className={'tombol' + (saring === v ? ' tombol-isi' : '')} aria-pressed={saring === v} onClick={() => setSaring(v)}>{t}</button>
        ))}
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Jabatan</th><th>Tampil di publik</th><th>Atasan</th><th>Urutan</th><th>Izin</th></tr></thead>
          <tbody>
            {daftar.length === 0 && <tr><td colSpan={5}>Tidak ada jabatan yang cocok.</td></tr>}
            {daftar.map((j) => (
              <tr key={j.kode} style={j.tampil_publik ? undefined : { opacity: 0.65 }}>
                <td style={{ paddingLeft: 12 + (saring === 'semua' && !k ? (j.kedalaman ?? 0) * 18 : 0) }}>
                  {j.nama}<br /><small>{j.kelompok} · Lingkup: {j.lingkup}</small>
                  {j.keterangan === 'manual' && (
                    <><br /><button type="button" className="tombol" style={{ padding: '2px 8px', color: '#a11', marginTop: 4 }} disabled={sibuk}
                      onClick={() => window.confirm(`Hapus jabatan "${j.nama}"? Hanya bisa jika belum dipakai.`) && jalankan(() => supabase.from('jabatan').delete().eq('kode', j.kode), 'Jabatan dihapus.')}>Hapus jabatan</button></>
                  )}
                </td>
                <td>
                  <button type="button" role="switch" aria-checked={j.tampil_publik} disabled={sibuk}
                    aria-label={`${j.tampil_publik ? 'Sembunyikan' : 'Tampilkan'} ${j.nama} di struktur organisasi publik`}
                    onClick={() => ubah(j.kode, { tampil_publik: !j.tampil_publik })}
                    className="tombol" style={{ padding: '4px 12px', minWidth: 120, ...(j.tampil_publik ? { background: 'var(--warna-utama)', color: '#fff' } : {}) }}>
                    {j.tampil_publik ? 'Tampil' : 'Disembunyikan'}
                  </button>
                </td>
                <td>
                  <select value={j.induk_kode ?? ''} disabled={sibuk} aria-label={`Atasan ${j.nama}`} onChange={(e) => ubah(j.kode, { induk_kode: e.target.value || null })}>
                    <option value="">Puncak bagan</option>
                    {jabatan.filter((x) => x.kode !== j.kode).map((x) => <option key={x.kode} value={x.kode}>{x.nama}</option>)}
                  </select>
                </td>
                <td>
                  <input type="number" defaultValue={j.urutan} style={{ width: 70 }} disabled={sibuk} aria-label={`Urutan ${j.nama}`}
                    onBlur={(e) => Number(e.target.value) !== j.urutan && ubah(j.kode, { urutan: Number(e.target.value) })} />
                </td>
                <td>{(izinJabatan.get(j.kode) ?? []).map((i) => <Fragment key={i}><code>{i}</code>{' '}</Fragment>)}{!(izinJabatan.get(j.kode) ?? []).length && '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ jabatan baru
const slug = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

function FormJabatan({ jabatan, sibuk, jalankan, selesai }: Umum & { jabatan: Jabatan[]; selesai: () => void }) {
  const [nama, setNama] = useState('')
  const [kelompok, setKelompok] = useState('')
  const [induk, setInduk] = useState('')
  const [lingkup, setLingkup] = useState<Jabatan['lingkup']>('sekolah')
  const [satu, setSatu] = useState(false)
  const [publik, setPublik] = useState(true)
  const kelompokAda = [...new Set(jabatan.map((j) => j.kelompok))]
  const kodeDasar = slug(nama)
  const kode = !kodeDasar ? '' : jabatan.some((j) => j.kode === kodeDasar) ? `${kodeDasar}_${jabatan.length + 1}` : kodeDasar
  const kembar = jabatan.some((j) => j.nama.trim().toLowerCase() === nama.trim().toLowerCase())

  async function simpan() {
    const saudara = jabatan.filter((j) => (j.induk_kode ?? '') === induk)
    const urutan = (saudara.length ? Math.max(...saudara.map((j) => j.urutan)) : (jabatan.find((j) => j.kode === induk)?.urutan ?? 0)) + 1
    await jalankan(() => supabase.from('jabatan').insert({
      kode, nama: nama.trim(), kelompok: kelompok.trim(), lingkup, induk_kode: induk || null, urutan,
      tampil_publik: publik, satu_pemegang: satu, bagan: true, keterangan: 'manual',
    }), 'Jabatan ditambahkan. Pilih jabatan ini di tab Tambah untuk menugaskan orangnya.')
    setNama('')
    selesai()
  }

  return (
    <div className="kartu form jarak" style={{ maxWidth: 560 }}>
      <h3>Jabatan baru</h3>
      <label>Nama jabatan<input value={nama} maxLength={80} onChange={(e) => setNama(e.target.value)} placeholder="Contoh: Koordinator BK" /></label>
      {kembar && <p className="catatan" role="alert">Nama ini sudah ada di daftar.</p>}
      <label>Kelompok
        <input list="daftar-kelompok" value={kelompok} onChange={(e) => setKelompok(e.target.value)} placeholder="Pilih atau ketik kelompok baru" />
        <datalist id="daftar-kelompok">{kelompokAda.map((x) => <option key={x} value={x} />)}</datalist>
      </label>
      <label>Atasan di bagan
        <select value={induk} onChange={(e) => setInduk(e.target.value)}>
          <option value="">Puncak bagan</option>
          {jabatan.map((x) => <option key={x.kode} value={x.kode}>{'\u00a0\u00a0'.repeat(x.kedalaman ?? 0)}{x.nama}</option>)}
        </select>
      </label>
      <label>Lingkup penugasan
        <select value={lingkup} onChange={(e) => setLingkup(e.target.value as Jabatan['lingkup'])}>
          <option value="sekolah">Seluruh sekolah</option>
          <option value="kompetensi">Per kompetensi keahlian</option>
          <option value="rombel">Per rombel</option>
          <option value="ruang">Per bengkel atau laboratorium</option>
          <option value="ekskul">Per ekstrakurikuler</option>
        </select>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={satu} onChange={(e) => setSatu(e.target.checked)} /> Hanya satu pemegang{lingkup !== 'sekolah' ? ' untuk setiap lingkup' : ''}</label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={publik} onChange={(e) => setPublik(e.target.checked)} /> Tampil di struktur organisasi publik</label>
      <p className="catatan">Jabatan baru belum memberi izin apa pun. Izin akses tetap diatur terpisah oleh pengelola sistem.</p>
      <button className="tombol tombol-isi" disabled={sibuk || !kode || !nama.trim() || !kelompok.trim() || kembar} onClick={simpan}>Simpan jabatan</button>
    </div>
  )
}

// ------------------------------------------------------------------ riwayat
function TabRiwayat({ audit, mJabatan, mPtk }: Peta & { audit: Audit[] }) {
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const per = efektif(ukuran)
  const irisan = audit.slice((hal - 1) * per, hal * per)
  const aksiLabel: Record<string, string> = { INSERT: 'Ditambahkan', UPDATE: 'Diubah', DELETE: 'Dihapus' }
  return (
    <>
      <div className="tabel-bungkus">
        <table>
          <thead><tr><th>Waktu</th><th>Aksi</th><th>Nama</th><th>Jabatan</th><th>Lingkup</th><th>Status</th></tr></thead>
          <tbody>
            {audit.length === 0 && <tr><td colSpan={6}>Belum ada perubahan.</td></tr>}
            {irisan.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.waktu).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{aksiLabel[a.aksi] ?? a.aksi}</td>
                <td>{mPtk.get(a.ringkasan?.ptk_id ?? '')?.nama ?? '-'}</td>
                <td>{mJabatan.get(a.ringkasan?.jabatan ?? '')?.nama ?? a.ringkasan?.jabatan ?? '-'}</td>
                <td>{a.ringkasan?.lingkup ?? '-'}</td>
                <td>{a.ringkasan?.status_lama ? `${a.ringkasan.status_lama} menjadi ${a.ringkasan.status}` : a.ringkasan?.status ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={audit.length} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} />
      <p className="catatan">Menampilkan 100 perubahan terakhir.</p>
    </>
  )
}
