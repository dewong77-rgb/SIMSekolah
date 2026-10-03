import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

export default function Masuk() {
  const { session } = useAuth()
  const lokasi = useLocation()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'diam' | 'kirim' | 'terkirim' | 'galat'>('diam')
  const [pesan, setPesan] = useState('')
  const [nisn, setNisn] = useState('')
  const [lahir, setLahir] = useState('')
  const [username, setUsername] = useState('')
  const [sandi, setSandi] = useState('')
  const [statusAdmin, setStatusAdmin] = useState<'diam' | 'kirim' | 'galat' | 'dibatasi'>('diam')
  const [statusSiswa, setStatusSiswa] = useState<'diam' | 'kirim' | 'galat' | 'dibatasi' | 'nonaktif'>('diam')

  if (session) return <Navigate to="/portal" replace />

  async function kirim(e: FormEvent) {
    e.preventDefault()
    setStatus('kirim')
    const dari = (lokasi.state as { dari?: string } | null)?.dari
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + (dari ?? '/portal'),
      },
    })
    // Jawaban seragam: tidak mengungkap apakah email terdaftar.
    // Hanya kegagalan batas kirim yang ditampilkan.
    if (error && /rate|too many|seconds/i.test(error.message)) {
      setStatus('galat')
      setPesan('Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi.')
      return
    }
    setStatus('terkirim')
  }

  async function masukSiswa(e: FormEvent) {
    e.preventDefault()
    setStatusSiswa('kirim')
    const { data, error } = await supabase.functions.invoke('masuk-siswa', {
      body: { nisn: nisn.trim(), tanggal_lahir: lahir },
    })
    // Pada status 429 supabase-js mengembalikan error; badan jawabannya ada di error.context.
    let hasil = data as { ok?: boolean; token_hash?: string; dibatasi?: boolean; nonaktif?: boolean } | null
    if (error && 'context' in error) {
      try { hasil = await (error as { context: Response }).context.json() } catch { hasil = null }
    }
    if (hasil?.ok && hasil.token_hash) {
      const { error: ev } = await supabase.auth.verifyOtp({ token_hash: hasil.token_hash, type: 'magiclink' })
      if (!ev) return // sesi terbentuk, halaman berpindah sendiri ke /portal
    }
    setStatusSiswa(hasil?.dibatasi ? 'dibatasi' : hasil?.nonaktif ? 'nonaktif' : 'galat')
  }

  async function masukAdmin(e: FormEvent) {
    e.preventDefault()
    setStatusAdmin('kirim')
    const { data, error } = await supabase.functions.invoke('masuk-admin', {
      body: { username: username.trim(), password: sandi },
    })
    let hasil = data as { ok?: boolean; access_token?: string; refresh_token?: string; dibatasi?: boolean } | null
    if (error && 'context' in error) {
      try { hasil = await (error as { context: Response }).context.json() } catch { hasil = null }
    }
    if (hasil?.ok && hasil.access_token && hasil.refresh_token) {
      const { error: es } = await supabase.auth.setSession({ access_token: hasil.access_token, refresh_token: hasil.refresh_token })
      if (!es) return // sesi terbentuk, halaman berpindah sendiri ke /portal
    }
    setSandi('')
    setStatusAdmin(hasil?.dibatasi ? 'dibatasi' : 'galat')
  }

  return (
    <Halaman judul="Masuk" lead="Admin dan guru masuk dengan username atau tautan email. Siswa masuk dengan NISN dan tanggal lahir.">
      <div className="grid grid-3">
        <form className="kartu form" onSubmit={masukAdmin}>
          <h3>Masuk admin dan guru</h3>
          <label>
            Username
            <input required autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} disabled={statusAdmin === 'kirim'} />
          </label>
          <label>
            Password
            <input type="password" required autoComplete="current-password" value={sandi} onChange={(e) => setSandi(e.target.value)} disabled={statusAdmin === 'kirim'} />
          </label>
          <button className="tombol tombol-isi" disabled={statusAdmin === 'kirim' || !username || !sandi}>
            {statusAdmin === 'kirim' ? 'Memeriksa...' : 'Masuk'}
          </button>
          <div aria-live="polite">
            {statusAdmin === 'galat' && <p className="catatan">Username atau password tidak cocok. Username dan password diatur dari menu Profil setelah masuk dengan tautan email.</p>}
            {statusAdmin === 'dibatasi' && <p className="catatan">Terlalu banyak percobaan. Coba lagi dalam 15 menit.</p>}
          </div>
        </form>
        <form className="kartu form" onSubmit={kirim}>
          <h3>Masuk dengan email</h3>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === 'kirim'}
            />
          </label>
          <button className="tombol tombol-isi" disabled={status === 'kirim' || !email}>
            {status === 'kirim' ? 'Mengirim...' : 'Kirim tautan masuk'}
          </button>
          <div aria-live="polite">
            {status === 'terkirim' && (
              <p className="catatan">
                Jika email terdaftar, tautan masuk sudah dikirim. Buka email Anda, lalu klik tautannya di
                perangkat ini. Cek folder spam bila belum muncul.
              </p>
            )}
            {status === 'galat' && <p className="catatan">{pesan}</p>}
          </div>
        </form>
        <form className="kartu form" onSubmit={masukSiswa}>
          <h3>Masuk siswa</h3>
          <label>
            NISN
            <input
              inputMode="numeric"
              pattern="\d{10}"
              maxLength={10}
              required
              autoComplete="off"
              value={nisn}
              onChange={(e) => setNisn(e.target.value.replace(/\D/g, ''))}
              disabled={statusSiswa === 'kirim'}
            />
          </label>
          <label>
            Tanggal lahir
            <input type="date" required value={lahir} onChange={(e) => setLahir(e.target.value)} disabled={statusSiswa === 'kirim'} />
          </label>
          <button className="tombol tombol-isi" disabled={statusSiswa === 'kirim' || nisn.length !== 10 || !lahir}>
            {statusSiswa === 'kirim' ? 'Memeriksa...' : 'Masuk'}
          </button>
          <div aria-live="polite">
            {statusSiswa === 'galat' && <p className="catatan">NISN atau tanggal lahir tidak cocok. Hubungi wali kelas bila masih gagal.</p>}
            {statusSiswa === 'nonaktif' && <p className="catatan">Akun ini dinonaktifkan. Hubungi admin sekolah.</p>}
            {statusSiswa === 'dibatasi' && <p className="catatan">Terlalu banyak percobaan. Coba lagi dalam 15 menit.</p>}
          </div>
        </form>
      </div>
    </Halaman>
  )
}
