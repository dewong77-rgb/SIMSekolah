import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil, tglJam } from '../lib/rpc'
import { bacaSoalXlsx, unduhTemplateSoal, type SoalImpor } from './lmsSoalXlsx'
import { biru, dariInputLokal, dua, keInputLokal, merah, nilaiTeks, unduhCsv } from './lmsUtil'

// Kuis dan ulangan: pilihan ganda, isian singkat, esai dengan rubrik. Semua data lewat fungsi basis data lms_*.
// Kunci jawaban dan rubrik skor baru dikirim setelah siswa selesai.

export type PertemuanRingkas = { id: string; nomor: number; judul: string }
type Jenis = 'kuis' | 'ulangan_harian' | 'ulangan_tengah' | 'ulangan_semester'
type Tipe = 'pilgan' | 'isian' | 'esai'
type Level = { skor: number; deskripsi: string }
type Rubrik = { kriteria: string; skor_maks: number; level?: Level[] }
type Komposisi = { pilgan: number; isian: number; esai: number; total_bobot: number }
type Asesmen = {
  id: string; jenis: Jenis; judul: string; petunjuk: string | null
  pertemuan_id: string | null; pertemuan_nomor: number | null; durasi_menit: number
  buka: string | null; tutup: string | null; maks_percobaan: number; acak: boolean; tampil_hasil: boolean
  jumlah_tampil: number | null; kkm: number | null; komposisi: Komposisi
  status: 'draf' | 'terbit'; jumlah_soal: number; terkunci: boolean
  sudah_selesai: number | null; perlu_koreksi: number | null
  percobaan_selesai: number | null; nilai_terbaik: number | null; menunggu_koreksi: number | null
  percobaan_terakhir: string | null; berjalan: boolean | null
}
type Soal = {
  id: string; urutan: number; tipe: Tipe; pertanyaan: string; opsi: string[] | null; kunci: number | null
  kunci_isian: string[] | null; rubrik: Rubrik[] | null; bobot: number; pembahasan: string | null
}
type SoalKerja = { soal_id: string; tipe: Tipe; pertanyaan: string; bobot: number; opsi: string[] | null; pilihan: number | null; teks: string | null; rubrik: Rubrik[] | null }
type SoalTinjau = SoalKerja & {
  benar: number | null; kunci_isian: string[] | null; skor: number | null; status_koreksi: 'menunggu' | null
  skor_rubrik: number[] | null; catatan_guru: string | null; pembahasan: string | null
}
type Sesi = { percobaan: string; batas_waktu: string; sekarang: string; judul: string; petunjuk: string | null; soal: SoalKerja[] }
type Hasil = {
  nilai: number | null; nilai_otomatis: number | null; butuh_koreksi: boolean; kkm: number | null
  tampil_hasil: boolean; judul: string; tinjau: SoalTinjau[] | null
}
type StatusKuis = 'belum' | 'berjalan' | 'perlu_koreksi' | 'selesai'
type BarisKuis = {
  peserta_didik_id: string; nama: string; nisn: string | null; no_urut: number | null; percobaan: number
  status: StatusKuis; nilai_terbaik: number | null; nilai_terakhir: number | null; nilai_otomatis: number | null
}
type JawabanKoreksi = {
  percobaan_id: string; peserta_didik_id: string; nama: string; ke: number; teks: string
  skor: number | null; skor_rubrik: number[] | null; catatan_guru: string | null; dikoreksi: boolean
  otomatis_benar: boolean | null; skor_efektif: number
}
type SoalKoreksi = {
  soal_id: string; tipe: Tipe; pertanyaan: string; bobot: number; rubrik: Rubrik[] | null
  kunci_isian: string[] | null; jawaban: JawabanKoreksi[]
}

const labelJenis: Record<string, string> = { kuis: 'Kuis', ulangan_harian: 'Ulangan harian', ulangan_tengah: 'Ulangan tengah semester (UTS)', ulangan_semester: 'Ulangan akhir semester (UAS)' }
const labelTab: Record<Jenis, string> = { kuis: 'Kuis', ulangan_harian: 'Ulangan harian', ulangan_tengah: 'UTS', ulangan_semester: 'UAS' }
const urutJenis: Jenis[] = ['kuis', 'ulangan_harian', 'ulangan_tengah', 'ulangan_semester']
const labelTipe: Record<Tipe, string> = { pilgan: 'Pilihan ganda', isian: 'Isian singkat', esai: 'Esai dengan rubrik' }
const labelStatusKuis: Record<StatusKuis, string> = { belum: 'Belum mengerjakan', berjalan: 'Sedang mengerjakan', perlu_koreksi: 'Menunggu koreksi', selesai: 'Selesai' }
const kelasStatusKuis: Record<StatusKuis, string> = { belum: 'status-dibatalkan', berjalan: 'status-menunggu', perlu_koreksi: 'status-menunggu', selesai: 'status-selesai' }
const huruf = 'ABCDEF'

function jadwal(a: Asesmen): string {
  if (a.buka && a.tutup) return `${tglJam(a.buka)} sampai ${tglJam(a.tutup)}`
  if (a.buka) return `Mulai ${tglJam(a.buka)}`
  if (a.tutup) return `Ditutup ${tglJam(a.tutup)}`
  return 'Kapan saja'
}

const rubrikMaks = (r: Rubrik[] | null) => (r ?? []).reduce((j, k) => j + Number(k.skor_maks), 0)

type NilaiForm = {
  pertemuan: string; jenis: string; judul: string; petunjuk: string; durasi: number; buka: string; tutup: string
  maks: number; acak: boolean; tampil: boolean; jumlahTampil: string; kkm: string
}

/** Menyimpan pengaturan asesmen. Fungsi yang sama dipakai untuk membuat, mengubah, dan menerbitkan. */
function simpanAsesmen(kelasId: string, a: Asesmen | null, v: NilaiForm, terbit: boolean | null): Promise<string> {
  return panggil<string>('lms_asesmen_atur', {
    p_kelas: kelasId, p_id: a?.id ?? null, p_pertemuan: v.pertemuan || null, p_jenis: v.jenis, p_judul: v.judul,
    p_petunjuk: v.petunjuk || null, p_durasi: v.durasi, p_buka: dariInputLokal(v.buka), p_tutup: dariInputLokal(v.tutup),
    p_maks: v.maks, p_acak: v.acak, p_tampil_hasil: v.tampil, p_terbit: terbit,
    p_jumlah_tampil: v.jumlahTampil.trim() ? Number(v.jumlahTampil) : null,
    p_kkm: v.kkm.trim() ? Number(v.kkm) : null,
  })
}
const nilaiAwal = (a: Asesmen | null, jenisAwal: Jenis = 'kuis'): NilaiForm => ({
  pertemuan: a?.pertemuan_id ?? '', jenis: a?.jenis ?? jenisAwal, judul: a?.judul ?? '', petunjuk: a?.petunjuk ?? '',
  durasi: a?.durasi_menit ?? 15, buka: keInputLokal(a?.buka ?? null), tutup: keInputLokal(a?.tutup ?? null),
  maks: a?.maks_percobaan ?? 1, acak: a?.acak ?? true, tampil: a?.tampil_hasil ?? true,
  jumlahTampil: a?.jumlah_tampil != null ? String(a.jumlah_tampil) : '', kkm: a?.kkm != null ? String(a.kkm) : '',
})

function FormAsesmen({ kelasId, pertemuan, awal, selesai, jenisAwal }: {
  kelasId: string; pertemuan: PertemuanRingkas[]; awal: Asesmen | null; selesai: (id: string) => void | Promise<void>; jenisAwal?: Jenis
}) {
  const [v, setV] = useState<NilaiForm>(nilaiAwal(awal, jenisAwal))
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function kirim(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try { const id = await simpanAsesmen(kelasId, awal, v, awal ? null : false); await selesai(id) } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <form className="kartu form jarak" onSubmit={kirim}>
      <h3>{awal ? 'Pengaturan' : 'Kuis atau ulangan baru'}</h3>
      <div className="grid grid-2">
        <label>Jenis
          <select value={v.jenis} onChange={(e) => setV({ ...v, jenis: e.target.value })}>
            {Object.entries(labelJenis).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label>Judul<input required maxLength={200} value={v.judul} onChange={(e) => setV({ ...v, judul: e.target.value })} /></label>
        <label>Terkait pertemuan
          <select value={v.pertemuan} onChange={(e) => setV({ ...v, pertemuan: e.target.value })}>
            <option value="">Tidak terkait (ulangan umum)</option>
            {pertemuan.map((p) => <option key={p.id} value={p.id}>Pertemuan {p.nomor}: {p.judul}</option>)}
          </select>
          <span className="petunjuk">Bila terkait, siswa harus sudah absen di pertemuan itu.</span>
        </label>
        <label>Durasi (menit)<input required type="number" min={1} max={300} value={v.durasi} onChange={(e) => setV({ ...v, durasi: Number(e.target.value) })} /></label>
        <label>Dibuka (opsional)<input type="datetime-local" value={v.buka} onChange={(e) => setV({ ...v, buka: e.target.value })} /></label>
        <label>Ditutup (opsional)<input type="datetime-local" value={v.tutup} onChange={(e) => setV({ ...v, tutup: e.target.value })} /></label>
        <label>Kesempatan mengerjakan<input required type="number" min={1} max={10} value={v.maks} onChange={(e) => setV({ ...v, maks: Number(e.target.value) })} /><span className="petunjuk">Nilai terbaik yang dipakai.</span></label>
        <label>Jumlah soal yang ditampilkan (opsional)
          <input type="number" min={1} max={500} value={v.jumlahTampil} onChange={(e) => setV({ ...v, jumlahTampil: e.target.value })} />
          <span className="petunjuk">Kosong: semua soal. Diisi: tiap siswa mendapat soal acak dari bank soal.</span>
        </label>
        <label>KKM (opsional)
          <input type="number" min={0} max={100} step="0.01" value={v.kkm} onChange={(e) => setV({ ...v, kkm: e.target.value })} />
          <span className="petunjuk">Nilai 0 sampai 100. Siswa melihat lulus atau belum.</span>
        </label>
      </div>
      <label>Petunjuk untuk siswa (opsional)<textarea rows={2} maxLength={1000} value={v.petunjuk} onChange={(e) => setV({ ...v, petunjuk: e.target.value })} /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
        <input type="checkbox" checked={v.acak} onChange={(e) => setV({ ...v, acak: e.target.checked })} style={{ width: 'auto' }} />
        Acak urutan soal dan pilihan jawaban per siswa
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
        <input type="checkbox" checked={v.tampil} onChange={(e) => setV({ ...v, tampil: e.target.checked })} style={{ width: 'auto' }} />
        Tampilkan nilai, kunci, dan pembahasan setelah selesai
      </label>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : awal ? 'Simpan pengaturan' : 'Buat dan lanjut ke soal'}</button></div>
    </form>
  )
}

/** Daftar kuis dan ulangan satu kelas. Dipasang di halaman kelas. */
/** Latihan soal di dalam ruang pertemuan. Guru membuat latihan terkait pertemuan, siswa mengerjakan setelah absen. */
export function LatihanPertemuan({ kelasId, pertemuanId, judul, kelola, perbarui, versi }: {
  kelasId: string; pertemuanId: string; judul: string; kelola: boolean; perbarui: () => void; versi: number
}) {
  const [daftar, setDaftar] = useState<Asesmen[] | null>(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    panggil<Asesmen[]>('lms_asesmen_daftar', { p_kelas: kelasId })
      .then((d) => setDaftar(d.filter((a) => a.pertemuan_id === pertemuanId)))
      .catch((e: Error) => setGalat(e.message))
  }, [kelasId, pertemuanId, versi])
  async function buat() {
    setSibuk(true); setGalat('')
    try {
      const id = await simpanAsesmen(kelasId, null, { ...nilaiAwal(null), pertemuan: pertemuanId, jenis: 'kuis', judul: `Latihan: ${judul}`.slice(0, 200), durasi: 15, maks: 3 }, false)
      perbarui()
      nav(`/portal/lms/${kelasId}/kuis/${id}`)
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  return (
    <div className="kartu jarak" id="latihan">
      <h3>Kuis atau latihan soal <small>(opsional, nilai tambah)</small></h3>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!daftar && <p className="catatan">Memuat...</p>}
      {daftar && daftar.length === 0 && <p className="catatan">{kelola ? 'Belum ada kuis. Opsional: kuis atau latihan soal memberi nilai tambah bagi siswa.' : 'Belum ada latihan soal.'}</p>}
      {(daftar ?? []).map((a) => (
        <p key={a.id} style={{ margin: '6px 0' }}>
          <Link to={`/portal/lms/${kelasId}/kuis/${a.id}`}>{a.judul}</Link>{' '}
          <small>{a.jumlah_soal} soal, {a.durasi_menit} menit</small>{' '}
          {kelola
            ? <><span className={`status ${a.status === 'terbit' ? 'status-selesai' : 'status-menunggu'}`}>{a.status === 'terbit' ? 'Terbit' : 'Draf'}</span>{a.jumlah_soal === 0 ? <> <span className="status status-ditolak">Belum ada soal</span></> : null}</>
            : a.berjalan ? <span className="status status-menunggu">Sedang dikerjakan</span>
              : a.percobaan_selesai ? <small>{a.menunggu_koreksi && a.nilai_terbaik === null ? 'Menunggu koreksi' : `Nilai ${nilaiTeks(a.nilai_terbaik)}`}</small>
                : <span className="status status-dibatalkan">Belum dikerjakan</span>}
        </p>
      ))}
      {kelola && <div className="aksi"><button className="tombol" style={{ color: 'var(--warna-utama)' }} disabled={sibuk} onClick={() => void buat()}>{sibuk ? 'Membuat...' : 'Buat latihan soal'}</button></div>}
    </div>
  )
}

export const labelJenisAsesmen = labelJenis
export type JenisAsesmen = Jenis

export function DaftarKuis({ kelasId, kelola, pertemuan, jenisTetap }: { kelasId: string; kelola: boolean; pertemuan: PertemuanRingkas[]; jenisTetap?: Jenis }) {
  const [daftar, setDaftar] = useState<Asesmen[] | null>(null)
  const [galat, setGalat] = useState('')
  const [form, setForm] = useState(false)
  const [tabPilih, setTab] = useState<Jenis>('kuis')
  const tab = jenisTetap ?? tabPilih
  const nav = useNavigate()
  useEffect(() => {
    panggil<Asesmen[]>('lms_asesmen_daftar', { p_kelas: kelasId }).then(setDaftar).catch((e: Error) => setGalat(e.message))
  }, [kelasId])
  return (
    <>
      {!jenisTetap && <div className="judul-bagian jarak"><h2>Kuis dan ulangan</h2></div>}
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!jenisTetap && <nav className="langkah-bar" aria-label="Jenis penilaian">
        {urutJenis.map((j) => (
          <button key={j} type="button" className={`langkah${tab === j ? ' langkah-aktif' : ''}`} onClick={() => { setTab(j); setForm(false) }}>
            <span className="langkah-teks"><strong>{labelTab[j]}</strong><small>{daftar ? `${daftar.filter((a) => a.jenis === j).length} buah` : '...'}</small></span>
          </button>
        ))}
      </nav>}
      {kelola && (
        <div className="aksi">
          <button className="tombol tombol-isi" onClick={() => setForm(!form)}>{form ? 'Tutup formulir' : `Buat ${labelJenis[tab].toLowerCase()}`}</button>
        </div>
      )}
      {form && <FormAsesmen key={tab} kelasId={kelasId} pertemuan={pertemuan} awal={null} jenisAwal={tab} selesai={(id) => nav(`/portal/lms/${kelasId}/kuis/${id}`)} />}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Judul</th><th>Jadwal</th><th>{kelola ? 'Soal dan peserta' : 'Nilai saya'}</th><th></th></tr></thead>
          <tbody>
            {!daftar && <tr><td colSpan={4}>Memuat...</td></tr>}
            {daftar && daftar.filter((a) => a.jenis === tab).length === 0 && <tr><td colSpan={4}>Belum ada {labelJenis[tab].toLowerCase()}.</td></tr>}
            {(daftar ?? []).filter((a) => a.jenis === tab).map((a) => (
              <tr key={a.id}>
                <td>
                  <Link to={`/portal/lms/${kelasId}/kuis/${a.id}`}>{a.judul}</Link><br />
                  <small>{labelJenis[a.jenis]}{a.pertemuan_nomor ? `, pertemuan ${a.pertemuan_nomor}` : ''}, {a.durasi_menit} menit</small>
                </td>
                <td><small>{jadwal(a)}</small></td>
                <td>
                  {kelola
                    ? <>
                        {a.jumlah_tampil ? `${a.jumlah_tampil} dari ${a.jumlah_soal} soal` : `${a.jumlah_soal} soal`}, {a.sudah_selesai ?? 0} selesai{' '}
                        <span className={`status ${a.status === 'terbit' ? 'status-selesai' : 'status-menunggu'}`}>{a.status === 'terbit' ? 'Terbit' : 'Draf'}</span>
                        {a.perlu_koreksi ? <> <span className="status status-menunggu">{a.perlu_koreksi} perlu koreksi</span></> : null}
                      </>
                    : a.berjalan
                      ? <span className="status status-menunggu">Sedang dikerjakan</span>
                      : a.percobaan_selesai
                        ? <>
                            {a.menunggu_koreksi && a.nilai_terbaik === null
                              ? <span className="status status-menunggu">Menunggu koreksi</span>
                              : nilaiTeks(a.nilai_terbaik)}{' '}
                            <small>({a.percobaan_selesai}/{a.maks_percobaan} kali)</small>
                          </>
                        : <span className="status status-dibatalkan">Belum dikerjakan</span>}
                </td>
                <td><Link to={`/portal/lms/${kelasId}/kuis/${a.id}`}>{kelola ? 'Kelola' : 'Buka'}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Level rubrik ditulis satu baris per level: "4 | deskripsi". */
function levelKeTeks(l?: Level[]): string { return (l ?? []).map((x) => `${x.skor} | ${x.deskripsi}`).join('\n') }
function teksKeLevel(t: string): Level[] {
  return t.split('\n').map((b) => b.trim()).filter(Boolean).map((b) => {
    const i = b.indexOf('|')
    return { skor: Number(b.slice(0, i).trim()), deskripsi: b.slice(i + 1).trim() }
  })
}
type RubrikForm = { kriteria: string; skor_maks: number; level: string }

function FormSoal({ asesmenId, awal, selesai, batal }: { asesmenId: string; awal: Soal | null; selesai: () => Promise<void>; batal: () => void }) {
  const [tipe, setTipe] = useState<Tipe>(awal?.tipe ?? 'pilgan')
  const [tanya, setTanya] = useState(awal?.pertanyaan ?? '')
  const [opsi, setOpsi] = useState<string[]>(awal?.opsi ?? ['', '', '', ''])
  const [kunci, setKunci] = useState(awal?.kunci ?? 0)
  const [isian, setIsian] = useState<string[]>(awal?.kunci_isian?.length ? awal.kunci_isian : [''])
  const [rubrik, setRubrik] = useState<RubrikForm[]>(
    awal?.rubrik?.length
      ? awal.rubrik.map((r) => ({ kriteria: r.kriteria, skor_maks: r.skor_maks, level: levelKeTeks(r.level) }))
      : [{ kriteria: '', skor_maks: 4, level: '' }])
  const [bobot, setBobot] = useState(awal?.bobot ?? 1)
  const [bahas, setBahas] = useState(awal?.pembahasan ?? '')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function kirim(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      const rub = rubrik.map((r) => {
        const level = teksKeLevel(r.level)
        return { kriteria: r.kriteria.trim(), skor_maks: r.skor_maks, ...(level.length ? { level } : {}) }
      })
      await panggil('lms_soal_tulis', {
        p_asesmen: asesmenId, p_id: awal?.id ?? null, p_tipe: tipe, p_pertanyaan: tanya,
        p_opsi: tipe === 'pilgan' ? opsi : null, p_kunci: tipe === 'pilgan' ? kunci : null,
        p_kunci_isian: tipe === 'isian' ? isian.map((x) => x.trim()).filter(Boolean) : null,
        p_rubrik: tipe === 'esai' ? rub : null, p_bobot: bobot, p_pembahasan: bahas || null,
      })
      await selesai()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  function hapusOpsi(i: number) {
    setOpsi(opsi.filter((_, x) => x !== i))
    setKunci(kunci === i ? 0 : kunci > i ? kunci - 1 : kunci)
  }
  const ubahRubrik = (i: number, p: Partial<RubrikForm>) => setRubrik(rubrik.map((r, n) => (n === i ? { ...r, ...p } : r)))
  const jumlahRubrik = rubrik.reduce((j, r) => j + (Number(r.skor_maks) || 0), 0)
  return (
    <form className="kartu form jarak" onSubmit={kirim}>
      <h3>{awal ? 'Ubah soal' : 'Tambah soal'}</h3>
      <label>Jenis soal
        <select value={tipe} onChange={(e) => setTipe(e.target.value as Tipe)}>
          {(Object.keys(labelTipe) as Tipe[]).map((t) => <option key={t} value={t}>{labelTipe[t]}</option>)}
        </select>
      </label>
      <label>Pertanyaan<textarea required rows={3} maxLength={4000} value={tanya} onChange={(e) => setTanya(e.target.value)} /></label>

      {tipe === 'pilgan' && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600 }}>Pilihan jawaban (pilih satu yang benar)</legend>
          {opsi.map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input type="radio" name="kunci" aria-label={`Jawaban benar ${huruf[i]}`} checked={kunci === i} onChange={() => setKunci(i)} style={{ width: 'auto' }} />
              <strong>{huruf[i]}</strong>
              <input required aria-label={`Pilihan ${huruf[i]}`} value={o} onChange={(e) => setOpsi(opsi.map((x, n) => (n === i ? e.target.value : x)))} />
              {opsi.length > 2 && <button type="button" className="tombol" style={biru} onClick={() => hapusOpsi(i)}>Hapus</button>}
            </div>
          ))}
          {opsi.length < 6 && <div className="aksi"><button type="button" className="tombol" style={biru} onClick={() => setOpsi([...opsi, ''])}>Tambah pilihan</button></div>}
        </fieldset>
      )}

      {tipe === 'isian' && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600 }}>Jawaban yang diterima</legend>
          <p className="petunjuk" style={{ margin: '4px 0' }}>Huruf besar dan kecil serta spasi berlebih tidak dibedakan. Tambahkan variasi jawaban yang sama benarnya. Jawaban lain bisa Anda terima manual saat koreksi.</p>
          {isian.map((x, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input required={i === 0} maxLength={300} aria-label={`Jawaban diterima ${i + 1}`} value={x} onChange={(e) => setIsian(isian.map((y, n) => (n === i ? e.target.value : y)))} />
              {isian.length > 1 && <button type="button" className="tombol" style={biru} onClick={() => setIsian(isian.filter((_, n) => n !== i))}>Hapus</button>}
            </div>
          ))}
          {isian.length < 10 && <div className="aksi"><button type="button" className="tombol" style={biru} onClick={() => setIsian([...isian, ''])}>Tambah variasi jawaban</button></div>}
        </fieldset>
      )}

      {tipe === 'esai' && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600 }}>Rubrik penilaian</legend>
          <p className="petunjuk" style={{ margin: '4px 0' }}>Tiap kriteria punya skor maksimum. Skor soal = jumlah skor kriteria dibagi total maksimum, dikali bobot soal. Deskripsi level bersifat opsional, satu baris per level, contoh: <code>4 | Lengkap dan tepat</code>.</p>
          {rubrik.map((r, i) => (
            <div key={i} className="kartu" style={{ marginTop: 8 }}>
              <div className="grid grid-2">
                <label>Kriteria {i + 1}<input required maxLength={200} value={r.kriteria} onChange={(e) => ubahRubrik(i, { kriteria: e.target.value })} /></label>
                <label>Skor maksimum<input required type="number" min={1} max={100} value={r.skor_maks} onChange={(e) => ubahRubrik(i, { skor_maks: Number(e.target.value) })} /></label>
              </div>
              <label>Deskripsi level (opsional)<textarea rows={3} value={r.level} onChange={(e) => ubahRubrik(i, { level: e.target.value })} placeholder={'4 | Lengkap dan tepat\n2 | Sebagian benar\n0 | Tidak sesuai'} /></label>
              {rubrik.length > 1 && <div className="aksi"><button type="button" className="tombol" style={biru} onClick={() => setRubrik(rubrik.filter((_, n) => n !== i))}>Hapus kriteria</button></div>}
            </div>
          ))}
          <p className="catatan">Total skor rubrik: {jumlahRubrik}.</p>
          {rubrik.length < 10 && <div className="aksi"><button type="button" className="tombol" style={biru} onClick={() => setRubrik([...rubrik, { kriteria: '', skor_maks: 4, level: '' }])}>Tambah kriteria</button></div>}
        </fieldset>
      )}

      <div className="grid grid-2">
        <label>Bobot soal<input type="number" min={1} max={100} value={bobot} onChange={(e) => setBobot(Number(e.target.value))} /></label>
      </div>
      <label>Pembahasan (opsional)<textarea rows={2} maxLength={2000} value={bahas} onChange={(e) => setBahas(e.target.value)} /></label>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi">
        <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan soal'}</button>
        <button type="button" className="tombol" style={biru} onClick={batal}>Batal</button>
      </div>
    </form>
  )
}

function RekapKuis({ asesmenId, kkm, versi }: { asesmenId: string; kkm: number | null; versi: number }) {
  const [baris, setBaris] = useState<BarisKuis[] | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    panggil<{ siswa: BarisKuis[] }>('lms_asesmen_rekap', { p_asesmen: asesmenId }).then((r) => setBaris(r.siswa)).catch((e: Error) => setGalat(e.message))
  }, [asesmenId, versi])
  const bernilai = (baris ?? []).filter((b) => b.nilai_terbaik !== null)
  const rata = bernilai.length ? bernilai.reduce((j, b) => j + Number(b.nilai_terbaik), 0) / bernilai.length : null
  const lulus = kkm !== null ? bernilai.filter((b) => Number(b.nilai_terbaik) >= kkm).length : null
  const hitung = (s: StatusKuis) => (baris ?? []).filter((b) => b.status === s).length
  return (
    <div className="kartu jarak">
      <h3>Siapa yang sudah mengerjakan</h3>
      <div className="aksi">
        <button className="tombol" style={biru} disabled={!baris} onClick={() => baris && unduhCsv('rekap-kuis.csv', [
          ['No', 'Nama', 'NISN', 'Status', 'Percobaan', 'Nilai terbaik', 'Nilai terakhir', kkm !== null ? `KKM ${kkm}` : 'KKM'],
          ...baris.map((b, i) => [b.no_urut ?? i + 1, b.nama, b.nisn, labelStatusKuis[b.status], b.percobaan, b.nilai_terbaik, b.nilai_terakhir,
            kkm !== null && b.nilai_terbaik !== null ? (Number(b.nilai_terbaik) >= kkm ? 'Lulus' : 'Belum lulus') : '']),
        ])}>Unduh CSV</button>
      </div>
      {baris && (
        <p className="catatan">
          {hitung('selesai')} selesai, {hitung('perlu_koreksi')} menunggu koreksi, {hitung('berjalan')} sedang mengerjakan, {hitung('belum')} belum.
          {' '}Rata-rata nilai terbaik: {nilaiTeks(rata)}.{lulus !== null ? ` Mencapai KKM ${nilaiTeks(kkm)}: ${lulus} dari ${bernilai.length} siswa bernilai.` : ''}
        </p>
      )}
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>No</th><th>Nama</th><th>Status</th><th>Percobaan</th><th>Nilai terbaik</th><th>Nilai terakhir</th></tr></thead>
          <tbody>
            {!baris && <tr><td colSpan={6}>Memuat...</td></tr>}
            {(baris ?? []).map((b, i) => (
              <tr key={b.peserta_didik_id}>
                <td>{b.no_urut ?? i + 1}</td>
                <td>{b.nama}<br /><small>{b.nisn ?? ''}</small></td>
                <td><span className={`status ${kelasStatusKuis[b.status]}`}>{labelStatusKuis[b.status]}</span></td>
                <td>{b.percobaan}</td>
                <td>
                  {nilaiTeks(b.nilai_terbaik)}
                  {kkm !== null && b.nilai_terbaik !== null ? <><br /><small>{Number(b.nilai_terbaik) >= kkm ? 'Lulus KKM' : 'Di bawah KKM'}</small></> : null}
                  {b.nilai_terbaik === null && b.nilai_otomatis !== null ? <small>sementara {nilaiTeks(b.nilai_otomatis)}</small> : null}
                </td>
                <td>{nilaiTeks(b.nilai_terakhir)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KoreksiEsai({ soal, j, simpan }: { soal: SoalKoreksi; j: JawabanKoreksi; simpan: () => Promise<void> }) {
  const rub = soal.rubrik ?? []
  const [skor, setSkor] = useState<string[]>(rub.map((_, i) => (j.skor_rubrik?.[i] != null ? String(j.skor_rubrik[i]) : '')))
  const [catatan, setCatatan] = useState(j.catatan_guru ?? '')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const sum = skor.reduce((x, s) => x + (Number(s) || 0), 0)
  const maks = rubrikMaks(rub)
  async function kirim() {
    setGalat('')
    if (skor.some((s) => s.trim() === '')) { setGalat('Isi skor setiap kriteria.'); return }
    setSibuk(true)
    try {
      await panggil('lms_koreksi_simpan', { p_percobaan: j.percobaan_id, p_soal: soal.soal_id, p_skor: skor.map(Number), p_catatan: catatan || null })
      await simpan()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  return (
    <div className="kartu" style={{ marginTop: 8 }}>
      <p style={{ marginTop: 0 }}>
        <strong>{j.nama}</strong> <small>percobaan {j.ke}</small>{' '}
        {j.dikoreksi ? <span className="status status-selesai">Sudah dikoreksi: {nilaiTeks(j.skor)} dari {soal.bobot}</span> : <span className="status status-menunggu">Belum dikoreksi</span>}
      </p>
      <p style={{ whiteSpace: 'pre-wrap', background: 'var(--warna-latar, #f6f6f6)', padding: 8, borderRadius: 6 }}>{j.teks}</p>
      {rub.map((r, i) => (
        <label key={i} style={{ display: 'block', marginTop: 6 }}>
          {r.kriteria} <small>(maks {r.skor_maks})</small>
          <input type="number" min={0} max={r.skor_maks} step="0.5" value={skor[i]} onChange={(e) => setSkor(skor.map((x, n) => (n === i ? e.target.value : x)))} style={{ maxWidth: 120 }} />
          {r.level?.length ? <span className="petunjuk">{r.level.map((l) => `${l.skor}: ${l.deskripsi}`).join(' / ')}</span> : null}
        </label>
      ))}
      <label style={{ display: 'block', marginTop: 6 }}>Catatan untuk siswa (opsional)<textarea rows={2} maxLength={1000} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label>
      <p className="catatan">Jumlah rubrik {nilaiTeks(sum)} dari {maks}. Skor soal: {nilaiTeks(maks ? Math.round((sum / maks) * soal.bobot * 100) / 100 : 0)} dari {soal.bobot}.</p>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk} onClick={() => void kirim()}>{sibuk ? 'Menyimpan...' : 'Simpan koreksi'}</button></div>
    </div>
  )
}

function KoreksiKuis({ asesmenId, setelah }: { asesmenId: string; setelah: () => void }) {
  const [data, setData] = useState<SoalKoreksi[] | null>(null)
  const [galat, setGalat] = useState('')
  const [belumSaja, setBelumSaja] = useState(true)
  const muat = useCallback(async () => {
    try { setData(await panggil<SoalKoreksi[]>('lms_koreksi_daftar', { p_asesmen: asesmenId })) } catch (e) { setGalat((e as Error).message) }
  }, [asesmenId])
  useEffect(() => { void muat() }, [muat])
  const simpan = async () => { await muat(); setelah() }
  async function isianSet(j: JawabanKoreksi, s: SoalKoreksi, benar: boolean | null) {
    setGalat('')
    try { await panggil('lms_koreksi_isian', { p_percobaan: j.percobaan_id, p_soal: s.soal_id, p_benar: benar }); await simpan() } catch (e) { setGalat((e as Error).message) }
  }
  return (
    <div className="kartu jarak">
      <h3>Koreksi jawaban</h3>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!data && <p className="catatan">Memuat...</p>}
      {data && data.length === 0 && <p className="catatan">Tidak ada soal isian atau esai.</p>}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
        <input type="checkbox" checked={belumSaja} onChange={(e) => setBelumSaja(e.target.checked)} style={{ width: 'auto' }} />
        Tampilkan yang belum dikoreksi saja
      </label>
      {(data ?? []).map((s, n) => {
        const baris = s.jawaban.filter((j) => !belumSaja || (s.tipe === 'esai' ? !j.dikoreksi : j.otomatis_benar === false && !j.dikoreksi))
        return (
          <div key={s.soal_id} style={{ marginTop: 16 }}>
            <h4 style={{ margin: 0 }}>{labelTipe[s.tipe]}: {s.pertanyaan.length > 120 ? s.pertanyaan.slice(0, 120) + '...' : s.pertanyaan}</h4>
            <small>
              Bobot {s.bobot}. {s.tipe === 'isian' ? `Kunci: ${(s.kunci_isian ?? []).join(' / ')}.` : `Rubrik: ${(s.rubrik ?? []).map((r) => `${r.kriteria} (${r.skor_maks})`).join(', ')}.`}
              {' '}{baris.length} dari {s.jawaban.length} jawaban.
            </small>
            {baris.length === 0 && <p className="catatan">Tidak ada yang perlu ditinjau.</p>}
            {s.tipe === 'esai' && baris.map((j) => <KoreksiEsai key={`${j.percobaan_id}-${n}-${j.dikoreksi}`} soal={s} j={j} simpan={simpan} />)}
            {s.tipe === 'isian' && baris.length > 0 && (
              <div className="tabel-bungkus jarak">
                <table>
                  <thead><tr><th>Siswa</th><th>Jawaban</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {baris.map((j) => (
                      <tr key={j.percobaan_id}>
                        <td>{j.nama}<br /><small>percobaan {j.ke}</small></td>
                        <td>{j.teks}</td>
                        <td>{j.dikoreksi ? `Manual: ${j.skor_efektif > 0 ? 'benar' : 'salah'}` : j.otomatis_benar ? 'Cocok kunci' : 'Tidak cocok kunci'}</td>
                        <td>
                          <div className="aksi">
                            <button className="tombol" style={biru} onClick={() => void isianSet(j, s, true)}>Terima benar</button>
                            <button className="tombol" style={merah} onClick={() => void isianSet(j, s, false)}>Salah</button>
                            {j.dikoreksi && <button className="tombol" style={biru} onClick={() => void isianSet(j, s, null)}>Kembali otomatis</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function KuisGuru({ kelasId, a, pertemuan, muat }: { kelasId: string; a: Asesmen; pertemuan: PertemuanRingkas[]; muat: () => Promise<void> }) {
  const [soal, setSoal] = useState<Soal[] | null>(null)
  const [galat, setGalat] = useState('')
  const [edit, setEdit] = useState<Soal | 'baru' | null>(null)
  const [atur, setAtur] = useState(false)
  const [koreksi, setKoreksi] = useState(false)
  const [versi, setVersi] = useState(0)
  const muatSoal = useCallback(async () => {
    try { setSoal(await panggil<Soal[]>('lms_soal_daftar', { p_asesmen: a.id })) } catch (e) { setGalat((e as Error).message) }
  }, [a.id])
  useEffect(() => { void muatSoal() }, [muatSoal])
  async function terbitkan(terbit: boolean) {
    setGalat('')
    try { await simpanAsesmen(kelasId, a, nilaiAwal(a), terbit); await muat(); setVersi((x) => x + 1) } catch (e) { setGalat((e as Error).message) }
  }
  const total = (soal ?? []).reduce((j, s) => j + s.bobot, 0)
  const k = a.komposisi
  const adaKoreksi = k.isian + k.esai > 0
  return (
    <>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      <div className="kartu">
        <p style={{ margin: 0 }}>
          <span className={`status ${a.status === 'terbit' ? 'status-selesai' : 'status-menunggu'}`}>{a.status === 'terbit' ? 'Terbit' : 'Draf'}</span>{' '}
          {labelJenis[a.jenis]}, {a.durasi_menit} menit, {a.maks_percobaan} kali kesempatan. {jadwal(a)}.
          {a.kkm !== null ? ` KKM ${nilaiTeks(a.kkm)}.` : ''}
        </p>
        <p className="catatan">
          Bank soal: {k.pilgan} pilihan ganda, {k.isian} isian, {k.esai} esai, total bobot {nilaiTeks(k.total_bobot)}.
          {a.jumlah_tampil ? ` Tiap siswa mendapat ${a.jumlah_tampil} soal acak dari ${a.jumlah_soal}. Nilai dihitung dari soal yang tampil, jadi bobot antar soal sebaiknya seimbang.` : ' Semua soal ditampilkan.'}
        </p>
        {a.jumlah_tampil !== null && a.jumlah_tampil > a.jumlah_soal && (
          <p className="catatan galat" role="alert">Jumlah soal yang ditampilkan ({a.jumlah_tampil}) melebihi bank soal ({a.jumlah_soal}). Semua soal akan ditampilkan.</p>
        )}
        <div className="aksi jarak">
          <button className="tombol tombol-isi" onClick={() => void terbitkan(a.status !== 'terbit')}>{a.status === 'terbit' ? 'Tarik jadi draf' : 'Terbitkan ke siswa'}</button>
          <button className="tombol" style={biru} onClick={() => setAtur(!atur)}>{atur ? 'Tutup pengaturan' : 'Ubah pengaturan'}</button>
          {adaKoreksi && a.terkunci && (
            <button className="tombol" style={biru} onClick={() => setKoreksi(!koreksi)}>
              {koreksi ? 'Tutup koreksi' : `Koreksi jawaban${a.perlu_koreksi ? ` (${a.perlu_koreksi} menunggu)` : ''}`}
            </button>
          )}
        </div>
      </div>
      {atur && <FormAsesmen kelasId={kelasId} pertemuan={pertemuan} awal={a} selesai={async () => { await muat(); setAtur(false) }} />}
      {koreksi && <KoreksiKuis asesmenId={a.id} setelah={() => { void muat(); setVersi((x) => x + 1) }} />}

      <div className="judul-bagian jarak"><h2>Soal ({soal?.length ?? 0})</h2></div>
      {a.terkunci && <p className="catatan">Soal terkunci karena sudah ada siswa yang mengerjakan, supaya nilai tetap adil.</p>}
      {!soal && <p className="catatan">Memuat...</p>}
      {soal && soal.length === 0 && <div className="kartu"><p className="catatan">Belum ada soal. Tambahkan soal, lalu terbitkan.</p></div>}
      {(soal ?? []).map((s, i) => (
        <div key={s.id} className="kartu" style={{ marginTop: 8 }}>
          <p style={{ marginTop: 0 }}>
            <strong>{i + 1}.</strong> <small>[{labelTipe[s.tipe]}]</small> {s.pertanyaan}{' '}
            <small>(bobot {s.bobot}{total ? `, ${Math.round((s.bobot / total) * 100)}%` : ''})</small>
          </p>
          {s.tipe === 'pilgan' && (
            <ol type="A" style={{ margin: '0 0 8px' }}>
              {(s.opsi ?? []).map((o, n) => <li key={n} style={n === s.kunci ? { fontWeight: 700 } : undefined}>{o}{n === s.kunci ? ' (benar)' : ''}</li>)}
            </ol>
          )}
          {s.tipe === 'isian' && <p className="catatan">Jawaban diterima: {(s.kunci_isian ?? []).join(' / ')}</p>}
          {s.tipe === 'esai' && (
            <div className="tabel-bungkus">
              <table>
                <thead><tr><th>Kriteria</th><th>Skor maks</th><th>Level</th></tr></thead>
                <tbody>
                  {(s.rubrik ?? []).map((r, n) => (
                    <tr key={n}><td>{r.kriteria}</td><td>{r.skor_maks}</td><td><small>{(r.level ?? []).map((l) => `${l.skor}: ${l.deskripsi}`).join(' / ')}</small></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.pembahasan && <p className="catatan">Pembahasan: {s.pembahasan}</p>}
          {!a.terkunci && <div className="aksi"><button className="tombol" style={biru} onClick={() => setEdit(s)}>Ubah soal</button></div>}
        </div>
      ))}
      {!a.terkunci && !edit && <div className="aksi jarak"><button className="tombol tombol-isi" onClick={() => setEdit('baru')}>Tambah soal</button></div>}
      {edit && (
        <FormSoal key={edit === 'baru' ? 'baru' : edit.id} asesmenId={a.id} awal={edit === 'baru' ? null : edit}
          selesai={async () => { setEdit(null); await muatSoal(); await muat() }} batal={() => setEdit(null)} />
      )}
      {!a.terkunci && <ImporSoal asesmenId={a.id} selesai={async () => { await muatSoal(); await muat() }} />}
      <RekapKuis asesmenId={a.id} kkm={a.kkm} versi={versi} />
    </>
  )
}

function ImporSoal({ asesmenId, selesai }: { asesmenId: string; selesai: () => Promise<void> }) {
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState<string[]>([])
  const [pesan, setPesan] = useState('')
  async function unggah(f: File | undefined) {
    if (!f) return
    setSibuk(true); setGalat([]); setPesan('')
    try {
      const { soal, galat: g } = await bacaSoalXlsx(f)
      if (g.length) { setGalat(g); setSibuk(false); return }
      let n = 0
      for (const s of soal as SoalImpor[]) {
        try {
          await panggil('lms_soal_tulis', { p_asesmen: asesmenId, p_id: null, p_tipe: s.tipe, p_pertanyaan: s.pertanyaan, p_opsi: s.opsi, p_kunci: s.kunci, p_kunci_isian: s.kunci_isian, p_rubrik: s.rubrik, p_bobot: s.bobot, p_pembahasan: s.pembahasan })
          n++
        } catch (e) { setGalat([`Soal ke-${n + 1} gagal: ${(e as Error).message}`, n > 0 ? `${n} soal sebelumnya sudah masuk.` : '']); break }
      }
      if (n === soal.length) setPesan(`${n} soal berhasil dimasukkan.`)
      await selesai()
    } catch (e) { setGalat(['Berkas tidak bisa dibaca. Gunakan template Excel (.xlsx). ' + (e as Error).message]) }
    setSibuk(false)
  }
  return (
    <div className="kartu jarak">
      <h3>Unggah soal dari Excel</h3>
      <p className="catatan">Unduh template, isi soal, lalu unggah. Pilihan ganda dan isian singkat dinilai otomatis.</p>
      <div className="aksi">
        <button type="button" className="tombol" style={biru} onClick={() => void unduhTemplateSoal()}>Unduh template Excel</button>
        <label className="tombol tombol-isi" style={{ cursor: 'pointer' }}>
          {sibuk ? 'Memproses...' : 'Unggah soal (.xlsx)'}
          <input type="file" accept=".xlsx" hidden disabled={sibuk} onChange={(e) => { void unggah(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
      {pesan && <div className="kartu hasil"><strong>{pesan}</strong></div>}
      {galat.filter(Boolean).length > 0 && <ul className="catatan galat" role="alert">{galat.filter(Boolean).map((g, i) => <li key={i}>{g}</li>)}</ul>}
    </div>
  )
}

function terjawab(s: SoalKerja): boolean {
  return s.tipe === 'pilgan' ? s.pilihan !== null : (s.teks ?? '').trim() !== ''
}

function TinjauSoal({ s, i }: { s: SoalTinjau; i: number }) {
  const rub = s.rubrik ?? []
  return (
    <div className="kartu" style={{ marginTop: 8 }}>
      <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>
        <strong>{i + 1}.</strong> {s.pertanyaan}{' '}
        <small>({s.status_koreksi === 'menunggu' ? `menunggu koreksi, bobot ${s.bobot}` : `skor ${nilaiTeks(s.skor)} dari ${s.bobot}`})</small>
      </p>
      {s.tipe === 'pilgan' && (
        <>
          <ol type="A" style={{ margin: '0 0 8px' }}>
            {(s.opsi ?? []).map((o, n) => (
              <li key={n} style={n === s.benar ? { fontWeight: 700 } : undefined}>
                {o}{n === s.benar ? ' (jawaban benar)' : ''}{n === s.pilihan ? ' (jawaban Anda)' : ''}
              </li>
            ))}
          </ol>
          {s.pilihan === null && <p className="catatan">Tidak dijawab.</p>}
        </>
      )}
      {s.tipe === 'isian' && (
        <>
          <p style={{ margin: '0 0 4px' }}>Jawaban Anda: {s.teks ? <strong>{s.teks}</strong> : <em>tidak dijawab</em>}</p>
          <p className="catatan">Jawaban yang diterima: {(s.kunci_isian ?? []).join(' / ')}</p>
        </>
      )}
      {s.tipe === 'esai' && (
        <>
          <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{s.teks ? s.teks : <em>Tidak dijawab.</em>}</p>
          {s.status_koreksi === 'menunggu' && <p className="catatan">Menunggu koreksi guru.</p>}
          {s.skor_rubrik && (
            <div className="tabel-bungkus">
              <table>
                <thead><tr><th>Kriteria</th><th>Skor</th></tr></thead>
                <tbody>{rub.map((r, n) => <tr key={n}><td>{r.kriteria}</td><td>{nilaiTeks(s.skor_rubrik?.[n])} dari {r.skor_maks}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {s.catatan_guru && <p className="catatan">Catatan guru: {s.catatan_guru}</p>}
        </>
      )}
      {s.pembahasan && <p className="catatan">Pembahasan: {s.pembahasan}</p>}
    </div>
  )
}

function KuisSiswa({ kelasId, a, muat }: { kelasId: string; a: Asesmen; muat: () => Promise<void> }) {
  const [sesi, setSesi] = useState<Sesi | null>(null)
  const [hasil, setHasil] = useState<Hasil | null>(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [sisa, setSisa] = useState(0)
  const selisih = useRef(0)
  const terkirim = useRef(false)
  // Jawaban teks yang belum tersimpan: soalId -> teks. Penyimpanan tertunda 1,2 detik setelah berhenti mengetik.
  const tunda = useRef<Record<string, string>>({})
  const timer = useRef<Record<string, number>>({})

  const simpanTeks = useCallback(async (percobaan: string, soalId: string) => {
    window.clearTimeout(timer.current[soalId])
    if (!(soalId in tunda.current)) return
    const teks = tunda.current[soalId]
    try {
      await panggil('lms_jawab_isi', { p_percobaan: percobaan, p_soal: soalId, p_teks: teks })
      if (tunda.current[soalId] === teks) delete tunda.current[soalId]
    } catch (e) { setGalat('Jawaban teks belum tersimpan. ' + (e as Error).message) }
  }, [])
  const siramSemua = useCallback(async (percobaan: string) => {
    await Promise.all(Object.keys(tunda.current).map((id) => simpanTeks(percobaan, id)))
  }, [simpanTeks])

  const kirim = useCallback(async (percobaan: string) => {
    if (terkirim.current) return
    terkirim.current = true
    setSibuk(true)
    try {
      await siramSemua(percobaan)
      setHasil(await panggil<Hasil>('lms_kirim', { p_percobaan: percobaan }))
      setSesi(null)
      await muat()
    } catch (e) { terkirim.current = false; setGalat((e as Error).message) }
    setSibuk(false)
  }, [muat, siramSemua])

  useEffect(() => {
    if (!sesi) return
    const batas = new Date(sesi.batas_waktu).getTime()
    const tik = () => {
      const s = Math.max(0, Math.ceil((batas - (Date.now() + selisih.current)) / 1000))
      setSisa(s)
      if (s <= 0) void kirim(sesi.percobaan)
    }
    tik()
    const t = window.setInterval(tik, 1000)
    return () => window.clearInterval(t)
  }, [sesi, kirim])

  async function mulai() {
    setSibuk(true); setGalat(''); setHasil(null)
    try {
      const r = await panggil<Sesi>('lms_asesmen_mulai', { p_asesmen: a.id })
      selisih.current = new Date(r.sekarang).getTime() - Date.now()
      terkirim.current = false
      tunda.current = {}
      setSesi(r)
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  async function lihatTerakhir() {
    if (!a.percobaan_terakhir) return
    setSibuk(true); setGalat('')
    try { setHasil(await panggil<Hasil>('lms_kirim', { p_percobaan: a.percobaan_terakhir })) } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  async function pilih(soalId: string, idx: number) {
    if (!sesi) return
    setSesi({ ...sesi, soal: sesi.soal.map((s) => (s.soal_id === soalId ? { ...s, pilihan: idx } : s)) })
    try {
      const r = await panggil<{ ok: boolean; habis?: boolean }>('lms_jawab_isi', { p_percobaan: sesi.percobaan, p_soal: soalId, p_pilihan: idx })
      if (!r.ok && r.habis) await kirim(sesi.percobaan)
    } catch (e) { setGalat('Jawaban belum tersimpan, coba pilih lagi. ' + (e as Error).message) }
  }
  function ketik(soalId: string, teks: string) {
    if (!sesi) return
    setSesi({ ...sesi, soal: sesi.soal.map((s) => (s.soal_id === soalId ? { ...s, teks } : s)) })
    tunda.current[soalId] = teks
    window.clearTimeout(timer.current[soalId])
    const percobaan = sesi.percobaan
    timer.current[soalId] = window.setTimeout(() => void simpanTeks(percobaan, soalId), 1200)
  }
  function selesaiManual() {
    if (!sesi) return
    const kosong = sesi.soal.filter((s) => !terjawab(s)).length
    if (!window.confirm(kosong ? `${kosong} soal belum dijawab. Kirim sekarang?` : 'Kirim jawaban sekarang?')) return
    void kirim(sesi.percobaan)
  }

  const mm = `${dua(Math.floor(sisa / 60))}:${dua(sisa % 60)}`

  if (sesi) {
    return (
      <>
        <div className="kartu" style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <strong aria-live="off">Sisa waktu {mm}</strong>
          <small>{sesi.soal.filter(terjawab).length} dari {sesi.soal.length} terjawab</small>
        </div>
        {sesi.petunjuk && <p className="catatan">{sesi.petunjuk}</p>}
        {galat && <p className="catatan galat" role="alert">{galat}</p>}
        {sesi.soal.map((s, i) => (
          <fieldset key={s.soal_id} className="kartu" style={{ marginTop: 8 }}>
            <legend style={{ fontWeight: 600 }}>Soal {i + 1} <small>(bobot {s.bobot})</small></legend>
            <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{s.pertanyaan}</p>
            {s.tipe === 'pilgan' && (s.opsi ?? []).map((o, n) => (
              <label key={n} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400, marginTop: 6 }}>
                <input type="radio" name={s.soal_id} checked={s.pilihan === n} onChange={() => void pilih(s.soal_id, n)} style={{ width: 'auto', marginTop: 4 }} />
                <span><strong>{huruf[n]}.</strong> {o}</span>
              </label>
            ))}
            {s.tipe === 'isian' && (
              <input aria-label={`Jawaban soal ${i + 1}`} maxLength={300} value={s.teks ?? ''} placeholder="Ketik jawaban singkat"
                onChange={(e) => ketik(s.soal_id, e.target.value)} onBlur={() => void simpanTeks(sesi.percobaan, s.soal_id)} />
            )}
            {s.tipe === 'esai' && (
              <>
                {s.rubrik && s.rubrik.length > 0 && (
                  <p className="petunjuk" style={{ margin: '0 0 6px' }}>Penilaian: {s.rubrik.map((r) => `${r.kriteria} (${r.skor_maks})`).join(', ')}.</p>
                )}
                <textarea aria-label={`Jawaban soal ${i + 1}`} rows={6} maxLength={5000} value={s.teks ?? ''} placeholder="Tulis jawaban Anda"
                  onChange={(e) => ketik(s.soal_id, e.target.value)} onBlur={() => void simpanTeks(sesi.percobaan, s.soal_id)} />
              </>
            )}
          </fieldset>
        ))}
        <div className="aksi jarak"><button className="tombol tombol-isi" disabled={sibuk} onClick={selesaiManual}>{sibuk ? 'Mengirim...' : 'Selesai dan kirim'}</button></div>
      </>
    )
  }

  const sisaKesempatan = a.maks_percobaan - (a.percobaan_selesai ?? 0)
  const lulus = hasil && hasil.kkm !== null && hasil.nilai !== null ? hasil.nilai >= hasil.kkm : null
  return (
    <>
      {galat && (
        <p className="catatan galat" role="alert">
          {galat}{galat.startsWith('Pertemuan ini terkunci') && a.pertemuan_id ? <> <Link to={`/portal/lms/${kelasId}`}>Kembali ke kelas</Link></> : null}
        </p>
      )}
      {hasil && (
        <div className="kartu hasil">
          <h3 style={{ marginTop: 0 }}>Jawaban terkirim</h3>
          {!hasil.tampil_hasil
            ? <p style={{ margin: 0 }}>Nilai ditampilkan oleh guru.</p>
            : hasil.butuh_koreksi
              ? <p style={{ margin: 0 }}>Ada jawaban esai atau isian yang menunggu koreksi guru. Nilai sementara dari soal otomatis: <strong>{nilaiTeks(hasil.nilai_otomatis)}</strong> (belum termasuk esai). Nilai akhir muncul setelah dikoreksi.</p>
              : <p style={{ fontSize: '1.4rem', margin: 0 }}>Nilai {nilaiTeks(hasil.nilai)}</p>}
          {hasil.tampil_hasil && lulus !== null && <p style={{ margin: '6px 0 0' }}>{lulus ? 'Mencapai' : 'Belum mencapai'} KKM ({nilaiTeks(hasil.kkm)}).</p>}
        </div>
      )}
      {hasil?.tinjau && hasil.tinjau.map((s, i) => <TinjauSoal key={s.soal_id} s={s} i={i} />)}
      {!hasil && (
        <div className="kartu">
          <p style={{ marginTop: 0 }}>
            {labelJenis[a.jenis]}, {a.jumlah_tampil ? Math.min(a.jumlah_tampil, a.jumlah_soal) : a.jumlah_soal} soal
            {a.komposisi.esai > 0 ? ' (termasuk esai)' : ''}, {a.durasi_menit} menit. {jadwal(a)}.{a.kkm !== null ? ` KKM ${nilaiTeks(a.kkm)}.` : ''}
          </p>
          {a.petunjuk && <p>{a.petunjuk}</p>}
          <p className="catatan">Waktu berjalan di server. Menutup halaman tidak menghentikan waktu. Jawaban tersimpan otomatis.</p>
          {a.percobaan_selesai ? (
            <p>
              {a.menunggu_koreksi && a.nilai_terbaik === null
                ? 'Jawaban Anda menunggu koreksi guru.'
                : <>Nilai terbaik Anda: <strong>{nilaiTeks(a.nilai_terbaik)}</strong>.</>}
              {' '}({a.percobaan_selesai} dari {a.maks_percobaan} kesempatan terpakai).
            </p>
          ) : null}
          {a.percobaan_terakhir && a.tampil_hasil && (
            <div className="aksi"><button className="tombol" style={biru} disabled={sibuk} onClick={() => void lihatTerakhir()}>Lihat hasil terakhir</button></div>
          )}
        </div>
      )}
      {(a.berjalan || sisaKesempatan > 0) && (
        <div className="aksi jarak">
          <button className="tombol tombol-isi" disabled={sibuk} onClick={() => void mulai()}>
            {sibuk ? 'Memuat...' : a.berjalan ? 'Lanjutkan mengerjakan' : a.percobaan_selesai ? 'Kerjakan lagi' : 'Mulai mengerjakan'}
          </button>
        </div>
      )}
      {!a.berjalan && sisaKesempatan <= 0 && <p className="catatan">Kesempatan mengerjakan sudah habis.</p>}
    </>
  )
}

/** Satu kuis atau ulangan. Pengelola: soal, pengaturan, koreksi, rekap. Siswa: mengerjakan dengan timer. */
export function RuangKuis() {
  const { kelasId = '', id = '' } = useParams()
  const [a, setA] = useState<Asesmen | null>(null)
  const [kelola, setKelola] = useState<boolean | null>(null)
  const [pertemuan, setPertemuan] = useState<PertemuanRingkas[]>([])
  const [galat, setGalat] = useState('')
  const muat = useCallback(async () => {
    try {
      const [k, daftar, pt] = await Promise.all([
        panggil<{ id: string; peran: string }[]>('lms_kelas_saya'),
        panggil<Asesmen[]>('lms_asesmen_daftar', { p_kelas: kelasId }),
        panggil<PertemuanRingkas[]>('lms_pertemuan_daftar', { p_kelas: kelasId }),
      ])
      setKelola(k.find((x) => x.id === kelasId)?.peran === 'pengelola')
      setPertemuan(pt.map((p) => ({ id: p.id, nomor: p.nomor, judul: p.judul })))
      const cari = daftar.find((x) => x.id === id) ?? null
      setA(cari)
      if (!cari) setGalat('Kuis tidak ditemukan atau belum diterbitkan.')
    } catch (e) { setGalat((e as Error).message) }
  }, [kelasId, id])
  useEffect(() => { void muat() }, [muat])
  return (
    <Halaman judul={a?.judul ?? 'Kuis'} lead={a ? `${labelJenis[a.jenis]}${a.pertemuan_nomor ? `, pertemuan ${a.pertemuan_nomor}` : ''}` : undefined}>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {a && kelola !== null && (kelola
        ? <KuisGuru kelasId={kelasId} a={a} pertemuan={pertemuan} muat={muat} />
        : <KuisSiswa kelasId={kelasId} a={a} muat={muat} />)}
      <p className="catatan jarak"><Link to={`/portal/lms/${kelasId}`}>Kembali ke kelas</Link></p>
    </Halaman>
  )
}
