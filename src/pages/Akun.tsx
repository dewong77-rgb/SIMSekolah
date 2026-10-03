import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { supabase } from '../lib/supabase'

type Ptk = { id: string; nama: string; email: string | null; jenis_ptk: string; status_kepegawaian: string | null }
type Hasil = { ptk_id: string; nama: string; status: 'dibuat' | 'sudah' | 'dilewati' | 'gagal'; pesan?: string }

const emailSah = (e: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

export default function Akun() {
  const [daftar, setDaftar] = useState<Ptk[] | null>(null)
  const [terdaftar, setTerdaftar] = useState<Set<string>>(new Set())
  const [pilih, setPilih] = useState<Set<string>>(new Set())
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [hasil, setHasil] = useState<Hasil[]>([])

  const muat = useCallback(async () => {
    const [p, a] = await Promise.all([
      supabase.from('ptk').select('id,nama,email,jenis_ptk,status_kepegawaian').in('jenis_ptk', ['Guru', 'Kepala Sekolah']).order('nama'),
      supabase.from('profil_pengguna').select('ptk_id').not('ptk_id', 'is', null),
    ])
    if (p.error || a.error) return setGalat((p.error ?? a.error)!.message)
    setDaftar(p.data as Ptk[])
    setTerdaftar(new Set((a.data ?? []).map((r) => r.ptk_id as string)))
  }, [])
  useEffect(() => { void muat() }, [muat])

  const belum = (daftar ?? []).filter((p) => !terdaftar.has(p.id) && emailSah(p.email))

  function tukar(id: string) {
    setPilih((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function daftarkan() {
    setSibuk(true)
    setHasil([])
    setGalat('')
    const { data, error } = await supabase.functions.invoke('daftarkan-akun', { body: { ptk_ids: [...pilih] } })
    if (error) setGalat(error.message)
    else setHasil((data as { hasil: Hasil[] }).hasil)
    setPilih(new Set())
    await muat()
    setSibuk(false)
  }

  return (
    <Halaman judul="Akun guru" lead="Daftarkan akun guru dari data PTK. Guru masuk dengan tautan yang dikirim ke email di Dapodik.">
      <div className="kartu">
        <p className="catatan">
          Periksa email sebelum mendaftarkan. Tautan masuk hanya dikirim ke email yang tercatat di sini. Email yang salah
          berarti guru tidak bisa masuk. Perbaiki dulu di Dapodik, lalu unggah ulang berkas guru.
        </p>
        <div className="aksi jarak">
          <button className="tombol tombol-isi" disabled={sibuk || pilih.size === 0} onClick={daftarkan}>
            {sibuk ? 'Mendaftarkan...' : `Daftarkan ${pilih.size} akun`}
          </button>
          <button
            className="tombol"
            style={{ color: 'var(--warna-utama)' }}
            disabled={sibuk || belum.length === 0}
            onClick={() => setPilih(new Set(belum.slice(0, 100).map((p) => p.id)))}
          >
            Pilih semua yang belum terdaftar ({belum.length})
          </button>
        </div>
        {galat && <p className="catatan jarak">Galat: {galat}</p>}
      </div>

      {hasil.length > 0 && (
        <div className="kartu jarak" aria-live="polite">
          <h3>Hasil</h3>
          <ul>
            {hasil.map((h) => (
              <li key={h.ptk_id}><strong>{h.nama}</strong>: {h.status}{h.pesan ? ` (${h.pesan})` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="tabel-bungkus jarak">
        <table>
          <thead>
            <tr><th></th><th>Nama</th><th>Jenis</th><th>Email</th><th>Akun</th></tr>
          </thead>
          <tbody>
            {!daftar && <tr><td colSpan={5}>Memuat...</td></tr>}
            {daftar?.map((p) => {
              const ada = terdaftar.has(p.id)
              const sah = emailSah(p.email)
              return (
                <tr key={p.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${p.nama}`}
                      disabled={ada || !sah || sibuk}
                      checked={pilih.has(p.id)}
                      onChange={() => tukar(p.id)}
                    />
                  </td>
                  <td>{p.nama}</td>
                  <td>{p.jenis_ptk}</td>
                  <td>{p.email ?? '-'}</td>
                  <td>{ada ? 'Terdaftar' : sah ? 'Belum' : 'Email tidak valid'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
