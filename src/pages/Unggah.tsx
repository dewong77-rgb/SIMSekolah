import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { sha256Berkas, unggah, type HasilUnggah } from '../dapodik/unggah'
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

type Item = {
  nama: string; ukuran: number; hasil?: Hasil; galat?: string; sha?: string
  proses?: string; hasilUnggah?: HasilUnggah; paksa?: boolean
}

export default function Unggah() {
  const [item, setItem] = useState<Item[]>([])
  const [sibuk, setSibuk] = useState(false)
  const { profil } = useAuth()

  async function pilih(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setSibuk(true)
    const keluar: Item[] = []
    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer())
        const hasil = await uraiBook(bacaBerkas(bytes))
        keluar.push({ nama: f.name, ukuran: f.size, hasil, sha: await sha256Berkas(bytes) })
      } catch (err) {
        keluar.push({ nama: f.name, ukuran: f.size, galat: (err as Error).message })
      }
      setItem([...keluar])
    }
    setSibuk(false)
    e.target.value = ''
  }

  function ubah(nama: string, p: Partial<Item>) {
    setItem((a) => a.map((x) => (x.nama === nama ? { ...x, ...p } : x)))
  }

  async function kirim(it: Item) {
    if (!it.hasil || !it.sha || !profil) return
    setSibuk(true)
    ubah(it.nama, { proses: 'Memulai', hasilUnggah: undefined })
    try {
      const r = await unggah(it.hasil, it.nama, it.sha, profil.npsn, (m) => ubah(it.nama, { proses: m }), !!it.paksa)
      if (r.status === 'selesai') {
        const c = await supabase.rpc('cocokkan_ajuan')
        const j = c.data as { selesai: number; belum_terbukti: number } | null
        if (j && (j.selesai > 0 || j.belum_terbukti > 0)) r.alasan = `${r.alasan} Ajuan perbaikan: ${j.selesai} selesai, ${j.belum_terbukti} belum tampak di data.`
      }
      ubah(it.nama, { proses: undefined, hasilUnggah: r })
    } catch (e) {
      ubah(it.nama, {
        proses: undefined,
        hasilUnggah: { status: 'gagal', alasan: (e as Error).message, ringkasan: {}, isu: [] },
      })
    }
    setSibuk(false)
  }

  return (
    <Halaman judul="Unggah Dapodik" lead="Pilih berkas ekspor Dapodik. Berkas dibaca di peramban Anda. Data baru dikirim ke server setelah Anda menekan Unggah.">
      <div className="kartu form">
        <label>
          Berkas Dapodik (xlsx atau xls)
          <input type="file" multiple accept=".xlsx,.xls" onChange={pilih} disabled={sibuk} />
        </label>
        <p className="catatan">
          Jenis berkas dikenali dari isinya, bukan dari nama. Urutan yang disarankan: profil, guru dan tendik, daftar peserta didik, peserta didik keluar, daftar hadir, data SMK.
        </p>
        {sibuk && <p className="catatan" aria-live="polite">Membaca berkas...</p>}
      </div>

      {item.map((it) => (
        <div className="kartu jarak" key={it.nama}>
          <h3>{it.nama}</h3>
          {it.galat && <p><strong>Tidak terbaca.</strong> {it.galat}</p>}
          {it.hasil && <Ringkasan h={it.hasil} />}
          {it.hasil && (
            <div className="aksi jarak">
              <button
                className="tombol tombol-isi"
                disabled={sibuk || !!it.proses || it.hasilUnggah?.status === 'selesai' || it.hasil.isu.some((i) => i.tingkat === 'galat')}
                onClick={() => kirim(it)}
              >
                {it.proses ? 'Mengunggah...' : 'Unggah ke database'}
              </button>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 12 }}>
                <input type="checkbox" checked={!!it.paksa} onChange={(e) => ubah(it.nama, { paksa: e.target.checked })} />
                Unggah ulang walau berkas identik sudah pernah masuk
              </label>
            </div>
          )}
          {it.proses && <p className="catatan jarak" aria-live="polite">{it.proses}</p>}
          {it.hasilUnggah && (
            <div className="jarak" aria-live="polite">
              <p>
                <strong>
                  {it.hasilUnggah.status === 'selesai' ? 'Selesai diunggah.' : it.hasilUnggah.status === 'dilewati' ? 'Dilewati.' : 'Gagal.'}
                </strong>{' '}
                {it.hasilUnggah.alasan}
              </p>
              {it.hasilUnggah.status === 'gagal' && it.hasilUnggah.isu.filter((i) => i.tingkat === 'galat').map((i, k) => (
                <p key={k} className="catatan">{i.pesan}</p>
              ))}
            </div>
          )}
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
