import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

type PeranMasuk = 'guru' | 'siswa' | 'alumni' | 'admin' | 'orang_tua'

const peranMasuk: { id: PeranMasuk; nama: string; usernameLabel: string; petunjuk: string }[] = [
  { id: 'guru', nama: 'Guru dan staf', usernameLabel: 'NIP (atau NUPTK)', petunjuk: 'Pertama kali masuk? Password awal adalah NPSN sekolah. Anda akan diminta menggantinya.' },
  { id: 'siswa', nama: 'Siswa', usernameLabel: 'NISN', petunjuk: 'Pertama kali masuk? Password awal adalah tanggal lahir dengan format DDMMYYYY, misalnya 17082009. Anda akan diminta menggantinya.' },
  { id: 'alumni', nama: 'Alumni', usernameLabel: 'NISN', petunjuk: 'Pertama kali masuk? Password awal adalah tanggal lahir dengan format DDMMYYYY. Anda akan diminta menggantinya.' },
  { id: 'orang_tua', nama: 'Orang tua', usernameLabel: '', petunjuk: '' },
  { id: 'admin', nama: 'Admin', usernameLabel: 'Username', petunjuk: 'Username dan password admin diatur dari menu Profil setelah masuk pertama dengan tautan email.' },
]

const adaTautanEmail: PeranMasuk[] = ['guru', 'admin', 'orang_tua']

export default function Masuk() {
  const { session } = useAuth()
  const lokasi = useLocation()
  const [params, setParams] = useSearchParams()
  const awal = params.get('sebagai') as PeranMasuk | null
  const peran: PeranMasuk = peranMasuk.some((p) => p.id === awal) ? (awal as PeranMasuk) : 'siswa'
  const info = peranMasuk.find((p) => p.id === peran)!

  const [username, setUsername] = useState('')
  const [sandi, setSandi] = useState('')
  const [status, setStatus] = useState<'diam' | 'kirim' | 'galat' | 'dibatasi' | 'nonaktif'>('diam')
  const [email, setEmail] = useState('')
  const [statusEmail, setStatusEmail] = useState<'diam' | 'kirim' | 'terkirim' | 'galat'>('diam')
  const [pesanEmail, setPesanEmail] = useState('')
  const [bukaEmail, setBukaEmail] = useState(false)

  if (session) return <Navigate to="/portal" replace />

  function pilih(p: PeranMasuk) {
    setParams({ sebagai: p }, { replace: true })
    setUsername(''); setSandi(''); setStatus('diam'); setBukaEmail(false); setStatusEmail('diam')
  }

  async function masuk(e: FormEvent) {
    e.preventDefault()
    setStatus('kirim')
    const { data, error } = await supabase.functions.invoke('masuk', { body: { peran, username: username.trim(), password: sandi } })
    // Pada status 429 supabase-js mengembalikan error; badan jawabannya ada di error.context.
    let hasil = data as { ok?: boolean; access_token?: string; refresh_token?: string; dibatasi?: boolean; nonaktif?: boolean } | null
    if (error && 'context' in error) {
      try { hasil = await (error as { context: Response }).context.json() } catch { hasil = null }
    }
    if (hasil?.ok && hasil.access_token && hasil.refresh_token) {
      const { error: es } = await supabase.auth.setSession({ access_token: hasil.access_token, refresh_token: hasil.refresh_token })
      if (!es) return // sesi terbentuk, halaman berpindah sendiri ke /portal
    }
    setSandi('')
    setStatus(hasil?.dibatasi ? 'dibatasi' : hasil?.nonaktif ? 'nonaktif' : 'galat')
  }

  async function kirimEmail(e: FormEvent) {
    e.preventDefault()
    setStatusEmail('kirim')
    const dari = (lokasi.state as { dari?: string } | null)?.dari
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + (dari ?? '/portal') },
    })
    // Jawaban seragam: tidak mengungkap apakah email terdaftar. Hanya kegagalan batas kirim yang ditampilkan.
    if (error && /rate|too many|seconds/i.test(error.message)) {
      setStatusEmail('galat')
      setPesanEmail('Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi.')
      return
    }
    setStatusEmail('terkirim')
  }

  const formEmail = (
    <form className="form" onSubmit={kirimEmail}>
      <label>
        Email
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={statusEmail === 'kirim'} />
      </label>
      <button className="tombol tombol-isi" disabled={statusEmail === 'kirim' || !email}>
        {statusEmail === 'kirim' ? 'Mengirim...' : 'Kirim tautan masuk'}
      </button>
      <div aria-live="polite">
        {statusEmail === 'terkirim' && <p className="catatan">Jika email terdaftar, tautan masuk sudah dikirim. Buka email Anda, lalu klik tautannya di perangkat ini. Cek folder spam bila belum muncul.</p>}
        {statusEmail === 'galat' && <p className="catatan">{pesanEmail}</p>}
      </div>
    </form>
  )

  return (
    <Halaman judul="Masuk" lead="Pilih peran Anda, lalu masuk dengan username dan password.">
      <div className="kartu form" style={{ maxWidth: 520 }}>
        <div role="tablist" aria-label="Masuk sebagai" className="pilih-peran">
          {peranMasuk.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={peran === p.id} className={peran === p.id ? 'aktif' : ''} onClick={() => pilih(p.id)}>
              {p.nama}
            </button>
          ))}
        </div>

        {peran !== 'orang_tua' && (
          <form className="form" onSubmit={masuk}>
            <label>
              {info.usernameLabel}
              <input
                required autoComplete="username" autoCapitalize="none" value={username}
                inputMode={peran === 'admin' ? 'text' : 'numeric'}
                maxLength={peran === 'siswa' || peran === 'alumni' ? 10 : 40}
                onChange={(e) => setUsername(peran === 'admin' ? e.target.value : e.target.value.replace(/\D/g, ''))}
                disabled={status === 'kirim'}
              />
            </label>
            <label>
              Password
              <input type="password" required autoComplete="current-password" value={sandi} onChange={(e) => setSandi(e.target.value)} disabled={status === 'kirim'} />
            </label>
            <button className="tombol tombol-isi" disabled={status === 'kirim' || !username || !sandi}>
              {status === 'kirim' ? 'Memeriksa...' : `Masuk sebagai ${info.nama.toLowerCase()}`}
            </button>
            <div aria-live="polite">
              {status === 'galat' && <p className="catatan" role="alert">Username atau password tidak cocok. Hubungi admin sekolah bila lupa password.</p>}
              {status === 'nonaktif' && <p className="catatan" role="alert">Akun ini dinonaktifkan. Hubungi admin sekolah.</p>}
              {status === 'dibatasi' && <p className="catatan" role="alert">Terlalu banyak percobaan. Coba lagi dalam 15 menit.</p>}
            </div>
            <p className="catatan">{info.petunjuk}</p>
          </form>
        )}

        {peran === 'orang_tua' && (
          <>
            <p className="catatan">Akun orang tua belum memakai username dan password. Sementara ini orang tua masuk dengan tautan email yang didaftarkan sekolah.</p>
            {formEmail}
          </>
        )}

        {peran !== 'orang_tua' && adaTautanEmail.includes(peran) && (
          <div>
            <button type="button" className="tombol" style={{ color: 'var(--warna-utama)' }} aria-expanded={bukaEmail} onClick={() => setBukaEmail(!bukaEmail)}>
              {bukaEmail ? 'Tutup' : 'Masuk dengan tautan email'}
            </button>
            {bukaEmail && <div className="jarak">{formEmail}</div>}
          </div>
        )}
      </div>
    </Halaman>
  )
}
