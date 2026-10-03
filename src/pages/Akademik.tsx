// Kalender sekolah dan jam pelajaran untuk umum: tampilan bulan, daftar agenda, langganan ke kalender pribadi.
import { useMemo, useState } from 'react'
import Halaman from '../components/Halaman'
import JamSistem from '../components/JamSistem'
import {
  type Agenda, type Kategori, KATEGORI, URUT_KATEGORI, NAMA_BULAN, NAMA_HARI, URL_ICS,
  googleKalender, jamTitik, posisiJam, tambahHari, tanggalLengkap, unduhIcs, useAgenda, useJamBel, useSekarang, wib,
} from '../lib/kalender'

const HARI_SENIN_DULU = [1, 2, 3, 4, 5, 6, 0]

function kisiBulan(tahun: number, bulan: number) {
  const awal = `${tahun}-${String(bulan + 1).padStart(2, '0')}-01`
  const hariAwal = new Date(Date.UTC(tahun, bulan, 1)).getUTCDay()
  const geser = (hariAwal + 6) % 7
  const mulai = tambahHari(awal, -geser)
  const jumlah = Math.ceil((geser + new Date(Date.UTC(tahun, bulan + 1, 0)).getUTCDate()) / 7) * 7
  return { awal, mulai, sel: Array.from({ length: jumlah }, (_, i) => tambahHari(mulai, i)) }
}

function Rincian({ a }: { a: Agenda }) {
  return (
    <li className="agenda-rincian" style={{ borderLeftColor: KATEGORI[a.kategori].warna }}>
      <div>
        <span className="lencana" style={{ background: KATEGORI[a.kategori].warna, color: '#fff' }}>{KATEGORI[a.kategori].label}</span>
        <h4>{a.judul}</h4>
        <p className="catatan">
          {tanggalLengkap(a.mulai)}{a.selesai !== a.mulai ? ` sampai ${tanggalLengkap(a.selesai)}` : ''}
          {a.jam_mulai ? `, pukul ${jamTitik(a.jam_mulai)}${a.jam_selesai ? ` sampai ${jamTitik(a.jam_selesai)}` : ''} WIB` : ''}
          {a.tempat ? `, ${a.tempat}` : ''}
        </p>
        {a.keterangan && <p style={{ whiteSpace: 'pre-line' }}>{a.keterangan}</p>}
        <p className="aksi-kecil">
          <a href={googleKalender(a)} target="_blank" rel="noopener noreferrer">Tambah ke Google Kalender</a>
          {' · '}
          <button type="button" className="tautan-tombol" onClick={() => unduhIcs([a], 'agenda-sekolah')}>Unduh .ics</button>
        </p>
      </div>
    </li>
  )
}

export default function Akademik() {
  const sekarang = useSekarang(60_000)
  const [tahun, setTahun] = useState(() => Number(wib().tanggal.slice(0, 4)))
  const [bulan, setBulan] = useState(() => Number(wib().tanggal.slice(5, 7)) - 1)
  const [tampilan, setTampilan] = useState<'bulan' | 'daftar'>('bulan')
  const [aktif, setAktif] = useState<Set<Kategori>>(new Set(URUT_KATEGORI))
  const [pilih, setPilih] = useState<string | null>(null)
  const [salin, setSalin] = useState(false)

  const grid = useMemo(() => kisiBulan(tahun, bulan), [tahun, bulan])
  const akhirGrid = grid.sel[grid.sel.length - 1]
  const { agenda, galat } = useAgenda(grid.mulai, akhirGrid)
  const bel = useJamBel()
  const tersaring = (agenda ?? []).filter((a) => aktif.has(a.kategori))
  const akhirBulan = `${tahun}-${String(bulan + 1).padStart(2, '0')}-${String(new Date(Date.UTC(tahun, bulan + 1, 0)).getUTCDate()).padStart(2, '0')}`
  const bulanIni = tersaring.filter((a) => a.selesai >= grid.awal && a.mulai <= akhirBulan)
  const pada = (iso: string) => tersaring.filter((a) => a.mulai <= iso && a.selesai >= iso)
  const pindah = (d: number) => { const t = new Date(Date.UTC(tahun, bulan + d, 1)); setTahun(t.getUTCFullYear()); setBulan(t.getUTCMonth()); setPilih(null) }
  const hariIni = sekarang.tanggal
  const posisi = bel ? posisiJam(bel, (agenda ?? []).filter((a) => a.kategori === 'libur'), wib()) : null
  const sesiAktif = posisi && posisi.status === 'sesi' ? posisi.slot : null

  const tabelBel = (kel: 'senin_kamis' | 'jumat', judul: string, hariKe: number[]) => {
    const baris = (bel ?? []).filter((b) => b.kelompok === kel)
    const aktifSekarang = sesiAktif && hariKe.includes(sekarang.hari) && sesiAktif.kelompok === kel ? sesiAktif.urutan : -1
    return (
      <div className="kartu">
        <h3>{judul}</h3>
        {baris.length === 0 ? <p className="catatan">Belum diatur.</p> : (
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Jam</th><th>Mulai</th><th>Selesai</th></tr></thead>
              <tbody>
                {baris.map((b) => (
                  <tr key={b.urutan} style={b.urutan === aktifSekarang ? { background: '#e6f3ea', fontWeight: 600 } : b.jenis !== 'pelajaran' ? { color: 'var(--teks-lembut)' } : undefined}>
                    <td>{b.label}</td><td>{jamTitik(b.mulai)}</td><td>{jamTitik(b.selesai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  const terpilih = pilih ? pada(pilih) : []
  const kelompokDaftar = useMemo(() => {
    const m = new Map<string, Agenda[]>()
    for (const a of bulanIni) m.set(a.mulai < grid.awal ? grid.awal : a.mulai, [...(m.get(a.mulai < grid.awal ? grid.awal : a.mulai) ?? []), a])
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0]))
  }, [bulanIni, grid.awal])

  return (
    <Halaman judul="Kalender dan Jam Pelajaran" lead="Kalender pendidikan, kegiatan sekolah, libur, dan jadwal jam pelajaran.">
      <div className="grid grid-2">
        <JamSistem varian="kartu" />
        <div className="kartu">
          <h3>Pengingat di kalender Anda</h3>
          <p className="catatan">Langganan kalender sekolah di Google Calendar, Apple Calendar, atau Outlook. Agenda baru dan perubahan ikut masuk otomatis, kegiatan dan ujian diingatkan sehari sebelumnya.</p>
          <div className="aksi" style={{ alignItems: 'center' }}>
            <input readOnly value={URL_ICS} aria-label="Alamat langganan kalender" onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0 }} />
            <button type="button" className="tombol" onClick={() => { void navigator.clipboard?.writeText(URL_ICS); setSalin(true); setTimeout(() => setSalin(false), 2000) }}>{salin ? 'Tersalin' : 'Salin'}</button>
          </div>
          <p className="catatan">Google Calendar: Setelan, Tambahkan kalender, Dari URL, lalu tempel alamat di atas.</p>
        </div>
      </div>

      <div className="judul-bagian jarak"><h2>Kalender</h2></div>
      <div className="kal-kontrol">
        <div className="kal-nav">
          <button type="button" className="tombol" onClick={() => pindah(-1)} aria-label="Bulan sebelumnya">‹</button>
          <strong aria-live="polite">{NAMA_BULAN[bulan]} {tahun}</strong>
          <button type="button" className="tombol" onClick={() => pindah(1)} aria-label="Bulan berikutnya">›</button>
          <button type="button" className="tombol" onClick={() => { setTahun(Number(hariIni.slice(0, 4))); setBulan(Number(hariIni.slice(5, 7)) - 1); setPilih(hariIni) }}>Hari ini</button>
        </div>
        <div className="kal-nav">
          <button type="button" className={'tombol' + (tampilan === 'bulan' ? ' tombol-isi' : '')} aria-pressed={tampilan === 'bulan'} onClick={() => setTampilan('bulan')}>Bulan</button>
          <button type="button" className={'tombol' + (tampilan === 'daftar' ? ' tombol-isi' : '')} aria-pressed={tampilan === 'daftar'} onClick={() => setTampilan('daftar')}>Daftar</button>
          <button type="button" className="tombol" disabled={bulanIni.length === 0} onClick={() => unduhIcs(bulanIni, `kalender-${tahun}-${String(bulan + 1).padStart(2, '0')}`)}>Unduh bulan ini</button>
        </div>
      </div>
      <ul className="kal-filter" aria-label="Saring kategori">
        {URUT_KATEGORI.map((k) => (
          <li key={k}>
            <button type="button" aria-pressed={aktif.has(k)} className={'kal-chip' + (aktif.has(k) ? ' aktif' : '')} style={{ ['--w' as string]: KATEGORI[k].warna }}
              onClick={() => { const s = new Set(aktif); if (s.has(k)) s.delete(k); else s.add(k); setAktif(s) }}>
              <i aria-hidden="true" />{KATEGORI[k].label}
            </button>
          </li>
        ))}
      </ul>
      {galat && <p className="kartu" role="alert">Kalender belum dapat dimuat.</p>}

      {tampilan === 'bulan' ? (
        <>
          <div className="kal-grid" role="grid" aria-label={`Kalender ${NAMA_BULAN[bulan]} ${tahun}`}>
            {HARI_SENIN_DULU.map((h) => <div key={h} className="kal-kepala" role="columnheader">{NAMA_HARI[h].slice(0, 3)}</div>)}
            {grid.sel.map((iso) => {
              const hari = pada(iso)
              const luar = iso.slice(0, 7) !== `${tahun}-${String(bulan + 1).padStart(2, '0')}`
              const libur = hari.some((a) => a.kategori === 'libur')
              const w = new Date(iso + 'T00:00:00Z').getUTCDay()
              return (
                <button key={iso} type="button" role="gridcell" aria-label={`${tanggalLengkap(iso)}, ${hari.length} agenda`} aria-pressed={pilih === iso}
                  className={'kal-sel' + (luar ? ' luar' : '') + (iso === hariIni ? ' hariini' : '') + (pilih === iso ? ' pilih' : '') + (libur || w === 0 ? ' libur' : '')}
                  onClick={() => setPilih(iso)}>
                  <span className="kal-tgl">{Number(iso.slice(8))}</span>
                  <span className="kal-isi">
                    {hari.slice(0, 3).map((a) => <span key={a.id} className="kal-item" style={{ background: KATEGORI[a.kategori].warna }} title={a.judul}>{a.judul}</span>)}
                    {hari.length > 3 && <span className="kal-lagi">+{hari.length - 3}</span>}
                  </span>
                  <span className="kal-titik" aria-hidden="true">{hari.slice(0, 4).map((a) => <i key={a.id} style={{ background: KATEGORI[a.kategori].warna }} />)}</span>
                </button>
              )
            })}
          </div>
          {pilih ? (
            <section className="jarak" aria-live="polite">
              <h3>{tanggalLengkap(pilih)}</h3>
              {terpilih.length === 0 ? <p className="catatan">Tidak ada agenda.</p> : <ul className="agenda-rincian-daftar">{terpilih.map((a) => <Rincian key={a.id} a={a} />)}</ul>}
            </section>
          ) : <p className="catatan jarak">Pilih tanggal untuk melihat rincian agenda.</p>}
        </>
      ) : (
        <div className="jarak">
          {kelompokDaftar.length === 0 && <p className="catatan">Tidak ada agenda pada bulan ini.</p>}
          {kelompokDaftar.map(([iso, daftar]) => (
            <section key={iso} className="jarak" aria-label={tanggalLengkap(iso)}>
              <h3>{tanggalLengkap(iso)}</h3>
              <ul className="agenda-rincian-daftar">{daftar.map((a) => <Rincian key={a.id} a={a} />)}</ul>
            </section>
          ))}
        </div>
      )}

      <div className="judul-bagian jarak"><h2>Jam pelajaran</h2></div>
      <div className="grid grid-2">
        {tabelBel('senin_kamis', 'Senin sampai Kamis', [1, 2, 3, 4])}
        {tabelBel('jumat', 'Jumat', [5])}
      </div>
    </Halaman>
  )
}
