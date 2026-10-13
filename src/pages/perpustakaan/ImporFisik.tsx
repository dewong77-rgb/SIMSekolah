import { useState } from 'react'
import { unduhCsv } from '../../lib/hubin'
import type { Fisik } from '../../lib/perpustakaan'
import { panggil } from '../../lib/rpc'
import { bacaBerkas, unduhTemplate, type BarisImpor } from './imporFisikXlsx'

// Impor koleksi fisik dari Excel: unduh template, isi, unggah, periksa pratinjau, lalu impor.

type Hasil = { judul_baru: number; judul_ada: number; eksemplar: number; gagal: { baris: string; alasan: string }[] }
const digit = (s: string | null | undefined) => (s ?? '').replace(/[^0-9Xx]/g, '').toUpperCase()
const kunciJudul = (judul: string | null | undefined, penulis: string | null | undefined) => `${(judul ?? '').trim().toLowerCase()}|${(penulis ?? '').trim().toLowerCase()}`

export default function ImporFisik({ daftar, selesai, tutup }: { daftar: Fisik[]; selesai: () => Promise<void>; tutup: () => void }) {
  const [baris, setBaris] = useState<BarisImpor[] | null>(null)
  const [nama, setNama] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [maju, setMaju] = useState(0)
  const [hasil, setHasil] = useState<Hasil | null>(null)

  const ada = (b: BarisImpor) => {
    const isbn = digit(b.data.isbn)
    return daftar.some((f) => isbn ? digit(f.isbn) === isbn : kunciJudul(f.judul, f.penulis) === kunciJudul(b.data.judul, b.data.penulis))
  }
  const sah = (baris ?? []).filter((b) => !b.galat)
  const salah = (baris ?? []).filter((b) => b.galat)
  const totalEks = sah.reduce((a, b) => a + Number(b.data.jumlah || 0), 0)

  async function pilih(f: File | null) {
    setBaris(null); setHasil(null); setGalat(''); setNama(f?.name ?? '')
    if (!f) return
    try { setBaris(await bacaBerkas(f)) } catch (e) { setGalat((e as Error).message) }
  }

  async function impor() {
    if (!sah.length) return
    setSibuk(true); setGalat(''); setHasil(null); setMaju(0)
    const total: Hasil = { judul_baru: 0, judul_ada: 0, eksemplar: 0, gagal: [] }
    try {
      for (let i = 0; i < sah.length; i += 100) {
        const bagian = sah.slice(i, i + 100)
        const r = await panggil<Hasil>('perpus_fisik_impor', { p_baris: bagian.map((b) => ({ ...b.data, baris: b.baris })) })
        total.judul_baru += r.judul_baru; total.judul_ada += r.judul_ada; total.eksemplar += r.eksemplar; total.gagal.push(...r.gagal)
        setMaju(Math.min(i + 100, sah.length))
      }
      setHasil(total)
      await selesai()
    } catch (e) {
      setGalat(`${(e as Error).message} Sebagian baris mungkin sudah masuk. Periksa daftar koleksi sebelum mengulang, agar tidak ganda.`)
      setHasil(total.judul_baru + total.judul_ada ? total : null)
      await selesai()
    }
    setSibuk(false)
  }

  function unduhGagal() {
    const semua = [...salah.map((b) => [String(b.baris), b.galat ?? ''] as [string, string]), ...(hasil?.gagal ?? []).map((g) => [g.baris, g.alasan] as [string, string])]
    unduhCsv('impor-buku-fisik-gagal', [['Baris di Excel', 'Alasan'], ...semua])
  }

  return (
    <div className="kartu jarak">
      <h3>Impor buku fisik dari Excel</h3>
      <ol className="catatan" style={{ paddingLeft: 18 }}>
        <li>Unduh template, lalu isi satu baris untuk setiap judul beserta jumlah eksemplarnya.</li>
        <li>Unggah berkas yang sudah diisi dan periksa pratinjau.</li>
        <li>Tekan Impor. Judul yang sudah ada tidak digandakan, eksemplarnya ditambahkan.</li>
      </ol>
      <div className="aksi" style={{ marginTop: 0 }}>
        <button type="button" className="tombol" onClick={() => void unduhTemplate()}>Unduh template Excel</button>
        <button type="button" className="tombol" onClick={tutup} disabled={sibuk}>Tutup</button>
      </div>
      <label className="form jarak" style={{ display: 'grid', gap: 6, fontWeight: 600 }}>Berkas Excel (.xlsx)
        <input type="file" accept=".xlsx" disabled={sibuk} onChange={(e) => void pilih(e.target.files?.[0] ?? null)} />
      </label>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}

      {baris && !hasil && (
        <>
          <div className="lencana-baris jarak">
            <span className="lencana">{nama}</span>
            <span className="lencana">{baris.length} baris dibaca</span>
            <span className="lencana" style={{ background: '#e3f4e8', color: '#17603a' }}>{sah.length} siap diimpor ({totalEks} eksemplar)</span>
            {salah.length > 0 && <span className="lencana" style={{ background: '#fde3e3', color: '#8a1f1f' }}>{salah.length} perlu diperbaiki</span>}
          </div>
          <div className="tabel-bungkus"><table>
            <thead><tr><th>Baris</th><th>Judul</th><th>Eksemplar</th><th>Hasil pemeriksaan</th></tr></thead>
            <tbody>
              {baris.slice(0, 200).map((b) => (
                <tr key={b.baris}>
                  <td>{b.baris}</td>
                  <td>{b.data.judul || <em>kosong</em>}<br /><small>{[b.data.penulis, b.data.tahun_terbit, b.data.rak && `Rak ${b.data.rak}`].filter(Boolean).join(' · ')}</small></td>
                  <td>{b.data.jumlah ?? 1}</td>
                  <td>
                    {b.galat
                      ? <span className="status status-ditolak">{b.galat}</span>
                      : ada(b) ? <span className="status status-menunggu">Judul sudah ada, eksemplar ditambahkan</span> : <span className="status status-selesai">Judul baru</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {baris.length > 200 && <p className="catatan">Pratinjau menampilkan 200 baris pertama dari {baris.length}. Semua baris diproses saat impor.</p>}
          <div className="aksi">
            <button type="button" className="tombol tombol-isi" disabled={sibuk || !sah.length} onClick={() => void impor()}>
              {sibuk ? `Mengimpor ${maju} dari ${sah.length}...` : `Impor ${sah.length} baris`}
            </button>
            {salah.length > 0 && <button type="button" className="tombol" onClick={unduhGagal}>Unduh daftar baris bermasalah</button>}
          </div>
          {salah.length > 0 && <p className="catatan">Baris bermasalah dilewati. Perbaiki di Excel, lalu impor ulang berkas itu: judul yang sudah masuk tidak akan digandakan.</p>}
        </>
      )}

      {hasil && (
        <div className="kartu hasil jarak" role="status">
          <strong>Impor selesai.</strong>
          <p style={{ marginBottom: 0 }}>{hasil.judul_baru} judul baru, {hasil.judul_ada} judul sudah ada, {hasil.eksemplar} eksemplar ditambahkan.
            {(hasil.gagal.length + salah.length) > 0 && ` ${hasil.gagal.length + salah.length} baris dilewati.`}</p>
          {(hasil.gagal.length + salah.length) > 0 && <div className="aksi"><button type="button" className="tombol" onClick={unduhGagal}>Unduh daftar baris dilewati</button></div>}
        </div>
      )}
    </div>
  )
}
