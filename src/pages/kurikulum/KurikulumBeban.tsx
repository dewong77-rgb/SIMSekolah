// Beban mengajar: pembagian guru ke tiap mapel per kelas (satu mapel bisa diampu beberapa guru, masing-masing dengan JP),
// linieritas dari Dapodik, dan rekap jam per guru.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Halaman from '../../components/Halaman'
import { panggil } from '../../lib/rpc'
import {
  STATUS_LINIER, WARNA_NADA, namaKelompok, pilihanTahunAjaran, tahunAjaranSekarang,
  type BebanMapel, type Guru, type Pengaturan,
} from '../../lib/kurikulum'
import GerbangKurikulum from './GerbangKurikulum'

function Status({ s }: { s: string | null }) {
  if (!s) return <small>-</small>
  const x = STATUS_LINIER[s] ?? { label: s, nada: 'netral' as const, ket: '' }
  return <span className="lencana" style={{ ...WARNA_NADA[x.nada], marginBottom: 0 }} title={x.ket}>{x.label}</span>
}

const URUT_STATUS: Record<string, number> = { linier: 0, manual_linier: 0, ijazah: 1, dapodik: 2, belum_dipetakan: 3, tanpa_data: 4, tidak_linier: 5, manual_tidak: 5 }
const BUTUH_PERHATIAN = new Set(['tidak_linier', 'manual_tidak', 'tanpa_data'])

function Isi({ p }: { p: Pengaturan }) {
  const [ta, setTa] = useState(tahunAjaranSekarang())
  const [data, setData] = useState<BebanMapel[]>([])
  const [guru, setGuru] = useState<Guru[]>([])
  const [tab, setTab] = useState<'kelas' | 'guru'>('kelas')
  const [rombel, setRombel] = useState('')
  const [terbuka, setTerbuka] = useState<string | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')

  const muat = useCallback(async () => {
    try {
      const [d, g] = await Promise.all([panggil<BebanMapel[]>('kur_beban_data', { p_ta: ta }), panggil<Guru[]>('kur_guru_daftar', { p_ta: ta })])
      setData(d ?? []); setGuru(g ?? [])
    } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [ta])
  useEffect(() => { setMemuat(true); void muat() }, [muat])

  const daftarRombel = useMemo(() => {
    const m = new Map<string, { id: string; nama: string; tingkat: number; butuh: number; terbagi: number }>()
    for (const k of data) {
      const x = m.get(k.rombel_id) ?? { id: k.rombel_id, nama: k.rombel, tingkat: k.tingkat, butuh: 0, terbagi: 0 }
      x.butuh += k.jp; x.terbagi += Math.min(k.jp_terbagi, k.jp); m.set(k.rombel_id, x)
    }
    return [...m.values()].sort((a, b) => a.tingkat - b.tingkat || a.nama.localeCompare(b.nama, 'id', { numeric: true }))
  }, [data])
  useEffect(() => { if (!daftarRombel.some((r) => r.id === rombel)) setRombel(daftarRombel[0]?.id ?? '') }, [daftarRombel, rombel])

  const butuh = data.reduce((a, b) => a + b.jp, 0)
  const terbagi = data.reduce((a, b) => a + Math.min(b.jp_terbagi, b.jp), 0)
  const kosong = data.filter((k) => k.jp_terbagi === 0).length
  const perhatian = data.reduce((a, k) => a + k.guru.filter((g) => BUTUH_PERHATIAN.has(g.status)).length, 0)

  async function atur(k: BebanMapel, ptk: string, jp: number) {
    setGalat(''); setInfo(''); setSibuk(true)
    try { await panggil('kur_beban_atur', { p_rombel: k.rombel_id, p_mapel: k.mapel_id, p_ptk: ptk, p_jp: jp }); await muat() }
    catch (e) { setGalat((e as Error).message); await muat() }
    setSibuk(false)
  }
  async function koreksi(ptk: string, mapel: string, nilai: string) {
    setGalat(''); setInfo(''); setSibuk(true)
    try { await panggil('kur_linieritas_set', { p_ptk: ptk, p_mapel: mapel, p_linier: nilai === '' ? null : nilai === 'ya', p_catatan: null }); setInfo('Koreksi linieritas tersimpan.'); await muat() }
    catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  const baris = data.filter((k) => k.rombel_id === rombel)
  const urutGuru = (mapelId: string) => [...guru].sort((a, b) => (URUT_STATUS[a.status[mapelId]] ?? 9) - (URUT_STATUS[b.status[mapelId]] ?? 9) || a.nama.localeCompare(b.nama, 'id'))

  return (
    <Halaman judul="Beban mengajar" lead="Bagi guru ke tiap mapel per kelas. Satu mapel boleh diampu beberapa guru, masing-masing dengan jam sendiri. Linieritas dibaca dari data Dapodik dan bisa dikoreksi manual.">
      {!p.boleh && <p className="kartu">Anda hanya dapat melihat. Pembagian guru dilakukan oleh Waka Kurikulum atau staf kurikulum.</p>}
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}

      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={ta} onChange={(e) => setTa(e.target.value)} aria-label="Tahun ajaran">{pilihanTahunAjaran().map((x) => <option key={x}>{x}</option>)}</select>
        <button className={tab === 'kelas' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('kelas')}>Per kelas</button>
        <button className={tab === 'guru' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('guru')}>Per guru</button>
      </div>

      {memuat ? <p className="catatan jarak">Memuat data...</p> : butuh === 0 ? (
        <p className="kartu jarak">Belum ada struktur kurikulum untuk tahun ajaran {ta}, atau belum ada rombel di Dapodik. Isi dulu di halaman Struktur kurikulum.</p>
      ) : (
        <>
          <div className="grid grid-3 jarak">
            <div className="kartu"><small>Jam terbagi ke guru</small><h3 style={{ margin: 0 }}>{terbagi} dari {butuh} JP</h3></div>
            <div className="kartu"><small>Mapel belum ada guru</small><h3 style={{ margin: 0 }}>{kosong}</h3></div>
            <div className="kartu"><small>Perlu dicek linieritasnya</small><h3 style={{ margin: 0 }}>{perhatian}</h3></div>
          </div>

          {tab === 'kelas' && (
            <div className="kartu form jarak">
              <label>Kelas
                <select value={rombel} onChange={(e) => setRombel(e.target.value)}>
                  {daftarRombel.map((r) => <option key={r.id} value={r.id}>{r.nama} ({r.terbagi}/{r.butuh} JP)</option>)}
                </select>
              </label>
              <div className="tabel-bungkus">
                <table>
                  <thead><tr><th>Mapel</th><th>Kelompok</th><th>JP</th><th>Guru pengampu</th></tr></thead>
                  <tbody>
                    {baris.map((k) => {
                      const sisa = k.jp - k.jp_terbagi
                      return (
                        <tr key={k.mapel_id}>
                          <td>{k.mapel}</td>
                          <td>{namaKelompok(k.kelompok)}</td>
                          <td>
                            <span className="lencana" style={{ ...WARNA_NADA[sisa === 0 ? 'baik' : sisa < 0 ? 'buruk' : 'sedang'], marginBottom: 0 }}>{k.jp_terbagi}/{k.jp}</span>
                          </td>
                          <td>
                            {k.guru.map((g) => (
                              <div key={g.ptk_id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                                <span style={{ minWidth: 180 }}>{g.guru}</span>
                                <input type="number" min={1} max={k.jp} defaultValue={g.jp} disabled={!p.boleh || sibuk} aria-label={`JP ${g.guru}`} style={{ width: 64 }}
                                  onBlur={(e) => { const n = Number(e.target.value); if (n !== g.jp) void atur(k, g.ptk_id, n) }} />
                                <Status s={g.status} />
                                {p.boleh && <button className="tombol" style={{ padding: '2px 8px', color: '#a11' }} disabled={sibuk} onClick={() => atur(k, g.ptk_id, 0)} aria-label={`Lepas ${g.guru}`}>Lepas</button>}
                              </div>
                            ))}
                            {p.boleh && sisa > 0 && (
                              <select value="" disabled={sibuk} aria-label={`Tambah guru ${k.mapel}`} onChange={(e) => e.target.value && atur(k, e.target.value, sisa)} style={{ minWidth: 240 }}>
                                <option value="">{k.guru.length ? 'Tambah guru...' : 'Pilih guru...'}</option>
                                {urutGuru(k.mapel_id).filter((g) => !k.guru.some((x) => x.ptk_id === g.ptk_id)).map((g) => <option key={g.ptk_id} value={g.ptk_id}>{g.nama} · {STATUS_LINIER[g.status[k.mapel_id]]?.label ?? '-'} · {g.jp_total} JP</option>)}
                              </select>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr><th colSpan={2}>Total kelas</th><th>{baris.reduce((a, b) => a + b.jp, 0)}</th><th /></tr></tfoot>
                </table>
              </div>
              <p className="catatan">Memilih guru memberinya seluruh sisa jam mapel itu. Ubah angka JP bila mapel dibagi ke beberapa guru. Daftar guru diurutkan dari yang paling linier.</p>
            </div>
          )}

          {tab === 'guru' && (
            <div className="kartu jarak">
              <div className="tabel-bungkus">
                <table>
                  <thead><tr><th>Guru</th><th>Kompetensi di Dapodik</th><th>Kelas</th><th>JP</th><th>Menit</th><th>Terhadap target {p.jam_wajib} JP</th><th>JP tidak linier</th><th><span className="sr-only">Rinci</span></th></tr></thead>
                  <tbody>
                    {guru.map((g) => {
                      const selisih = g.jp_total - p.jam_wajib
                      const rinci = data.flatMap((k) => k.guru.filter((x) => x.ptk_id === g.ptk_id).map((x) => ({ k, x })))
                      return (
                        <Fragment key={g.ptk_id}>
                          <tr>
                            <td>{g.nama}</td>
                            <td><small>{g.kompetensi ?? g.jurusan_prodi ?? 'Belum diisi'}</small></td>
                            <td>{g.jumlah_rombel}</td>
                            <td>{g.jp_total}</td>
                            <td>{g.jp_total * p.durasi_jp}</td>
                            <td>
                              <span className="lencana" style={{ ...WARNA_NADA[g.jp_total === 0 ? 'netral' : selisih < 0 ? 'sedang' : selisih === 0 ? 'baik' : selisih > 16 ? 'buruk' : 'baik'], marginBottom: 0 }}>
                                {g.jp_total === 0 ? 'Belum mengajar' : selisih < 0 ? `Kurang ${-selisih}` : selisih === 0 ? 'Pas' : `Lebih ${selisih}`}
                              </span>
                            </td>
                            <td>{g.jp_tidak_linier > 0 ? <span className="lencana" style={{ ...WARNA_NADA.buruk, marginBottom: 0 }}>{g.jp_tidak_linier}</span> : '0'}</td>
                            <td><button className="tombol" style={{ padding: '4px 10px' }} onClick={() => setTerbuka(terbuka === g.ptk_id ? null : g.ptk_id)}>{terbuka === g.ptk_id ? 'Tutup' : 'Rinci'}</button></td>
                          </tr>
                          {terbuka === g.ptk_id && (
                            <tr>
                              <td colSpan={8} style={{ background: '#f7f9fc' }}>
                                <p className="catatan">
                                  Kompetensi: {g.kompetensi ?? '-'} · Sertifikasi: {g.sertifikasi ?? '-'} · Prodi ijazah: {g.jurusan_prodi ?? '-'} · Mengajar di Dapodik: {g.mengajar ?? '-'}
                                  {g.jjm_dapodik != null ? ` · JJM Dapodik: ${g.jjm_dapodik}` : ''}{g.tugas_tambahan ? ` · Tugas tambahan: ${g.tugas_tambahan}` : ''}
                                </p>
                                {rinci.length === 0 ? <p className="catatan">Belum ada pembagian kelas.</p> : (
                                  <table>
                                    <thead><tr><th>Kelas</th><th>Mapel</th><th>JP</th><th>Linieritas</th><th>Koreksi manual</th></tr></thead>
                                    <tbody>
                                      {rinci.map(({ k, x }) => (
                                        <tr key={k.rombel_id + k.mapel_id}>
                                          <td>{k.rombel}</td><td>{k.mapel}</td><td>{x.jp}</td><td><Status s={x.status} /></td>
                                          <td>{p.boleh && (
                                            <select value={x.status === 'manual_linier' ? 'ya' : x.status === 'manual_tidak' ? 'tidak' : ''} disabled={sibuk} aria-label={`Koreksi ${k.mapel}`} onChange={(e) => koreksi(g.ptk_id, k.mapel_id, e.target.value)}>
                                              <option value="">Ikuti data Dapodik</option><option value="ya">Tetapkan linier</option><option value="tidak">Tetapkan tidak linier</option>
                                            </select>
                                          )}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="catatan jarak">Menit = JP × {p.durasi_jp} menit. Jam tugas tambahan (wakil kepala sekolah, kepala program, wali kelas) belum dihitung ke target. Linieritas membaca data Dapodik terakhir yang diunggah.</p>
            </div>
          )}
        </>
      )}
    </Halaman>
  )
}

export default function KurikulumBeban() {
  return <GerbangKurikulum judul="Beban mengajar" aktif="/portal/kurikulum/beban">{(p) => <Isi p={p} />}</GerbangKurikulum>
}
