import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil, tglJam } from '../lib/rpc'
import { biru, dariInputLokal, keInputLokal, merah, nilaiTeks, unduhCsv } from './lmsUtil'
import type { PertemuanRingkas } from './LmsKuis'
import { LembarJawabanGuru } from './LmsLembar'

// Tugas dan pengumpulan. Pengumpulan berupa teks dan atau tautan https (Drive, GitHub, dan sebagainya).

type Saya = { teks: string | null; url: string | null; dikumpul_pada: string; terlambat: boolean; nilai: number | null; umpan_balik: string | null }
type Tugas = {
  id: string; judul: string; instruksi: string | null; tenggat: string | null; terima_telat: boolean; nilai_maks: number
  status: 'draf' | 'terbit'; pertemuan_id: string | null; pertemuan_nomor: number | null
  dikumpul: number | null; dinilai: number | null; total_siswa: number | null; saya: Saya | null; lembar?: boolean
}
type BarisTugas = {
  peserta_didik_id: string; nama: string; nisn: string | null; no_urut: number | null
  status: 'belum' | 'terkumpul' | 'terlambat' | 'dinilai'; teks: string | null; url: string | null
  dikumpul_pada: string | null; nilai: number | null; umpan_balik: string | null
  ada_isian?: boolean; jumlah_lampiran?: number
}

const labelStatus: Record<string, string> = { belum: 'Belum', terkumpul: 'Terkumpul', terlambat: 'Terlambat', dinilai: 'Dinilai' }
const kelasStatus: Record<string, string> = { belum: 'status-dibatalkan', terkumpul: 'status-menunggu', terlambat: 'status-ditolak', dinilai: 'status-selesai' }

function statusSaya(t: Tugas): string {
  if (!t.saya) return 'belum'
  if (t.saya.nilai !== null) return 'dinilai'
  return t.saya.terlambat ? 'terlambat' : 'terkumpul'
}

function FormTugas({ kelasId, pertemuan, awal, selesai }: {
  kelasId: string; pertemuan: PertemuanRingkas[]; awal: Tugas | null; selesai: (id: string) => void | Promise<void>
}) {
  const [v, setV] = useState({
    judul: awal?.judul ?? '', instruksi: awal?.instruksi ?? '', pertemuan: awal?.pertemuan_id ?? '',
    tenggat: keInputLokal(awal?.tenggat ?? null), telat: awal?.terima_telat ?? false, maks: awal?.nilai_maks ?? 100,
  })
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function kirim(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      const id = await panggil<string>('lms_tugas_simpan', {
        p_kelas: kelasId, p_id: awal?.id ?? null, p_pertemuan: v.pertemuan || null, p_judul: v.judul,
        p_instruksi: v.instruksi || null, p_tenggat: dariInputLokal(v.tenggat), p_terima_telat: v.telat,
        p_nilai_maks: v.maks, p_terbit: awal ? null : false,
      })
      await selesai(id)
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <form className="kartu form jarak" onSubmit={kirim}>
      <h3>{awal ? 'Pengaturan tugas' : 'Tugas baru'}</h3>
      <div className="grid grid-2">
        <label>Judul<input required maxLength={200} value={v.judul} onChange={(e) => setV({ ...v, judul: e.target.value })} /></label>
        <label>Terkait pertemuan
          <select value={v.pertemuan} onChange={(e) => setV({ ...v, pertemuan: e.target.value })}>
            <option value="">Tidak terkait</option>
            {pertemuan.map((p) => <option key={p.id} value={p.id}>Pertemuan {p.nomor}: {p.judul}</option>)}
          </select>
          <span className="petunjuk">Bila terkait, siswa harus sudah absen di pertemuan itu.</span>
        </label>
        <label>Tenggat (opsional)<input type="datetime-local" value={v.tenggat} onChange={(e) => setV({ ...v, tenggat: e.target.value })} /></label>
        <label>Nilai maksimum<input required type="number" min={1} max={1000} value={v.maks} onChange={(e) => setV({ ...v, maks: Number(e.target.value) })} /></label>
      </div>
      <label>Instruksi<textarea rows={5} maxLength={10000} value={v.instruksi} onChange={(e) => setV({ ...v, instruksi: e.target.value })} /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
        <input type="checkbox" checked={v.telat} onChange={(e) => setV({ ...v, telat: e.target.checked })} style={{ width: 'auto' }} />
        Tetap terima pengumpulan setelah tenggat (ditandai terlambat)
      </label>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : awal ? 'Simpan pengaturan' : 'Buat tugas'}</button></div>
    </form>
  )
}

/** Daftar tugas satu kelas. Dipasang di halaman kelas. */
export function DaftarTugas({ kelasId, kelola, pertemuan }: { kelasId: string; kelola: boolean; pertemuan: PertemuanRingkas[] }) {
  const [daftar, setDaftar] = useState<Tugas[] | null>(null)
  const [galat, setGalat] = useState('')
  const [form, setForm] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    panggil<Tugas[]>('lms_tugas_daftar', { p_kelas: kelasId }).then(setDaftar).catch((e: Error) => setGalat(e.message))
  }, [kelasId])
  return (
    <>
      <div className="judul-bagian jarak"><h2>Tugas</h2></div>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {kelola && <div className="aksi"><button className="tombol tombol-isi" onClick={() => setForm(!form)}>{form ? 'Tutup formulir' : 'Buat tugas'}</button></div>}
      {form && <FormTugas kelasId={kelasId} pertemuan={pertemuan} awal={null} selesai={(id) => nav(`/portal/lms/${kelasId}/tugas/${id}`)} />}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Tugas</th><th>Tenggat</th><th>{kelola ? 'Terkumpul' : 'Status saya'}</th><th></th></tr></thead>
          <tbody>
            {!daftar && <tr><td colSpan={4}>Memuat...</td></tr>}
            {daftar && daftar.length === 0 && <tr><td colSpan={4}>Belum ada tugas.</td></tr>}
            {(daftar ?? []).map((t) => (
              <tr key={t.id}>
                <td><Link to={`/portal/lms/${kelasId}/tugas/${t.id}`}>{t.judul}</Link><br /><small>{t.pertemuan_nomor ? `Pertemuan ${t.pertemuan_nomor}` : 'Umum'}</small></td>
                <td><small>{t.tenggat ? tglJam(t.tenggat) : 'Tanpa tenggat'}</small></td>
                <td>
                  {kelola
                    ? <>{t.dikumpul ?? 0}/{t.total_siswa ?? 0}, {t.dinilai ?? 0} dinilai <span className={`status ${t.status === 'terbit' ? 'status-selesai' : 'status-menunggu'}`}>{t.status === 'terbit' ? 'Terbit' : 'Draf'}</span></>
                    : <><span className={`status ${kelasStatus[statusSaya(t)]}`}>{labelStatus[statusSaya(t)]}</span>{t.saya?.nilai !== null && t.saya?.nilai !== undefined ? <> {nilaiTeks(t.saya.nilai)}/{t.nilai_maks}</> : null}</>}
                </td>
                <td><Link to={`/portal/lms/${kelasId}/tugas/${t.id}`}>{kelola ? 'Kelola' : 'Buka'}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function BarisNilai({ b, tugasId, maks, muat }: { b: BarisTugas; tugasId: string; maks: number; muat: () => Promise<void> }) {
  const [nilai, setNilai] = useState(b.nilai === null ? '' : String(b.nilai))
  const [umpan, setUmpan] = useState(b.umpan_balik ?? '')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [buka, setBuka] = useState(false)
  const [lembar, setLembar] = useState(false)
  async function simpan() {
    setSibuk(true); setGalat('')
    try { await panggil('lms_tugas_nilai', { p_tugas: tugasId, p_pd: b.peserta_didik_id, p_nilai: Number(nilai), p_umpan: umpan || null }); await muat() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  const ada = b.status !== 'belum'
  return (
    <tr>
      <td>{b.no_urut ?? ''}</td>
      <td>{b.nama}<br /><small>{b.nisn ?? ''}</small></td>
      <td><span className={`status ${kelasStatus[b.status]}`}>{labelStatus[b.status]}</span>{b.dikumpul_pada ? <><br /><small>{tglJam(b.dikumpul_pada)}</small></> : null}</td>
      <td>
        {ada ? (
          <>
            {b.url && <a href={b.url} target="_blank" rel="noopener noreferrer">Buka tautan</a>}
            {b.ada_isian && <><br /><button type="button" className="tombol" style={biru} onClick={() => setLembar(!lembar)}>{lembar ? 'Sembunyikan lembar' : 'Lihat lembar'}</button>{b.jumlah_lampiran ? <small> {b.jumlah_lampiran} lampiran</small> : null}</>}
            {b.teks && <><br /><button type="button" className="tombol" style={biru} onClick={() => setBuka(!buka)}>{buka ? 'Sembunyikan jawaban' : 'Lihat jawaban'}</button></>}
            {buka && b.teks && <p style={{ whiteSpace: 'pre-wrap' }}>{b.teks}</p>}
            {lembar && <LembarJawabanGuru tugasId={tugasId} pdId={b.peserta_didik_id} />}
          </>
        ) : <small>-</small>}
      </td>
      <td>
        {ada && (
          <div style={{ display: 'grid', gap: 4, minWidth: 180 }}>
            <input type="number" min={0} max={maks} step="any" aria-label={`Nilai ${b.nama}`} placeholder={`0 sampai ${maks}`} value={nilai} onChange={(e) => setNilai(e.target.value)} />
            <input aria-label={`Umpan balik ${b.nama}`} placeholder="Umpan balik" maxLength={2000} value={umpan} onChange={(e) => setUmpan(e.target.value)} />
            <button type="button" className="tombol" style={biru} disabled={sibuk || nilai === ''} onClick={() => void simpan()}>{sibuk ? 'Menyimpan...' : 'Simpan nilai'}</button>
            {galat && <small className="galat">{galat}</small>}
          </div>
        )}
      </td>
    </tr>
  )
}

function TugasGuru({ kelasId, t, pertemuan, muat }: { kelasId: string; t: Tugas; pertemuan: PertemuanRingkas[]; muat: () => Promise<void> }) {
  const [baris, setBaris] = useState<BarisTugas[] | null>(null)
  const [galat, setGalat] = useState('')
  const [atur, setAtur] = useState(false)
  const nav = useNavigate()
  const muatRekap = useCallback(async () => {
    try { setBaris((await panggil<{ siswa: BarisTugas[] }>('lms_tugas_rekap', { p_tugas: t.id })).siswa) } catch (e) { setGalat((e as Error).message) }
  }, [t.id])
  useEffect(() => { void muatRekap() }, [muatRekap])
  async function terbitkan(terbit: boolean) {
    setGalat('')
    try {
      await panggil('lms_tugas_simpan', {
        p_kelas: kelasId, p_id: t.id, p_pertemuan: t.pertemuan_id, p_judul: t.judul, p_instruksi: t.instruksi,
        p_tenggat: t.tenggat, p_terima_telat: t.terima_telat, p_nilai_maks: t.nilai_maks, p_terbit: terbit,
      })
      await muat()
    } catch (e) { setGalat((e as Error).message) }
  }
  async function hapus() {
    if (!window.confirm('Hapus tugas ini? Pengumpulan siswa tetap tersimpan di basis data tetapi tugas tidak tampil lagi.')) return
    try { await panggil('lms_tugas_hapus', { p_tugas: t.id }); nav(`/portal/lms/${kelasId}`) } catch (e) { setGalat((e as Error).message) }
  }
  const hitung = (s: string) => (baris ?? []).filter((b) => b.status === s).length
  return (
    <>
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="kartu">
        <p style={{ margin: 0 }}>
          <span className={`status ${t.status === 'terbit' ? 'status-selesai' : 'status-menunggu'}`}>{t.status === 'terbit' ? 'Terbit' : 'Draf'}</span>{' '}
          Tenggat: {t.tenggat ? tglJam(t.tenggat) : 'tanpa tenggat'}{t.terima_telat ? ', terlambat tetap diterima' : ''}. Nilai maksimum {t.nilai_maks}.
        </p>
        {t.instruksi && <p style={{ whiteSpace: 'pre-wrap' }}>{t.instruksi}</p>}
        <div className="aksi jarak">
          <button className="tombol tombol-isi" onClick={() => void terbitkan(t.status !== 'terbit')}>{t.status === 'terbit' ? 'Tarik jadi draf' : 'Terbitkan ke siswa'}</button>
          <button className="tombol" style={biru} onClick={() => setAtur(!atur)}>{atur ? 'Tutup pengaturan' : 'Ubah pengaturan'}</button>
          <button className="tombol" style={merah} onClick={() => void hapus()}>Hapus tugas</button>
        </div>
      </div>
      {atur && <FormTugas kelasId={kelasId} pertemuan={pertemuan} awal={t} selesai={async () => { await muat(); setAtur(false) }} />}
      <div className="kartu jarak">
        <h3>Siapa yang sudah mengumpulkan</h3>
        <div className="aksi">
          <button className="tombol" style={biru} disabled={!baris} onClick={() => baris && unduhCsv('rekap-tugas.csv', [
            ['No', 'Nama', 'NISN', 'Status', 'Dikumpulkan', 'Nilai', 'Umpan balik'],
            ...baris.map((b, i) => [b.no_urut ?? i + 1, b.nama, b.nisn, labelStatus[b.status], b.dikumpul_pada ? tglJam(b.dikumpul_pada) : '', b.nilai, b.umpan_balik]),
          ])}>Unduh CSV</button>
        </div>
        {baris && <p className="catatan">{hitung('terkumpul') + hitung('terlambat') + hitung('dinilai')} dari {baris.length} sudah mengumpulkan ({hitung('terlambat')} terlambat), {hitung('dinilai')} dinilai, {hitung('belum')} belum.</p>}
        <div className="tabel-bungkus jarak">
          <table>
            <thead><tr><th>No</th><th>Nama</th><th>Status</th><th>Jawaban</th><th>Nilai</th></tr></thead>
            <tbody>
              {!baris && <tr><td colSpan={5}>Memuat...</td></tr>}
              {(baris ?? []).map((b) => <BarisNilai key={`${b.peserta_didik_id}-${b.nilai}-${b.umpan_balik}`} b={b} tugasId={t.id} maks={t.nilai_maks} muat={muatRekap} />)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function TugasSiswa({ t, muat, kelasId }: { t: Tugas; muat: () => Promise<void>; kelasId: string }) {
  const [teks, setTeks] = useState(t.saya?.teks ?? '')
  const [url, setUrl] = useState(t.saya?.url ?? '')
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const dinilai = t.saya?.nilai !== null && t.saya?.nilai !== undefined
  const lewat = !!t.tenggat && new Date(t.tenggat).getTime() < Date.now()
  const tutup = lewat && !t.terima_telat
  async function kirim(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat(''); setPesan('')
    try {
      const r = await panggil<{ ok: boolean; terlambat: boolean }>('lms_tugas_kumpul', { p_tugas: t.id, p_teks: teks || null, p_url: url || null })
      setPesan(r.terlambat ? 'Tersimpan, ditandai terlambat.' : 'Tugas terkumpul.')
      await muat()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <>
      <div className="kartu">
        <p style={{ margin: 0 }}>Tenggat: {t.tenggat ? tglJam(t.tenggat) : 'tanpa tenggat'}. Nilai maksimum {t.nilai_maks}.</p>
        {t.instruksi && <p style={{ whiteSpace: 'pre-wrap' }}>{t.instruksi}</p>}
        {t.saya && <p className="catatan">Terakhir dikumpulkan {tglJam(t.saya.dikumpul_pada)}{t.saya.terlambat ? ' (terlambat)' : ''}.</p>}
      </div>
      {dinilai && t.saya && (
        <div className="kartu hasil jarak">
          <strong>Nilai {nilaiTeks(t.saya.nilai)} dari {t.nilai_maks}</strong>
          {t.saya.umpan_balik && <p style={{ marginBottom: 0 }}>Umpan balik guru: {t.saya.umpan_balik}</p>}
        </div>
      )}
      {pesan && <div className="kartu hasil jarak"><strong>{pesan}</strong></div>}
      {t.lembar && !dinilai && <div className="kartu jarak"><p style={{ margin: 0 }}>Tugas ini berupa lembar kerja. Isi dan kumpulkan langsung di halaman pertemuan{t.pertemuan_nomor ? ` ${t.pertemuan_nomor}` : ''}.</p>{t.pertemuan_id && <p><Link to={`/portal/lms/${kelasId}/pertemuan/${t.pertemuan_id}`}>Buka lembar kerja</Link></p>}</div>}
      {!t.lembar && !dinilai && (tutup
        ? <p className="catatan">Tenggat sudah lewat dan pengumpulan ditutup.</p>
        : (
          <form className="kartu form jarak" onSubmit={kirim}>
            <h3>{t.saya ? 'Ubah pengumpulan' : 'Kumpulkan tugas'}</h3>
            <label>Jawaban teks<textarea rows={6} maxLength={10000} value={teks} onChange={(e) => setTeks(e.target.value)} /></label>
            <label>Tautan hasil kerja (opsional)<input type="url" pattern="https://.*" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
              <span className="petunjuk">Unggah berkas ke Google Drive, atur akses untuk guru, lalu tempel tautannya. Harus diawali https://.</span>
            </label>
            {galat && <p className="catatan galat" role="alert">{galat}</p>}
            <div className="aksi"><button className="tombol tombol-isi" disabled={sibuk || (!teks.trim() && !url.trim())}>{sibuk ? 'Mengirim...' : t.saya ? 'Simpan perubahan' : 'Kumpulkan'}</button></div>
          </form>
        ))}
    </>
  )
}

/** Satu tugas. Pengelola: pengaturan, rekap pengumpulan, penilaian. Siswa: kumpulkan dan lihat nilai. */
export function RuangTugas() {
  const { kelasId = '', id = '' } = useParams()
  const [t, setT] = useState<Tugas | null>(null)
  const [kelola, setKelola] = useState<boolean | null>(null)
  const [pertemuan, setPertemuan] = useState<PertemuanRingkas[]>([])
  const [galat, setGalat] = useState('')
  const muat = useCallback(async () => {
    try {
      const [k, daftar, pt] = await Promise.all([
        panggil<{ id: string; peran: string }[]>('lms_kelas_saya'),
        panggil<Tugas[]>('lms_tugas_daftar', { p_kelas: kelasId }),
        panggil<PertemuanRingkas[]>('lms_pertemuan_daftar', { p_kelas: kelasId }),
      ])
      setKelola(k.find((x) => x.id === kelasId)?.peran === 'pengelola')
      setPertemuan(pt.map((p) => ({ id: p.id, nomor: p.nomor, judul: p.judul })))
      const cari = daftar.find((x) => x.id === id) ?? null
      setT(cari)
      if (!cari) setGalat('Tugas tidak ditemukan atau belum diterbitkan.')
    } catch (e) { setGalat((e as Error).message) }
  }, [kelasId, id])
  useEffect(() => { void muat() }, [muat])
  return (
    <Halaman judul={t?.judul ?? 'Tugas'} lead={t?.pertemuan_nomor ? `Pertemuan ${t.pertemuan_nomor}` : undefined}>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {t && kelola !== null && (kelola
        ? <TugasGuru kelasId={kelasId} t={t} pertemuan={pertemuan} muat={muat} />
        : <TugasSiswa key={t.saya?.dikumpul_pada ?? 'baru'} t={t} muat={muat} kelasId={kelasId} />)}
      <p className="catatan jarak"><Link to={`/portal/lms/${kelasId}`}>Kembali ke kelas</Link></p>
    </Halaman>
  )
}
