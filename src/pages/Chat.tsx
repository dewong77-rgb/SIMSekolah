import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { panggil, tglJam } from '../lib/rpc'
import { biru, merah } from './lmsUtil'

// Chat sekolah. Semua data lewat fungsi basis data chat_*. Tabel chat tidak punya policy.
// Pembaruan memakai polling ringan (hanya saat tab terlihat) agar aman untuk batas koneksi paket gratis.

type Jenis = 'kelas' | 'tanya' | 'guru' | 'kanal'
type Ruang = {
  id: string; jenis: Jenis; akses: 'peserta' | 'pemantau'; judul: string
  pesan_terakhir_pada: string | null; pesan_terakhir: string | null; belum_dibaca: number
}
type Pesan = { id: string; dibuat_pada: string; pengirim: string; saya: boolean; dihapus: boolean; isi: string | null }
type GuruTanya = { ptk_id: string; nama: string; mapel: string | null; wali: boolean; terbuka: boolean }
type SiswaChat = { id: string; nama: string; rombel: string }
type PengaturanKelas = { id: string; mapel: string; rombel: string; mode: 'tertutup' | 'dibuka' | 'selalu' }
type Laporan = {
  id: string; status: 'baru' | 'ditinjau' | 'selesai'; alasan: string; dibuat_pada: string; catatan: string | null
  ruang_id: string; ruang: string; jenis: Jenis; pelapor: string; pengirim: string; isi: string; dibuat_pesan: string
}

const labelJenis: Record<Jenis, string> = { kelas: 'Kelas', tanya: 'Tanya guru', guru: 'Ruang guru', kanal: 'Kanal jabatan' }
const BATAS = 2000

const kapital = (n: string) => n.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())

function waktuPesan(iso: string): string {
  const d = new Date(iso)
  const sekarang = new Date()
  const hariIni = d.toDateString() === sekarang.toDateString()
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return hariIni ? jam : `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, ${jam}`
}

/** Memberi tahu menu portal agar menghitung ulang lencana belum dibaca. */
const kabarkanChat = () => window.dispatchEvent(new Event('sims:chat'))

/** Menjalankan fungsi berkala hanya saat tab terlihat, dan sekali saat tab kembali aktif. */
function useBerkala(fn: () => void, ms: number) {
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) ref.current() }, ms)
    const lihat = () => { if (!document.hidden) ref.current() }
    document.addEventListener('visibilitychange', lihat)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', lihat) }
  }, [ms])
}

export default function Chat() {
  const { ruangId } = useParams()
  const { profil } = useAuth()
  const peran = profil?.peran
  const [daftar, setDaftar] = useState<Ruang[] | null>(null)
  const [galat, setGalat] = useState('')

  const muat = useCallback(async () => {
    try { setDaftar(await panggil<Ruang[]>('chat_ruang_daftar')); setGalat('') } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])
  useBerkala(() => void muat(), 20000)

  const terpilih = daftar?.find((r) => r.id === ruangId) ?? null
  const bolehLaporan = peran === 'guru' || peran === 'admin_tu' || peran === 'staf'

  return (
    <Halaman judul="Chat" lead="Percakapan kelas, tanya guru, dan ruang guru. Wali kelas dan sekolah dapat membaca percakapan siswa.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className={'chat-tata' + (ruangId ? ' ada-ruang' : '')}>
        <aside className="chat-samping" aria-label="Daftar percakapan">
          <div className="aksi" style={{ marginTop: 0 }}>
            {peran === 'siswa' && <MulaiTanyaSiswa />}
            {peran === 'guru' && <MulaiTanyaGuru />}
            {bolehLaporan && <Link to="/portal/chat/laporan" className="tombol" style={biru}>Laporan pesan</Link>}
          </div>
          {peran === 'guru' && <PengaturanJamTanya />}
          <ul className="chat-daftar">
            {!daftar && <li className="catatan">Memuat...</li>}
            {daftar && daftar.length === 0 && (
              <li className="kartu"><p className="catatan">Belum ada percakapan.{peran === 'siswa' ? ' Pilih Tanya guru untuk memulai.' : ''}</p></li>
            )}
            {(daftar ?? []).map((r) => (
              <li key={r.id}>
                <Link to={`/portal/chat/${r.id}`} className={'chat-ruang' + (r.id === ruangId ? ' aktif' : '')} aria-current={r.id === ruangId ? 'page' : undefined}>
                  <span className="chat-ruang-atas">
                    <strong>{r.judul}</strong>
                    {r.belum_dibaca > 0 && <b className="angka" aria-label={`${r.belum_dibaca} belum dibaca`}>{r.belum_dibaca > 99 ? '99+' : r.belum_dibaca}</b>}
                  </span>
                  <small>
                    {labelJenis[r.jenis]}{r.akses === 'pemantau' ? ', pantauan' : ''}
                    {r.pesan_terakhir_pada ? `, ${waktuPesan(r.pesan_terakhir_pada)}` : ''}
                  </small>
                  {r.pesan_terakhir && <span className="chat-cuplikan">{r.pesan_terakhir}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <section className="chat-isi" aria-label="Percakapan">
          {ruangId && daftar && !terpilih && (
            <div className="kartu"><p>Percakapan tidak ditemukan atau Anda tidak memiliki akses.</p><Link to="/portal/chat">Kembali ke daftar</Link></div>
          )}
          {ruangId && terpilih && <Percakapan key={terpilih.id} ruang={terpilih} muatDaftar={muat} />}
          {!ruangId && (
            <div className="kartu chat-kosong">
              <p><strong>Pilih percakapan di sebelah kiri.</strong></p>
              <p className="catatan">Pesan di kelas dan Tanya guru dapat dibaca wali kelas dan sekolah. Gunakan untuk keperluan belajar.</p>
            </div>
          )}
        </section>
      </div>
    </Halaman>
  )
}

function Percakapan({ ruang, muatDaftar }: { ruang: Ruang; muatDaftar: () => Promise<void> }) {
  const { profil } = useAuth()
  const navigate = useNavigate()
  const [pesan, setPesan] = useState<Pesan[]>([])
  const [lama, setLama] = useState<Pesan[]>([])
  const [memuat, setMemuat] = useState(true)
  const [masihAda, setMasihAda] = useState(false)
  const [teks, setTeks] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [akses, setAkses] = useState<'peserta' | 'pemantau' | 'audit'>(ruang.akses)
  const [lapor, setLapor] = useState<{ id: string; alasan: string } | null>(null)
  const gulir = useRef<HTMLDivElement>(null)
  const dekatDasar = useRef(true)
  const terakhirId = useRef<string | null>(null)

  const muat = useCallback(async () => {
    try {
      const h = await panggil<{ akses: 'peserta' | 'pemantau' | 'audit'; pesan: Pesan[] }>('chat_pesan_daftar', { p_ruang: ruang.id, p_batas: 50 })
      setAkses(h.akses)
      setPesan(h.pesan)
      setMasihAda(h.pesan.length >= 50)
      setGalat('')
      const akhir = h.pesan[h.pesan.length - 1]
      if (akhir && akhir.id !== terakhirId.current) {
        terakhirId.current = akhir.id
        if (h.akses === 'peserta' && !document.hidden) {
          await panggil('chat_tandai_baca', { p_ruang: ruang.id })
          kabarkanChat()
          void muatDaftar()
        }
      }
    } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [ruang.id, muatDaftar])

  useEffect(() => { void muat() }, [muat])
  useBerkala(() => void muat(), 8000)

  // Tandai dibaca saat tab kembali terlihat.
  useEffect(() => {
    if (akses !== 'peserta') return
    const lihat = () => {
      if (document.hidden) return
      void panggil('chat_tandai_baca', { p_ruang: ruang.id }).then(() => { kabarkanChat(); void muatDaftar() }).catch(() => undefined)
    }
    document.addEventListener('visibilitychange', lihat)
    return () => document.removeEventListener('visibilitychange', lihat)
  }, [akses, ruang.id, muatDaftar])

  // Gulir ke bawah hanya bila pengguna memang sedang di dasar percakapan.
  useEffect(() => {
    const el = gulir.current
    if (el && dekatDasar.current) el.scrollTop = el.scrollHeight
  }, [pesan])

  function saatGulir() {
    const el = gulir.current
    if (el) dekatDasar.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function muatLama() {
    const semua = [...lama, ...pesan]
    const tertua = semua[0]
    if (!tertua) return
    try {
      const h = await panggil<{ pesan: Pesan[] }>('chat_pesan_daftar', { p_ruang: ruang.id, p_sebelum: tertua.dibuat_pada, p_batas: 50 })
      dekatDasar.current = false
      setLama((l) => [...h.pesan, ...l])
      if (h.pesan.length < 50) setMasihAda(false)
    } catch (e) { setGalat((e as Error).message) }
  }

  async function kirim(e?: FormEvent) {
    e?.preventDefault()
    const isi = teks.trim()
    if (!isi || sibuk) return
    setSibuk(true); setGalat(''); setInfo('')
    try {
      const h = await panggil<{ tenang: boolean }>('chat_kirim', { p_ruang: ruang.id, p_isi: isi })
      setTeks('')
      dekatDasar.current = true
      if (h.tenang) setInfo('Terkirim. Sekarang jam tenang (21.00 sampai 05.00 WIB), jadi penerima baru membacanya saat membuka chat.')
      await muat()
      void muatDaftar()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }

  function tekan(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void kirim() }
  }

  async function hapus(id: string) {
    if (!window.confirm('Hapus pesan ini? Pesan hilang dari tampilan, tetapi sekolah tetap menyimpan catatannya.')) return
    setGalat('')
    try { await panggil('chat_hapus', { p_pesan: id }); await muat(); void muatDaftar() } catch (e) { setGalat((e as Error).message) }
  }

  async function kirimLaporan(e: FormEvent) {
    e.preventDefault()
    if (!lapor) return
    setGalat('')
    try {
      await panggil('chat_lapor', { p_pesan: lapor.id, p_alasan: lapor.alasan })
      setLapor(null)
      setInfo('Laporan terkirim ke wali kelas dan TU Kesiswaan.')
    } catch (er) { setGalat((er as Error).message) }
  }

  const semua = [...lama, ...pesan]
  const bolehKirim = akses === 'peserta'
  const rombelRuang = ruang.jenis === 'kelas' || ruang.jenis === 'tanya'
  const guru = profil?.peran === 'guru'

  return (
    <div className="chat-panel">
      <div className="chat-kepala">
        <button type="button" className="tombol chat-kembali" style={biru} onClick={() => navigate('/portal/chat')}>Kembali</button>
        <div>
          <h2>{ruang.judul}</h2>
          <small>{labelJenis[ruang.jenis]}</small>
        </div>
      </div>

      {akses === 'pemantau' && <p className="catatan chat-banner">Anda memantau percakapan ini sebagai wali kelas. Hanya baca. Akses Anda tercatat.</p>}
      {akses === 'audit' && <p className="catatan chat-banner">Akses audit. Akses ini tercatat.</p>}
      {akses === 'peserta' && rombelRuang && ruang.jenis === 'tanya' && <p className="catatan chat-banner">Percakapan ini dapat dibaca wali kelas dan sekolah.</p>}
      {akses === 'peserta' && ruang.jenis === 'kelas' && <p className="catatan chat-banner">Semua anggota kelas membaca pesan di sini. Wali kelas dan sekolah juga dapat membacanya.</p>}

      <div className="chat-pesan" ref={gulir} onScroll={saatGulir} role="log" aria-live="polite" aria-label="Pesan">
        {masihAda && <button type="button" className="tombol chat-lama" style={biru} onClick={() => void muatLama()}>Muat pesan lebih lama</button>}
        {memuat && <p className="catatan">Memuat...</p>}
        {!memuat && semua.length === 0 && <p className="catatan">Belum ada pesan. Mulai percakapan di bawah.</p>}
        {semua.map((p) => (
          <div key={p.id} className={'gelembung' + (p.saya ? ' saya' : '') + (p.dihapus ? ' dihapus' : '')}>
            <small className="gelembung-nama">{p.saya ? 'Anda' : kapital(p.pengirim)}, {waktuPesan(p.dibuat_pada)}</small>
            {p.dihapus && p.isi === null
              ? <p className="gelembung-isi"><em>Pesan dihapus</em></p>
              : <p className="gelembung-isi">{p.isi}{p.dihapus && <small> (dihapus)</small>}</p>}
            {!p.dihapus && (
              <span className="gelembung-aksi">
                {!p.saya && <button type="button" className="tautan-kecil" onClick={() => setLapor({ id: p.id, alasan: '' })}>Laporkan</button>}
                {(p.saya || (guru && akses === 'peserta' && rombelRuang)) && <button type="button" className="tautan-kecil" style={merah} onClick={() => void hapus(p.id)}>Hapus</button>}
              </span>
            )}
          </div>
        ))}
      </div>

      {lapor && (
        <form className="kartu form" onSubmit={kirimLaporan}>
          <label>Alasan laporan<textarea required minLength={3} maxLength={500} rows={2} value={lapor.alasan} onChange={(e) => setLapor({ ...lapor, alasan: e.target.value })} /></label>
          <div className="aksi" style={{ marginTop: 0 }}>
            <button className="tombol tombol-isi">Kirim laporan</button>
            <button type="button" className="tombol" style={biru} onClick={() => setLapor(null)}>Batal</button>
          </div>
        </form>
      )}

      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {info && <p className="catatan sukses" role="status">{info}</p>}

      {bolehKirim ? (
        <form className="chat-kirim" onSubmit={kirim}>
          <label className="sr-saja" htmlFor="chat-teks">Tulis pesan</label>
          <textarea
            id="chat-teks" rows={2} maxLength={BATAS} value={teks} placeholder="Tulis pesan. Ctrl+Enter untuk kirim."
            onChange={(e) => setTeks(e.target.value)} onKeyDown={tekan}
          />
          <div className="chat-kirim-bawah">
            <small className="catatan">{teks.length > BATAS - 200 ? `${BATAS - teks.length} karakter tersisa` : ''}</small>
            <button className="tombol tombol-isi" disabled={sibuk || !teks.trim()}>{sibuk ? 'Mengirim...' : 'Kirim'}</button>
          </div>
        </form>
      ) : (
        <p className="catatan">Anda tidak dapat mengirim pesan di percakapan ini.</p>
      )}
    </div>
  )
}

function MulaiTanyaSiswa() {
  const navigate = useNavigate()
  const [buka, setBuka] = useState(false)
  const [guru, setGuru] = useState<GuruTanya[] | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    if (!buka || guru) return
    panggil<GuruTanya[]>('chat_guru_untuk_saya').then(setGuru).catch((e: Error) => setGalat(e.message))
  }, [buka, guru])
  async function mulai(id: string) {
    setGalat('')
    try { const rid = await panggil<string>('chat_mulai_tanya', { p_guru: id }); navigate(`/portal/chat/${rid}`) } catch (e) { setGalat((e as Error).message) }
  }
  return (
    <div style={{ width: '100%' }}>
      <button type="button" className="tombol tombol-isi" aria-expanded={buka} onClick={() => setBuka(!buka)}>{buka ? 'Tutup' : 'Tanya guru'}</button>
      {buka && (
        <div className="kartu jarak">
          {galat && <p className="catatan galat" role="alert">{galat}</p>}
          {!guru && !galat && <p className="catatan">Memuat...</p>}
          {guru && guru.length === 0 && <p className="catatan">Belum ada guru yang bisa dihubungi. Guru muncul setelah kelas ajar dibuat untuk kelas Anda.</p>}
          <ul className="chat-pilih">
            {(guru ?? []).map((g) => (
              <li key={g.ptk_id}>
                <span><strong>{kapital(g.nama)}</strong><br /><small>{g.wali ? 'Wali kelas' : ''}{g.wali && g.mapel ? ', ' : ''}{g.mapel ?? ''}</small></span>
                {g.terbuka
                  ? <button type="button" className="tombol" style={biru} onClick={() => void mulai(g.ptk_id)}>Mulai</button>
                  : <span className="status status-dibatalkan">Jam tanya ditutup</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function MulaiTanyaGuru() {
  const navigate = useNavigate()
  const [buka, setBuka] = useState(false)
  const [siswa, setSiswa] = useState<SiswaChat[] | null>(null)
  const [rombel, setRombel] = useState('')
  const [pilih, setPilih] = useState('')
  const [galat, setGalat] = useState('')
  useEffect(() => {
    if (!buka || siswa) return
    panggil<SiswaChat[]>('chat_siswa_saya').then(setSiswa).catch((e: Error) => setGalat(e.message))
  }, [buka, siswa])
  const daftarRombel = Array.from(new Set((siswa ?? []).map((s) => s.rombel)))
  const calon = (siswa ?? []).filter((s) => s.rombel === rombel)
  async function mulai(e: FormEvent) {
    e.preventDefault()
    setGalat('')
    try { const rid = await panggil<string>('chat_mulai_tanya', { p_guru: null, p_siswa: pilih }); navigate(`/portal/chat/${rid}`) } catch (er) { setGalat((er as Error).message) }
  }
  return (
    <div style={{ width: '100%' }}>
      <button type="button" className="tombol tombol-isi" aria-expanded={buka} onClick={() => setBuka(!buka)}>{buka ? 'Tutup' : 'Pesan ke siswa'}</button>
      {buka && (
        <form className="kartu form jarak" onSubmit={mulai}>
          {galat && <p className="catatan galat" role="alert">{galat}</p>}
          {!siswa && !galat && <p className="catatan">Memuat...</p>}
          {siswa && siswa.length === 0 && <p className="catatan">Belum ada siswa. Siswa muncul dari kelas yang Anda ajar atau walikan.</p>}
          {siswa && siswa.length > 0 && (
            <>
              <label>Kelas
                <select value={rombel} onChange={(e) => { setRombel(e.target.value); setPilih('') }}>
                  <option value="">Pilih kelas</option>
                  {daftarRombel.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label>Siswa
                <select required value={pilih} onChange={(e) => setPilih(e.target.value)} disabled={!rombel}>
                  <option value="">Pilih siswa</option>
                  {calon.map((s) => <option key={s.id} value={s.id}>{kapital(s.nama)}</option>)}
                </select>
              </label>
              <button className="tombol tombol-isi" disabled={!pilih}>Buka percakapan</button>
            </>
          )}
        </form>
      )}
    </div>
  )
}

function PengaturanJamTanya() {
  const [buka, setBuka] = useState(false)
  const [kelas, setKelas] = useState<PengaturanKelas[] | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  useEffect(() => {
    if (!buka || kelas) return
    panggil<PengaturanKelas[]>('chat_tanya_pengaturan').then(setKelas).catch((e: Error) => setGalat(e.message))
  }, [buka, kelas])
  async function atur(id: string, mode: PengaturanKelas['mode']) {
    setGalat(''); setInfo('')
    try {
      await panggil('chat_tanya_atur', { p_kelas: id, p_mode: mode })
      setKelas((k) => (k ?? []).map((x) => (x.id === id ? { ...x, mode } : x)))
      setInfo('Tersimpan.')
    } catch (e) { setGalat((e as Error).message) }
  }
  return (
    <div className="jarak">
      <button type="button" className="tombol" style={biru} aria-expanded={buka} onClick={() => setBuka(!buka)}>{buka ? 'Tutup pengaturan' : 'Jam tanya siswa'}</button>
      {buka && (
        <div className="kartu jarak">
          <p className="catatan">Atur kapan siswa boleh memulai Tanya guru dengan Anda. Wali kelas selalu bisa dihubungi siswa kelasnya.</p>
          {galat && <p className="catatan galat" role="alert">{galat}</p>}
          {info && <p className="catatan sukses" role="status">{info}</p>}
          {!kelas && !galat && <p className="catatan">Memuat...</p>}
          {kelas && kelas.length === 0 && <p className="catatan">Anda belum punya kelas ajar.</p>}
          <ul className="chat-pilih">
            {(kelas ?? []).map((k) => (
              <li key={k.id}>
                <span><strong>{k.mapel}</strong><br /><small>{k.rombel}</small></span>
                <select aria-label={`Jam tanya ${k.mapel} ${k.rombel}`} value={k.mode} onChange={(e) => void atur(k.id, e.target.value as PengaturanKelas['mode'])}>
                  <option value="tertutup">Ditutup</option>
                  <option value="dibuka">Dibuka sementara</option>
                  <option value="selalu">Selalu dibuka</option>
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const labelStatus: Record<Laporan['status'], string> = { baru: 'Baru', ditinjau: 'Ditinjau', selesai: 'Selesai' }
const kelasStatus: Record<Laporan['status'], string> = { baru: 'status-menunggu', ditinjau: 'status-diteruskan', selesai: 'status-selesai' }

export function ChatLaporan() {
  const [status, setStatus] = useState<'baru' | 'ditinjau' | 'selesai'>('baru')
  const [daftar, setDaftar] = useState<Laporan[] | null>(null)
  const [galat, setGalat] = useState('')
  const [catatan, setCatatan] = useState<Record<string, string>>({})
  const muat = useCallback(async () => {
    setDaftar(null)
    try { setDaftar(await panggil<Laporan[]>('chat_laporan_daftar', { p_status: status })); setGalat('') } catch (e) { setGalat((e as Error).message) }
  }, [status])
  useEffect(() => { void muat() }, [muat])
  async function tinjau(id: string, st: 'ditinjau' | 'selesai') {
    setGalat('')
    try { await panggil('chat_laporan_tinjau', { p_laporan: id, p_status: st, p_catatan: catatan[id] || null }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  return (
    <Halaman judul="Laporan pesan" lead="Pesan yang dilaporkan siswa atau guru di percakapan yang Anda pantau.">
      <div className="aksi" style={{ marginTop: 0 }}>
        {(['baru', 'ditinjau', 'selesai'] as const).map((s) => (
          <button key={s} type="button" className={'tombol' + (status === s ? ' tombol-isi' : '')} style={status === s ? undefined : biru} onClick={() => setStatus(s)}>{labelStatus[s]}</button>
        ))}
      </div>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!daftar && !galat && <p className="catatan jarak">Memuat...</p>}
      {daftar && daftar.length === 0 && <div className="kartu jarak"><p className="catatan">Tidak ada laporan berstatus {labelStatus[status].toLowerCase()}.</p></div>}
      {(daftar ?? []).map((l) => (
        <div className="kartu jarak" key={l.id}>
          <p style={{ margin: 0 }}>
            <span className={`status ${kelasStatus[l.status]}`}>{labelStatus[l.status]}</span>{' '}
            <strong>{l.ruang}</strong><br />
            <small>Dilaporkan {kapital(l.pelapor)}, {tglJam(l.dibuat_pada)}</small>
          </p>
          <p className="catatan" style={{ marginTop: 8 }}>Alasan: {l.alasan}</p>
          <blockquote className="chat-kutipan">
            <small>{kapital(l.pengirim)}, {tglJam(l.dibuat_pesan)}</small>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{l.isi}</p>
          </blockquote>
          {l.catatan && <p className="catatan">Catatan peninjau: {l.catatan}</p>}
          {l.status !== 'selesai' && (
            <div className="form" style={{ marginTop: 10 }}>
              <label>Catatan tinjauan (opsional)<textarea rows={2} maxLength={500} value={catatan[l.id] ?? ''} onChange={(e) => setCatatan({ ...catatan, [l.id]: e.target.value })} /></label>
              <div className="aksi" style={{ marginTop: 0 }}>
                {l.status === 'baru' && <button type="button" className="tombol" style={biru} onClick={() => void tinjau(l.id, 'ditinjau')}>Tandai ditinjau</button>}
                <button type="button" className="tombol tombol-isi" onClick={() => void tinjau(l.id, 'selesai')}>Selesai</button>
                <Link to={`/portal/chat/${l.ruang_id}`} className="tombol" style={biru}>Buka percakapan</Link>
              </div>
            </div>
          )}
        </div>
      ))}
      <p className="jarak"><Link to="/portal/chat">Kembali ke chat</Link></p>
    </Halaman>
  )
}
