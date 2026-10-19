import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { AKSEPTASI, hapusBerkas, periksaBerkas, ukuranTeks, unduhBerkas, unggahBerkas } from '../lib/berkas'
import { panggil, tgl } from '../lib/rpc'
import { biru, merah, nilaiTeks, unduhCsv } from './lmsUtil'
import PilihKelas from './LmsPilihKelas'
import { KartuKelas, type KelasRingkas } from './LmsProgres'
import type { NilaiCbt } from './lmsXlsx'

// Kelengkapan administrasi guru, dokumen perangkat ajar, jurnal mengajar, buku nilai, dan ringkasan untuk orang tua.

type Kelas = { id: string; mapel: string; rombel: string; peran: 'pengelola' | 'siswa' }
type Perangkat = {
  id: string; jenis: string; judul: string; isi: string | null; url: string | null; kelas_ajar_id: string | null
  kelas: string | null; guru: string; milik_saya: boolean; diubah_pada: string
  berkas_id: string | null; berkas_nama: string | null; berkas_ukuran: number | null
}
const labelPerangkat: Record<string, string> = {
  cp: 'Capaian Pembelajaran (CP)', tp: 'Tujuan Pembelajaran (TP)', atp: 'Alur Tujuan Pembelajaran (ATP)', silabus: 'Silabus',
  prota: 'Program Tahunan', promes: 'Program Semester', modul_ajar: 'Modul Ajar', rpp: 'RPP', kktp: 'KKTP',
  bahan_ajar: 'Bahan Ajar', lkpd: 'LKPD', soal_asesmen: 'Soal dan kisi-kisi', analisis_nilai: 'Analisis nilai',
  remedial_pengayaan: 'Remedial dan pengayaan', lainnya: 'Lainnya',
}
// Jenis yang lazim diperiksa kelengkapannya oleh supervisi.
const jenisInti = ['cp', 'atp', 'prota', 'promes', 'modul_ajar', 'kktp']

function FormPerangkat({ kelas, awal, jenisAwal, selesai, batal }: { kelas: Kelas[]; awal: Perangkat | null; jenisAwal?: string; selesai: () => Promise<void>; batal: () => void }) {
  const [v, setV] = useState({ jenis: awal?.jenis ?? jenisAwal ?? 'modul_ajar', judul: awal?.judul ?? '', kelas: awal?.kelas_ajar_id ?? '', isi: awal?.isi ?? '', url: awal?.url ?? '' })
  const [berkas, setBerkas] = useState<File | null>(null)
  const [progres, setProgres] = useState<number | null>(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const berkasLama = awal?.berkas_id ? { id: awal.berkas_id, nama: awal.berkas_nama ?? 'berkas', ukuran: awal.berkas_ukuran } : null

  function pilih(f: File | null) {
    setGalat('')
    if (f) {
      const salah = periksaBerkas(f)
      if (salah) { setGalat(salah); setBerkas(null); return }
    }
    setBerkas(f)
  }

  async function kirim(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat(''); setProgres(null)
    let baruId: string | null = null
    let tersimpan = false
    try {
      let berkasId = berkasLama?.id ?? null
      if (berkas) {
        const b = await unggahBerkas(berkas, v.jenis === 'modul_ajar' ? 'modul_ajar' : 'perangkat_ajar', null, setProgres)
        baruId = b.id; berkasId = b.id
      }
      await panggil('lms_perangkat_simpan', { p_id: awal?.id ?? null, p_kelas: v.kelas || null, p_jenis: v.jenis, p_judul: v.judul, p_isi: v.isi || null, p_url: v.url || null, p_berkas: berkasId })
      tersimpan = true
      if (baruId && berkasLama) await hapusBerkas(berkasLama.id).catch(() => undefined)
    } catch (er) {
      if (baruId && !tersimpan) await hapusBerkas(baruId).catch(() => undefined)
      setGalat((er as Error).message)
    }
    setProgres(null)
    setSibuk(false)
    if (tersimpan) await selesai()
  }
  return (
    <form className="kartu form jarak" onSubmit={kirim}>
      <h3>{awal ? 'Ubah dokumen' : 'Dokumen baru'}</h3>
      <div className="grid grid-2">
        <label>Jenis
          <select value={v.jenis} onChange={(e) => setV({ ...v, jenis: e.target.value })}>
            {Object.entries(labelPerangkat).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label>Judul<input required maxLength={200} value={v.judul} onChange={(e) => setV({ ...v, judul: e.target.value })} /></label>
        <label>Kelas ajar (opsional)
          <select value={v.kelas} onChange={(e) => setV({ ...v, kelas: e.target.value })}>
            <option value="">Berlaku umum</option>
            {kelas.filter((k) => k.peran === 'pengelola').map((k) => <option key={k.id} value={k.id}>{k.mapel} {k.rombel}</option>)}
          </select>
        </label>
        <label>Tautan dokumen (opsional)<input type="url" pattern="https://.*" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://drive.google.com/..." /></label>
      </div>
      <label>Berkas (opsional, maksimal 25 MB)
        <input type="file" accept={AKSEPTASI} disabled={sibuk} onChange={(e) => pilih(e.target.files?.[0] ?? null)} />
        <span className="petunjuk">
          PDF, Word, Excel, PowerPoint, gambar, atau teks. Berkas disimpan di Google Drive sekolah.
          {berkasLama && !berkas && <> Berkas saat ini: {berkasLama.nama} ({ukuranTeks(berkasLama.ukuran)}). Pilih berkas baru untuk menggantinya.</>}
          {berkas && <> Dipilih: {berkas.name} ({ukuranTeks(berkas.size)}).</>}
        </span>
      </label>
      {progres != null && <p className="catatan" role="status">Mengunggah berkas... {progres}%</p>}
      <label>Isi dokumen (opsional bila ada tautan atau berkas)<textarea rows={10} maxLength={50000} value={v.isi} onChange={(e) => setV({ ...v, isi: e.target.value })} /><span className="petunjuk">Teks biasa. Dokumen panjang lebih nyaman diunggah sebagai berkas.</span></label>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi">
        <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? (progres != null ? 'Mengunggah...' : 'Menyimpan...') : 'Simpan'}</button>
        <button type="button" className="tombol" style={biru} onClick={batal} disabled={sibuk}>Batal</button>
      </div>
    </form>
  )
}

type KelengkapanKelas = {
  kelas_id: string; mapel: string; rombel: string; guru: string
  jumlah_pertemuan: number; lengkap: number; modul_guru: number
  kurang: { id: string; nomor: number; judul: string; kurang: string[] }[]
}

/**
 * Kelengkapan administrasi, dihitung otomatis dari isi LMS: pertemuan lengkap bila punya bahan bacaan dan lembar kerja.
 * Guru melihat kelasnya sendiri. Admin TU melihat semua guru, ditambah daftar dokumen perangkat ajar tingkat tahun.
 */
export function AdministrasiGuru() {
  const [data, setData] = useState<{ supervisi: boolean; kelas: KelengkapanKelas[] } | null>(null)
  const [galat, setGalat] = useState('')
  const [guruPilih, setGuruPilih] = useState('')
  const [buka, setBuka] = useState<string | null>(null)
  useEffect(() => {
    panggil<{ supervisi: boolean; kelas: KelengkapanKelas[] }>('lms_kelengkapan_administrasi').then(setData).catch((e: Error) => setGalat(e.message))
  }, [])
  const supervisi = data?.supervisi ?? false
  const guruDaftar = useMemo(() => Array.from(new Set((data?.kelas ?? []).map((k) => k.guru))).sort(), [data])
  const tampil = (data?.kelas ?? []).filter((k) => !guruPilih || k.guru === guruPilih)
  const total = tampil.reduce((j, k) => j + k.jumlah_pertemuan, 0)
  const lengkap = tampil.reduce((j, k) => j + k.lengkap, 0)
  const persen = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)
  const labelPersen = (a: number, b: number) => (persen(a, b) === null ? '-' : `${persen(a, b)}%`)
  return (
    <Halaman judul="Kelengkapan administrasi" lead={supervisi ? 'Kelengkapan pertemuan semua guru, dihitung otomatis dari isi LMS.' : 'Kelengkapan pertemuan Anda, dihitung otomatis dari isi LMS.'}>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!data && !galat && <p className="catatan">Memuat...</p>}
      {data && (
        <>
          <div className="grid grid-3">
            <div className="kartu"><small>Pertemuan lengkap</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{lengkap} dari {total}</p><small>{labelPersen(lengkap, total)} dari seluruh pertemuan</small></div>
            <div className="kartu"><small>Kelas ajar</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{tampil.length}</p><small>{tampil.filter((k) => k.kurang.length === 0).length} kelas sudah lengkap</small></div>
            <div className="kartu"><small>Modul guru</small><p style={{ margin: 0, fontSize: '1.4rem' }}>{tampil.reduce((j, k) => j + k.modul_guru, 0)} pertemuan</p><small>Punya materi khusus guru (modul ajar)</small></div>
          </div>
          <p className="catatan jarak">Pertemuan dinilai lengkap bila punya bahan bacaan dan lembar kerja untuk siswa. Isi di ruang pertemuan, bukan di sini. Halaman ini hanya membaca hasilnya.</p>
          <div className="aksi">
            {supervisi && (
              <label>Guru
                <select value={guruPilih} onChange={(e) => setGuruPilih(e.target.value)}>
                  <option value="">Semua guru</option>
                  {guruDaftar.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            )}
            <button type="button" className="tombol" style={biru} disabled={tampil.length === 0} onClick={() => unduhCsv('kelengkapan-administrasi', [
              ['Guru', 'Mata pelajaran', 'Rombel', 'Jumlah pertemuan', 'Pertemuan lengkap', 'Persen lengkap', 'Pertemuan bermodul guru', 'Pertemuan yang kurang'],
              ...tampil.map((k) => [k.guru, k.mapel, k.rombel, k.jumlah_pertemuan, k.lengkap, persen(k.lengkap, k.jumlah_pertemuan), k.modul_guru,
                k.kurang.map((x) => `P${x.nomor} (${x.kurang.join(', ')})`).join('; ')]),
            ])}>Unduh CSV</button>
          </div>
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr>{supervisi && <th>Guru</th>}<th>Kelas</th><th>Pertemuan lengkap</th><th>Modul guru</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {tampil.length === 0 && <tr><td colSpan={supervisi ? 6 : 5}>Belum ada kelas ajar.</td></tr>}
                {tampil.map((k) => (
                  <Fragment key={k.kelas_id}>
                    <tr>
                      {supervisi && <td>{k.guru}</td>}
                      <td><Link to={`/portal/lms/${k.kelas_id}`}>{k.mapel} {k.rombel}</Link></td>
                      <td>{k.lengkap} dari {k.jumlah_pertemuan} ({labelPersen(k.lengkap, k.jumlah_pertemuan)})</td>
                      <td>{k.modul_guru} dari {k.jumlah_pertemuan}</td>
                      <td>{k.jumlah_pertemuan === 0
                        ? <span className="status status-dibatalkan">Belum ada pertemuan</span>
                        : k.kurang.length === 0 ? <span className="status status-selesai">Lengkap</span> : <span className="status status-menunggu">{k.kurang.length} pertemuan kurang</span>}</td>
                      <td>{k.kurang.length > 0 && <button type="button" className="tombol" style={biru} onClick={() => setBuka(buka === k.kelas_id ? null : k.kelas_id)}>{buka === k.kelas_id ? 'Tutup' : 'Lihat yang kurang'}</button>}</td>
                    </tr>
                    {buka === k.kelas_id && (
                      <tr><td colSpan={supervisi ? 6 : 5}>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                          {k.kurang.map((x) => (
                            <li key={x.id}><Link to={`/portal/lms/${k.kelas_id}/pertemuan/${x.id}`}>Pertemuan {x.nomor}: {x.judul}</Link> <small>belum ada {x.kurang.join(' dan ')}</small></li>
                          ))}
                        </ul>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {supervisi
            ? (
              <>
                <h2 className="jarak" style={{ fontSize: '1.2rem' }}>Dokumen perangkat ajar per guru</h2>
                <p className="catatan">Dokumen tingkat tahun yang tidak melekat pada satu pertemuan: CP, ATP, Prota, Promes, dan KKTP.</p>
                <DaftarPerangkat />
              </>
            )
            : <p className="catatan jarak">Dokumen tingkat tahun (CP, ATP, Prota, Promes, KKTP) diunggah di <Link to="/portal/lms/perangkat/tp">Dokumen perangkat ajar</Link>.</p>}
        </>
      )}
      <p className="catatan jarak"><Link to="/portal/lms">Kembali ke ruang belajar</Link></p>
    </Halaman>
  )
}

/** Daftar dokumen perangkat ajar. Dengan `jenis`, daftar dan formulir dikunci ke satu jenis. */
export function DaftarPerangkat({ jenis }: { jenis?: string }) {
  const { profil } = useAuth()
  const supervisi = profil?.peran === 'admin_tu'
  const [daftar, setDaftar] = useState<Perangkat[] | null>(null)
  const [kelas, setKelas] = useState<Kelas[]>([])
  const [galat, setGalat] = useState('')
  const [edit, setEdit] = useState<Perangkat | 'baru' | null>(null)
  const [saring, setSaring] = useState(jenis ?? '')
  const [guruPilih, setGuruPilih] = useState('')
  const [lihat, setLihat] = useState<string | null>(null)
  const muat = useCallback(async () => {
    try {
      const [d, k] = await Promise.all([panggil<Perangkat[]>('lms_perangkat_daftar', { p_ptk: null }), panggil<Kelas[]>('lms_kelas_saya')])
      setDaftar(d); setKelas(k)
    } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])
  async function hapus(id: string) {
    if (!window.confirm('Hapus dokumen ini?')) return
    const lama = (daftar ?? []).find((d) => d.id === id)
    try {
      await panggil('lms_perangkat_hapus', { p_id: id })
      if (lama?.berkas_id) await hapusBerkas(lama.berkas_id).catch(() => undefined)
      await muat()
    } catch (e) { setGalat((e as Error).message) }
  }
  async function unduh(d: Perangkat) {
    if (!d.berkas_id) return
    setGalat('')
    try { await unduhBerkas(d.berkas_id, d.berkas_nama ?? 'berkas') } catch (e) { setGalat((e as Error).message) }
  }
  const guruDaftar = useMemo(() => Array.from(new Set((daftar ?? []).map((d) => d.guru))).sort(), [daftar])
  const tampil = (daftar ?? []).filter((d) => (!saring || d.jenis === saring) && (!guruPilih || d.guru === guruPilih))
  const matriks = useMemo(() => guruDaftar.map((g) => ({
    guru: g, hitung: Object.fromEntries(jenisInti.map((j) => [j, (daftar ?? []).filter((d) => d.guru === g && d.jenis === j).length])),
  })), [guruDaftar, daftar])
  return (
    <>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!supervisi && !edit && <div className="aksi"><button className="tombol tombol-isi" onClick={() => setEdit('baru')}>Tambah dokumen</button></div>}
      {edit && <FormPerangkat key={edit === 'baru' ? 'baru' : edit.id} kelas={kelas} jenisAwal={jenis} awal={edit === 'baru' ? null : edit} selesai={async () => { setEdit(null); await muat() }} batal={() => setEdit(null)} />}

      {supervisi && matriks.length > 0 && (
        <div className="kartu jarak">
          <h3>Kelengkapan per guru</h3>
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Guru</th>{jenisInti.map((j) => <th key={j}>{labelPerangkat[j].replace(/ \(.*\)/, '')}</th>)}</tr></thead>
              <tbody>{matriks.map((m) => <tr key={m.guru}><td>{m.guru}</td>{jenisInti.map((j) => <td key={j}>{m.hitung[j] || '-'}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-2 jarak">
        {!jenis && <label>Jenis
          <select value={saring} onChange={(e) => setSaring(e.target.value)}>
            <option value="">Semua jenis</option>
            {Object.entries(labelPerangkat).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>}
        {supervisi && (
          <label>Guru
            <select value={guruPilih} onChange={(e) => setGuruPilih(e.target.value)}>
              <option value="">Semua guru</option>
              {guruDaftar.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Dokumen</th><th>Jenis</th>{supervisi && <th>Guru</th>}<th>Diubah</th><th></th></tr></thead>
          <tbody>
            {!daftar && <tr><td colSpan={5}>Memuat...</td></tr>}
            {daftar && tampil.length === 0 && <tr><td colSpan={5}>Belum ada dokumen.</td></tr>}
            {tampil.map((d) => (
              <tr key={d.id}>
                <td>
                  <strong>{d.judul}</strong>{d.kelas ? <><br /><small>{d.kelas}</small></> : null}
                  {d.url && <><br /><a href={d.url} target="_blank" rel="noopener noreferrer">Buka tautan</a></>}
                  {d.berkas_id && <><br /><button type="button" className="tombol" style={biru} onClick={() => void unduh(d)}>Unduh {d.berkas_nama} ({ukuranTeks(d.berkas_ukuran)})</button></>}
                  {d.isi && <><br /><button type="button" className="tombol" style={biru} onClick={() => setLihat(lihat === d.id ? null : d.id)}>{lihat === d.id ? 'Sembunyikan isi' : 'Baca isi'}</button></>}
                  {lihat === d.id && d.isi && <p style={{ whiteSpace: 'pre-wrap' }}>{d.isi}</p>}
                </td>
                <td>{labelPerangkat[d.jenis]}</td>
                {supervisi && <td>{d.guru}</td>}
                <td><small>{tgl(d.diubah_pada)}</small></td>
                <td>
                  {d.milik_saya && (
                    <div className="aksi">
                      <button type="button" className="tombol" style={biru} onClick={() => setEdit(d)}>Ubah</button>
                      <button type="button" className="tombol" style={merah} onClick={() => void hapus(d.id)}>Hapus</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!jenis && <p className="catatan jarak"><Link to="/portal/lms">Kembali ke ruang belajar</Link></p>}
    </>
  )
}

type Jurnal = {
  id: string; tanggal: string; pertemuan_id: string | null; pertemuan_nomor: number | null; materi: string
  kegiatan: string | null; kendala: string | null; tindak_lanjut: string | null; hadir: number; izin: number; sakit: number; alpa: number
}
type PertemuanR = { id: string; nomor: number; judul: string; tanggal: string }

function FormJurnal({ kelasId, pertemuan, awal, selesai, batal }: { kelasId: string; pertemuan: PertemuanR[]; awal: Jurnal | null; selesai: () => Promise<void>; batal: () => void }) {
  const [v, setV] = useState({ pertemuan: awal?.pertemuan_id ?? '', tanggal: awal?.tanggal ?? '', materi: awal?.materi ?? '', kegiatan: awal?.kegiatan ?? '', kendala: awal?.kendala ?? '', tindak: awal?.tindak_lanjut ?? '' })
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  function pilihPertemuan(id: string) {
    const p = pertemuan.find((x) => x.id === id)
    setV({ ...v, pertemuan: id, materi: v.materi || (p?.judul ?? ''), tanggal: v.tanggal || (p?.tanggal ?? '') })
  }
  async function kirim(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      await panggil('lms_jurnal_simpan', { p_kelas: kelasId, p_id: awal?.id ?? null, p_pertemuan: v.pertemuan || null, p_tanggal: v.tanggal || null, p_materi: v.materi, p_kegiatan: v.kegiatan || null, p_kendala: v.kendala || null, p_tindak: v.tindak || null })
      await selesai()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <form className="kartu form jarak" onSubmit={kirim}>
      <h3>{awal ? 'Ubah jurnal' : 'Jurnal baru'}</h3>
      <div className="grid grid-2">
        <label>Pertemuan (opsional)
          <select value={v.pertemuan} onChange={(e) => pilihPertemuan(e.target.value)}>
            <option value="">Tidak terkait pertemuan</option>
            {pertemuan.map((p) => <option key={p.id} value={p.id}>Pertemuan {p.nomor}: {p.judul}</option>)}
          </select>
          <span className="petunjuk">Bila terkait, jumlah hadir, izin, sakit, alpa terisi otomatis dari absensi.</span>
        </label>
        <label>Tanggal<input type="date" value={v.tanggal} onChange={(e) => setV({ ...v, tanggal: e.target.value })} /></label>
      </div>
      <label>Materi<input required maxLength={300} value={v.materi} onChange={(e) => setV({ ...v, materi: e.target.value })} /></label>
      <label>Kegiatan pembelajaran<textarea rows={3} maxLength={5000} value={v.kegiatan} onChange={(e) => setV({ ...v, kegiatan: e.target.value })} /></label>
      <div className="grid grid-2">
        <label>Kendala<textarea rows={2} maxLength={3000} value={v.kendala} onChange={(e) => setV({ ...v, kendala: e.target.value })} /></label>
        <label>Tindak lanjut<textarea rows={2} maxLength={3000} value={v.tindak} onChange={(e) => setV({ ...v, tindak: e.target.value })} /></label>
      </div>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi">
        <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan jurnal'}</button>
        <button type="button" className="tombol" style={biru} onClick={batal}>Batal</button>
      </div>
    </form>
  )
}

/** Jurnal mengajar satu kelas. */
export function JurnalKelas() {
  const { kelasId = '' } = useParams()
  const [daftar, setDaftar] = useState<Jurnal[] | null>(null)
  const [pertemuan, setPertemuan] = useState<PertemuanR[]>([])
  const [galat, setGalat] = useState('')
  const [edit, setEdit] = useState<Jurnal | 'baru' | null>(null)
  const muat = useCallback(async () => {
    try {
      const [j, p] = await Promise.all([panggil<Jurnal[]>('lms_jurnal_daftar', { p_kelas: kelasId }), panggil<PertemuanR[]>('lms_pertemuan_daftar', { p_kelas: kelasId })])
      setDaftar(j); setPertemuan(p)
    } catch (e) { setGalat((e as Error).message) }
  }, [kelasId])
  useEffect(() => { void muat() }, [muat])
  async function hapus(id: string) {
    if (!window.confirm('Hapus entri jurnal ini?')) return
    try { await panggil('lms_jurnal_hapus', { p_id: id }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  function unduh() {
    unduhCsv('jurnal-mengajar.csv', [
      ['Tanggal', 'Pertemuan', 'Materi', 'Kegiatan', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Kendala', 'Tindak lanjut'],
      ...(daftar ?? []).map((j) => [j.tanggal, j.pertemuan_nomor, j.materi, j.kegiatan, j.hadir, j.izin, j.sakit, j.alpa, j.kendala, j.tindak_lanjut]),
    ])
  }
  return (
    <Halaman judul="Jurnal mengajar" lead="Catatan harian pembelajaran. Kehadiran terisi dari absensi pertemuan.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <PilihKelas kelasId={kelasId} sub="/jurnal" />
      <div className="aksi">
        {!edit && <button className="tombol tombol-isi" onClick={() => setEdit('baru')}>Tambah jurnal</button>}
        <button className="tombol" style={biru} onClick={unduh} disabled={!daftar || daftar.length === 0}>Unduh CSV</button>
      </div>
      {edit && <FormJurnal key={edit === 'baru' ? 'baru' : edit.id} kelasId={kelasId} pertemuan={pertemuan} awal={edit === 'baru' ? null : edit} selesai={async () => { setEdit(null); await muat() }} batal={() => setEdit(null)} />}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Tanggal</th><th>Materi dan kegiatan</th><th>Kehadiran</th><th>Kendala dan tindak lanjut</th><th></th></tr></thead>
          <tbody>
            {!daftar && <tr><td colSpan={5}>Memuat...</td></tr>}
            {daftar && daftar.length === 0 && <tr><td colSpan={5}>Belum ada jurnal.</td></tr>}
            {(daftar ?? []).map((j) => (
              <tr key={j.id}>
                <td>{tgl(j.tanggal)}{j.pertemuan_nomor ? <><br /><small>Pertemuan {j.pertemuan_nomor}</small></> : null}</td>
                <td><strong>{j.materi}</strong>{j.kegiatan ? <><br /><small>{j.kegiatan}</small></> : null}</td>
                <td>{j.pertemuan_id ? <small>H {j.hadir}, I {j.izin}, S {j.sakit}, A {j.alpa}</small> : '-'}</td>
                <td><small>{j.kendala ?? '-'}{j.tindak_lanjut ? <><br />Tindak lanjut: {j.tindak_lanjut}</> : null}</small></td>
                <td>
                  <div className="aksi">
                    <button type="button" className="tombol" style={biru} onClick={() => setEdit(j)}>Ubah</button>
                    <button type="button" className="tombol" style={merah} onClick={() => void hapus(j.id)}>Hapus</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="catatan jarak"><Link to={`/portal/lms/${kelasId}`}>Kembali ke kelas</Link></p>
    </Halaman>
  )
}

type Nilai = {
  komponen: { id: string; sumber: string; grup: string; judul: string }[]
  bobot: Record<string, number>
  siswa: { peserta_didik_id: string; nama: string; nisn: string | null; no_urut: number | null; nilai: Record<string, number>; rata: Record<string, number>; akhir: number | null }[]
}
const labelGrup: Record<string, string> = { kuis: 'Kuis', tugas: 'Tugas', uh: 'Ulangan harian', uts: 'UTS', uas: 'UAS' }
const grupUrut = ['kuis', 'tugas', 'uh', 'uts', 'uas']

type KelasNilai = { id: string; mapel: string; rombel: string; guru: string; semester: string; peran: 'pengelola' | 'siswa' }

/** Tabel nilai satu kelas dengan bobot dan unduhan. Dipakai halaman Rekap nilai dan Buku nilai per kelas. */
function TabelNilai({ kelas }: { kelas: KelasNilai }) {
  const kelasId = kelas.id
  const [data, setData] = useState<Nilai | null>(null)
  const [galat, setGalat] = useState('')
  const [bobot, setBobot] = useState<Record<string, number>>({ kuis: 20, tugas: 20, uh: 20, uts: 20, uas: 20 })
  const [terapan, setTerapan] = useState(bobot)
  const [mengunduh, setMengunduh] = useState(false)
  const [cbt, setCbt] = useState<NilaiCbt | null>(null)
  const [semuaCbt, setSemuaCbt] = useState(false)
  // Nilai CBT (UTS dan UAS) dibaca terpisah. Bila fungsinya belum terpasang atau gagal, bagian CBT disembunyikan.
  useEffect(() => { setCbt(null); panggil<NilaiCbt>('lms_nilai_cbt', { p_kelas: kelasId }).then(setCbt).catch(() => setCbt(null)) }, [kelasId])
  useEffect(() => {
    setData(null); setGalat('')
    panggil<Nilai>('lms_nilai_kelas', { p_kelas: kelasId, p_bobot: terapan }).then(setData).catch((e: Error) => setGalat(e.message))
  }, [kelasId, terapan])
  // Ulangan harian, UTS, dan UAS tidak lagi dibuat di kelas (dialihkan ke CBT). Kolomnya tampil hanya bila kelas masih punya data lama.
  const grup = grupUrut.filter((g) => g === 'kuis' || g === 'tugas' || (data?.komponen ?? []).some((k) => k.grup === g))
  const jumlah = grup.reduce((j, g) => j + (bobot[g] || 0), 0)
  const kolomCbt = (cbt?.kolom ?? []).filter((k) => semuaCbt || k.cocok)
  const adaCbtLain = (cbt?.kolom ?? []).some((k) => !k.cocok)
  const nilaiCbt = new Map((cbt?.nilai ?? []).map((n) => [`${n.peserta_didik_id}|${n.kolom}`, n.nilai]))
  const labelCbt = (k: { jenis: string; ujian: string; paket: string }) => `${k.jenis === 'uts' ? 'UTS' : k.jenis === 'uas' ? 'UAS' : 'Ujian'}: ${k.ujian} / ${k.paket}`
  const nama = `${kelas.mapel} ${kelas.rombel}`.replace(/[\\/:*?"<>|]/g, ' ').trim()
  function unduhCsvNilai() {
    if (!data) return
    unduhCsv(`nilai-${nama}.csv`, [
      ['No', 'Nama', 'NISN', ...data.komponen.map((k) => `${labelGrup[k.grup]}: ${k.judul}`), ...grup.map((g) => `Rata-rata ${labelGrup[g]}`), 'Nilai akhir', ...kolomCbt.map(labelCbt)],
      ...data.siswa.map((s, i) => [s.no_urut ?? i + 1, s.nama, s.nisn, ...data.komponen.map((k) => s.nilai[k.id]), ...grup.map((g) => s.rata[g]), s.akhir, ...kolomCbt.map((k) => nilaiCbt.get(`${s.peserta_didik_id}|${k.id}`))]),
    ])
  }
  async function unduhExcel() {
    setMengunduh(true); setGalat('')
    try { const { unduhRekapKelas } = await import('./lmsXlsx'); await unduhRekapKelas(kelas, terapan) } catch (e) { setGalat('Gagal menyiapkan Excel. ' + (e as Error).message) }
    setMengunduh(false)
  }
  const kolom = 2 + grup.length + kolomCbt.length
  return (
    <>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="kartu form">
        <h3>Bobot nilai akhir</h3>
        <div className="grid grid-3">
          {grup.map((g) => (
            <label key={g}>{labelGrup[g]} (%)<input type="number" min={0} max={100} value={bobot[g]} onChange={(e) => setBobot({ ...bobot, [g]: Number(e.target.value) })} /></label>
          ))}
        </div>
        <p className="catatan">Jumlah bobot {jumlah}. Komponen yang belum punya nilai tidak ikut dihitung, dan bobot disesuaikan otomatis dari komponen yang ada.</p>
        <div className="aksi">
          <button className="tombol tombol-isi" onClick={() => setTerapan(bobot)}>Terapkan bobot</button>
          <button className="tombol" style={biru} onClick={() => void unduhExcel()} disabled={!data || mengunduh}>{mengunduh ? 'Menyiapkan...' : 'Unduh Excel (lengkap)'}</button>
          <button className="tombol" style={biru} onClick={unduhCsvNilai} disabled={!data}>Unduh CSV nilai</button>
        </div>
      </div>
      {cbt && cbt.kolom.length > 0 && (
        <p className="catatan jarak">
          Kolom CBT di kanan adalah nilai UTS dan UAS dari Asesmen digital, tidak masuk nilai akhir di atas.
          {kolomCbt.length === 0 && ' Belum ada paket CBT bernama mapel ini.'}{' '}
          {adaCbtLain && <label><input type="checkbox" checked={semuaCbt} onChange={(e) => setSemuaCbt(e.target.checked)} /> Tampilkan semua paket CBT yang diikuti kelas ini</label>}
        </p>
      )}
      <div className="tabel-bungkus jarak">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              {(data?.komponen ?? []).map((k) => <th key={k.id}>{k.judul}<br /><small>{labelGrup[k.grup]}</small></th>)}
              {grup.map((g) => <th key={g}>Rata {labelGrup[g]}</th>)}
              <th>Akhir</th>
              {kolomCbt.map((k) => <th key={k.id}>{k.paket}<br /><small>{labelCbt(k).split(':')[0]} CBT · {k.ujian}</small></th>)}
            </tr>
          </thead>
          <tbody>
            {!data && !galat && <tr><td colSpan={kolom}>Memuat...</td></tr>}
            {data && data.komponen.length === 0 && <tr><td colSpan={kolom}>Belum ada kuis atau tugas yang terbit.</td></tr>}
            {(data?.siswa ?? []).map((s) => (
              <tr key={s.peserta_didik_id}>
                <td>{s.nama}<br /><small>{s.nisn ?? ''}</small></td>
                {data!.komponen.map((k) => <td key={k.id}>{nilaiTeks(s.nilai[k.id])}</td>)}
                {grup.map((g) => <td key={g}>{nilaiTeks(s.rata[g])}</td>)}
                <td><strong>{nilaiTeks(s.akhir)}</strong></td>
                {kolomCbt.map((k) => <td key={k.id}>{nilaiTeks(nilaiCbt.get(`${s.peserta_didik_id}|${k.id}`))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Buku nilai satu kelas (alamat lama dari halaman kelas). */
export function BukuNilai() {
  const { kelasId = '' } = useParams()
  const [kelas, setKelas] = useState<KelasNilai | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    panggil<KelasNilai[]>('lms_kelas_saya').then((d) => {
      const k = d.find((x) => x.id === kelasId)
      if (k) setKelas(k); else setGalat('Kelas tidak ditemukan.')
    }).catch((e: Error) => setGalat(e.message))
  }, [kelasId])
  return (
    <Halaman judul="Buku nilai" lead="Nilai terbaik kuis dan nilai tugas yang sudah dinilai.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <PilihKelas kelasId={kelasId} sub="/nilai" />
      {kelas && <TabelNilai kelas={kelas} />}
      <p className="catatan jarak"><Link to={`/portal/lms/${kelasId}`}>Kembali ke kelas</Link></p>
    </Halaman>
  )
}

/** Menu Nilai untuk guru: pilih kelas, lihat nilai semua siswa, unduh Excel atau CSV. */
export function RekapNilai() {
  const [kelas, setKelas] = useState<KelasNilai[] | null>(null)
  const [galat, setGalat] = useState('')
  const [pilih, setPilih] = useState('')
  useEffect(() => {
    panggil<KelasNilai[]>('lms_kelas_saya').then((d) => {
      const k = d.filter((x) => x.peran === 'pengelola')
      setKelas(k)
      setPilih((lama) => lama || k[0]?.id || '')
    }).catch((e: Error) => setGalat(e.message))
  }, [])
  const aktif = kelas?.find((k) => k.id === pilih) ?? null
  return (
    <Halaman judul="Rekap nilai" lead="Nilai kuis dan tugas semua siswa per kelas. Nilai UTS dan UAS dari Asesmen digital (CBT) tampil di kolom kanan.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!kelas && !galat && <p className="catatan">Memuat...</p>}
      {kelas && kelas.length === 0 && <p className="catatan">Belum ada kelas yang Anda ajar.</p>}
      {kelas && kelas.length > 0 && (
        <div className="chip-bar" role="tablist" aria-label="Kelas">
          {kelas.map((k) => (
            <button key={k.id} type="button" role="tab" aria-selected={pilih === k.id} className={'chip' + (pilih === k.id ? ' aktif' : '')} onClick={() => setPilih(k.id)}>{k.rombel} · {k.mapel}</button>
          ))}
        </div>
      )}
      {aktif && <TabelNilai key={aktif.id} kelas={aktif} />}
    </Halaman>
  )
}

type Anak = { peserta_didik_id: string; nama: string; kelas: KelasRingkas[] }

/** Ringkasan belajar anak untuk orang tua: kehadiran, materi, nilai kuis dan ulangan, status tugas. Hanya baca. */
export function LmsAnak() {
  const [data, setData] = useState<Anak[] | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => { panggil<Anak[]>('lms_anak_ringkasan').then(setData).catch((e: Error) => setGalat(e.message)) }, [])
  return (
    <Halaman judul="Belajar anak" lead="Kehadiran, materi, nilai kuis dan ulangan, serta status tugas di ruang belajar.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!data && !galat && <p className="catatan">Memuat...</p>}
      {data && data.length === 0 && <div className="kartu"><p>Belum ada anak yang ditautkan ke akun Anda. Minta admin TU sekolah menautkannya.</p></div>}
      {(data ?? []).map((a) => (
        <div key={a.peserta_didik_id} className="jarak">
          <div className="judul-bagian"><h2>{a.nama}</h2></div>
          {a.kelas.length === 0 && <div className="kartu"><p className="catatan">Belum ada kelas ajar.</p></div>}
          {a.kelas.map((k) => <KartuKelas key={k.kelas_id} k={k} tautan={false} />)}
        </div>
      ))}
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
