// Berkas pribadi, modul ajar, dan arsip surat. Berkas disimpan di Google Drive sekolah dalam folder
// terstruktur per orang (lihat private.berkas_jalur). Izin baca dijaga basis data, bukan tautan publik.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { AKSEPTASI, hapusBerkas, periksaBerkas, ukuranTeks, unduhBerkas, unggahBerkas } from '../lib/berkas'
import { panggil, tgl } from '../lib/rpc'

type Jenis = 'berkas_pribadi' | 'modul_ajar' | 'arsip_surat'
type Baris = { id: string; nama: string; ukuran: number; mime: string; dibuat_pada: string; milik_saya: boolean }

const keterangan: Record<Jenis, { label: string; ket: string }> = {
  berkas_pribadi: { label: 'Berkas pribadi', ket: 'Ijazah, SK, sertifikat, dan dokumen pribadi lain. Hanya Anda dan TU yang dapat membuka.' },
  modul_ajar: { label: 'Modul ajar', ket: 'Modul ajar per tahun ajaran. Hanya Anda dan TU yang dapat membuka.' },
  arsip_surat: { label: 'Arsip surat', ket: 'Salinan surat masuk dan keluar per tahun ajaran. Dikelola TU.' },
}

export default function BerkasSaya() {
  const { profil, superAdmin } = useAuth()
  const tu = profil?.peran === 'admin_tu' || superAdmin
  const jenisBoleh: Jenis[] = [
    'berkas_pribadi',
    ...(profil?.ptk_id ? (['modul_ajar'] as Jenis[]) : []),
    ...(tu ? (['arsip_surat'] as Jenis[]) : []),
  ]
  const [jenis, setJenis] = useState<Jenis>('berkas_pribadi')
  const [daftar, setDaftar] = useState<Baris[] | null>(null)
  const [berkas, setBerkas] = useState<File | null>(null)
  const [progres, setProgres] = useState<number | null>(null)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')

  const muat = useCallback(async () => {
    setDaftar(null)
    try { setDaftar(await panggil<Baris[]>('berkas_daftar', { p_kategori: jenis })) } catch (e) { setGalat((e as Error).message); setDaftar([]) }
  }, [jenis])
  useEffect(() => { void muat() }, [muat])

  function pilih(f: File | null) {
    setGalat('')
    if (f) {
      const salah = periksaBerkas(f)
      if (salah) { setGalat(salah); setBerkas(null); return }
    }
    setBerkas(f)
  }

  async function kirim(e: FormEvent) {
    e.preventDefault()
    if (!berkas) { setGalat('Pilih berkas dulu.'); return }
    setSibuk(true); setGalat(''); setProgres(null)
    try {
      await unggahBerkas(berkas, jenis, null, setProgres)
      setBerkas(null)
      ;(e.target as HTMLFormElement).reset()
      await muat()
    } catch (er) { setGalat((er as Error).message) }
    setProgres(null); setSibuk(false)
  }

  async function unduh(b: Baris) {
    setGalat('')
    try { await unduhBerkas(b.id, b.nama) } catch (e) { setGalat((e as Error).message) }
  }

  async function hapus(b: Baris) {
    if (!window.confirm(`Hapus "${b.nama}"? Berkas dipindahkan ke tempat sampah Drive.`)) return
    setGalat('')
    try { await hapusBerkas(b.id); await muat() } catch (e) { setGalat((e as Error).message) }
  }

  return (
    <Halaman judul="Berkas saya" lead="Simpan dokumen di folder Drive sekolah yang tertata per orang dan per jenis berkas.">
      <div className="aksi" role="tablist">
        {jenisBoleh.map((j) => (
          <button key={j} type="button" role="tab" aria-selected={j === jenis} className={j === jenis ? 'tombol tombol-isi' : 'tombol'} onClick={() => setJenis(j)} disabled={sibuk}>
            {keterangan[j].label}
          </button>
        ))}
      </div>
      <p className="catatan">{keterangan[jenis].ket}</p>

      <form className="kartu form jarak" onSubmit={kirim}>
        <label>Berkas (maksimal 25 MB)
          <input type="file" accept={AKSEPTASI} disabled={sibuk} onChange={(e) => pilih(e.target.files?.[0] ?? null)} />
          <span className="petunjuk">PDF, Word, Excel, PowerPoint, gambar, atau teks.{berkas && <> Dipilih: {berkas.name} ({ukuranTeks(berkas.size)}).</>}</span>
        </label>
        {progres != null && <p className="catatan" role="status">Mengunggah berkas... {progres}%</p>}
        {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
        <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk || !berkas}>{sibuk ? 'Mengunggah...' : 'Unggah'}</button></div>
      </form>

      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Nama berkas</th><th>Ukuran</th><th>Diunggah</th><th>Aksi</th></tr></thead>
          <tbody>
            {!daftar && <tr><td colSpan={4}>Memuat...</td></tr>}
            {daftar && daftar.length === 0 && <tr><td colSpan={4}>Belum ada berkas.</td></tr>}
            {(daftar ?? []).map((b) => (
              <tr key={b.id}>
                <td>{b.nama}</td>
                <td>{ukuranTeks(b.ukuran)}</td>
                <td>{tgl(b.dibuat_pada)}</td>
                <td>
                  <button type="button" className="tombol" onClick={() => void unduh(b)}>Unduh</button>{' '}
                  <button type="button" className="tombol" onClick={() => void hapus(b)}>Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Halaman>
  )
}
