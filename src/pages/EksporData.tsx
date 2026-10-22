import { useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { useSekolah } from '../lib/profilSekolah'
import { eksporPesertaDidik, eksporPtk } from '../dapodik/ekspor'

// Admin TU mengunduh biodata lengkap peserta didik dan PTK dalam format Dapodik. Berguna bagi admin yang tidak memegang berkas mentah Dapodik.

type Butir = { kunci: string; judul: string; isi: string; jalankan: (pengunduh: string, sekolah: string | null) => Promise<number> }

const DAFTAR: Butir[] = [
  { kunci: 'pd_aktif', judul: 'Peserta didik aktif', isi: 'Biodata lengkap, data orang tua dan wali, rombel saat ini.', jalankan: (p, s) => eksporPesertaDidik('aktif', p, s) },
  { kunci: 'pd_keluar', judul: 'Peserta didik keluar', isi: 'Lulus, mutasi, dan alasan keluar lainnya, lengkap dengan tanggal keluar.', jalankan: (p, s) => eksporPesertaDidik('keluar', p, s) },
  { kunci: 'guru', judul: 'Guru', isi: 'Biodata dan data kepegawaian guru.', jalankan: (p, s) => eksporPtk('guru', p, s) },
  { kunci: 'tendik', judul: 'Tenaga kependidikan', isi: 'Biodata dan data kepegawaian tenaga kependidikan.', jalankan: (p, s) => eksporPtk('tendik', p, s) },
]

export default function EksporData() {
  const { session } = useAuth()
  const sekolah = useSekolah()
  const [sibuk, setSibuk] = useState<string | null>(null)
  const [hasil, setHasil] = useState<Record<string, string>>({})
  const [galat, setGalat] = useState('')
  const pengunduh = session?.user.email ?? 'Admin'

  async function jalan(b: Butir) {
    setSibuk(b.kunci); setGalat('')
    try {
      const n = await b.jalankan(pengunduh, sekolah.nama ?? null)
      setHasil((h) => ({ ...h, [b.kunci]: `${n.toLocaleString('id-ID')} baris diekspor. Berkas sudah diunduh.` }))
    } catch (e) { setGalat(`${b.judul}: ${(e as Error).message}`) }
    setSibuk(null)
  }

  return (
    <Halaman judul="Ekspor data" lead="Unduh biodata lengkap peserta didik dan PTK dalam format Dapodik, sebagai salinan untuk admin lain.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="kartu perhatian jarak">
        <strong>Berkas ini memuat data pribadi.</strong>
        <p className="catatan" style={{ margin: '4px 0 0' }}>NIK, nomor KK, nomor rekening, dan data orang tua ikut terunduh. Simpan di tempat yang aman dan jangan dibagikan di luar keperluan sekolah. Setiap ekspor tercatat atas nama akun Anda.</p>
      </div>
      <div className="grid grid-2 jarak">
        {DAFTAR.map((b) => (
          <div key={b.kunci} className="kartu">
            <h3 style={{ marginTop: 0 }}>{b.judul}</h3>
            <p className="catatan">{b.isi}</p>
            <div className="aksi"><button type="button" className="tombol tombol-isi" disabled={sibuk !== null} onClick={() => void jalan(b)}>{sibuk === b.kunci ? 'Menyiapkan berkas...' : 'Ekspor ke Excel'}</button></div>
            {hasil[b.kunci] && <p className="catatan" role="status"><strong>{hasil[b.kunci]}</strong></p>}
          </div>
        ))}
      </div>
      <p className="catatan jarak">
        Format kolom sama dengan berkas ekspor Dapodik, jadi hasilnya bisa dibaca kembali lewat <Link to="/portal/unggah">Unggah Dapodik</Link>.
        Data yang diekspor adalah data yang tersimpan di sistem ini, bukan data terbaru di server Dapodik.
      </p>
    </Halaman>
  )
}
