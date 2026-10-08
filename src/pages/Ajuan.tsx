// Ajuan perubahan profil: formulir pengaju, riwayat "Ajuan saya", dan layar keputusan admin TU.
// Alur: menunggu -> diteruskan (TU bagian setuju) -> dikerjakan (operator Dapodik) -> selesai (otomatis saat unggahan Dapodik cocok).
// Persetujuan tidak mengubah data SIMS. Data berubah hanya lewat unggahan Dapodik.
import TombolIkon from '../components/TombolIkon'
import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import Pager, { efektif } from '../components/Pager'
import { supabase } from '../lib/supabase'
import { panggil } from '../lib/rpc'
import { useAuth } from '../auth/AuthContext'

type StatusAjuan = 'menunggu' | 'diteruskan' | 'dikerjakan' | 'selesai' | 'ditolak' | 'dibatalkan'
type Jalur = 'langsung' | 'tu' | 'operator'
type JenisAjuan = 'ptk' | 'siswa' | 'rombel' | 'pembelajaran' | 'ekskul' | 'sarpras'
type Kolom = {
  jenis: string; kunci: string; tabel: string; kolom: string; hubungan: string | null; label: string; kelompok: string
  tipe: 'teks' | 'angka' | 'tanggal' | 'pilihan'; pilihan: string[] | null; label_pilihan?: Record<string, string> | null; wajib: boolean; butuh_dokumen: boolean; terapkan: boolean; urutan: number
  butir: string | null; bantuan: string | null; jalur: Jalur; min_nilai: number | null; maks_nilai: number | null
}
type Butir = { kunci: string; label: string; kelompok: string; butir?: string | null; lama: string | null; baru: string | null; butuh_dokumen: boolean; terapkan: boolean; jalur?: Jalur; diterapkan?: boolean }
type Ajuan = {
  id: string; jenis: JenisAjuan; subjek_id: string; subjek_nama: string; pengaju_peran: string; perubahan: Butir[]; alasan: string
  butuh_dokumen: boolean; status: StatusAjuan; catatan_admin: string | null; catatan_operator: string | null
  diputuskan_pada: string | null; dibuat_pada: string; bagian: string | null; belum_terbukti: boolean
  dikerjakan_pada: string | null; selesai_pada: string | null; diterapkan_pada?: string | null; aksi?: string[]
}
type Profil = { jenis: 'ptk' | 'siswa'; data: Record<string, unknown>; sensitif: Record<string, unknown>; disamarkan: boolean; orang_tua?: Record<string, unknown>[] }

const waktu = (t: string | null) => (t ? new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-')
const namaStatus: Record<StatusAjuan, string> = {
  menunggu: 'Menunggu TU', diteruskan: 'Menunggu operator Dapodik', dikerjakan: 'Dikerjakan operator', selesai: 'Selesai', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan',
}
const namaJalur: Record<Jalur, string> = {
  langsung: 'Berlaku langsung di SIMS',
  tu: 'Perlu persetujuan TU, lalu berlaku di SIMS',
  operator: 'Lewat operator Dapodik (kolom kunci identitas)',
}
const namaBagian: Record<string, string> = { kepegawaian: 'TU Kepegawaian', kesiswaan: 'TU Kesiswaan', kurikulum: 'Kurikulum', sarpras: 'Sarana dan prasarana' }
const namaPengaju: Record<string, string> = { guru: 'Guru/tendik', siswa: 'Siswa', orang_tua: 'Orang tua' }
const namaJenis: Record<JenisAjuan, string> = { ptk: 'Guru/tendik', siswa: 'Siswa', rombel: 'Rombel (F-ROMBEL)', pembelajaran: 'SK mengajar (F-ROMBEL)', ekskul: 'Ekskul (F-EKSKUL)', sarpras: 'Sarpras (formulir Dapodik)' }
const nilaiTampil = (kunci: string, x: string | null) => {
  if (x === null || x === '') return '(kosong)'
  if (kunci === 'jk') return x === 'L' ? 'Laki-laki' : x === 'P' ? 'Perempuan' : x
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return new Date(x + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  return x
}
const pesan = (e: { message: string } | null) => e?.message ?? 'Terjadi kesalahan.'

function Status({ s }: { s: StatusAjuan }) {
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
                {b.butir && <small className="petunjuk">{b.butir}. </small>}
                <strong>{/^Data (ayah|ibu|wali)/.test(b.kelompok) ? `${b.kelompok.replace('Data ', '').replace(/^./, (c) => c.toUpperCase())}: ` : ''}{b.label}</strong>
                {b.butuh_dokumen && <small className="petunjuk"> Perlu dokumen pendukung</small>}
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
  const adaTinjau = diubah.some((c) => c.jalur !== 'langsung')
  const adaLangsung = diubah.some((c) => c.jalur === 'langsung')

  async function kirim(e: FormEvent) {
    e.preventDefault()
    setGalat('')
    if (diubah.length === 0) { setGalat('Belum ada data yang diubah.'); return }
    if (adaTinjau && alasan.trim().length < 5) { setGalat('Tulis alasan perubahan, minimal 5 karakter, untuk kolom yang perlu persetujuan TU.'); return }
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
    <Halaman judul={jenis === 'ptk' ? 'Formulir PTK (F-PTK)' : 'Formulir peserta didik (F-PD)'} lead={nama ? `Untuk ${nama}. Nomor mengikuti formulir resmi Dapodik. Isi yang kosong atau ubah yang keliru, sisanya biarkan.` : undefined}>
      {memuat && <p className="catatan">Memuat formulir...</p>}
      {!memuat && kolom.length > 0 && (
        <form onSubmit={kirim}>
          <p className="catatan">
            Perubahan langsung berlaku di SIMS saat Anda mengirim, tanpa menunggu persetujuan. Setiap perubahan tercatat sebagai ajuan di TU Kepegawaian atau TU Kesiswaan dan masuk antrean operator Dapodik untuk disalin ke Dapodik. Nama, tanggal lahir, NIK dan NUPTK guru, serta NISN tidak bisa diubah langsung karena menjadi kunci pencocokan data Dapodik. Perubahan kolom itu diajukan ke operator. Siapkan KK, akta, atau ijazah bila diminta.
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
                        {c.butir ? `${c.butir}. ` : ''}{c.label}{c.wajib ? ' *' : ''}
                        <small className="petunjuk"> {namaJalur[c.jalur]}{c.butuh_dokumen ? ', perlu dokumen' : ''}</small>
                      </span>
                      {c.tipe === 'pilihan' ? (
                        <select value={nilai[c.kunci] ?? ''} onChange={(e) => setNilai({ ...nilai, [c.kunci]: e.target.value })}>
                          {!c.wajib && <option value="">(kosong)</option>}
                          {opsi.map((o) => <option key={o} value={o}>{c.kunci === 'jk' ? (o === 'L' ? 'Laki-laki' : 'Perempuan') : (c.label_pilihan?.[o] ?? o)}</option>)}
                        </select>
                      ) : (
                        <input
                          type={c.tipe === 'tanggal' ? 'date' : c.tipe === 'angka' ? 'number' : 'text'}
                          step={c.tipe === 'angka' ? 'any' : undefined} min={c.tipe === 'angka' ? (c.min_nilai ?? 0) : undefined} max={c.tipe === 'angka' && c.maks_nilai !== null ? c.maks_nilai : undefined}
                          maxLength={c.tipe === 'teks' ? 200 : undefined} autoComplete="off"
                          value={nilai[c.kunci] ?? ''} placeholder={samarAsal[c.kunci] ? `Saat ini ${samarAsal[c.kunci]}` : undefined}
                          onChange={(e) => setNilai({ ...nilai, [c.kunci]: e.target.value })}
                        />
                      )}
                      {c.bantuan && <small className="petunjuk">{c.bantuan}</small>}
                    </label>
                  )
                })}
              </section>
            ))}
          </div>
          <section className="kartu form jarak">
            <label>
              <span>Alasan perubahan{adaTinjau ? ' *' : ' (opsional)'}</span>
              <textarea rows={3} maxLength={500} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Contoh: pindah alamat, salah ketik nama saat pendataan." />
            </label>
            {adaLangsung && <p className="catatan" role="note">Perubahan ini langsung tersimpan di SIMS dan masuk antrean operator Dapodik.</p>}
            {butuhDok && <p className="catatan" role="note">Ajuan ini memuat perubahan yang perlu dokumen. Admin dapat meminta dokumen pendukung sebelum menyetujui.</p>}
            <div aria-live="polite">{galat && <p className="catatan galat" role="alert">{galat}</p>}</div>
            <div className="aksi">
              <button className="tombol tombol-isi" disabled={sibuk || diubah.length === 0}>{sibuk ? 'Menyimpan...' : `Simpan${diubah.length ? ` (${diubah.length} kolom)` : ''}`}</button>
              <TombolIkon ikon="tutup" label="Batal" onClick={() => nav(-1)} />
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
      {baru && <p className="catatan sukses" role="status">Tersimpan. Perubahan sudah berlaku di SIMS dan tercatat untuk operator Dapodik. Kolom kunci identitas menunggu keputusan TU bagian terkait.</p>}
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
            {a.catatan_operator && <p className="catatan"><strong>Catatan operator:</strong> {a.catatan_operator}</p>}
            <p className="catatan">
              {a.status === 'menunggu' && `Menunggu keputusan ${namaBagian[a.bagian ?? ''] ?? 'TU'}.`}
              {a.status === 'diteruskan' && (a.diterapkan_pada ? `Sudah berlaku di SIMS sejak ${waktu(a.diterapkan_pada)}. Menunggu operator Dapodik menyalinnya ke Dapodik.` : `Disetujui ${waktu(a.diputuskan_pada)}. Menunggu operator Dapodik memperbaiki datanya.`)}
              {a.status === 'dikerjakan' && (a.belum_terbukti ? 'Sedang dikerjakan. Data terbaru belum menunjukkan perubahan ini, operator akan memeriksanya lagi.' : 'Operator Dapodik sedang memperbaiki datanya.')}
              {a.status === 'selesai' && `Selesai ${waktu(a.selesai_pada)}. Data sudah tercatat di Dapodik.`}
            </p>
            {a.status === 'menunggu' && <div className="aksi jarak"><button className="tombol" onClick={() => batalkan(a.id)}>Batalkan ajuan</button></div>}
          </article>
        ))}
      </div>
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

// ------------------------------------------------------------------ antrean TU bagian dan operator Dapodik

export function AjuanMasuk() {
  const { profil } = useAuth()
  const [daftar, setDaftar] = useState<Ajuan[] | null>(null)
  const [tab, setTab] = useState<'keputusan' | 'operator' | 'riwayat'>('keputusan')
  const [cari, setCari] = useState('')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [buka, setBuka] = useState<string | null>(null)
  const [catatan, setCatatan] = useState('')
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    try { setDaftar((await panggil<Ajuan[] | null>('ajuan_daftar')) ?? []) } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])

  const dalamTab = (a: Ajuan) =>
    tab === 'keputusan' ? a.status === 'menunggu'
      : tab === 'operator' ? a.status === 'diteruskan' || a.status === 'dikerjakan'
        : !['menunggu', 'diteruskan', 'dikerjakan'].includes(a.status)
  const q = cari.trim().toLowerCase()
  const tampil = useMemo(
    () => (daftar ?? []).filter((a) => dalamTab(a) && (!q || a.subjek_nama.toLowerCase().includes(q) || a.alasan.toLowerCase().includes(q))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daftar, tab, q],
  )
  const per = efektif(ukuran)
  const halaman = tampil.slice((hal - 1) * per, hal * per)
  const jumlah = (t: 'keputusan' | 'operator') => (daftar ?? []).filter((a) => (t === 'keputusan' ? a.status === 'menunggu' : a.status === 'diteruskan' || a.status === 'dikerjakan')).length
  const bisaKerjakan = (daftar ?? []).some((a) => a.aksi?.includes('kerjakan')) || profil?.peran === 'admin_tu'

  async function jalankan(fn: string, args: Record<string, unknown>, ok: string) {
    setSibuk(true); setGalat(''); setInfo('')
    try { await panggil(fn, args); setInfo(ok); setBuka(null); setCatatan(''); await muat() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  async function cocokkan() {
    setSibuk(true); setGalat(''); setInfo('')
    try {
      const r = await panggil<{ selesai: number; belum_terbukti: number }>('cocokkan_ajuan')
      setInfo(`Pencocokan selesai: ${r.selesai} ajuan selesai, ${r.belum_terbukti} belum tampak di data.`)
      await muat()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  return (
    <Halaman judul="Ajuan perbaikan data" lead="Isian langsung dan ajuan yang disetujui TU masuk antrean operator sebagai tagihan kerja. Operator menyalinnya ke Dapodik, lalu mencentang selesai.">
      <div className="pilih-peran" role="tablist">
        {([['keputusan', 'Menunggu keputusan'], ['operator', 'Antrean operator Dapodik'], ['riwayat', 'Riwayat']] as const).map(([id, nama]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'aktif' : ''} onClick={() => { setTab(id); setHal(1); setBuka(null) }}>
            {nama}{id !== 'riwayat' ? ` (${jumlah(id)})` : ''}
          </button>
        ))}
      </div>
      <div aria-live="polite">
        {info && <p className="catatan sukses jarak" role="status">{info}</p>}
        {galat && <p className="catatan galat jarak" role="alert">{galat}</p>}
      </div>
      <div className="aksi jarak" style={{ alignItems: 'center' }}>
        <input type="search" placeholder="Cari nama atau alasan" aria-label="Cari ajuan" value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ flex: '1 1 14rem', maxWidth: '24rem' }} />
        {tab === 'operator' && bisaKerjakan && (
          <>
            <button className="tombol" disabled={sibuk} onClick={cocokkan}>Cocokkan dengan data terbaru</button>
            {profil?.peran === 'admin_tu' && <Link to="/portal/unggah" className="tombol" style={{ color: 'var(--warna-utama)' }}>Buka Unggah Dapodik</Link>}
          </>
        )}
      </div>
      {tab === 'operator' && <p className="catatan jarak">Salin nilai usulan ke aplikasi Dapodik atau VervalPD, lalu centang "Sudah di Dapodik". Alternatifnya ekspor ulang dan unggah di menu Unggah Dapodik; ajuan selesai otomatis bila nilai terbaru dari Dapodik sama dengan usulan. Kolom yang belum dibaca dari berkas Dapodik (misalnya NIY/NIGK dan data penugasan) hanya bisa ditutup dengan centang.</p>}

      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Diajukan</th><th>Nama</th><th>Bagian</th><th>Kolom</th><th>Status</th></tr></thead>
          <tbody>
            {!daftar && <tr><td colSpan={5}>Memuat...</td></tr>}
            {daftar && halaman.length === 0 && <tr><td colSpan={5}>Tidak ada ajuan.</td></tr>}
            {halaman.map((a) => (
              <Fragment key={a.id}>
                <tr>
                  <td>{waktu(a.dibuat_pada)}</td>
                  <td>
                    <button className="tombol" style={{ padding: '2px 8px', color: 'var(--warna-utama)', textAlign: 'left' }} aria-expanded={buka === a.id} onClick={() => { setBuka(buka === a.id ? null : a.id); setCatatan('') }}>{a.subjek_nama}</button>
                    <br /><small>{namaJenis[a.jenis]}, oleh {namaPengaju[a.pengaju_peran] ?? a.pengaju_peran}</small>
                  </td>
                  <td>{namaBagian[a.bagian ?? ''] ?? '-'}</td>
                  <td>{a.perubahan.length}{a.butuh_dokumen ? ' (perlu dokumen)' : ''}</td>
                  <td><Status s={a.status} />{a.belum_terbukti && a.status === 'dikerjakan' ? <small> belum tampak di data</small> : null}</td>
                </tr>
                {buka === a.id && (
                  <tr><td colSpan={5}>
                    <TabelButir butir={a.perubahan} />
                    <p className="catatan jarak"><strong>Alasan:</strong> {a.alasan}</p>
                    {a.butuh_dokumen && <p className="catatan">Memuat perubahan identitas. Minta KK, akta, atau ijazah dari pengaju sebelum menyetujui.</p>}
                    {a.catatan_admin && <p className="catatan"><strong>Catatan TU:</strong> {a.catatan_admin}</p>}
                    {a.catatan_operator && <p className="catatan"><strong>Catatan operator:</strong> {a.catatan_operator}</p>}
                    {(a.aksi ?? []).length > 0 && (
                      <div className="form jarak">
                        <label><span>Catatan {a.aksi?.includes('putuskan') ? '(wajib bila menolak)' : '(wajib bila mengembalikan)'}</span>
                          <textarea rows={2} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
                        </label>
                        <div className="aksi">
                          {a.aksi?.includes('putuskan') && (
                            <>
                              <button className="tombol tombol-isi" disabled={sibuk} onClick={() => jalankan('putuskan_ajuan', { p_id: a.id, p_setuju: true, p_catatan: catatan }, `Ajuan ${a.subjek_nama} diteruskan ke operator Dapodik.`)}>Setujui dan teruskan</button>
                              <TombolIkon ikon="tolak" label="Tolak" varian="bahaya" disabled={sibuk || catatan.trim().length < 3} onClick={() => jalankan('putuskan_ajuan', { p_id: a.id, p_setuju: false, p_catatan: catatan }, `Ajuan ${a.subjek_nama} ditolak.`)} />
                            </>
                          )}
                          {a.aksi?.includes('kerjakan') && (
                            <>
                              {a.status === 'diteruskan' && <button className="tombol" disabled={sibuk} onClick={() => jalankan('kerjakan_ajuan', { p_id: a.id, p_aksi: 'mulai', p_catatan: catatan }, 'Ajuan ditandai sedang dikerjakan.')}>Mulai kerjakan</button>}
                              <button className="tombol tombol-isi" disabled={sibuk} onClick={() => jalankan('kerjakan_ajuan', { p_id: a.id, p_aksi: 'selesai', p_catatan: catatan }, 'Ajuan ditandai selesai: sudah di Dapodik.')}>Sudah di Dapodik</button>
                              <button className="tombol" disabled={sibuk || catatan.trim().length < 3} onClick={() => jalankan('kerjakan_ajuan', { p_id: a.id, p_aksi: 'kembalikan', p_catatan: catatan }, 'Ajuan dikembalikan ke pengaju.')}>Kembalikan</button>
                            </>
                          )}
                        </div>
                      </div>
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
