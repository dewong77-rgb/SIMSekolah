import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { bacaBerkas } from '../dapodik/readers'
import { uraiBook, type Hasil } from '../dapodik/parser'

const namaJenis: Record<string, string> = {
  profil: 'Profil sekolah',
  sekolah_smk: 'Data SMK (kompetensi, DUDI, MoU)',
  absensi: 'Daftar hadir per rombel',
  pd_aktif: 'Peserta didik aktif',
  pd_keluar: 'Peserta didik keluar',
  guru: 'Guru',
  tendik: 'Tenaga kependidikan',
}

const namaTabel: Record<string, string> = {
  sekolah: 'Sekolah', rombel: 'Rombel', keanggotaan_rombel: 'Keanggotaan rombel',
  peserta_didik: 'Peserta didik', peserta_didik_sensitif: 'Data sensitif peserta didik',
  peserta_didik_stub: 'Peserta didik (dari daftar hadir)', orang_tua_wali: 'Orang tua dan wali',
  ptk: 'PTK', ptk_sensitif: 'Data sensitif PTK', prasarana: 'Prasarana', sarana: 'Sarana',
  bantuan_sekolah: 'Bantuan sekolah', kompetensi_keahlian: 'Kompetensi keahlian', dudi: 'DUDI',
  mou_kerjasama: 'MoU kerja sama', unit_produksi: 'Unit produksi', praktik_industri: 'Praktik industri',
}

type Item = { nama: string; ukuran: number; hasil?: Hasil; galat?: string }

export default function Unggah() {
  const [item, setItem] = useState<Item[]>([])
  const [sibuk, setSibuk] = useState(false)

  async function pilih(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setSibuk(true)
    const keluar: Item[] = []
    for (const f of files) {
      try {
        const book = bacaBerkas(new Uint8Array(await f.arrayBuffer()))
        keluar.push({ nama: f.name, ukuran: f.size, hasil: await uraiBook(book) })
      } catch (err) {
        keluar.push({ nama: f.name, ukuran: f.size, galat: (err as Error).message })
      }
      setItem([...keluar])
    }
    setSibuk(false)
    e.target.value = ''
  }

  return (
    <Halaman judul="Unggah Dapodik" lead="Pilih berkas ekspor Dapodik. Berkas dibaca di peramban Anda dan belum dikirim ke server. Ini tahap pratinjau.">
      <div className="kartu form">
        <label>
          Berkas Dapodik (xlsx atau xls)
          <input type="file" multiple accept=".xlsx,.xls" onChange={pilih} disabled={sibuk} />
        </label>
        <p className="catatan">
          Jenis berkas dikenali dari isinya, bukan dari nama. Data pribadi tidak meninggalkan perangkat ini pada tahap pratinjau.
        </p>
        {sibuk && <p className="catatan" aria-live="polite">Membaca berkas...</p>}
      </div>

      {item.map((it) => (
        <div className="kartu jarak" key={it.nama}>
          <h3>{it.nama}</h3>
          {it.galat && <p><strong>Tidak terbaca.</strong> {it.galat}</p>}
          {it.hasil && <Ringkasan h={it.hasil} />}
        </div>
      ))}
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

function Ringkasan({ h }: { h: Hasil }) {
  const tabel = Object.entries(h.tabel).filter(([n]) => n in namaTabel)
  const galat = h.isu.filter((i) => i.tingkat === 'galat')
  return (
    <>
      <p>
        <strong>{namaJenis[h.jenis] ?? h.jenis}</strong>
        {h.diunduh && <> · diunduh {h.diunduh.replace('T', ' ')}</>}
        {h.pengunduh && <> oleh {h.pengunduh}</>}
        {h.semester && <> · semester {h.semester}</>}
        {h.semesterAbsensi.length > 0 && <> · semester {h.semesterAbsensi.join(', ')}</>}
      </p>
      {galat.length > 0 && <p><strong>Ada galat. Berkas ini tidak akan diunggah.</strong></p>}
      <table>
        <thead><tr><th>Tabel tujuan</th><th>Jumlah baris</th></tr></thead>
        <tbody>
          {tabel.map(([n, rows]) => (
            <tr key={n}><td>{namaTabel[n]}</td><td>{rows.length.toLocaleString('id-ID')}</td></tr>
          ))}
        </tbody>
      </table>
      {h.jenis === 'pd_keluar' && h.ringkasan.status !== undefined && (
        <p className="catatan jarak">
          Status: {Object.entries(h.ringkasan.status as Record<string, number>).map(([k, v]) => `${k} ${v}`).join(', ')}
        </p>
      )}
      <h4>Isu ({h.isu.length})</h4>
      {h.isu.length === 0 ? <p className="catatan">Tidak ada isu.</p> : (
        <ul>
          {h.isu.map((i, k) => (
            <li key={k}>
              <strong>{i.tingkat}</strong>: {i.pesan}
              {i.lembar && <small> [{i.lembar}{i.kolom ? `, ${i.kolom}` : ''}{i.baris ? `, baris ${i.baris}` : ''}]</small>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
