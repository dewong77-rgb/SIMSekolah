// Jadwal pelajaran: grid hari x jam ke-n per kelas dan per guru. Bentrok guru dan kuota JP dijaga di basis data dan ditandai di pilihan.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil } from '../../lib/rpc'
import { muatJamBel, type JamBel } from '../../lib/kalender'
import { NAMA_HARI_JADWAL, WARNA_NADA, pilihanTahunAjaran, tahunAjaranSekarang, type Kebutuhan, type Pengaturan, type SlotJadwal } from '../../lib/kurikulum'
import GerbangKurikulum from './GerbangKurikulum'

const HARI = [1, 2, 3, 4, 5]
const kunci = (r: string, h: number, j: number) => `${r}|${h}|${j}`

function Isi({ p }: { p: Pengaturan }) {
  const [ta, setTa] = useState(tahunAjaranSekarang())
  const [bel, setBel] = useState<JamBel[] | null>(null)
  const [butuh, setButuh] = useState<Kebutuhan[]>([])
  const [slot, setSlot] = useState<SlotJadwal[]>([])
  const [tab, setTab] = useState<'kelas' | 'guru'>('kelas')
  const [rombel, setRombel] = useState('')
  const [guru, setGuru] = useState('')
  const [memuat, setMemuat] = useState(true)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')

  useEffect(() => { void muatJamBel(true).then(setBel) }, [])
  const muat = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([panggil<Kebutuhan[]>('kur_beban_data', { p_ta: ta }), panggil<SlotJadwal[]>('kur_jadwal_data', { p_ta: ta })])
      setButuh(b ?? []); setSlot(s ?? [])
    } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [ta])
  useEffect(() => { setMemuat(true); void muat() }, [muat])

  const pelajaran = (k: JamBel['kelompok']) => (bel ?? []).filter((x) => x.kelompok === k && x.jenis === 'pelajaran').sort((a, b) => a.mulai.localeCompare(b.mulai))
  const snk = pelajaran('senin_kamis'), jmt = pelajaran('jumat')
  const maksJam = Math.max(snk.length, jmt.length)
  const jamHari = (h: number) => (h === 5 ? jmt : snk)

  const daftarRombel = useMemo(() => {
    const m = new Map<string, { id: string; nama: string; tingkat: number }>()
    for (const k of butuh) m.set(k.rombel_id, { id: k.rombel_id, nama: k.rombel, tingkat: k.tingkat })
    return [...m.values()].sort((a, b) => a.tingkat - b.tingkat || a.nama.localeCompare(b.nama, 'id', { numeric: true }))
  }, [butuh])
  useEffect(() => { if (!daftarRombel.some((r) => r.id === rombel)) setRombel(daftarRombel[0]?.id ?? '') }, [daftarRombel, rombel])

  const petaSlot = useMemo(() => new Map(slot.map((s) => [kunci(s.rombel_id, s.hari, s.jam_ke), s])), [slot])
  const sibukGuru = useMemo(() => new Map(slot.filter((s) => s.ptk_id).map((s) => [`${s.ptk_id}|${s.hari}|${s.jam_ke}`, s.rombel])), [slot])
  const daftarGuru = useMemo(() => {
    const m = new Map<string, string>()
    for (const k of butuh) if (k.ptk_id && k.guru) m.set(k.ptk_id, k.guru)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'id'))
  }, [butuh])
  useEffect(() => { if (!daftarGuru.some(([id]) => id === guru)) setGuru(daftarGuru[0]?.[0] ?? '') }, [daftarGuru, guru])

  const totalJp = butuh.reduce((a, b) => a + b.jp, 0)
  const terjadwal = slot.length
  const kelasIni = butuh.filter((k) => k.rombel_id === rombel)
  const terpakai = (mapel: string) => slot.filter((s) => s.rombel_id === rombel && s.mapel_id === mapel).length

  async function pasang(h: number, j: number, mapel: string) {
    setGalat(''); setSibuk(true)
    try { await panggil('kur_jadwal_set', { p_rombel: rombel, p_hari: h, p_jam_ke: j, p_mapel: mapel || null }); await muat() }
    catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  if (bel && snk.length === 0) {
    return (
      <Halaman judul="Jadwal pelajaran" lead="Jadwal memakai jam ke-n dari jam bel sekolah.">
        <p className="kartu">Jam pelajaran belum diatur. Isi dulu jam bel Senin sampai Kamis dan Jumat di <Link to="/portal/jam-pelajaran">Jam pelajaran</Link>, lalu kembali ke sini.</p>
      </Halaman>
    )
  }

  return (
    <Halaman judul="Jadwal pelajaran" lead="Susun jadwal per kelas. Guru dan jam per minggu mengikuti Beban mengajar. Guru yang sudah mengajar di kelas lain pada jam yang sama tidak bisa dipilih.">
      {!p.boleh && <p className="kartu">Anda hanya dapat melihat. Jadwal disusun oleh Waka Kurikulum atau staf kurikulum.</p>}
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={ta} onChange={(e) => setTa(e.target.value)} aria-label="Tahun ajaran">{pilihanTahunAjaran().map((x) => <option key={x}>{x}</option>)}</select>
        <button className={tab === 'kelas' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('kelas')}>Per kelas</button>
        <button className={tab === 'guru' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('guru')}>Per guru</button>
      </div>

      {memuat || !bel ? <p className="catatan jarak">Memuat data...</p> : daftarRombel.length === 0 ? (
        <p className="kartu jarak">Belum ada kebutuhan mengajar untuk {ta}. Isi <Link to="/portal/kurikulum/struktur">Struktur kurikulum</Link> dan bagi guru di <Link to="/portal/kurikulum/beban">Beban mengajar</Link> lebih dulu.</p>
      ) : (
        <>
          <div className="grid grid-3 jarak">
            <div className="kartu"><small>Jam terjadwal</small><h3 style={{ margin: 0 }}>{terjadwal} dari {totalJp} JP</h3></div>
            <div className="kartu"><small>Belum ada guru</small><h3 style={{ margin: 0 }}>{butuh.filter((k) => !k.ptk_id).length} mapel</h3></div>
            <div className="kartu"><small>Durasi satu JP</small><h3 style={{ margin: 0 }}>{p.durasi_jp} menit</h3></div>
          </div>

          {tab === 'kelas' && (
            <div className="kartu form jarak">
              <label>Kelas
                <select value={rombel} onChange={(e) => setRombel(e.target.value)}>
                  {daftarRombel.map((r) => <option key={r.id} value={r.id}>{r.nama} ({slot.filter((s) => s.rombel_id === r.id).length}/{butuh.filter((k) => k.rombel_id === r.id).reduce((a, b) => a + b.jp, 0)} JP)</option>)}
                </select>
              </label>
              <div className="tabel-bungkus">
                <table>
                  <thead><tr><th>Jam</th>{HARI.map((h) => <th key={h}>{NAMA_HARI_JADWAL[h]}</th>)}</tr></thead>
                  <tbody>
                    {Array.from({ length: maksJam }, (_, i) => i + 1).map((j) => (
                      <tr key={j}>
                        <th>Ke-{j}<small style={{ display: 'block', fontWeight: 400 }}>{snk[j - 1] ? `${snk[j - 1].mulai}-${snk[j - 1].selesai}` : ''}</small></th>
                        {HARI.map((h) => {
                          if (j > jamHari(h).length) return <td key={h} style={{ background: '#f1f3f6' }} />
                          const s = petaSlot.get(kunci(rombel, h, j))
                          const basi = s && s.ptk_beban_id !== s.ptk_id
                          return (
                            <td key={h} style={basi ? { background: '#fdf1d8' } : undefined}>
                              <select value={s?.mapel_id ?? ''} disabled={!p.boleh || sibuk} aria-label={`${NAMA_HARI_JADWAL[h]} jam ke-${j}`} onChange={(e) => pasang(h, j, e.target.value)} style={{ minWidth: 150, width: '100%' }}>
                                <option value="">-</option>
                                {kelasIni.map((k) => {
                                  const sisa = k.jp - terpakai(k.mapel_id)
                                  const lain = k.ptk_id ? sibukGuru.get(`${k.ptk_id}|${h}|${j}`) : undefined
                                  const sama = s?.mapel_id === k.mapel_id
                                  const mati = !k.ptk_id || (!sama && (sisa <= 0 || (!!lain && lain !== k.rombel)))
                                  const ket = !k.ptk_id ? 'belum ada guru' : lain && lain !== k.rombel && !sama ? `guru di ${lain}` : `sisa ${sisa}`
                                  return <option key={k.mapel_id} value={k.mapel_id} disabled={mati}>{k.mapel} ({ket})</option>
                                })}
                              </select>
                              {s && <small style={{ display: 'block' }}>{s.guru}{basi ? ' · guru di Beban sudah berganti, pilih ulang' : ''}</small>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="lencana-baris">
                {kelasIni.map((k) => {
                  const sisa = k.jp - terpakai(k.mapel_id)
                  return <span key={k.mapel_id} className="lencana" style={WARNA_NADA[!k.ptk_id ? 'netral' : sisa === 0 ? 'baik' : sisa < 0 ? 'buruk' : 'sedang']}>{k.mapel}: {terpakai(k.mapel_id)}/{k.jp}</span>
                })}
              </div>
            </div>
          )}

          {tab === 'guru' && (
            <div className="kartu form jarak">
              <label>Guru
                <select value={guru} onChange={(e) => setGuru(e.target.value)}>
                  {daftarGuru.map(([id, nama]) => <option key={id} value={id}>{nama} ({slot.filter((s) => s.ptk_id === id).length}/{butuh.filter((k) => k.ptk_id === id).reduce((a, b) => a + b.jp, 0)} JP)</option>)}
                </select>
              </label>
              <div className="tabel-bungkus">
                <table>
                  <thead><tr><th>Jam</th>{HARI.map((h) => <th key={h}>{NAMA_HARI_JADWAL[h]}</th>)}</tr></thead>
                  <tbody>
                    {Array.from({ length: maksJam }, (_, i) => i + 1).map((j) => (
                      <tr key={j}>
                        <th>Ke-{j}</th>
                        {HARI.map((h) => {
                          const s = slot.find((x) => x.ptk_id === guru && x.hari === h && x.jam_ke === j)
                          return <td key={h} style={j > jamHari(h).length ? { background: '#f1f3f6' } : undefined}>{s ? <><strong>{s.rombel}</strong><small style={{ display: 'block' }}>{s.mapel}</small></> : ''}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="catatan">Jam yang belum terjadwal dihitung dari Beban mengajar. Susun di tab Per kelas.</p>
            </div>
          )}
        </>
      )}
    </Halaman>
  )
}

export default function KurikulumJadwal() {
  return <GerbangKurikulum judul="Jadwal pelajaran" aktif="/portal/kurikulum/jadwal">{(p) => <Isi p={p} />}</GerbangKurikulum>
}
