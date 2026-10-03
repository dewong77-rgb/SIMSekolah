// Atur jam pelajaran dan bel: satu daftar untuk Senin sampai Kamis dan satu untuk Jumat.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { supabase } from '../lib/supabase'
import { type JamBel, menitDari, muatJamBel } from '../lib/kalender'

type Baris = { label: string; jenis: JamBel['jenis']; mulai: string; selesai: string }
type Kel = JamBel['kelompok']

const dua = (n: number) => String(n).padStart(2, '0')
const jamDari = (m: number) => `${dua(Math.floor(m / 60))}:${dua(m % 60)}`

/** Contoh pola: apel, jam pelajaran 45 menit, dua istirahat. Hanya titik awal, wajib disesuaikan. */
function contoh(kel: Kel): Baris[] {
  const durasi = kel === 'jumat' ? 40 : 45
  const hasil: Baris[] = []
  let t = 7 * 60
  let ke = 1
  const pelajaran = (n: number) => { for (let i = 0; i < n; i++) { hasil.push({ label: `Jam ke-${ke++}`, jenis: 'pelajaran', mulai: jamDari(t), selesai: jamDari(t + durasi) }); t += durasi } }
  const rehat = (nama: string, menit: number) => { hasil.push({ label: nama, jenis: 'istirahat', mulai: jamDari(t), selesai: jamDari(t + menit) }); t += menit }
  pelajaran(3); rehat('Istirahat 1', 15); pelajaran(3); rehat('Istirahat 2', 30); pelajaran(kel === 'jumat' ? 1 : 3)
  return hasil
}

function Editor({ kel, judul, awal, boleh, salinDari }: { kel: Kel; judul: string; awal: Baris[]; boleh: boolean; salinDari?: () => Baris[] }) {
  const [baris, setBaris] = useState<Baris[]>(awal)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  useEffect(() => setBaris(awal), [awal])

  const ubah = (i: number, k: keyof Baris, v: string) => setBaris((b) => b.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  async function simpan() {
    setGalat(''); setInfo('')
    const urut = [...baris].sort((a, b) => a.mulai.localeCompare(b.mulai))
    for (const b of urut) {
      if (!b.label.trim()) return setGalat('Setiap baris perlu nama, misalnya "Jam ke-1".')
      if (!b.mulai || !b.selesai) return setGalat('Isi jam mulai dan selesai di semua baris.')
      if (menitDari(b.selesai) <= menitDari(b.mulai)) return setGalat(`${b.label}: jam selesai harus setelah jam mulai.`)
    }
    for (let i = 1; i < urut.length; i++) if (menitDari(urut[i].mulai) < menitDari(urut[i - 1].selesai)) return setGalat(`${urut[i - 1].label} dan ${urut[i].label} saling tumpang tindih.`)
    setSibuk(true)
    const { error } = await supabase.rpc('jam_bel_simpan', { p_kelompok: kel, p_baris: urut })
    setSibuk(false)
    if (error) return setGalat(error.message)
    await muatJamBel(true)
    setInfo('Tersimpan. Jam sistem dan halaman publik memakai jadwal ini.')
  }

  return (
    <div className="kartu form">
      <h3>{judul}</h3>
      {galat && <p role="alert" className="catatan" style={{ color: '#a11' }}>{galat}</p>}
      {info && <p role="status" className="catatan">{info}</p>}
      <div className="tabel-bungkus">
        <table>
          <thead><tr><th>Nama</th><th>Jenis</th><th>Mulai</th><th>Selesai</th><th><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>
            {baris.length === 0 && <tr><td colSpan={5}>Belum ada baris.</td></tr>}
            {baris.map((b, i) => (
              <tr key={i}>
                <td><input value={b.label} maxLength={40} disabled={!boleh} aria-label={`Nama baris ${i + 1}`} onChange={(e) => ubah(i, 'label', e.target.value)} style={{ minWidth: 110 }} /></td>
                <td>
                  <select value={b.jenis} disabled={!boleh} aria-label={`Jenis baris ${i + 1}`} onChange={(e) => ubah(i, 'jenis', e.target.value)}>
                    <option value="pelajaran">Pelajaran</option><option value="istirahat">Istirahat</option><option value="lainnya">Lainnya</option>
                  </select>
                </td>
                <td><input type="time" value={b.mulai} disabled={!boleh} aria-label={`Mulai baris ${i + 1}`} onChange={(e) => ubah(i, 'mulai', e.target.value)} /></td>
                <td><input type="time" value={b.selesai} disabled={!boleh} aria-label={`Selesai baris ${i + 1}`} onChange={(e) => ubah(i, 'selesai', e.target.value)} /></td>
                <td>{boleh && <button type="button" className="tombol" style={{ padding: '4px 10px', color: '#a11' }} onClick={() => setBaris((x) => x.filter((_, j) => j !== i))} aria-label={`Hapus baris ${i + 1}`}>Hapus</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {boleh && (
        <div className="aksi jarak" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="tombol" onClick={() => setBaris((b) => { const t = b.length ? b[b.length - 1].selesai : '07:00'; return [...b, { label: `Jam ke-${b.filter((x) => x.jenis === 'pelajaran').length + 1}`, jenis: 'pelajaran', mulai: t, selesai: '' }] })}>Tambah baris</button>
          <button type="button" className="tombol" onClick={() => { if (!baris.length || window.confirm('Ganti isi tabel dengan contoh pola?')) setBaris(contoh(kel)) }}>Isi dengan contoh</button>
          {salinDari && <button type="button" className="tombol" onClick={() => { if (!baris.length || window.confirm('Ganti isi tabel dengan salinan Senin sampai Kamis?')) setBaris(salinDari()) }}>Salin dari Senin sampai Kamis</button>}
          <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={simpan}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
        </div>
      )}
    </div>
  )
}

export default function KelolaJam() {
  const [data, setData] = useState<JamBel[] | null>(null)
  const [boleh, setBoleh] = useState<boolean | null>(null)
  const [snk, setSnk] = useState<Baris[]>([])
  const [jmt, setJmt] = useState<Baris[]>([])

  useEffect(() => {
    void muatJamBel(true).then((d) => {
      setData(d)
      const ke = (k: Kel): Baris[] => d.filter((x) => x.kelompok === k).map((x) => ({ label: x.label, jenis: x.jenis, mulai: x.mulai, selesai: x.selesai }))
      setSnk(ke('senin_kamis')); setJmt(ke('jumat'))
    })
    void Promise.resolve(supabase.rpc('jam_bel_boleh')).then(({ data: b }) => setBoleh(b === true))
  }, [])

  return (
    <Halaman judul="Jam pelajaran" lead="Jam masuk, jam pelajaran, dan istirahat. Dipakai jam sistem untuk menampilkan jam ke berapa sekarang.">
      {boleh === false && <p className="kartu">Anda hanya dapat melihat. Pengaturan jam dilakukan oleh Waka Kurikulum atau staf kurikulum.</p>}
      {data && (
        <div className="grid grid-2">
          <Editor kel="senin_kamis" judul="Senin sampai Kamis" awal={snk} boleh={boleh === true} />
          <Editor kel="jumat" judul="Jumat" awal={jmt} boleh={boleh === true} salinDari={() => snk.map((x) => ({ ...x }))} />
        </div>
      )}
      <p className="catatan jarak">Sabtu, Minggu, dan hari libur di kalender otomatis dianggap tanpa jam pelajaran. <Link to="/akademik">Lihat tampilan publik</Link></p>
    </Halaman>
  )
}
