// Profil sekolah (super admin): kontak, lokasi, media sosial, visi dan misi untuk situs publik.
// Isian kosong otomatis memakai data Dapodik. Disimpan di tabel terpisah, jadi unggahan Dapodik tidak menimpanya.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { muatProfilSekolah } from '../lib/profilSekolah'

type Isi = Record<string, string>
const TEKS = ['slogan', 'tentang', 'visi', 'misi', 'sejarah', 'akreditasi', 'tahun_berdiri', 'alamat_tampil', 'telepon', 'email', 'whatsapp', 'jam_layanan', 'lintang', 'bujur', 'website', 'instagram', 'facebook', 'youtube', 'tiktok', 'x_twitter'] as const
const TAUTAN = ['website', 'instagram', 'facebook', 'youtube', 'tiktok', 'x_twitter']
type Hint = { alamat: string; telepon: string; email: string; website: string; lintang: string; bujur: string }

type Pp = { isi: Isi; ubah: (k: string, v: string) => void; k: string; label: string; kecil?: string }
function Kolom({ isi, ubah, k, label, tipe = 'text', petunjuk, kecil }: Pp & { tipe?: string; petunjuk?: string }) {
  return (
    <label>{label}
      <input type={tipe} value={isi[k] ?? ''} placeholder={petunjuk} inputMode={k === 'lintang' || k === 'bujur' ? 'decimal' : undefined} onChange={(e) => ubah(k, e.target.value)} />
      {kecil && <small className="catatan">{kecil}</small>}
    </label>
  )
}
function Area({ isi, ubah, k, label, baris = 4, kecil }: Pp & { baris?: number }) {
  return (
    <label>{label}
      <textarea rows={baris} value={isi[k] ?? ''} onChange={(e) => ubah(k, e.target.value)} />
      {kecil && <small className="catatan">{kecil}</small>}
    </label>
  )
}

export default function ProfilSekolah() {
  const { profil } = useAuth()
  const [isi, setIsi] = useState<Isi>({})
  const [hint, setHint] = useState<Hint>({ alamat: '', telepon: '', email: '', website: '', lintang: '', bujur: '' })
  const [muat, setMuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [terakhir, setTerakhir] = useState<string | null>(null)
  const npsn = profil?.npsn ?? ''

  const baca = useCallback(async () => {
    if (!npsn) return
    const [m, s, r] = await Promise.all([
      supabase.from('profil_sekolah_manual').select('*').eq('npsn', npsn).maybeSingle(),
      supabase.from('sekolah').select('telepon,email,website,lintang,bujur').eq('npsn', npsn).maybeSingle(),
      supabase.rpc('profil_sekolah_publik'),
    ])
    if (m.error) { setGalat(m.error.message); setMuat(false); return }
    const baris = (m.data ?? {}) as Record<string, unknown>
    const awal: Isi = {}
    for (const k of TEKS) awal[k] = baris[k] == null ? '' : String(baris[k])
    setIsi(awal)
    setTerakhir((baris.diperbarui_pada as string | undefined) ?? null)
    const sk = (s.data ?? {}) as Record<string, unknown>
    const pub = (r.data ?? {}) as Record<string, unknown>
    setHint({
      alamat: awal.alamat_tampil ? '' : String(pub.alamat ?? ''),
      telepon: String(sk.telepon ?? ''), email: String(sk.email ?? ''), website: String(sk.website ?? ''),
      lintang: sk.lintang == null ? '' : String(sk.lintang), bujur: sk.bujur == null ? '' : String(sk.bujur),
    })
    setMuat(false)
  }, [npsn])
  useEffect(() => { void baca() }, [baca])

  const ubah = (k: string, v: string) => setIsi((x) => ({ ...x, [k]: v }))

  async function simpan(e: FormEvent) {
    e.preventDefault()
    setGalat(''); setInfo('')
    for (const k of TAUTAN) if (isi[k]?.trim() && !/^https?:\/\/\S+$/i.test(isi[k].trim())) return setGalat(`Tautan ${k.replace('_', ' ')} harus diawali https://`)
    const lat = isi.lintang.trim(), bjr = isi.bujur.trim()
    if ((lat === '') !== (bjr === '')) return setGalat('Isi lintang dan bujur sekaligus, atau kosongkan keduanya.')
    if (lat && (!Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90)) return setGalat('Lintang harus angka antara -90 dan 90.')
    if (bjr && (!Number.isFinite(Number(bjr)) || Math.abs(Number(bjr)) > 180)) return setGalat('Bujur harus angka antara -180 dan 180.')
    const th = isi.tahun_berdiri.trim()
    if (th && !/^\d{4}$/.test(th)) return setGalat('Tahun berdiri harus 4 angka.')
    const baris: Record<string, unknown> = { npsn }
    for (const k of TEKS) {
      const v = (isi[k] ?? '').trim()
      baris[k] = v === '' ? null : k === 'lintang' || k === 'bujur' ? Number(v.replace(',', '.')) : k === 'tahun_berdiri' ? Number(v) : v
    }
    setSibuk(true)
    const { error } = await supabase.from('profil_sekolah_manual').upsert(baris, { onConflict: 'npsn' })
    setSibuk(false)
    if (error) return setGalat(error.message)
    void muatProfilSekolah(true)
    setInfo('Tersimpan. Situs publik sudah memakai data ini.')
    void baca()
  }

  const lat = Number(isi.lintang || hint.lintang), bjr = Number(isi.bujur || hint.bujur)
  const adaKoordinat = Number.isFinite(lat) && Number.isFinite(bjr) && (isi.lintang || hint.lintang) !== '' && (isi.bujur || hint.bujur) !== ''

  return (
    <Halaman judul="Profil sekolah" lead="Kontak, lokasi, media sosial, visi, dan misi yang tampil di situs publik. Isian kosong memakai data Dapodik.">
      {muat && <p className="catatan">Memuat...</p>}
      {galat && <p className="kartu" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      {!muat && (
        <form className="form" onSubmit={simpan} style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
          <fieldset className="kartu form">
            <legend><h3>Kontak dan layanan</h3></legend>
            <label>Alamat yang ditampilkan
              <textarea rows={2} value={isi.alamat_tampil ?? ''} placeholder={hint.alamat} onChange={(e) => ubah('alamat_tampil', e.target.value)} />
              <small className="catatan">Kosongkan untuk memakai alamat dari Dapodik (terlihat sebagai teks abu-abu).</small>
            </label>
            <Kolom isi={isi} ubah={ubah} k="telepon" label="Telepon" petunjuk={hint.telepon} />
            <Kolom isi={isi} ubah={ubah} k="whatsapp" label="WhatsApp" petunjuk="Contoh: 0812xxxxxxxx" kecil="Tampil sebagai tautan chat di footer dan halaman Kontak." />
            <Kolom isi={isi} ubah={ubah} k="email" label="Email" tipe="email" petunjuk={hint.email} />
            <Kolom isi={isi} ubah={ubah} k="jam_layanan" label="Jam layanan" petunjuk="Senin sampai Jumat, 07.00 sampai 15.30 WIB" />
          </fieldset>

          <fieldset className="kartu form">
            <legend><h3>Lokasi</h3></legend>
            <div className="grid grid-2">
              <Kolom isi={isi} ubah={ubah} k="lintang" label="Lintang (latitude)" petunjuk={hint.lintang || '-6.3724'} />
              <Kolom isi={isi} ubah={ubah} k="bujur" label="Bujur (longitude)" petunjuk={hint.bujur || '106.7087'} />
            </div>
            <p className="catatan">
              Salin koordinat dari Google Maps: tekan lama pada titik sekolah, lalu salin dua angka yang muncul. Kosongkan untuk memakai koordinat Dapodik.
              {adaKoordinat && <> <a href={`https://www.google.com/maps?q=${lat},${bjr}`} target="_blank" rel="noopener noreferrer">Cek titik di Google Maps</a>.</>}
            </p>
          </fieldset>

          <fieldset className="kartu form">
            <legend><h3>Media sosial dan situs web</h3></legend>
            <Kolom isi={isi} ubah={ubah} k="website" label="Situs web" tipe="url" petunjuk={hint.website || 'https://'} />
            <Kolom isi={isi} ubah={ubah} k="instagram" label="Instagram" tipe="url" petunjuk="https://www.instagram.com/akun" />
            <Kolom isi={isi} ubah={ubah} k="facebook" label="Facebook" tipe="url" petunjuk="https://www.facebook.com/halaman" />
            <Kolom isi={isi} ubah={ubah} k="youtube" label="YouTube" tipe="url" petunjuk="https://www.youtube.com/@kanal" />
            <Kolom isi={isi} ubah={ubah} k="tiktok" label="TikTok" tipe="url" petunjuk="https://www.tiktok.com/@akun" />
            <Kolom isi={isi} ubah={ubah} k="x_twitter" label="X (Twitter)" tipe="url" petunjuk="https://x.com/akun" />
          </fieldset>

          <fieldset className="kartu form">
            <legend><h3>Profil dan identitas</h3></legend>
            <Kolom isi={isi} ubah={ubah} k="slogan" label="Slogan atau kalimat pembuka" petunjuk="Tampil di beranda dan di bawah judul Profil Sekolah" />
            <Area isi={isi} ubah={ubah} k="visi" label="Visi" baris={3} />
            <Area isi={isi} ubah={ubah} k="misi" label="Misi" baris={5} kecil="Satu misi per baris." />
            <Area isi={isi} ubah={ubah} k="tentang" label="Tentang sekolah" baris={5} />
            <Area isi={isi} ubah={ubah} k="sejarah" label="Sejarah singkat" baris={5} />
            <div className="grid grid-2">
              <Kolom isi={isi} ubah={ubah} k="akreditasi" label="Akreditasi" petunjuk="Contoh: A, 2022" />
              <Kolom isi={isi} ubah={ubah} k="tahun_berdiri" label="Tahun berdiri" petunjuk="Contoh: 2017" />
            </div>
          </fieldset>

          <div className="aksi" style={{ alignItems: 'center' }}>
            <button className="tombol tombol-isi" type="submit" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan profil sekolah'}</button>
            <Link to="/kontak" target="_blank">Lihat halaman Kontak</Link>
            <Link to="/profil" target="_blank">Lihat Profil Sekolah</Link>
            {terakhir && <span className="catatan">Terakhir diperbarui {new Date(terakhir).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
          </div>
        </form>
      )}
      <p><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
