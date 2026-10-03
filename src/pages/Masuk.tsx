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

  return (
    <Halaman judul="Masuk" lead="Masuk dengan tautan yang dikirim ke email terdaftar. Tanpa kata sandi.">
      <div className="grid grid-2">
        <form className="kartu form" onSubmit={kirim}>
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
        <div className="kartu">
          <h3>Siapa yang bisa masuk</h3>
          <ul>
            <li>Admin TU</li>
            <li>Guru</li>
            <li>Siswa</li>
            <li>Orang tua</li>
          </ul>
          <p className="catatan">Akun didaftarkan oleh admin sekolah. Email yang belum didaftarkan tidak akan menerima tautan.</p>
        </div>
      </div>
    </Halaman>
  )
}
