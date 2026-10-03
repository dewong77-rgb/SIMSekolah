// Ajuan perubahan profil: formulir pengaju, riwayat "Ajuan saya", dan layar keputusan admin TU.
// Semua lewat fungsi basis data (ajukan_perubahan, ajuan_saya, batalkan_ajuan, ajuan_daftar, putuskan_ajuan, tandai_dapodik).
import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import Pager, { efektif } from '../components/Pager'
import { supabase } from '../lib/supabase'

type Kolom = {
  jenis: string; kunci: string; tabel: string; kolom: string; hubungan: string | null; label: string; kelompok: string
  tipe: 'teks' | 'angka' | 'tanggal' | 'pilihan'; pilihan: string[] | null; wajib: boolean; butuh_dokumen: boolean; terapkan: boolean; urutan: number
}
type Butir = { kunci: string; label: string; kelompok: string; lama: string | null; baru: string | null; butuh_dokumen: boolean; terapkan: boolean }
type Ajuan = {
  id: string; jenis: 'ptk' | 'siswa'; subjek_id: string; subjek_nama: string; pengaju_peran: string; perubahan: Butir[]; alasan: string
  butuh_dokumen: boolean; status: 'menunggu' | 'disetujui' | 'ditolak' | 'dibatalkan'; catatan_admin: string | null
  diputuskan_pada: string | null; sudah_di_dapodik: boolean; sudah_di_dapodik_pada: string | null; dibuat_pada: string
}
type Profil = { jenis: 'ptk' | 'siswa'; data: Record<string, unknown>; sensitif: Record<string, unknown>; disamarkan: boolean; orang_tua?: Record<string, unknown>[] }

const waktu = (t: string | null) => (t ? new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-')
const namaStatus = { menunggu: 'Menunggu', disetujui: 'Disetujui', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' } as const
const namaPengaju: Record<string, string> = { guru: 'Guru/tendik', siswa: 'Siswa', orang_tua: 'Orang tua' }
const namaJenis = { ptk: 'Guru/tendik', siswa: 'Siswa' } as const
const nilaiTampil = (kunci: string, x: string | null) => {
  if (x === null || x === '') return '(kosong)'
  if (kunci === 'jk') return x === 'L' ? 'Laki-laki' : x === 'P' ? 'Perempuan' : x
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return new Date(x + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  return x
}
const pesan = (e: { message: string } | null) => e?.message ?? 'Terjadi kesalahan.'

function Status({ s }: { s: Ajuan['status'] }) {
  return <span className={`status status-${s}`}>{namaStatus[s]}</span>
}

function TabelButir({ butir }: { butir: Butir[] }) {
  return (
    <div className="tabel-bungkus">
      <table>
        <thead><tr><th>Kolom</th><th>Sekarang</th><th>Diajukan</th></tr></thead>
        <tbody>
          {butir.map((b) => (
            <tr key={b.kunci}>
              <td>
                <strong>{/^Data (ayah|ibu|wali)/.test(b.kelompok) ? `${b.kelompok.replace('Data ', '').replace(/^./, (c) => c.toUpperCase())}: ` : ''}{b.label}</strong>
                {b.butuh_dokumen && <small className="petunjuk"> Perlu dokumen pendukung</small>}
                {!b.terapkan && <small className="petunjuk"> Diteruskan ke operator Dapodik, belum mengubah data SIMS</small>}
              </td>
              <td>{nilaiTampil(b.kunci, b.lama)}</td>
              <td><strong>{nilaiTampil(b.kunci, b.baru)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ------------------------------------------------------------------ formulir pengaju

export function FormAjuan() {
  const { jenis, id } = useParams()
  const nav = useNavigate()
  const valid = (jenis === 'ptk' || jenis === 'siswa') && !!id
  const [kolom, setKolom] = useState<Kolom[]>([])
  const [asal, setAsal] = useState<Record<string, string>>({})
  const [samarAsal, setSamarAsal] = useState<Record<string, string>>({})
  const [nilai, setNilai] = useState<Record<string, string>>({})
  const [nama, setNama] = useState('')
  const [alasan, setAlasan] = useState('')
  const [galat, setGalat] = useState('')
  const [memuat, setMemuat] = useState(true)
  const [sibuk, setSibuk] = useState(false)

  useEffect(() => {
    if (!valid) return
    let batal = false
    Promise.all([
      supabase.from('kolom_ajuan').select('*').eq('jenis', jenis).order('urutan'),
      supabase.rpc('profil_dapodik', { p_jenis: jenis, p_id: id }),
    ]).then(([k, p]) => {
      if (batal) return
      if (k.error || p.error || !p.data) {
        setGalat(k.error?.message ?? p.error?.message ?? 'Profil tidak ditemukan, atau Anda tidak berhak mengajukan perubahan.')
        setMemuat(false)
        return
      }
      const h = p.data as Profil
      const daftar = (k.data as Kolom[]) ?? []
      const a: Record<string, string> = {}
      const sm: Record<string, string> = {}
      for (const c of daftar) {
        let v: unknown
        if (c.tabel === 'ptk' || c.tabel === 'peserta_didik') v = h.data[c.kolom]
        else if (c.tabel.endsWith('_sensitif')) {
          if (h.disamarkan) { sm[c.kunci] = String(h.sensitif[c.kolom] ?? ''); v = '' } else v = h.sensitif[c.kolom]
        } else v = (h.orang_tua ?? []).find((o) => o.hubungan === c.hubungan)?.[c.kolom]
        a[c.kunci] = v === null || v === undefined ? '' : c.tipe === 'tanggal' ? String(v).slice(0, 10) : String(v)
      }
      setKolom(daftar); setAsal(a); setSamarAsal(sm); setNilai(a); setNama(String(h.data.nama ?? ''))
      setMemuat(false)
    })
    return () => { batal = true }
  }, [valid, jenis, id])

  const grup = useMemo(() => {
    const m = new Map<string, Kolom[]>()
    for (const c of kolom) m.set(c.kelompok, [...(m.get(c.kelompok) ?? []), c])
    return [...m.entries()]
  }, [kolom])
  const diubah = kolom.filter((c) => (nilai[c.kunci] ?? '').trim() !== (asal[c.kunci] ?? '').trim())
  const butuhDok = diubah.some((c) => c.butuh_dokumen)

  async function kirim(e: FormEvent) {
    e.preventDefault()
    setGalat('')
    if (diubah.length === 0) { setGalat('Belum ada data yang diubah.'); return }
    setSibuk(true)
    const { error } = await supabase.rpc('ajukan_perubahan', {
      p_jenis: jenis, p_subjek: id, p_alasan: alasan,
      p_perubahan: diubah.map((c) => ({ kunci: c.kunci, baru: (nilai[c.kunci] ?? '').trim() })),
    })
    setSibuk(false)
    if (error) { setGalat(pesan(error)); return }
    nav('/portal/ajuan', { state: { baru: true } })
  }

  if (!valid) return <Halaman judul="Ajukan perbaikan data"><p className="catatan">Alamat tidak valid.</p></Halaman>
  return (
    <Halaman judul="Ajukan perbaikan data" lead={nama ? `Untuk ${nama}. Ubah hanya kolom yang keliru, sisanya biarkan.` : undefined}>
      {memuat && <p className="catatan">Memuat formulir...</p>}
      {!memuat && kolom.length > 0 && (
        <form onSubmit={kirim}>
          <p className="catatan">
            Ajuan diperiksa admin TU sebelum berlaku. Perubahan identitas (nama, tanggal lahir, NIK, No. KK, dan sejenisnya) biasanya perlu dokumen pendukung. Unggah dokumen menyusul; sementara, siapkan KK atau akta untuk ditunjukkan ke admin.
          </p>
          <div className="grid grid-2 jarak">
            {grup.map(([judul, daftar]) => (
              <section key={judul} className="kartu form bagian-profil">
                <h3>{judul}</h3>
                {daftar.map((c) => {
                  const ubah = (nilai[c.kunci] ?? '').trim() !== (asal[c.kunci] ?? '').trim()
                  const opsi = c.tipe === 'pilihan' ? [...new Set([...(c.pilihan ?? []), ...(asal[c.kunci] ? [asal[c.kunci]] : [])])] : []
                  return (
                    <label key={c.kunci} className={ubah ? 'diubah' : undefined}>
                      <span>
                        {c.label}{c.wajib ? ' *' : ''}
                        {c.butuh_dokumen && <small className="petunjuk"> Perlu dokumen</small>}
                      </span>
                      {c.tipe === 'pilihan' ? (
                        <select value={nilai[c.kunci] ?? ''} onChange={(e) => setNilai({ ...nilai, [c.kunci]: e.target.value })}>
                          {!c.wajib && <option value="">(kosong)</option>}
                          {opsi.map((o) => <option key={o} value={o}>{c.kunci === 'jk' ? (o === 'L' ? 'Laki-laki' : 'Perempuan') : o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={c.tipe === 'tanggal' ? 'date' : c.tipe === 'angka' ? 'number' : 'text'}
                          step={c.tipe === 'angka' ? 'any' : undefined} min={c.tipe === 'angka' ? 0 : undefined}
                          maxLength={c.tipe === 'teks' ? 200 : undefined} autoComplete="off"
                          value={nilai[c.kunci] ?? ''} placeholder={samarAsal[c.kunci] ? `Saat ini ${samarAsal[c.kunci]}` : undefined}
                          onChange={(e) => setNilai({ ...nilai, [c.kunci]: e.target.value })}
                        />
                      )}
                      {!c.terapkan && ubah && <small className="petunjuk">Diteruskan ke operator Dapodik. Tampil di SIMS setelah data Dapodik diperbarui.</small>}
                    </label>
                  )
                })}
              </section>
            ))}
          </div>
          <section className="kartu form jarak">
            <label>
              <span>Alasan perubahan *</span>
              <textarea rows={3} maxLength={500} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Contoh: pindah alamat, salah ketik nama saat pendataan." />
            </label>
            {butuhDok && <p className="catatan" role="note">Ajuan ini memuat perubahan identitas. Admin dapat meminta dokumen pendukung sebelum menyetujui.</p>}
            <div aria-live="polite">{galat && <p className="catatan galat" role="alert">{galat}</p>}</div>
            <div className="aksi">
              <button className="tombol tombol-isi" disabled={sibuk || diubah.length === 0}>{sibuk ? 'Mengirim...' : `Kirim ajuan${diubah.length ? ` (${diubah.length} kolom)` : ''}`}</button>
              <button type="button" className="tombol" onClick={() => nav(-1)}>Batal</button>
            </div>
          </section>
        </form>
      )}
      {!memuat && kolom.length === 0 && galat && <p className="catatan galat" role="alert">{galat}</p>}
    </Halaman>
  )
}

// ------------------------------------------------------------------ ajuan saya

export function AjuanSaya() {
  const lokasi = useLocation()
  const baru = (lokasi.state as { baru?: boolean } | null)?.baru
  const [rows, setRows] = useState<Ajuan[] | null>(null)
  const [galat, setGalat] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let batal = false
    supabase.rpc('ajuan_saya').then(({ data, error }) => {
      if (batal) return
      if (error) setGalat(error.message)
      setRows((data as Ajuan[] | null) ?? [])
    })
    return () => { batal = true }
  }, [tick])

  async function batalkan(id: string) {
    if (!window.confirm('Batalkan ajuan ini?')) return
    const { error } = await supabase.rpc('batalkan_ajuan', { p_id: id })
    if (error) setGalat(pesan(error))
    setTick((n) => n + 1)
  }

  return (
    <Halaman judul="Ajuan saya" lead="Perbaikan data yang pernah diajukan dan keputusannya.">
      {baru && <p className="catatan sukses" role="status">Ajuan terkirim. Admin TU akan memeriksanya.</p>}
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {!rows && !galat && <p className="catatan">Memuat...</p>}
      {rows?.length === 0 && <p className="catatan">Belum ada ajuan. Buka profil Anda lalu pilih "Ajukan perbaikan data".</p>}
      <div className="daftar-ajuan">
        {rows?.map((a) => (
          <article key={a.id} className="kartu jarak">
            <header className="kepala-ajuan">
              <div><strong>{a.subjek_nama}</strong> <small>{namaJenis[a.jenis]}</small></div>
              <div><Status s={a.status} /> <small>{waktu(a.dibuat_pada)}</small></div>
            </header>
            <TabelButir butir={a.perubahan} />
            <p className="catatan jarak"><strong>Alasan:</strong> {a.alasan}</p>
            {a.catatan_admin && <p className="catatan"><strong>Catatan admin:</strong> {a.catatan_admin}</p>}
            {a.status === 'disetujui' && (
              <p className="catatan">
                Disetujui {waktu(a.diputuskan_pada)}.
                {a.perubahan.some((b) => b.terapkan) ? ' Perubahan sudah berlaku di SIMS.' : ''}
                {a.perubahan.some((b) => !b.terapkan) ? ' Perubahan identitas diteruskan ke operator Dapodik dan tampil setelah data Dapodik diperbarui.' : ''}
                {a.sudah_di_dapodik ? ' Sudah diperbaiki di Dapodik.' : ''}
              </p>
            )}
            {a.status === 'menunggu' && <div className="aksi jarak"><button className="tombol" onClick={() => batalkan(a.id)}>Batalkan ajuan</button></div>}
          </article>
        ))}
      </div>
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

// ------------------------------------------------------------------ keputusan admin TU

export function AjuanMasuk() {
  const [status, setStatus] = useState<'menunggu' | 'disetujui' | 'ditolak' | 'dibatalkan' | 'semua'>('menunggu')
  const [rows, setRows] = useState<Ajuan[] | null>(null)
  const [cari, setCari] = useState('')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [buka, setBuka] = useState<string | null>(null)
  const [catatan, setCatatan] = useState<Record<string, string>>({})
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let batal = false
    setRows(null)
    supabase.rpc('ajuan_daftar', { p_status: status === 'semua' ? null : status }).then(({ data, error }) => {
      if (batal) return
      if (error) setGalat(error.message)
      setRows((data as Ajuan[] | null) ?? [])
    })
    return () => { batal = true }
  }, [status, tick])

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    return (rows ?? []).filter((a) => !q || a.subjek_nama.toLowerCase().includes(q) || a.alasan.toLowerCase().includes(q))
  }, [rows, cari])
  const per = efektif(ukuran)
  const halaman = tampil.slice((hal - 1) * per, hal * per)
  const belumDapodik = (rows ?? []).filter((a) => a.status === 'disetujui' && !a.sudah_di_dapodik).length

  async function putuskan(a: Ajuan, setuju: boolean) {
    setGalat(''); setInfo(''); setSibuk(true)
    const { data, error } = await supabase.rpc('putuskan_ajuan', { p_id: a.id, p_setuju: setuju, p_catatan: catatan[a.id] ?? null })
    setSibuk(false)
    if (error) { setGalat(pesan(error)); return }
    const j = data as { status: string; diterapkan?: number; diteruskan_ke_dapodik?: number; berubah_sejak_ajuan?: number }
    setInfo(setuju
      ? `Disetujui untuk ${a.subjek_nama}: ${j.diterapkan ?? 0} kolom berlaku di SIMS${j.diteruskan_ke_dapodik ? `, ${j.diteruskan_ke_dapodik} kolom diteruskan ke operator Dapodik` : ''}.${j.berubah_sejak_ajuan ? ' Perhatian: sebagian nilai sudah berubah sejak diajukan.' : ''}`
      : `Ajuan ${a.subjek_nama} ditolak.`)
    setBuka(null)
    setTick((n) => n + 1)
  }

  async function tandai(a: Ajuan, nilai: boolean) {
    const { error } = await supabase.rpc('tandai_dapodik', { p_id: a.id, p_nilai: nilai })
    if (error) setGalat(pesan(error))
    setTick((n) => n + 1)
  }

  return (
    <Halaman judul="Ajuan perbaikan data" lead="Setujui atau tolak ajuan dari guru, siswa, dan orang tua.">
      <p className="catatan">
        Unggahan Dapodik berikutnya menimpa nilai SIMS dengan nilai Dapodik. Setelah menyetujui, perbaiki juga datanya di VervalPD atau aplikasi Dapodik, lalu centang "Sudah di Dapodik".
        {belumDapodik > 0 && <strong> {belumDapodik} ajuan disetujui belum ditandai di Dapodik.</strong>}
      </p>
      <div className="aksi jarak" style={{ alignItems: 'center' }}>
        <label className="catatan" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Status
          <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setHal(1); setBuka(null) }}>
            <option value="menunggu">Menunggu</option><option value="disetujui">Disetujui</option>
            <option value="ditolak">Ditolak</option><option value="dibatalkan">Dibatalkan</option><option value="semua">Semua</option>
          </select>
        </label>
        <input type="search" placeholder="Cari nama atau alasan" aria-label="Cari ajuan" value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ flex: '1 1 14rem', maxWidth: '24rem' }} />
      </div>
      <div aria-live="polite">
        {info && <p className="catatan sukses" role="status">{info}</p>}
        {galat && <p className="catatan galat" role="alert">{galat}</p>}
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Diajukan</th><th>Nama</th><th>Jenis</th><th>Pengaju</th><th>Kolom</th><th>Status</th></tr></thead>
          <tbody>
            {!rows && <tr><td colSpan={6}>Memuat...</td></tr>}
            {rows && halaman.length === 0 && <tr><td colSpan={6}>Tidak ada ajuan.</td></tr>}
            {halaman.map((a) => (
              <Fragment key={a.id}>
                <tr>
                  <td>{waktu(a.dibuat_pada)}</td>
                  <td><button className="tombol" style={{ padding: '2px 8px', color: 'var(--warna-utama)', textAlign: 'left' }} aria-expanded={buka === a.id} onClick={() => setBuka(buka === a.id ? null : a.id)}>{a.subjek_nama}</button></td>
                  <td>{namaJenis[a.jenis]}</td><td>{namaPengaju[a.pengaju_peran] ?? a.pengaju_peran}</td>
                  <td>{a.perubahan.length}{a.butuh_dokumen ? ' (perlu dokumen)' : ''}</td>
                  <td><Status s={a.status} />{a.status === 'disetujui' && a.sudah_di_dapodik ? <small> di Dapodik</small> : null}</td>
                </tr>
                {buka === a.id && (
                  <tr><td colSpan={6}>
                    <TabelButir butir={a.perubahan} />
                    <p className="catatan jarak"><strong>Alasan:</strong> {a.alasan}</p>
                    {a.butuh_dokumen && <p className="catatan">Memuat perubahan identitas. Minta KK, akta, atau ijazah dari pengaju sebelum menyetujui.</p>}
                    {a.catatan_admin && <p className="catatan"><strong>Catatan admin:</strong> {a.catatan_admin}</p>}
                    {a.status === 'menunggu' && (
                      <div className="form jarak">
                        <label><span>Catatan untuk pengaju (wajib bila menolak)</span>
                          <textarea rows={2} maxLength={500} value={catatan[a.id] ?? ''} onChange={(e) => setCatatan({ ...catatan, [a.id]: e.target.value })} />
                        </label>
                        <div className="aksi">
                          <button className="tombol tombol-isi" disabled={sibuk} onClick={() => putuskan(a, true)}>Setujui</button>
                          <button className="tombol" disabled={sibuk} onClick={() => putuskan(a, false)}>Tolak</button>
                        </div>
                      </div>
                    )}
                    {a.status === 'disetujui' && (
                      <label className="centang jarak">
                        <input type="checkbox" checked={a.sudah_di_dapodik} onChange={(e) => tandai(a, e.target.checked)} />
                        Sudah diperbaiki di Dapodik{a.sudah_di_dapodik_pada ? ` (${waktu(a.sudah_di_dapodik_pada)})` : ''}
                      </label>
                    )}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={tampil.length} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} />
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
