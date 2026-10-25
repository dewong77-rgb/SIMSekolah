import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil, tgl } from '../lib/rpc'
import { unduhCsv } from './lmsUtil'

// Rekap LMS per rombel dan mata pelajaran: mapel mana yang sudah mengunggah pertemuan, mana yang belum.
// Admin TU, Waka Kurikulum, dan Kepala Sekolah melihat semua rombel. Wali kelas hanya rombelnya.

type Status = 'sudah' | 'draf' | 'belum'
type Mapel = { kelas_id: string; mapel: string; guru: string | null; pertemuan: number; terbit: number; lengkap: number; terakhir: string | null; status: Status }
type Rombel = { rombel_id: string; rombel: string; wali: string | null; mapel: Mapel[] }
type Data = { semua: boolean; rombel: Rombel[] }

const LABEL: Record<Status, { teks: string; kelas: string }> = {
  sudah: { teks: 'Sudah upload', kelas: 'status status-selesai' },
  draf: { teks: 'Masih draf', kelas: 'status status-menunggu' },
  belum: { teks: 'Belum upload', kelas: 'status status-ditolak' },
}
const URUT: Record<Status, number> = { belum: 0, draf: 1, sudah: 2 }
const hitung = (r: Rombel) => ({
  sudah: r.mapel.filter((m) => m.status === 'sudah').length,
  draf: r.mapel.filter((m) => m.status === 'draf').length,
  belum: r.mapel.filter((m) => m.status === 'belum').length,
})

export default function RekapLmsMapel() {
  const [data, setData] = useState<Data | null>(null)
  const [galat, setGalat] = useState('')
  const [hanyaBelum, setHanyaBelum] = useState(false)
  const [cari, setCari] = useState('')
  useEffect(() => { panggil<Data>('lms_rekap_mapel').then(setData).catch((e: Error) => setGalat(e.message)) }, [])

  const rombel = useMemo(() => {
    const q = cari.trim().toLowerCase()
    return (data?.rombel ?? [])
      .map((r) => ({
        ...r,
        mapel: r.mapel
          .filter((m) => (!hanyaBelum || m.status !== 'sudah') && (!q || r.rombel.toLowerCase().includes(q) || m.mapel.toLowerCase().includes(q) || (m.guru ?? '').toLowerCase().includes(q)))
          .sort((a, b) => URUT[a.status] - URUT[b.status] || a.mapel.localeCompare(b.mapel)),
      }))
      .filter((r) => r.mapel.length > 0)
  }, [data, hanyaBelum, cari])

  const semua = (data?.rombel ?? []).flatMap((r) => r.mapel)
  const sudah = semua.filter((m) => m.status === 'sudah').length
  const draf = semua.filter((m) => m.status === 'draf').length
  const belum = semua.filter((m) => m.status === 'belum').length
  const guruBelum = new Set(semua.filter((m) => m.status !== 'sudah').map((m) => m.guru).filter(Boolean)).size

  function unduh() {
    if (!data) return
    unduhCsv('rekap-lms-per-mapel.csv', [
      ['Rombel', 'Wali kelas', 'Mata pelajaran', 'Guru', 'Status', 'Pertemuan dibuat', 'Pertemuan terbit', 'Terbit dan lengkap', 'Terakhir terbit'],
      ...data.rombel.flatMap((r) => r.mapel.map((m) => [r.rombel, r.wali, m.mapel, m.guru, LABEL[m.status].teks, m.pertemuan, m.terbit, m.lengkap, m.terakhir ? tgl(m.terakhir) : ''])),
    ])
  }

  return (
    <Halaman judul="Rekap LMS per kelas" lead={data && !data.semua ? 'Mata pelajaran di kelas yang Anda walikan: mana yang sudah mengunggah pertemuan, mana yang belum.' : 'Per rombel: mata pelajaran mana yang sudah mengunggah pertemuan LMS, mana yang belum, dan siapa gurunya.'}>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!data && !galat && <p className="catatan">Memuat...</p>}
      {data && (
        <>
          <div className="pantau-ringkas">
            <div className="ringkas-kartu"><div><strong>{data.rombel.length}</strong><span>Rombel</span></div></div>
            <div className="ringkas-kartu"><div><strong>{sudah} <small>dari {semua.length}</small></strong><span>Mapel sudah upload</span></div></div>
            <div className="ringkas-kartu"><div><strong>{belum + draf}</strong><span>Belum upload ({draf} masih draf)</span></div></div>
            <div className="ringkas-kartu"><div><strong>{guruBelum}</strong><span>Guru yang masih punya mapel belum upload</span></div></div>
          </div>
          <p className="catatan">Sudah upload berarti ada minimal satu pertemuan yang diterbitkan untuk siswa. Pertemuan lengkap bila punya bahan bacaan dan lembar kerja.</p>
          <div className="aksi jarak" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="search" placeholder="Cari rombel, mapel, atau guru" value={cari} onChange={(e) => setCari(e.target.value)} style={{ maxWidth: 280 }} aria-label="Cari" />
            <label className="baris-centang"><input type="checkbox" checked={hanyaBelum} onChange={(e) => setHanyaBelum(e.target.checked)} /> Hanya yang belum upload</label>
            <button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={unduh}>Unduh CSV</button>
          </div>
          {data.rombel.length === 0 && <div className="kartu jarak"><p>Belum ada kelas ajar di rombel yang bisa Anda lihat.</p></div>}
          {data.rombel.length > 0 && rombel.length === 0 && <div className="kartu jarak"><p>Tidak ada yang cocok dengan penyaringan.</p></div>}
          {rombel.map((r) => {
            const asli = data.rombel.find((x) => x.rombel_id === r.rombel_id) ?? r
            const h = hitung(asli)
            const total = asli.mapel.length
            return (
              <details key={r.rombel_id} className="kartu rekap-rombel" open={data.rombel.length <= 3 || h.belum + h.draf > 0}>
                <summary>
                  <span className="rekap-judul">
                    <strong>{r.rombel}</strong>
                    <small>{r.wali ? `Wali kelas: ${r.wali}` : 'Wali kelas belum diatur'}</small>
                  </span>
                  <span>
                    <span className="rekap-angka"><b>{h.sudah} sudah</b> dari {total} mapel · <em>{h.belum + h.draf} belum</em></span>
                    <div className="rekap-bar"><i style={{ width: `${total > 0 ? (h.sudah / total) * 100 : 0}%` }} /></div>
                  </span>
                </summary>
                <div className="tabel-bungkus">
                  <table>
                    <thead><tr><th>Mata pelajaran</th><th>Guru</th><th>Status</th><th>Terbit</th><th>Lengkap</th><th>Terakhir terbit</th></tr></thead>
                    <tbody>
                      {r.mapel.map((m) => (
                        <tr key={m.kelas_id}>
                          <td><Link to={`/portal/lms/${m.kelas_id}`}>{m.mapel}</Link></td>
                          <td>{m.guru ?? '-'}</td>
                          <td><span className={LABEL[m.status].kelas}>{LABEL[m.status].teks}</span></td>
                          <td>{m.terbit} <small>dari {m.pertemuan}</small></td>
                          <td>{m.lengkap}</td>
                          <td>{m.terakhir ? tgl(m.terakhir) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )
          })}
        </>
      )}
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
