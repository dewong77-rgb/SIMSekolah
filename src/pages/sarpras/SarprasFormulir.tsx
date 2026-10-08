// Formulir Sarpras resmi Dapodik: F-TANAH, F-BANGUNAN, F-RUANG, dan lembar Alat, Angkutan, Buku.
// Pemegang izin sarpras.kelola mengisi; yang lain melihat. Simpanan berlaku langsung dan menjadi tagihan kerja operator Dapodik.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import EntitasPanel from '../../components/FormulirRinci'
import { muatKatalog, type EntitasF } from '../../lib/formulir'
import { panggil } from '../../lib/rpc'
import GerbangSarpras from './GerbangSarpras'

function Isi({ izin }: { izin: string[] }) {
  const [semua, setSemua] = useState<EntitasF[] | null>(null)
  const [aktif, setAktif] = useState('sarpras_tanah')
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [versi, setVersi] = useState(0)
  const bisaUbah = izin.includes('kelola')

  useEffect(() => { muatKatalog().then(setSemua).catch((e: Error) => setGalat(e.message)) }, [])
  const daftar = useMemo(() => (semua ?? []).filter((e) => e.domain === 'sarpras'), [semua])
  const e = daftar.find((x) => x.kode === aktif) ?? daftar[0]

  async function impor() {
    setSibuk(true); setGalat(''); setInfo('')
    try {
      const n = await panggil<number>('formulir_impor_ruang')
      setInfo(n > 0 ? `${n} ruang dari data Dapodik ditambahkan. Lengkapi jenis prasarana dan ukurannya.` : 'Semua ruang di data Dapodik sudah ada di daftar ini.')
      setVersi((v) => v + 1)
    } catch (x) { setGalat((x as Error).message) }
    setSibuk(false)
  }

  return (
    <Halaman judul="Formulir Dapodik: tanah, bangunan, ruang, alat, angkutan, buku" lead="Isian mengikuti formulir resmi Dapodik. Setiap simpanan langsung berlaku di SIMS dan menjadi tagihan kerja operator Dapodik. Data ini tidak ditimpa oleh unggahan Dapodik.">
      {!bisaUbah && <p className="kartu">Anda hanya dapat melihat. Formulir diisi oleh Waka Sarana dan Prasarana.</p>}
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      {!semua && !galat && <p className="catatan">Memuat...</p>}
      {semua && e && (
        <>
          <div className="pilih-peran" role="tablist" style={{ flexWrap: 'wrap' }}>
            {daftar.map((x) => <button key={x.kode} role="tab" aria-selected={x.kode === e.kode} className={x.kode === e.kode ? 'aktif' : ''} onClick={() => { setAktif(x.kode); setInfo('') }}>{x.judul}</button>)}
          </div>
          <div className="jarak">
            <EntitasPanel
              key={`${e.kode}-${versi}`} entitas={e} semua={semua} owner={null} bisaUbah={bisaUbah} penandatanganKiri="Wakil Sarana Prasarana"
              tambahan={bisaUbah && e.kode === 'sarpras_ruang' ? <button className="tombol" disabled={sibuk} onClick={impor}>Impor ruang dari data Dapodik</button> : null}
            />
          </div>
        </>
      )}
      <p className="catatan jarak">Tagihan muncul di <Link to="/portal/ajuan-masuk">antrean operator Dapodik</Link>. Penghapusan baris juga dicatat sebagai tagihan.</p>
    </Halaman>
  )
}

export default function SarprasFormulir() {
  return <GerbangSarpras perlu={['kelola', 'operasional', 'lihat']} judul="Formulir Dapodik" aktif="/portal/sarpras/formulir">{(izin) => <Isi izin={izin} />}</GerbangSarpras>
}
