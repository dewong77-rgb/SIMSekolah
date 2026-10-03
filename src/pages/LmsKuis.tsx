import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil, tglJam } from '../lib/rpc'

// Kuis dan ulangan. Semua data lewat fungsi basis data lms_*. Kunci jawaban baru dikirim setelah siswa selesai.

export type PertemuanRingkas = { id: string; nomor: number; judul: string }
type Asesmen = {
  id: string; jenis: 'kuis' | 'ulangan_harian' | 'ulangan_semester'; judul: string; petunjuk: string | null
  pertemuan_id: string | null; pertemuan_nomor: number | null; durasi_menit: number
  buka: string | null; tutup: string | null; maks_percobaan: number; acak: boolean; tampil_hasil: boolean
  status: 'draf' | 'terbit'; jumlah_soal: number; terkunci: boolean
  sudah_selesai: number | null; percobaan_selesai: number | null; nilai_terbaik: number | null; berjalan: boolean | null
}
type Soal = { id: string; urutan: number; pertanyaan: string; opsi: string[]; kunci: number; bobot: number; pembahasan: string | null }
type SoalKerja = { soal_id: string; pertanyaan: string; bobot: number; opsi: string[]; pilihan: number | null }
type SoalTinjau = SoalKerja & { benar: number | null; pembahasan: string | null }
type Sesi = { percobaan: string; batas_waktu: string; sekarang: string; judul: string; petunjuk: string | null; soal: SoalKerja[] }
type Hasil = { nilai: number; tampil_hasil: boolean; tinjau: SoalTinjau[] | null }
type BarisKuis = { peserta_didik_id: string; nama: string; nisn: string | null; no_urut: number | null; percobaan: number; status: 'belum' | 'berjalan' | 'selesai'; nilai_terbaik: number | null; nilai_terakhir: number | null }

const labelJenis: Record<string, string> = { kuis: 'Kuis', ulangan_harian: 'Ulangan harian', ulangan_semester: 'Ulangan semester' }
const labelStatusKuis: Record<string, string> = { belum: 'Belum mengerjakan', berjalan: 'Sedang mengerjakan', selesai: 'Selesai' }
const kelasStatusKuis: Record<string, string> = { belum: 'status-dibatalkan', berjalan: 'status-menunggu', selesai: 'status-selesai' }
const huruf = 'ABCDEF'
const biru = { color: 'var(--warna-utama)' }

const dua = (n: number) => String(n).padStart(2, '0')
function keInputLokal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}T${dua(d.getHours())}:${dua(d.getMinutes())}`
}
const dariInputLokal = (s: string): string | null => (s ? new Date(s).toISOString() : null)
const nilaiTeks = (n: number | null) => (n === null ? '-' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 }))

function jadwal(a: Asesmen): string {
  if (a.buka && a.tutup) return `${tglJam(a.buka)} sampai ${tglJam(a.tutup)}`
  if (a.buka) return `Mulai ${tglJam(a.buka)}`
  if (a.tutup) return `Ditutup ${tglJam(a.tutup)}`
  return 'Kapan saja'
}

/** Menyimpan pengaturan asesmen. Fungsi yang sama dipakai untuk membuat, mengubah, dan menerbitkan. */
function simpanAsesmen(kelasId: string, a: Asesmen | null, v: {
  pertemuan: string; jenis: string; judul: string; petunjuk: string; durasi: number; buka: string; tutup: string
  maks: number; acak: boolean; tampil: boolean
}, terbit: boolean | null): Promise<string> {
  return panggil<string>('lms_asesmen_simpan', {
    p_kelas: kelasId, p_id: a?.id ?? null, p_pertemuan: v.pertemuan || null, p_jenis: v.jenis, p_judul: v.judul,
    p_petunjuk: v.petunjuk || null, p_durasi: v.durasi, p_buka: dariInputLokal(v.buka), p_tutup: dariInputLokal(v.tutup),
    p_maks: v.maks, p_acak: v.acak, p_tampil_hasil: v.tampil, p_terbit: terbit,
  })
}
const nilaiAwal = (a: Asesmen | null) => ({
  pertemuan: a?.pertemuan_id ?? '', jenis: a?.jenis ?? 'kuis', judul: a?.judul ?? '', petunjuk: a?.petunjuk ?? '',
  durasi: a?.durasi_menit ?? 15, buka: keInputLokal(a?.buka ?? null), tutup: keInputLokal(a?.tutup ?? null),
  maks: a?.maks_percobaan ?? 1, acak: a?.acak ?? true, tampil: a?.tampil_hasil ?? true,
})

function FormAsesmen({ kelasId, pertemuan, awal, selesai }: {
  kelasId: string; pertemuan: PertemuanRingkas[]; awal: Asesmen | null; selesai: (id: string) => void | Promise<void>
}) {
  const [v, setV] = useState(nilaiAwal(awal))
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
          <select value={v.jenis} onChange={(e) => setV({ ...v, jenis: e.target.value as typeof v.jenis })}>
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
export function DaftarKuis({ kelasId, kelola, pertemuan }: { kelasId: string; kelola: boolean; pertemuan: PertemuanRingkas[] }) {
  const [daftar, setDaftar] = useState<Asesmen[] | null>(null)
  const [galat, setGalat] = useState('')
  const [form, setForm] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    panggil<Asesmen[]>('lms_asesmen_daftar', { p_kelas: kelasId }).then(setDaftar).catch((e: Error) => setGalat(e.message))
  }, [kelasId])
  return (
    <>
      <div className="judul-bagian jarak"><h2>Kuis dan ulangan</h2></div>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {kelola && (
        <div className="aksi">
          <button className="tombol tombol-isi" onClick={() => setForm(!form)}>{form ? 'Tutup formulir' : 'Buat kuis atau ulangan'}</button>
        </div>
      )}
      {form && <FormAsesmen kelasId={kelasId} pertemuan={pertemuan} awal={null} selesai={(id) => nav(`/portal/lms/${kelasId}/kuis/${id}`)} />}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Judul</th><th>Jadwal</th><th>{kelola ? 'Soal dan peserta' : 'Nilai saya'}</th><th></th></tr></thead>
          <tbody>
            {!daftar && <tr><td colSpan={4}>Memuat...</td></tr>}
            {daftar && daftar.length === 0 && <tr><td colSpan={4}>Belum ada kuis atau ulangan.</td></tr>}
            {(daftar ?? []).map((a) => (
              <tr key={a.id}>
                <td>
                  <Link to={`/portal/lms/${kelasId}/kuis/${a.id}`}>{a.judul}</Link><br />
                  <small>{labelJenis[a.jenis]}{a.pertemuan_nomor ? `, pertemuan ${a.pertemuan_nomor}` : ''}, {a.durasi_menit} menit</small>
                </td>
                <td><small>{jadwal(a)}</small></td>
                <td>
                  {kelola
                    ? <>{a.jumlah_soal} soal, {a.sudah_selesai ?? 0} selesai <span className={`status ${a.status === 'terbit' ? 'status-selesai' : 'status-menunggu'}`}>{a.status === 'terbit' ? 'Terbit' : 'Draf'}</span></>
                    : a.berjalan
                      ? <span className="status status-menunggu">Sedang dikerjakan</span>
                      : a.percobaan_selesai
                        ? <>{nilaiTeks(a.nilai_terbaik)} <small>({a.percobaan_selesai}/{a.maks_percobaan} kali)</small></>
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

function FormSoal({ asesmenId, awal, selesai, batal }: { asesmenId: string; awal: Soal | null; selesai: () => Promise<void>; batal: () => void }) {
  const [tanya, setTanya] = useState(awal?.pertanyaan ?? '')
  const [opsi, setOpsi] = useState<string[]>(awal?.opsi ?? ['', '', '', ''])
  const [kunci, setKunci] = useState(awal?.kunci ?? 0)
  const [bobot, setBobot] = useState(awal?.bobot ?? 1)
  const [bahas, setBahas] = useState(awal?.pembahasan ?? '')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function kirim(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      await panggil('lms_soal_simpan', { p_asesmen: asesmenId, p_id: awal?.id ?? null, p_pertanyaan: tanya, p_opsi: opsi, p_kunci: kunci, p_bobot: bobot, p_pembahasan: bahas || null })
      await selesai()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  function hapusOpsi(i: number) {
    setOpsi(opsi.filter((_, x) => x !== i))
    setKunci(kunci === i ? 0 : kunci > i ? kunci - 1 : kunci)
  }
  return (
    <form className="kartu form jarak" onSubmit={kirim}>
      <h3>{awal ? 'Ubah soal' : 'Tambah soal'}</h3>
      <label>Pertanyaan<textarea required rows={3} maxLength={4000} value={tanya} onChange={(e) => setTanya(e.target.value)} /></label>
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
      <div className="grid grid-2">
        <label>Bobot<input type="number" min={1} max={100} value={bobot} onChange={(e) => setBobot(Number(e.target.value))} /></label>
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

function RekapKuis({ asesmenId, versi }: { asesmenId: string; versi: number }) {
  const [baris, setBaris] = useState<BarisKuis[] | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    panggil<{ siswa: BarisKuis[] }>('lms_asesmen_rekap', { p_asesmen: asesmenId }).then((r) => setBaris(r.siswa)).catch((e: Error) => setGalat(e.message))
  }, [asesmenId, versi])
  const selesai = (baris ?? []).filter((b) => b.status !== 'belum' && b.nilai_terbaik !== null)
  const rata = selesai.length ? selesai.reduce((j, b) => j + Number(b.nilai_terbaik), 0) / selesai.length : null
  return (
    <div className="kartu jarak">
      <h3>Siapa yang sudah mengerjakan</h3>
      {baris && <p className="catatan">{(baris).filter((b) => b.status === 'selesai').length} selesai, {baris.filter((b) => b.status === 'berjalan').length} sedang mengerjakan, {baris.filter((b) => b.status === 'belum').length} belum. Rata-rata nilai terbaik: {nilaiTeks(rata)}.</p>}
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
                <td>{b.percobaan}</td><td>{nilaiTeks(b.nilai_terbaik)}</td><td>{nilaiTeks(b.nilai_terakhir)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KuisGuru({ kelasId, a, pertemuan, muat }: { kelasId: string; a: Asesmen; pertemuan: PertemuanRingkas[]; muat: () => Promise<void> }) {
  const [soal, setSoal] = useState<Soal[] | null>(null)
  const [galat, setGalat] = useState('')
  const [edit, setEdit] = useState<Soal | 'baru' | null>(null)
  const [atur, setAtur] = useState(false)
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
  return (
    <>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="kartu">
        <p style={{ margin: 0 }}>
          <span className={`status ${a.status === 'terbit' ? 'status-selesai' : 'status-menunggu'}`}>{a.status === 'terbit' ? 'Terbit' : 'Draf'}</span>{' '}
          {labelJenis[a.jenis]}, {a.durasi_menit} menit, {a.maks_percobaan} kali kesempatan. {jadwal(a)}.
        </p>
        <div className="aksi jarak">
          <button className="tombol tombol-isi" onClick={() => void terbitkan(a.status !== 'terbit')}>{a.status === 'terbit' ? 'Tarik jadi draf' : 'Terbitkan ke siswa'}</button>
          <button className="tombol" style={biru} onClick={() => setAtur(!atur)}>{atur ? 'Tutup pengaturan' : 'Ubah pengaturan'}</button>
        </div>
      </div>
      {atur && <FormAsesmen kelasId={kelasId} pertemuan={pertemuan} awal={a} selesai={async () => { await muat(); setAtur(false) }} />}

      <div className="judul-bagian jarak"><h2>Soal ({soal?.length ?? 0})</h2></div>
      {a.terkunci && <p className="catatan">Soal terkunci karena sudah ada siswa yang mengerjakan, supaya nilai tetap adil.</p>}
      {!soal && <p className="catatan">Memuat...</p>}
      {soal && soal.length === 0 && <div className="kartu"><p className="catatan">Belum ada soal. Tambahkan soal, lalu terbitkan.</p></div>}
      {(soal ?? []).map((s, i) => (
        <div key={s.id} className="kartu" style={{ marginTop: 8 }}>
          <p style={{ marginTop: 0 }}><strong>{i + 1}.</strong> {s.pertanyaan} <small>(bobot {s.bobot}{total ? `, ${Math.round((s.bobot / total) * 100)}%` : ''})</small></p>
          <ol type="A" style={{ margin: '0 0 8px' }}>
            {s.opsi.map((o, n) => <li key={n} style={n === s.kunci ? { fontWeight: 700 } : undefined}>{o}{n === s.kunci ? ' (benar)' : ''}</li>)}
          </ol>
          {s.pembahasan && <p className="catatan">Pembahasan: {s.pembahasan}</p>}
          {!a.terkunci && <div className="aksi"><button className="tombol" style={biru} onClick={() => setEdit(s)}>Ubah soal</button></div>}
        </div>
      ))}
      {!a.terkunci && !edit && <div className="aksi jarak"><button className="tombol tombol-isi" onClick={() => setEdit('baru')}>Tambah soal</button></div>}
      {edit && (
        <FormSoal key={edit === 'baru' ? 'baru' : edit.id} asesmenId={a.id} awal={edit === 'baru' ? null : edit}
          selesai={async () => { setEdit(null); await muatSoal(); await muat() }} batal={() => setEdit(null)} />
      )}
      <RekapKuis asesmenId={a.id} versi={versi} />
    </>
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

  const kirim = useCallback(async (percobaan: string) => {
    if (terkirim.current) return
    terkirim.current = true
    setSibuk(true)
    try {
      setHasil(await panggil<Hasil>('lms_kirim', { p_percobaan: percobaan }))
      setSesi(null)
      await muat()
    } catch (e) { terkirim.current = false; setGalat((e as Error).message) }
    setSibuk(false)
  }, [muat])

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
      setSesi(r)
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  async function pilih(soalId: string, idx: number) {
    if (!sesi) return
    setSesi({ ...sesi, soal: sesi.soal.map((s) => (s.soal_id === soalId ? { ...s, pilihan: idx } : s)) })
    try {
      const r = await panggil<{ ok: boolean; habis?: boolean }>('lms_jawab', { p_percobaan: sesi.percobaan, p_soal: soalId, p_pilihan: idx })
      if (!r.ok && r.habis) await kirim(sesi.percobaan)
    } catch (e) { setGalat('Jawaban belum tersimpan, coba pilih lagi. ' + (e as Error).message) }
  }
  function selesaiManual() {
    if (!sesi) return
    const kosong = sesi.soal.filter((s) => s.pilihan === null).length
    if (!window.confirm(kosong ? `${kosong} soal belum dijawab. Kirim sekarang?` : 'Kirim jawaban sekarang?')) return
    void kirim(sesi.percobaan)
  }

  const mm = `${dua(Math.floor(sisa / 60))}:${dua(sisa % 60)}`

  if (sesi) {
    return (
      <>
        <div className="kartu" style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <strong aria-live="off">Sisa waktu {mm}</strong>
          <small>{sesi.soal.filter((s) => s.pilihan !== null).length} dari {sesi.soal.length} terjawab</small>
        </div>
        {sesi.petunjuk && <p className="catatan">{sesi.petunjuk}</p>}
        {galat && <p className="catatan galat" role="alert">{galat}</p>}
        {sesi.soal.map((s, i) => (
          <fieldset key={s.soal_id} className="kartu" style={{ marginTop: 8 }}>
            <legend style={{ fontWeight: 600 }}>Soal {i + 1}</legend>
            <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{s.pertanyaan}</p>
            {s.opsi.map((o, n) => (
              <label key={n} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400, marginTop: 6 }}>
                <input type="radio" name={s.soal_id} checked={s.pilihan === n} onChange={() => void pilih(s.soal_id, n)} style={{ width: 'auto', marginTop: 4 }} />
                <span><strong>{huruf[n]}.</strong> {o}</span>
              </label>
            ))}
          </fieldset>
        ))}
        <div className="aksi jarak"><button className="tombol tombol-isi" disabled={sibuk} onClick={selesaiManual}>{sibuk ? 'Mengirim...' : 'Selesai dan kirim'}</button></div>
      </>
    )
  }

  const sisaKesempatan = a.maks_percobaan - (a.percobaan_selesai ?? 0)
  return (
    <>
      {galat && (
        <p className="catatan galat" role="alert">
          {galat}{galat.startsWith('Absen dulu') && a.pertemuan_id ? <> <Link to={`/portal/lms/${kelasId}`}>Kembali ke kelas</Link></> : null}
        </p>
      )}
      {hasil && (
        <div className="kartu hasil">
          <h3 style={{ marginTop: 0 }}>Jawaban terkirim</h3>
          {hasil.tampil_hasil ? <p style={{ fontSize: '1.4rem', margin: 0 }}>Nilai {nilaiTeks(hasil.nilai)}</p> : <p style={{ margin: 0 }}>Nilai ditampilkan oleh guru.</p>}
        </div>
      )}
      {hasil?.tinjau && hasil.tinjau.map((s, i) => (
        <div key={s.soal_id} className="kartu" style={{ marginTop: 8 }}>
          <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}><strong>{i + 1}.</strong> {s.pertanyaan}</p>
          <ol type="A" style={{ margin: '0 0 8px' }}>
            {s.opsi.map((o, n) => (
              <li key={n} style={n === s.benar ? { fontWeight: 700 } : undefined}>
                {o}{n === s.benar ? ' (jawaban benar)' : ''}{n === s.pilihan && n !== s.benar ? ' (jawaban Anda)' : ''}{n === s.pilihan && n === s.benar ? ' (jawaban Anda)' : ''}
              </li>
            ))}
          </ol>
          {s.pilihan === null && <p className="catatan">Tidak dijawab.</p>}
          {s.pembahasan && <p className="catatan">Pembahasan: {s.pembahasan}</p>}
        </div>
      ))}
      {!hasil && (
        <div className="kartu">
          <p style={{ marginTop: 0 }}>{labelJenis[a.jenis]}, {a.jumlah_soal} soal, {a.durasi_menit} menit. {jadwal(a)}.</p>
          {a.petunjuk && <p>{a.petunjuk}</p>}
          <p className="catatan">Waktu berjalan di server. Menutup halaman tidak menghentikan waktu. Jawaban tersimpan setiap kali dipilih.</p>
          {a.percobaan_selesai ? <p>Nilai terbaik Anda: <strong>{nilaiTeks(a.nilai_terbaik)}</strong> ({a.percobaan_selesai} dari {a.maks_percobaan} kesempatan terpakai).</p> : null}
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

/** Satu kuis atau ulangan. Pengelola: soal, pengaturan, rekap. Siswa: mengerjakan dengan timer. */
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
