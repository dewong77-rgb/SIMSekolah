// Antrean operator Dapodik untuk isian mandiri: kolom yang diisi sendiri oleh guru, siswa, atau orang tua
// dan baris riwayat baru. Operator menginput ke Dapodik, lalu menandai "sudah diinput".
import { useCallback, useEffect, useMemo, useState } from 'react'
import { panggil } from '../lib/rpc'
import { bagianPtk, bagianSiswa, tampilIsi } from '../lib/formulir'

type Isian = { id: string; jenis: 'ptk' | 'siswa'; subjek_id: string; subjek_nama: string; kunci: string; label: string; kelompok: string; nilai: string; pengisi_peran: string; status: string; dibuat_pada: string }
type Riwayat = { id: string; jenis: 'ptk' | 'siswa'; subjek_id: string; subjek_nama: string; bagian: string; data: Record<string, string>; status: string; dibuat_pada: string }
type Antrean = { isian: Isian[]; riwayat: Riwayat[] }

const waktu = (t: string) => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
const namaPengisi: Record<string, string> = { guru: 'Guru', staf: 'Tendik', siswa: 'Siswa', orang_tua: 'Orang tua' }
const judulBagian = (jenis: string, bagian: string) => (jenis === 'ptk' ? bagianPtk : bagianSiswa).find((b) => b.kunci === bagian)?.judul ?? bagian
const rincian = (r: Riwayat) => {
  const b = (r.jenis === 'ptk' ? bagianPtk : bagianSiswa).find((x) => x.kunci === r.bagian)
  return (b?.kolom ?? []).filter((c) => r.data[c.kunci]).map((c) => `${c.label}: ${tampilIsi(r.data[c.kunci])}`).join('; ')
}

export default function IsianBaru({ onJumlah }: { onJumlah?: (n: number) => void }) {
  const [tampilStatus, setTampilStatus] = useState<'baru' | 'dientri'>('baru')
  const [data, setData] = useState<Antrean | null>(null)
  const [cari, setCari] = useState('')
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    try {
      const a = (await panggil<Antrean | null>('isian_antrean', { p_status: tampilStatus })) ?? { isian: [], riwayat: [] }
      setData(a)
      if (tampilStatus === 'baru') onJumlah?.(a.isian.length + a.riwayat.length)
    } catch (e) { setGalat((e as Error).message) }
  }, [tampilStatus, onJumlah])
  useEffect(() => { void muat() }, [muat])

  const q = cari.trim().toLowerCase()
  // Dikelompokkan per orang agar operator menginput satu profil sekaligus.
  const perOrang = useMemo(() => {
    const m = new Map<string, { nama: string; jenis: string; isian: Isian[]; riwayat: Riwayat[] }>()
    const ambil = (id: string, nama: string, jenis: string) => {
      if (!m.has(id)) m.set(id, { nama, jenis, isian: [], riwayat: [] })
      return m.get(id)!
    }
    for (const i of data?.isian ?? []) ambil(i.subjek_id, i.subjek_nama, i.jenis).isian.push(i)
    for (const r of data?.riwayat ?? []) ambil(r.subjek_id, r.subjek_nama, r.jenis).riwayat.push(r)
    return [...m.entries()].filter(([, v]) => !q || v.nama.toLowerCase().includes(q)).sort((a, b) => a[1].nama.localeCompare(b[1].nama, 'id'))
  }, [data, q])

  async function tandai(isian: Isian[], riwayat: Riwayat[], dientri: boolean) {
    setSibuk(true); setGalat(''); setInfo('')
    try {
      if (isian.length) await panggil('isian_tandai', { p_tipe: 'isian', p_ids: isian.map((x) => x.id), p_dientri: dientri })
      if (riwayat.length) await panggil('isian_tandai', { p_tipe: 'riwayat', p_ids: riwayat.map((x) => x.id), p_dientri: dientri })
      setInfo(dientri ? 'Ditandai sudah diinput ke Dapodik.' : 'Dikembalikan ke antrean.')
      await muat()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  async function unduh() {
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Isian mandiri')
    ws.addRow(['Nama', 'Jenis', 'Bagian', 'Kolom', 'Nilai', 'Diisi oleh', 'Waktu']).font = { bold: true }
    for (const i of data?.isian ?? []) ws.addRow([i.subjek_nama, i.jenis === 'ptk' ? 'Guru/tendik' : 'Siswa', i.kelompok, i.label, i.nilai, namaPengisi[i.pengisi_peran] ?? i.pengisi_peran, waktu(i.dibuat_pada)])
    for (const r of data?.riwayat ?? []) ws.addRow([r.subjek_nama, r.jenis === 'ptk' ? 'Guru/tendik' : 'Siswa', judulBagian(r.jenis, r.bagian), 'Baris riwayat', rincian(r), '', waktu(r.dibuat_pada)])
    ws.columns.forEach((c, n) => { c.width = [28, 12, 26, 28, 60, 14, 20][n] })
    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a')
    a.href = url; a.download = `isian-mandiri-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <p className="catatan jarak">
        Isian yang diisi sendiri oleh guru, tendik, siswa, dan orang tua. Input ke aplikasi Dapodik atau VervalPD, lalu tandai sudah diinput. Isian tidak hilang saat unggahan Dapodik berikutnya; bila Dapodik sudah memuat nilainya, isian selesai otomatis.
      </p>
      <div className="aksi jarak" style={{ alignItems: 'center' }}>
        <input type="search" placeholder="Cari nama" aria-label="Cari nama" value={cari} onChange={(e) => setCari(e.target.value)} style={{ flex: '1 1 14rem', maxWidth: '20rem' }} />
        <select aria-label="Status" value={tampilStatus} onChange={(e) => setTampilStatus(e.target.value as 'baru' | 'dientri')}>
          <option value="baru">Belum diinput</option>
          <option value="dientri">Sudah diinput</option>
        </select>
        <button className="tombol" type="button" disabled={!data || perOrang.length === 0} onClick={unduh}>Unduh Excel</button>
      </div>
      <div aria-live="polite">
        {info && <p className="catatan sukses jarak" role="status">{info}</p>}
        {galat && <p className="catatan galat jarak" role="alert">{galat}</p>}
      </div>
      {!data && <p className="catatan">Memuat...</p>}
      {data && perOrang.length === 0 && <p className="catatan">Tidak ada isian.</p>}
      {perOrang.map(([id, o]) => (
        <section key={id} className="kartu bagian-profil jarak">
          <h3>{o.nama} <small className="petunjuk">{o.jenis === 'ptk' ? 'Guru/tendik' : 'Siswa'}</small></h3>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Bagian</th><th>Kolom</th><th>Isian</th><th>Diisi</th></tr></thead>
              <tbody>
                {o.isian.map((i) => (
                  <tr key={i.id}><td>{i.kelompok}</td><td>{i.label}</td><td><strong>{i.nilai}</strong></td><td>{namaPengisi[i.pengisi_peran] ?? i.pengisi_peran}, {waktu(i.dibuat_pada)}{i.status === 'selesai' ? ' (sudah ada di Dapodik)' : ''}</td></tr>
                ))}
                {o.riwayat.map((r) => (
                  <tr key={r.id}><td>{judulBagian(r.jenis, r.bagian)}</td><td>Baris riwayat</td><td>{rincian(r)}</td><td>{waktu(r.dibuat_pada)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="aksi jarak">
            {tampilStatus === 'baru'
              ? <button className="tombol tombol-isi" disabled={sibuk} onClick={() => tandai(o.isian, o.riwayat, true)}>Tandai sudah diinput</button>
              : <button className="tombol" disabled={sibuk || o.isian.every((i) => i.status === 'selesai') && o.riwayat.length === 0} onClick={() => tandai(o.isian.filter((i) => i.status !== 'selesai'), o.riwayat, false)}>Kembalikan ke antrean</button>}
          </div>
        </section>
      ))}
    </>
  )
}
