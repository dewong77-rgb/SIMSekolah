import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil, tglJam } from '../lib/rpc'
import { LembarJawabanGuru } from './LmsLembar'
import type { Materi } from './LmsBelajar'

// Guru melihat isian lembar kerja semua siswa untuk satu pertemuan, dalam satu halaman.
// Isian dibuka per siswa, atau semuanya sekaligus. Penilaian tetap di halaman tugas.

type Siswa = {
  peserta_didik_id: string; nama: string; nisn: string | null; no_urut: number | null
  status: 'belum' | 'terkumpul' | 'terlambat' | 'dinilai'; dikumpul_pada: string | null; nilai: number | null; umpan_balik: string | null
}
type Rekap = { tugas: { id: string; judul: string; nilai_maks: number }; siswa: Siswa[] }
type Saring = 'semua' | 'sudah' | 'belum'

const LABEL: Record<string, string> = { belum: 'Belum mengumpulkan', terkumpul: 'Terkumpul', terlambat: 'Terlambat', dinilai: 'Dinilai' }
const KELAS: Record<string, string> = { belum: 'status-dibatalkan', terkumpul: 'status-menunggu', terlambat: 'status-ditolak', dinilai: 'status-selesai' }

export default function IsianLembar() {
  const { kelasId = '', id = '' } = useParams()
  const [judul, setJudul] = useState('')
  const [lembar, setLembar] = useState<Materi[] | null>(null)
  const [tugasId, setTugasId] = useState('')
  const [rekap, setRekap] = useState<Rekap | null>(null)
  const [galat, setGalat] = useState('')
  const [buka, setBuka] = useState<Set<string>>(new Set())
  const [saring, setSaring] = useState<Saring>('semua')

  useEffect(() => {
    panggil<{ pertemuan: { judul: string; nomor: number }; materi: Materi[] }>('lms_materi_buka', { p_pertemuan: id })
      .then((r) => {
        setJudul(`Pertemuan ${r.pertemuan.nomor}: ${r.pertemuan.judul}`)
        const l = r.materi.filter((m) => m.tugas_id)
        setLembar(l)
        setTugasId((t) => t || l[0]?.tugas_id || '')
      }).catch((e: Error) => setGalat(e.message))
  }, [id])

  const muat = useCallback(async () => {
    if (!tugasId) return
    setRekap(null); setBuka(new Set())
    try { setRekap(await panggil<Rekap>('lms_tugas_rekap', { p_tugas: tugasId })) } catch (e) { setGalat((e as Error).message) }
  }, [tugasId])
  useEffect(() => { void muat() }, [muat])

  const semua = rekap?.siswa ?? []
  const sudah = semua.filter((s) => s.status !== 'belum')
  const tampil = useMemo(() => semua.filter((s) => saring === 'semua' || (saring === 'sudah' ? s.status !== 'belum' : s.status === 'belum')), [semua, saring])
  const alih = (pd: string) => setBuka((b) => { const n = new Set(b); if (n.has(pd)) n.delete(pd); else n.add(pd); return n })
  const bukaSemua = sudah.length > 0 && sudah.every((s) => buka.has(s.peserta_didik_id))

  return (
    <Halaman judul="Isian lembar kerja siswa" lead={judul || undefined}>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!lembar && !galat && <p className="catatan">Memuat...</p>}
      {lembar && lembar.length === 0 && <div className="kartu"><p>Pertemuan ini belum punya lembar kerja.</p><p className="catatan">Lembar kerja ditambahkan dari halaman pertemuan.</p></div>}
      {lembar && lembar.length > 1 && (
        <label>Lembar kerja
          <select value={tugasId} onChange={(e) => setTugasId(e.target.value)}>{lembar.map((m) => <option key={m.tugas_id!} value={m.tugas_id!}>{m.judul}</option>)}</select>
        </label>
      )}
      {rekap && (
        <>
          <div className="grid grid-3 jarak">
            <div className="kartu"><small>Sudah mengumpulkan</small><p style={{ margin: 0, fontSize: '1.6rem' }}>{sudah.length} <small>dari {semua.length} siswa</small></p></div>
            <div className="kartu"><small>Sudah dinilai</small><p style={{ margin: 0, fontSize: '1.6rem' }}>{semua.filter((s) => s.status === 'dinilai').length}</p></div>
            <div className="kartu"><small>Belum mengumpulkan</small><p style={{ margin: 0, fontSize: '1.6rem' }}>{semua.length - sudah.length}</p></div>
          </div>
          <div className="aksi jarak">
            <label>Tampilkan
              <select value={saring} onChange={(e) => setSaring(e.target.value as Saring)}>
                <option value="semua">Semua siswa</option><option value="sudah">Sudah mengumpulkan</option><option value="belum">Belum mengumpulkan</option>
              </select>
            </label>
            <button type="button" className="tombol" disabled={sudah.length === 0} onClick={() => setBuka(bukaSemua ? new Set() : new Set(sudah.map((s) => s.peserta_didik_id)))}>
              {bukaSemua ? 'Sembunyikan semua isian' : `Buka semua isian (${sudah.length})`}
            </button>
            <Link to={`/portal/lms/${kelasId}/tugas/${rekap.tugas.id}`} className="tombol tombol-isi">Beri nilai</Link>
          </div>
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>No</th><th>Nama</th><th>Status</th><th>Nilai</th><th></th></tr></thead>
              <tbody>
                {tampil.length === 0 && <tr><td colSpan={5}>Tidak ada siswa yang cocok.</td></tr>}
                {tampil.map((s, i) => (
                  <tr key={s.peserta_didik_id}>
                    <td>{s.no_urut ?? i + 1}</td>
                    <td>{s.nama}<br /><small>{s.nisn ?? ''}</small></td>
                    <td><span className={`status ${KELAS[s.status]}`}>{LABEL[s.status]}</span>{s.dikumpul_pada ? <><br /><small>{tglJam(s.dikumpul_pada)}</small></> : null}</td>
                    <td>{s.nilai !== null ? `${s.nilai}/${rekap.tugas.nilai_maks}` : '-'}</td>
                    <td>
                      {s.status !== 'belum' && <button type="button" className="tombol" onClick={() => alih(s.peserta_didik_id)} aria-expanded={buka.has(s.peserta_didik_id)}>{buka.has(s.peserta_didik_id) ? 'Sembunyikan isian' : 'Lihat isian'}</button>}
                      {buka.has(s.peserta_didik_id) && <LembarJawabanGuru tugasId={rekap.tugas.id} pdId={s.peserta_didik_id} />}
                      {buka.has(s.peserta_didik_id) && s.umpan_balik && <p className="catatan"><strong>Umpan balik guru:</strong> {s.umpan_balik}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="catatan jarak"><Link to={`/portal/lms/${kelasId}`}>Kembali ke daftar pertemuan</Link></p>
    </Halaman>
  )
}
