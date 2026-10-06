import { useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import KolomSandi from './KolomSandi'

export type PeranMasuk = 'guru' | 'siswa' | 'alumni' | 'admin' | 'orang_tua'

const peranMasuk: { id: PeranMasuk; nama: string; usernameLabel: string; petunjuk: string }[] = [
  { id: 'guru', nama: 'Guru dan staf', usernameLabel: 'NIP (atau NUPTK)', petunjuk: 'Pertama kali masuk? Password awal adalah NPSN sekolah. Anda akan diminta menggantinya.' },
  { id: 'siswa', nama: 'Siswa', usernameLabel: 'NISN', petunjuk: 'Pertama kali masuk? Password awal adalah tanggal lahir dengan format DDMMYYYY, misalnya 17082009. Anda akan diminta menggantinya.' },
  { id: 'alumni', nama: 'Alumni', usernameLabel: 'NISN', petunjuk: 'Pertama kali masuk? Password awal adalah tanggal lahir dengan format DDMMYYYY. Anda akan diminta menggantinya.' },
  { id: 'orang_tua', nama: 'Orang tua', usernameLabel: 'NIK ibu (16 digit)', petunjuk: 'Username adalah NIK ibu yang tercatat di data sekolah. Bila tidak bisa dipakai, hubungi admin sekolah.' },
  { id: 'admin', nama: 'Admin', usernameLabel: 'Username', petunjuk: 'Username dan password admin diatur dari menu Profil setelah masuk pertama dengan tautan email.' },
]

const adaTautanEmail: PeranMasuk[] = ['guru', 'admin', 'orang_tua']

/** Satu kalimat pendek tepat di bawah kolom password, supaya format password awal tidak terlewat. */
const formatAwal: Partial<Record<PeranMasuk, string>> = {
  siswa: 'Belum pernah ganti password? Isi tanggal lahir DDMMYYYY, contoh 17082009.',
  alumni: 'Belum pernah ganti password? Isi tanggal lahir DDMMYYYY, contoh 17082009.',
  guru: 'Belum pernah ganti password? Isi NPSN sekolah.',
  orang_tua: 'Belum pernah ganti password? Isi NPSN sekolah. Username memakai NIK ibu di data sekolah.',
}

/** Formulir masuk bersama: dipakai halaman Masuk dan halaman Asesmen Digital. Akun dan password sama. */
export default function FormMasuk({ peranTersedia, tujuan }: { peranTersedia?: PeranMasuk[]; tujuan?: string }) {
  const lokasi = useLocation()
  const [params, setParams] = useSearchParams()
  const awal = params.get('sebagai') as PeranMasuk | null
  const daftarPeran = peranTersedia ? peranMasuk.filter((p) => peranTersedia.includes(p.id)) : peranMasuk
  const peran: PeranMasuk = daftarPeran.some((p) => p.id === awal) ? (awal as PeranMasuk) : daftarPeran[0].id
  const info = peranMasuk.find((p) => p.id === peran)!

  const [username, setUsername] = useState('')
  const [sandi, setSandi] = useState('')
  const [status, setStatus] = useState<'diam' | 'kirim' | 'galat' | 'dibatasi' | 'nonaktif'>('diam')
  const [sisa, setSisa] = useState<number | null>(null)
  const [tunggu, setTunggu] = useState(15)
  const [email, setEmail] = useState('')
  const [statusEmail, setStatusEmail] = useState<'diam' | 'kirim' | 'terkirim' | 'galat'>('diam')
  const [pesanEmail, setPesanEmail] = useState('')
  const [bukaEmail, setBukaEmail] = useState(false)

  function pilih(p: PeranMasuk) {
    setParams({ sebagai: p }, { replace: true })
    setUsername(''); setSandi(''); setStatus('diam'); setSisa(null); setBukaEmail(false); setStatusEmail('diam')
  }

  async function masuk(e: FormEvent) {
    e.preventDefault()
    setStatus('kirim')
    const { data, error } = peran === 'orang_tua'
      ? await supabase.functions.invoke('ortu', { body: { aksi: 'masuk', username: username.trim(), password: sandi } })
      : await supabase.functions.invoke('masuk', { body: { peran, username: username.trim(), password: sandi } })
    // Pada status 429 supabase-js mengembalikan error; badan jawabannya ada di error.context.
    let hasil = data as { ok?: boolean; access_token?: string; refresh_token?: string; dibatasi?: boolean; nonaktif?: boolean; sisa?: number; tunggu_menit?: number } | null
    if (error && 'context' in error) {
      try { hasil = await (error as { context: Response }).context.json() } catch { hasil = null }
    }
    if (hasil?.ok && hasil.access_token && hasil.refresh_token) {
      const { error: es } = await supabase.auth.setSession({ access_token: hasil.access_token, refresh_token: hasil.refresh_token })
      if (!es) return // sesi terbentuk, halaman berpindah sendiri ke /portal
    }
    setSandi('')
    setSisa(typeof hasil?.sisa === 'number' ? hasil.sisa : null)
    setTunggu(hasil?.tunggu_menit ?? 15)
    // Percobaan terakhir sudah terpakai: langsung tampilkan keadaan terkunci beserta lamanya.
    setStatus(hasil?.dibatasi || hasil?.sisa === 0 ? 'dibatasi' : hasil?.nonaktif ? 'nonaktif' : 'galat')
  }

  async function kirimEmail(e: FormEvent) {
    e.preventDefault()
    setStatusEmail('kirim')
    const dari = (lokasi.state as { dari?: string } | null)?.dari
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + (tujuan ?? dari ?? '/portal') },
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
      <div className="kartu form" style={{ maxWidth: 440 }}>
        <label className="pilih-peran-label">
          Masuk sebagai
          <select value={peran} onChange={(e) => pilih(e.target.value as PeranMasuk)} disabled={status === 'kirim'}>
            {daftarPeran.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
          </select>
        </label>

        {(
          <form className="form" onSubmit={masuk}>
            <label>
              {info.usernameLabel}
              <input
                required autoComplete="username" autoCapitalize="none" value={username}
                inputMode={peran === 'admin' ? 'text' : 'numeric'}
                maxLength={peran === 'siswa' || peran === 'alumni' ? 10 : peran === 'orang_tua' ? 16 : 40}
                onChange={(e) => setUsername(peran === 'admin' ? e.target.value : e.target.value.replace(/\D/g, ''))}
                disabled={status === 'kirim'}
              />
            </label>
            <KolomSandi
              label="Password" required autoComplete="current-password" value={sandi} onChange={(e) => setSandi(e.target.value)}
              disabled={status === 'kirim'} petunjuk={formatAwal[peran] ?? info.petunjuk}
            />
            <button className="tombol tombol-isi" disabled={status === 'kirim' || !username || !sandi}>
              {status === 'kirim' ? 'Memeriksa...' : `Masuk sebagai ${info.nama.toLowerCase()}`}
            </button>
            <div aria-live="polite">
              {status === 'galat' && (
                <div className="kotak-hitung" role="alert">
                  <p style={{ margin: 0 }}><strong>Username atau password tidak cocok.</strong></p>
                  {sisa !== null && <p style={{ margin: '4px 0 0' }}>Sisa percobaan: <strong>{sisa}</strong>. Periksa lagi sebelum menekan Masuk.</p>}
                  {formatAwal[peran] && <p style={{ margin: '4px 0 0' }}>{formatAwal[peran]}</p>}
                  <p style={{ margin: '4px 0 0' }}>Lupa password? Hubungi guru atau admin sekolah.</p>
                </div>
              )}
              {status === 'nonaktif' && <p className="catatan" role="alert">Akun ini dinonaktifkan. Hubungi admin sekolah.</p>}
              {status === 'dibatasi' && (
                <div className="kotak-hitung" role="alert">
                  <p style={{ margin: 0 }}><strong>Percobaan habis. Coba lagi dalam {tunggu} menit.</strong></p>
                  <p style={{ margin: '4px 0 0' }}>Tidak perlu menekan Masuk berulang kali. Hubungi admin sekolah bila perlu membuka kunci akun Anda lebih cepat.</p>
                </div>
              )}
            </div>
          </form>
        )}

        {adaTautanEmail.includes(peran) && (
          <div>
            <button type="button" className="tautan-teks" aria-expanded={bukaEmail} onClick={() => setBukaEmail(!bukaEmail)}>
              {bukaEmail ? 'Tutup masuk dengan email' : 'Atau masuk dengan tautan email'}
            </button>
            {bukaEmail && <div className="jarak">{formEmail}</div>}
          </div>
        )}
      </div>
  )
}
