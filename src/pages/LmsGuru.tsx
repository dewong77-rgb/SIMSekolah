import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { AKSEPTASI, hapusBerkas, periksaBerkas, ukuranTeks, unduhBerkas, unggahBerkas } from '../lib/berkas'
import { panggil, tgl } from '../lib/rpc'
import { biru, merah, nilaiTeks, unduhCsv } from './lmsUtil'
import { KartuKelas, type KelasRingkas } from './LmsProgres'

// Administrasi guru (perangkat ajar, jurnal), buku nilai, dan ringkasan untuk orang tua.

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
        const b = await unggahBerkas(berkas, 'perangkat_ajar', null, setProgres)
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

/** Perangkat ajar milik guru. Admin TU melihat semua guru sebagai bahan supervisi. */
export function AdministrasiGuru() {
  const { profil } = useAuth()
  const supervisi = profil?.peran === 'admin_tu'
  return (
    <Halaman judul="Administrasi guru" lead={supervisi ? 'Perangkat ajar seluruh guru, untuk supervisi.' : 'Perangkat ajar Anda: ATP, modul ajar, program, dan lainnya.'}>
      <DaftarPerangkat />
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
const labelGrup: Record<string, string> = { kuis: 'Kuis', tugas: 'Tugas', uh: 'Ulangan harian', uas: 'Ulangan semester' }
const grupUrut = ['kuis', 'tugas', 'uh', 'uas']

/** Buku nilai satu kelas: kuis, tugas, ulangan harian dan semester, dengan nilai akhir berbobot. */
export function BukuNilai() {
  const { kelasId = '' } = useParams()
  const [data, setData] = useState<Nilai | null>(null)
  const [galat, setGalat] = useState('')
  const [bobot, setBobot] = useState<Record<string, number>>({ kuis: 20, tugas: 20, uh: 30, uas: 30 })
  const [terapan, setTerapan] = useState(bobot)
  useEffect(() => {
    panggil<Nilai>('lms_nilai_kelas', { p_kelas: kelasId, p_bobot: terapan }).then(setData).catch((e: Error) => setGalat(e.message))
  }, [kelasId, terapan])
  const jumlah = grupUrut.reduce((j, g) => j + (bobot[g] || 0), 0)
  function unduh() {
    if (!data) return
    unduhCsv('buku-nilai.csv', [
      ['No', 'Nama', 'NISN', ...data.komponen.map((k) => `${labelGrup[k.grup]}: ${k.judul}`), ...grupUrut.map((g) => `Rata-rata ${labelGrup[g]}`), 'Nilai akhir'],
      ...data.siswa.map((s, i) => [s.no_urut ?? i + 1, s.nama, s.nisn, ...data.komponen.map((k) => s.nilai[k.id]), ...grupUrut.map((g) => s.rata[g]), s.akhir]),
    ])
  }
  return (
    <Halaman judul="Buku nilai" lead="Nilai terbaik kuis dan ulangan, serta nilai tugas yang sudah dinilai.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="kartu form">
        <h3>Bobot nilai akhir</h3>
        <div className="grid grid-3">
          {grupUrut.map((g) => (
            <label key={g}>{labelGrup[g]} (%)<input type="number" min={0} max={100} value={bobot[g]} onChange={(e) => setBobot({ ...bobot, [g]: Number(e.target.value) })} /></label>
          ))}
        </div>
        <p className="catatan">Jumlah bobot {jumlah}. Komponen yang belum punya nilai tidak ikut dihitung, dan bobot disesuaikan otomatis dari komponen yang ada.</p>
        <div className="aksi">
          <button className="tombol tombol-isi" onClick={() => setTerapan(bobot)}>Terapkan bobot</button>
          <button className="tombol" style={biru} onClick={unduh} disabled={!data}>Unduh CSV</button>
        </div>
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              {(data?.komponen ?? []).map((k) => <th key={k.id}>{k.judul}<br /><small>{labelGrup[k.grup]}</small></th>)}
              {grupUrut.map((g) => <th key={g}>Rata {labelGrup[g]}</th>)}
              <th>Akhir</th>
            </tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan={6}>Memuat...</td></tr>}
            {data && data.komponen.length === 0 && <tr><td colSpan={6}>Belum ada kuis, ulangan, atau tugas yang terbit.</td></tr>}
            {(data?.siswa ?? []).map((s) => (
              <tr key={s.peserta_didik_id}>
                <td>{s.nama}<br /><small>{s.nisn ?? ''}</small></td>
                {data!.komponen.map((k) => <td key={k.id}>{nilaiTeks(s.nilai[k.id])}</td>)}
                {grupUrut.map((g) => <td key={g}>{nilaiTeks(s.rata[g])}</td>)}
                <td><strong>{nilaiTeks(s.akhir)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="catatan jarak"><Link to={`/portal/lms/${kelasId}`}>Kembali ke kelas</Link></p>
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
