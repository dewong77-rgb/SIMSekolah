// Halaman super admin: menguji sambungan ke Google Drive sekolah lewat Edge Function "drive".
import { useState } from 'react'
import Halaman from '../components/Halaman'
import { supabase } from '../lib/supabase'

type Status = {
  terhubung: boolean
  alasan?: string
  folder_induk?: string
  akun?: string | null
  kuota_byte?: number | null
  terpakai_byte?: number | null
}
type Langkah = { nama: string; status: 'jalan' | 'ok' | 'gagal'; ket?: string }

const GB = 1024 ** 3
const ukuran = (b: number) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`)

async function panggilDrive<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('drive', { body })
  if (error) {
    let pesan = error.message
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json()
        if (j?.error) pesan = j.error
      } catch { /* pakai pesan bawaan */ }
    }
    throw new Error(pesan)
  }
  return data as T
}

export default function SambunganDrive() {
  const [sibuk, setSibuk] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [galat, setGalat] = useState('')
  const [langkah, setLangkah] = useState<Langkah[]>([])

  async function uji() {
    setSibuk(true); setGalat(''); setStatus(null)
    try {
      setStatus(await panggilDrive<Status>({ aksi: 'status' }))
    } catch (e) {
      setGalat((e as Error).message)
    }
    setSibuk(false)
  }

  async function ujiUnggah() {
    setSibuk(true); setGalat(''); setLangkah([])
    const daftar: Langkah[] = []
    const catat = (l: Langkah) => { daftar.push(l); setLangkah([...daftar]) }
    const ubahTerakhir = (l: Partial<Langkah>) => { daftar[daftar.length - 1] = { ...daftar[daftar.length - 1], ...l }; setLangkah([...daftar]) }
    try {
      const isi = new Blob([`Uji sambungan SIMS, ${new Date().toISOString()}\n`], { type: 'text/plain' })

      catat({ nama: 'Meminta sesi unggah', status: 'jalan' })
      const sesi = await panggilDrive<{ berkas_id: string; sesi_url: string }>({
        aksi: 'mulai', kategori: 'lainnya', nama: 'uji-sambungan.txt', mime: 'text/plain', ukuran: isi.size,
      })
      ubahTerakhir({ status: 'ok' })

      catat({ nama: 'Mengunggah langsung ke Drive', status: 'jalan' })
      const r = await fetch(sesi.sesi_url, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: isi })
      if (!r.ok) throw new Error(`Drive menolak unggahan (kode ${r.status}).`)
      const hasil = await r.json()
      if (!hasil?.id) throw new Error('Drive tidak mengembalikan id berkas.')
      ubahTerakhir({ status: 'ok' })

      catat({ nama: 'Memverifikasi dan mencatat berkas', status: 'jalan' })
      await panggilDrive({ aksi: 'selesai', berkas_id: sesi.berkas_id, drive_file_id: hasil.id })
      ubahTerakhir({ status: 'ok' })

      catat({ nama: 'Mengunduh kembali berkas uji', status: 'jalan' })
      const { data: jwt } = await supabase.auth.getSession()
      const url = `${import.meta.env.VITE_SUPABASE_URL ?? 'https://myjdtybkfgscerdhyemb.supabase.co'}/functions/v1/drive`
      const u = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt.session?.access_token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_3_nSHpyNyPTRIv2y0zD01A_dDeyGzB6',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ aksi: 'unduh', berkas_id: sesi.berkas_id }),
      })
      if (!u.ok) throw new Error(`Unduh gagal (kode ${u.status}).`)
      const teks = await u.text()
      if (!teks.startsWith('Uji sambungan SIMS')) throw new Error('Isi berkas yang diunduh tidak cocok.')
      ubahTerakhir({ status: 'ok' })

      catat({ nama: 'Menghapus berkas uji (ke tempat sampah Drive)', status: 'jalan' })
      await panggilDrive({ aksi: 'hapus', berkas_id: sesi.berkas_id })
      ubahTerakhir({ status: 'ok', ket: 'Alur lengkap berjalan.' })
    } catch (e) {
      if (daftar.length) ubahTerakhir({ status: 'gagal', ket: (e as Error).message })
      setGalat((e as Error).message)
    }
    setSibuk(false)
  }

  const persen = status?.kuota_byte && status.terpakai_byte != null ? Math.min(100, Math.round((status.terpakai_byte / status.kuota_byte) * 100)) : null

  return (
    <Halaman judul="Sambungan Drive" lead="Uji sambungan ke Google Drive sekolah dan lihat kuota penyimpanan.">
      <div className="kartu form" style={{ maxWidth: 720 }}>
        <h3>Status sambungan</h3>
        <p className="catatan">
          Tombol pertama memeriksa kunci Google di server dan membuat folder induk di Drive bila belum ada.
          Tombol kedua menguji alur lengkap dengan satu berkas kecil yang langsung dihapus.
        </p>
        <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="tombol tombol-isi" onClick={uji} disabled={sibuk}>{sibuk ? 'Memeriksa...' : 'Uji sambungan'}</button>
          <button className="tombol" onClick={ujiUnggah} disabled={sibuk}>Uji unggah dan unduh</button>
        </p>

        {galat && <p role="alert" className="catatan galat">{galat}</p>}

        {status && !status.terhubung && (
          <p role="status" className="catatan galat">Belum tersambung. {status.alasan}</p>
        )}
        {status?.terhubung && (
          <>
            <p role="status" className="catatan sukses">Tersambung.</p>
            <dl className="daftar">
              <dt>Akun Google</dt><dd>{status.akun ?? '-'}</dd>
              <dt>Folder induk</dt>
              <dd>
                {status.folder_induk
                  ? <a href={`https://drive.google.com/drive/folders/${status.folder_induk}`} rel="noopener noreferrer" target="_blank">Buka di Drive</a>
                  : '-'}
              </dd>
              <dt>Kuota terpakai</dt>
              <dd>
                {status.terpakai_byte != null ? ukuran(status.terpakai_byte) : '-'}
                {status.kuota_byte ? ` dari ${ukuran(status.kuota_byte)}${persen != null ? ` (${persen}%)` : ''}` : ''}
              </dd>
            </dl>
            <p className="catatan">Kuota dihitung bersama Gmail dan Google Foto pada akun yang sama.</p>
          </>
        )}

        {langkah.length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>Hasil uji alur lengkap</h3>
            <ol style={{ paddingLeft: 20, margin: 0 }}>
              {langkah.map((l) => (
                <li key={l.nama}>
                  {l.nama}: {l.status === 'jalan' ? 'berjalan...' : l.status === 'ok' ? 'berhasil' : 'GAGAL'}
                  {l.ket && <><br /><small>{l.ket}</small></>}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Halaman>
  )
}
