// Formulir rombongan belajar (F-ROMBEL SMK): kolom yang belum ada di Dapodik-impor, SK mengajar per mapel, dan cetak format resmi.
// Simpanan berlaku langsung di SIMS dan masuk antrean operator Dapodik sebagai tagihan kerja.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import CetakFormulir, { TandaTangan } from '../../components/CetakFormulir'
import { panggil } from '../../lib/rpc'
import { pilihanTahunAjaran, tahunAjaranSekarang } from '../../lib/kurikulum'
import GerbangKurikulum from './GerbangKurikulum'

type Pembelajaran = { beban_id: string; mapel: string; kelompok: string; ptk: string; jp: number; sk_mengajar: string | null; tanggal_sk: string | null }
type Rombel = {
  rombel_id: string; rombel: string; tingkat: number; kurikulum: string | null; ruangan: string | null; wali: string | null; jumlah_siswa: number
  program: string | null; kompetensi_keahlian: string | null; moving_class: string | null; melayani_kebutuhan_khusus: string | null
  pembelajaran: Pembelajaran[]
}

/** Urutan dan judul kelompok mapel mengikuti lembar PEMBELAJARAN pada F-ROMBEL. */
const KELOMPOK: [string, string][] = [
  ['umum', '1 - Matpel Kelompok A (Umum)'],
  ['projek', '3 - Matpel Pilihan P5 (Projek Penguatan Profil Pelajar Pancasila)'],
  ['muatan_lokal', '4 - Matpel Wajib (Tambahan Jam)'],
  ['kejuruan', '5 - Matpel Peminatan C (Kejuruan)'],
  ['pkl', '8 - Matpel Tambahan Jam (PKL)'],
]
const tglId = (t: string | null) => (t ? new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

export function CetakRombel({ r, tutup }: { r: Rombel; tutup: () => void }) {
  const jenjang = r.tingkat
  return (
    <CetakFormulir judul="Formulir Rombongan Belajar" kode="F-ROMBEL (SMK)" tutup={tutup}>
      <h2>ROMBEL</h2>
      <table>
        <thead>
          <tr><th>Tingkat Pendidikan</th><th>Jenis Rombel</th><th>Jurusan Sat. Pendidikan</th><th>Kurikulum</th><th>Nama Rombel</th><th>Wali / Guru Kelas</th><th>Prasarana</th><th>Moving Class</th><th>Melayani Keb. Khusus</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>{jenjang}</td><td>Kelas</td><td>{r.kompetensi_keahlian ?? r.program ?? ''}</td><td>{r.kurikulum ?? ''}</td><td>{r.rombel}</td><td>{r.wali ?? ''}</td><td>{r.ruangan ?? ''}</td>
            <td>{r.moving_class ?? ''}</td><td>{r.melayani_kebutuhan_khusus ?? ''}</td>
          </tr>
        </tbody>
      </table>
      <h2>PEMBELAJARAN</h2>
      {KELOMPOK.map(([kunci, judul]) => {
        const baris = r.pembelajaran.filter((p) => p.kelompok === kunci)
        return (
          <Fragment key={kunci}>
            <p style={{ margin: '6px 0 0', fontWeight: 700, breakAfter: 'avoid' }}>{judul}</p>
            <table>
              <thead><tr><th style={{ width: '32%' }}>Mata Pelajaran</th><th style={{ width: '24%' }}>PTK</th><th>SK Mengajar</th><th style={{ width: '14%' }}>Tanggal SK</th><th style={{ width: '6%' }}>Jam</th></tr></thead>
              <tbody>
                {baris.map((p) => <tr key={p.beban_id}><td>{p.mapel}</td><td>{p.ptk}</td><td>{p.sk_mengajar ?? ''}</td><td>{tglId(p.tanggal_sk)}</td><td>{p.jp}</td></tr>)}
                {baris.length === 0 && <tr><td className="kosong-isi" colSpan={5} /></tr>}
              </tbody>
            </table>
          </Fragment>
        )
      })}
      <TandaTangan jabatan="Kepala Sekolah" />
    </CetakFormulir>
  )
}

function Isi() {
  const [ta, setTa] = useState(tahunAjaranSekarang())
  const [data, setData] = useState<Rombel[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [buka, setBuka] = useState<string | null>(null)
  const [cetak, setCetak] = useState<Rombel | null>(null)
  const [cari, setCari] = useState('')

  const muat = useCallback(async () => {
    try { setData((await panggil<Rombel[] | null>('rombel_formulir_data', { p_ta: ta })) ?? []) } catch (e) { setGalat((e as Error).message) }
    setMemuat(false)
  }, [ta])
  useEffect(() => { setMemuat(true); void muat() }, [muat])

  const tampil = useMemo(() => data.filter((r) => !cari.trim() || r.rombel.toLowerCase().includes(cari.trim().toLowerCase())), [data, cari])
  const lengkap = data.filter((r) => r.kompetensi_keahlian && r.moving_class).length

  async function jalankan(fn: () => Promise<unknown>, pesan: string) {
    setGalat(''); setInfo(''); setSibuk(true)
    try { await fn(); setInfo(pesan); await muat() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  const simpanRombel = (r: Rombel, f: FormData) =>
    jalankan(() => panggil('rombel_formulir_simpan', {
      p_rombel: r.rombel_id, p_kompetensi: String(f.get('kompetensi') ?? ''), p_moving: String(f.get('moving') ?? ''), p_kk: String(f.get('kk') ?? ''),
    }), `Data ${r.rombel} tersimpan dan masuk antrean operator Dapodik.`)
  const simpanSk = (p: Pembelajaran, f: FormData) =>
    jalankan(() => panggil('beban_sk_simpan', { p_beban: p.beban_id, p_sk: String(f.get('sk') ?? ''), p_tanggal: String(f.get('tanggal') ?? '') || null }),
      `SK ${p.mapel} (${p.ptk}) tersimpan dan masuk antrean operator Dapodik.`)

  return (
    <Halaman judul="Formulir rombongan belajar" lead="Lengkapi kolom F-ROMBEL yang belum ada di Dapodik-impor: jurusan, moving class, layanan kebutuhan khusus, dan SK mengajar. Setiap simpanan langsung berlaku dan menjadi tagihan kerja operator Dapodik.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={ta} onChange={(e) => setTa(e.target.value)} aria-label="Tahun ajaran">{pilihanTahunAjaran().map((x) => <option key={x}>{x}</option>)}</select>
        <input type="search" placeholder="Cari rombel" aria-label="Cari rombel" value={cari} onChange={(e) => setCari(e.target.value)} style={{ maxWidth: 220 }} />
        <small className="catatan">{lengkap} dari {data.length} rombel sudah memuat jurusan dan moving class</small>
      </div>

      {memuat ? <p className="catatan jarak">Memuat data...</p> : data.length === 0 ? (
        <p className="kartu jarak">Belum ada rombel untuk tahun ajaran {ta}. Unggah data Dapodik lebih dulu.</p>
      ) : (
        <div className="tabel-bungkus jarak">
          <table>
            <thead><tr><th>Rombel</th><th>Wali kelas</th><th>Siswa</th><th>Jurusan</th><th>Moving class</th><th>Layanan khusus</th><th /></tr></thead>
            <tbody>
              {tampil.map((r) => (
                <Fragment key={r.rombel_id}>
                  <tr>
                    <td><strong>{r.rombel}</strong><br /><small className="catatan">{r.ruangan ?? 'ruang belum tercatat'}</small></td>
                    <td>{r.wali ?? '-'}</td>
                    <td>{r.jumlah_siswa}</td>
                    <td>{r.kompetensi_keahlian ?? <span className="catatan">{r.program ?? '-'} (dari nama rombel)</span>}</td>
                    <td>{r.moving_class ?? '-'}</td>
                    <td>{r.melayani_kebutuhan_khusus ?? '-'}</td>
                    <td>
                      <button className="tombol" onClick={() => setBuka(buka === r.rombel_id ? null : r.rombel_id)} aria-expanded={buka === r.rombel_id}>{buka === r.rombel_id ? 'Tutup' : 'Isi'}</button>{' '}
                      <button className="tombol" onClick={() => setCetak(r)}>Cetak</button>
                    </td>
                  </tr>
                  {buka === r.rombel_id && (
                    <tr><td colSpan={7}>
                      <form className="form" onSubmit={(e) => { e.preventDefault(); void simpanRombel(r, new FormData(e.currentTarget)) }} key={`${r.rombel_id}-${r.kompetensi_keahlian}-${r.moving_class}-${r.melayani_kebutuhan_khusus}`}>
                        <label>Jurusan / kompetensi keahlian<input name="kompetensi" defaultValue={r.kompetensi_keahlian ?? r.program ?? ''} maxLength={100} /></label>
                        <label>Moving class<select name="moving" defaultValue={r.moving_class ?? ''}><option value="">(kosong)</option><option>Ya</option><option>Tidak</option></select></label>
                        <label>Melayani kebutuhan khusus<input name="kk" defaultValue={r.melayani_kebutuhan_khusus ?? ''} maxLength={200} placeholder="Contoh: Tidak ada, atau jenis layanan" /></label>
                        <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi" disabled={sibuk}>Simpan data rombel</button></div>
                      </form>
                      <h4>SK mengajar</h4>
                      <div className="tabel-bungkus">
                        <table>
                          <thead><tr><th>Mata pelajaran</th><th>PTK</th><th>Jam</th><th>Nomor SK</th><th>Tanggal SK</th><th /></tr></thead>
                          <tbody>
                            {r.pembelajaran.map((p) => (
                              <tr key={`${p.beban_id}-${p.sk_mengajar}-${p.tanggal_sk}`}>
                                <td>{p.mapel}</td><td>{p.ptk}</td><td>{p.jp}</td>
                                <td colSpan={3}>
                                  <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} onSubmit={(e) => { e.preventDefault(); void simpanSk(p, new FormData(e.currentTarget)) }}>
                                    <input name="sk" defaultValue={p.sk_mengajar ?? ''} maxLength={100} aria-label={`Nomor SK ${p.mapel} ${p.ptk}`} placeholder="Nomor SK" style={{ flex: '1 1 160px' }} />
                                    <input name="tanggal" type="date" defaultValue={p.tanggal_sk ?? ''} aria-label={`Tanggal SK ${p.mapel} ${p.ptk}`} />
                                    <button className="tombol" disabled={sibuk}>Simpan</button>
                                  </form>
                                </td>
                              </tr>
                            ))}
                            {r.pembelajaran.length === 0 && <tr><td colSpan={6} className="catatan">Belum ada pembagian guru. Atur di <Link to="/portal/kurikulum/beban">Beban mengajar</Link>.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
              {tampil.length === 0 && <tr><td colSpan={7} className="catatan">Tidak ada rombel yang cocok.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="catatan jarak">Perubahan tampil di <Link to="/portal/ajuan-masuk">antrean operator Dapodik</Link>. Nomor dan tanggal SK mengajar hanya disimpan di SIMS dan dicetak pada F-ROMBEL; unggahan Dapodik tidak menimpanya.</p>
      {cetak && <CetakRombel r={cetak} tutup={() => setCetak(null)} />}
    </Halaman>
  )
}

export default function KurikulumFormulir() {
  return <GerbangKurikulum judul="Formulir rombongan belajar" aktif="/portal/kurikulum/formulir">{() => <Isi />}</GerbangKurikulum>
}
