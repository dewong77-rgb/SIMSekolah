import { useCallback, useEffect, useState } from 'react'
import Halaman from '../components/Halaman'
import { panggil } from '../lib/rpc'
import { unduhCsv } from './lmsUtil'

// Waka Kurikulum memantau satu jam pelajaran: kelas terjadwal, guru sudah masuk LMS atau belum, jumlah siswa yang masuk,
// dan mengingatkan guru yang belum masuk. Bergantung pada jadwal pelajaran dan jam bel yang diisi bagian kurikulum.

type Jam = { ke: number; label: string; mulai: string; selesai: string; mulai_menit: number; selesai_menit: number }
type Baris = {
  rombel_id: string; rombel: string; mapel: string; ptk_id: string | null; guru: string | null
  guru_masuk: boolean; guru_pertama: string | null; guru_terakhir: string | null; guru_online: boolean
  siswa_total: number; siswa_masuk: number; ada_kelas: boolean; ada_pertemuan: boolean
}
type Data = { tanggal: string; hari: number; hari_ini: boolean; menit_sekarang: number; jam_sekarang: number; jam_dipilih: number; jam: Jam[]; baris: Baris[] }

const hariIni = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
const jam = (x: string | null) => (x ? new Date(x).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-')
const NAMA_HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

function kapital(n: string): string {
  return n.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
}

type Waktu = 'depan' | 'berjalan' | 'lewat'
function waktuJam(d: Data, j: Jam | undefined): Waktu {
  if (!j) return 'lewat'
  if (!d.hari_ini) return 'lewat'
  if (d.menit_sekarang < j.mulai_menit) return 'depan'
  if (d.menit_sekarang < j.selesai_menit) return 'berjalan'
  return 'lewat'
}

function statusGuru(b: Baris, w: Waktu): { label: string; kelas: string; perlu: boolean } {
  if (!b.ptk_id) return { label: 'Guru belum diisi di jadwal', kelas: 'status-dibatalkan', perlu: false }
  if (b.guru_masuk) return { label: b.guru_online ? 'Masuk, online' : 'Masuk', kelas: 'status-selesai', perlu: false }
  if (w === 'depan') return { label: 'Belum waktunya', kelas: 'status-menunggu', perlu: false }
  return { label: w === 'berjalan' ? 'Belum masuk' : 'Tidak masuk', kelas: 'status-dibatalkan', perlu: w === 'berjalan' }
}

export default function PantauJamLms() {
  const [tanggal, setTanggal] = useState(hariIni)
  const [jamManual, setJamManual] = useState<number | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [langsung, setLangsung] = useState(true)
  const [terkirim, setTerkirim] = useState<Set<string>>(new Set())
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    try { setData(await panggil<Data>('lms_pantau_jam', { p_tanggal: tanggal, p_jam: jamManual })); setGalat('') } catch (e) { setGalat((e as Error).message) }
  }, [tanggal, jamManual])
  useEffect(() => { void muat() }, [muat])
  useEffect(() => {
    if (!langsung || tanggal !== hariIni()) return
    const j = window.setInterval(() => { if (document.visibilityState === 'visible') void muat() }, 30_000)
    return () => window.clearInterval(j)
  }, [langsung, tanggal, muat])

  const dipilih = data?.jam.find((j) => j.ke === data.jam_dipilih)
  const w = data ? waktuJam(data, dipilih) : 'lewat'
  const baris = data?.baris ?? []
  const guruMasuk = baris.filter((b) => b.ptk_id && b.guru_masuk).length
  const guruBelum = baris.filter((b) => statusGuru(b, w).perlu)
  const siswaMasuk = baris.reduce((j, b) => j + b.siswa_masuk, 0)
  const siswaTotal = baris.reduce((j, b) => j + b.siswa_total, 0)

  const teks = (b: Baris) => `Jam ke-${data?.jam_dipilih} (${dipilih?.mulai}-${dipilih?.selesai}) kelas ${b.rombel} ${b.mapel} belum terlihat dibuka di LMS. Mohon segera masuk kelas dan buka LMS.`
  async function ingatkan(daftar: Baris[]) {
    setSibuk(true); setGalat(''); setPesan('')
    let ok = 0; let tunda = 0
    const baru = new Set(terkirim)
    for (const b of daftar) {
      if (!b.ptk_id) continue
      try {
        const terkirimBaru = await panggil<boolean>('lms_ingatkan', { p_ptk: b.ptk_id, p_pesan: teks(b) })
        if (terkirimBaru) ok++; else tunda++
        baru.add(b.ptk_id)
      } catch (e) { setGalat((e as Error).message); break }
    }
    setTerkirim(baru)
    setPesan(`${ok} pengingat terkirim.${tunda ? ` ${tunda} guru sudah diingatkan kurang dari 10 menit lalu.` : ''}`)
    setSibuk(false)
  }

  function unduh() {
    unduhCsv(`pantau-jam-${data?.jam_dipilih ?? ''}-${tanggal}.csv`, [
      ['Kelas', 'Mata pelajaran', 'Guru', 'Status guru', 'Akses guru', 'Siswa masuk', 'Siswa total'],
      ...baris.map((b) => [b.rombel, b.mapel, b.guru ? kapital(b.guru) : '', statusGuru(b, w).label, jam(b.guru_pertama), b.siswa_masuk, b.siswa_total]),
    ])
  }

  return (
    <Halaman judul="Pantau per jam pelajaran" lead="Guru dan siswa yang sudah masuk LMS pada tiap jam pelajaran, sesuai jadwal pelajaran.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi">
        <label>Tanggal<input type="date" value={tanggal} max={hariIni()} onChange={(e) => { if (e.target.value) { setTanggal(e.target.value); setJamManual(null) } }} /></label>
        {data && <span className="catatan">{NAMA_HARI[data.hari]}</span>}
      </div>
      {data && data.jam.length === 0 && <div className="kartu jarak"><p>Jam bel untuk hari ini belum diatur.</p><p className="catatan">Atur di menu Jam pelajaran.</p></div>}
      {data && data.jam.length > 0 && (
        <div className="aksi jarak" role="group" aria-label="Pilih jam pelajaran">
          {data.jam.map((j) => (
            <button key={j.ke} type="button" className={`tombol${j.ke === data.jam_dipilih ? ' tombol-isi' : ''}`} onClick={() => setJamManual(j.ke)} title={`${j.mulai} sampai ${j.selesai}`}>
              Jam {j.ke}<small style={{ display: 'block' }}>{j.mulai}{data.hari_ini && j.ke === data.jam_sekarang ? ' · sekarang' : ''}</small>
            </button>
          ))}
          {jamManual !== null && <button type="button" className="tombol" onClick={() => setJamManual(null)}>Ikuti jam berjalan</button>}
        </div>
      )}
      {data && data.jam.length > 0 && (
        <>
          <div className="grid grid-3 jarak">
            <div className="kartu"><small>Kelas terjadwal pada jam {data.jam_dipilih}</small><p style={{ margin: 0, fontSize: '1.6rem' }}>{baris.length}</p></div>
            <div className="kartu"><small>Guru sudah masuk</small><p style={{ margin: 0, fontSize: '1.6rem' }}>{guruMasuk} <small>dari {baris.filter((b) => b.ptk_id).length}</small></p></div>
            <div className="kartu"><small>Siswa masuk</small><p style={{ margin: 0, fontSize: '1.6rem' }}>{siswaMasuk} <small>dari {siswaTotal} ({pct(siswaMasuk, siswaTotal)}%)</small></p></div>
          </div>
          <div className="aksi jarak">
            <button className="tombol tombol-isi" disabled={sibuk || guruBelum.length === 0} onClick={() => void ingatkan(guruBelum)}>
              Ingatkan {guruBelum.length} guru yang belum masuk
            </button>
            <button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={unduh}>Unduh CSV</button>
            {data.hari_ini && <label className="baris-centang"><input type="checkbox" checked={langsung} onChange={(e) => setLangsung(e.target.checked)} /> Pantau langsung (segar tiap 30 detik)</label>}
          </div>
          {pesan && <p className="catatan" role="status"><strong>{pesan}</strong></p>}
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>Kelas</th><th>Mata pelajaran</th><th>Guru</th><th>Status guru</th><th>Siswa masuk</th><th>Pertemuan hari ini</th><th></th></tr></thead>
              <tbody>
                {baris.length === 0 && <tr><td colSpan={7}>Tidak ada kelas terjadwal pada jam ini. Jika seharusnya ada, jadwal pelajaran belum diisi bagian kurikulum.</td></tr>}
                {baris.map((b) => {
                  const s = statusGuru(b, w)
                  return (
                    <tr key={`${b.rombel_id}`}>
                      <td>{b.rombel}</td>
                      <td>{b.mapel}</td>
                      <td>{b.guru ? kapital(b.guru) : '-'}</td>
                      <td><span className={`status ${s.kelas}`}>{s.label}</span>{b.guru_masuk && <><br /><small>masuk {jam(b.guru_pertama)}, terakhir {jam(b.guru_terakhir)}</small></>}</td>
                      <td>{b.siswa_total > 0 ? <><strong>{b.siswa_masuk}</strong><small> / {b.siswa_total} ({pct(b.siswa_masuk, b.siswa_total)}%)</small></> : '-'}</td>
                      <td>{!b.ada_kelas ? <small>Kelas LMS belum dibuat</small> : b.ada_pertemuan ? 'Ada' : <small>Belum ada</small>}</td>
                      <td>{s.perlu && b.ptk_id && (terkirim.has(b.ptk_id)
                        ? <small>Sudah diingatkan</small>
                        : <button type="button" className="tombol" disabled={sibuk} onClick={() => void ingatkan([b])}>Ingatkan</button>)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!data && !galat && <p className="catatan">Memuat...</p>}
      <p className="catatan">Masuk berarti membuka halaman LMS pada jam itu. Pencatatan mulai sejak fitur ini aktif. Daftar kelas mengikuti jadwal pelajaran dari bagian kurikulum.</p>
    </Halaman>
  )
}
