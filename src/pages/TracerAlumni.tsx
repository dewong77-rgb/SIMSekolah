// Tracer study mandiri untuk alumni. Verifikasi NISN + tanggal lahir, sama dengan Cek Data Alumni.
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import FormTracer, { type IsianTracer } from '../components/FormTracer'
import { panggil } from '../lib/rpc'

type Cek = { ditemukan: boolean; dibatasi?: boolean; nama?: string; tahun_lulus?: number | null; jawaban?: IsianTracer | null }

export default function TracerAlumni() {
  const [nisn, setNisn] = useState('')
  const [lahir, setLahir] = useState('')
  const [cek, setCek] = useState<Cek | null>(null)
  const [sibuk, setSibuk] = useState(false)
  const [selesai, setSelesai] = useState(false)
  const [galat, setGalat] = useState('')

  async function periksa(e: FormEvent) {
    e.preventDefault(); setSibuk(true); setGalat(''); setCek(null)
    try { setCek(await panggil<Cek>('tracer_cek', { p_nisn: nisn.trim(), p_tanggal_lahir: lahir })) }
    catch { setGalat('Pemeriksaan gagal. Coba lagi beberapa saat.') } finally { setSibuk(false) }
  }
  async function simpan(d: IsianTracer) {
    setSibuk(true); setGalat('')
    try {
      const r = await panggil<{ tersimpan: boolean }>('tracer_simpan_mandiri', { p_nisn: nisn.trim(), p_tanggal_lahir: lahir, p_data: d })
      if (r.tersimpan) setSelesai(true); else setGalat('Jawaban belum dapat disimpan. Periksa isian Anda.')
    } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }

  if (selesai) return (
    <Halaman judul="Tracer Study Alumni" lead="Terima kasih. Jawaban Anda tersimpan.">
      <div className="kartu"><p>Data ini membantu sekolah memperbaiki kurikulum dan menjalin kerja sama dengan industri. Anda dapat membuka halaman ini lagi untuk memperbarui jawaban.</p><Link to="/" className="tombol tombol-isi">Ke beranda</Link></div>
    </Halaman>
  )

  return (
    <Halaman judul="Tracer Study Alumni" lead="Ceritakan kegiatan Anda setelah lulus. Hasilnya dipakai sekolah untuk memperbaiki pembelajaran dan kerja sama industri.">
      {!cek?.ditemukan && (
        <form className="kartu form" onSubmit={periksa} style={{ maxWidth: 480 }}>
          <label>NISN<input inputMode="numeric" maxLength={10} required value={nisn} onChange={(e) => setNisn(e.target.value.replace(/\D/g, ''))} placeholder="10 digit" /></label>
          <label>Tanggal lahir<input type="date" required value={lahir} onChange={(e) => setLahir(e.target.value)} /></label>
          <button className="tombol tombol-isi" disabled={sibuk || nisn.length !== 10 || !lahir}>{sibuk ? 'Memeriksa...' : 'Lanjut'}</button>
          <p className="catatan">Hanya alumni yang tercatat lulus di Dapodik. Jumlah percobaan dibatasi demi keamanan.</p>
          {cek && !cek.ditemukan && <p className="galat kartu" role="alert">{cek.dibatasi ? 'Terlalu banyak percobaan. Coba lagi satu jam lagi.' : 'Data tidak ditemukan. Periksa NISN dan tanggal lahir, atau hubungi sekolah.'}</p>}
        </form>
      )}
      {galat && <p className="galat kartu" role="alert">{galat}</p>}
      {cek?.ditemukan && (
        <div className="kartu" style={{ maxWidth: 720 }}>
          <h3>{cek.nama}</h3>
          <p className="catatan">{cek.tahun_lulus ? `Lulus ${cek.tahun_lulus}. ` : ''}{cek.jawaban ? 'Anda sudah pernah mengisi. Perbarui bila ada perubahan.' : 'Isi dengan kondisi Anda saat ini.'}</p>
          <FormTracer awal={cek.jawaban} kirim={simpan} sibuk={sibuk} tombol="Kirim jawaban" />
        </div>
      )}
    </Halaman>
  )
}
