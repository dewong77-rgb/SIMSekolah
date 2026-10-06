import TombolIkon from '../components/TombolIkon'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { panggil, tglJam } from '../lib/rpc'
import { ambilBlobBerkas, perkecilFoto, unduhBerkas, ukuranTeks, unggahBerkas } from '../lib/berkas'
import { jadikanIsian } from '../lib/lembar'
import { merah } from './lmsUtil'

// Lembar kerja isian. Dokumen Word yang diimpor guru menjadi formulir: siswa mengisi langsung,
// melampirkan foto bukti bila perlu, draf tersimpan otomatis, lalu dikumpulkan.

type Lampiran = { id: string; berkas_id: string; nama: string; mime: string; ukuran: number }
type Isian = Record<string, string>
type Saya = {
  tenggat: string | null; terima_telat: boolean; nilai_maks: number
  isian: Isian; catatan: string | null; url: string | null
  dikumpul: boolean; dikumpul_pada: string | null; terlambat: boolean | null; ada_perubahan: boolean
  nilai: number | null; umpan_balik: string | null; terkunci: boolean; lampiran: Lampiran[]
}
type Jawaban = { isian: Isian; catatan: string | null; url: string | null; dikumpul_pada: string | null; lampiran: Lampiran[]; dokumen: string | null }

const MAKS_LAMPIRAN = 8

/** Dokumen dengan kolom isian. Nilai awal dipasang sekali; perubahan dilaporkan lewat onUbah. */
export function DokumenIsian({ html, isian, terkunci, onUbah }: { html: string; isian: Isian; terkunci: boolean; onUbah?: (k: string, v: string) => void }) {
  const hasil = useMemo(() => jadikanIsian(html), [html])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-f]').forEach((x) => {
      const v = isian[x.dataset.f ?? ''] ?? ''
      if (x instanceof HTMLInputElement && x.type === 'checkbox') x.checked = v === '1'
      else x.value = v
      x.disabled = false
      x.readOnly = terkunci
      if (terkunci && x instanceof HTMLInputElement && x.type === 'checkbox') x.disabled = true
    })
  }, [hasil, isian, terkunci])
  // Tabel di HP ditumpuk jadi kartu: judul kolom dari baris pertama dipasang sebagai label tiap sel.
  useEffect(() => {
    ref.current?.querySelectorAll('table').forEach((t) => {
      const baris = Array.from(t.querySelectorAll('tr'))
      if (baris.length < 2) return
      const judul = Array.from(baris[0].children).map((c) => (c.textContent ?? '').trim())
      if (judul.every((x) => !x)) return
      t.classList.add('tabel-kartu'); baris[0].classList.add('tabel-kepala')
      baris.slice(1).forEach((tr) => Array.from(tr.children).forEach((c, i) => { if (judul[i]) c.setAttribute('data-label', judul[i]) }))
    })
  }, [hasil])
  function saatUbah(e: React.FormEvent<HTMLDivElement>) {
    const x = e.target as HTMLInputElement | HTMLTextAreaElement
    const k = x.dataset?.f
    if (!k || terkunci) return
    const v = x instanceof HTMLInputElement && x.type === 'checkbox' ? (x.checked ? '1' : '') : x.value
    onUbah?.(k, v)
  }
  return <div ref={ref} className="dokumen dokumen-isian" onInput={saatUbah} dangerouslySetInnerHTML={{ __html: hasil.html }} />
}

function Miniatur({ l, lepas }: { l: Lampiran; lepas?: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [galat, setGalat] = useState('')
  const gambar = l.mime.startsWith('image/')
  useEffect(() => {
    if (!gambar) return
    let url: string | null = null
    let batal = false
    ambilBlobBerkas(l.berkas_id).then((b) => { if (!batal) { url = URL.createObjectURL(b); setSrc(url) } }).catch((e) => setGalat((e as Error).message))
    return () => { batal = true; if (url) URL.revokeObjectURL(url) }
  }, [l.berkas_id, gambar])
  return (
    <div className="lampiran-kotak">
      {gambar && src && <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={l.nama} /></a>}
      {gambar && !src && !galat && <div className="lampiran-kosong">Memuat...</div>}
      {galat && <div className="lampiran-kosong galat">{galat}</div>}
      {!gambar && <div className="lampiran-kosong">{l.nama}</div>}
      <small>{l.nama} ({ukuranTeks(l.ukuran)})</small>
      <div className="aksi">
        <TombolIkon ikon="unduh" label="Unduh" onClick={() => void unduhBerkas(l.berkas_id, l.nama).catch(() => undefined)} />
        {lepas && <button type="button" className="tombol" style={merah} onClick={lepas}>Lepas</button>}
      </div>
    </div>
  )
}

/** Tampilan siswa: isi, lampirkan foto, simpan draf, kumpulkan. */
export function LembarSiswa({ tugasId, html, judul, setelah }: { tugasId: string; html: string; judul: string; setelah?: () => void }) {
  const [d, setD] = useState<Saya | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [unggah, setUnggah] = useState('')
  const [kotor, setKotor] = useState(false)
  const [catatan, setCatatan] = useState('')
  const [url, setUrl] = useState('')
  const isian = useRef<Isian>({})
  const catRef = useRef(''); const urlRef = useRef('')
  const jam = useRef<number | undefined>(undefined)
  const [awal, setAwal] = useState<Isian>({})
  const [simpanStatus, setSimpanStatus] = useState<'' | 'menyimpan' | 'tersimpan' | 'gagal'>('')
  const kunciCadangan = `lembar-draf:${tugasId}`
  const cadangkan = () => { try { localStorage.setItem(kunciCadangan, JSON.stringify({ isian: isian.current, catatan: catRef.current, url: urlRef.current })) } catch { /* penyimpanan perangkat penuh atau dimatikan */ } }
  const hapusCadangan = () => { try { localStorage.removeItem(kunciCadangan) } catch { /* abaikan */ } }

  const muat = useCallback(async () => {
    try {
      const r = await panggil<Saya>('lms_lembar_saya', { p_tugas: tugasId })
      setD(r); isian.current = { ...r.isian }; setAwal({ ...r.isian })
      setCatatan(r.catatan ?? ''); catRef.current = r.catatan ?? ''
      setUrl(r.url ?? ''); urlRef.current = r.url ?? ''
      setKotor(false); setGalat('')
      // Draf di perangkat yang belum sempat terkirim (sinyal putus, tab tertutup) dipulihkan.
      let pulih = false
      if (!r.terkunci) {
        try {
          const raw = localStorage.getItem(kunciCadangan)
          if (raw) {
            const c = JSON.parse(raw) as { isian?: Isian; catatan?: string; url?: string }
            isian.current = { ...r.isian, ...(c.isian ?? {}) }; setAwal({ ...isian.current })
            catRef.current = c.catatan ?? r.catatan ?? ''; setCatatan(catRef.current)
            urlRef.current = c.url ?? r.url ?? ''; setUrl(urlRef.current)
            pulih = true
          }
        } catch { /* cadangan rusak, abaikan */ }
      }
      if (pulih) { setKotor(true); setInfo('Draf di perangkat ini dipulihkan, sedang dikirim ulang.'); jam.current = window.setTimeout(() => { void simpanDraf() }, 800) }
    } catch (e) { setGalat((e as Error).message) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tugasId])
  useEffect(() => { void muat() }, [muat])

  const simpanDraf = useCallback(async (diam = false) => {
    window.clearTimeout(jam.current)
    setSimpanStatus('menyimpan')
    try {
      await panggil('lms_lembar_simpan_draf', { p_tugas: tugasId, p_isian: isian.current, p_catatan: catRef.current, p_url: urlRef.current })
      setKotor(false); hapusCadangan(); setSimpanStatus('tersimpan'); setGalat('')
      if (!diam) setInfo('')
      return true
    } catch (e) {
      // Jawaban aman di perangkat; dicoba lagi otomatis saat sinyal kembali.
      cadangkan(); setSimpanStatus('gagal')
      if (navigator.onLine) setGalat((e as Error).message)
      return false
    }
  }, [tugasId])

  function tandai() {
    setKotor(true); setInfo(''); cadangkan()
    window.clearTimeout(jam.current)
    jam.current = window.setTimeout(() => { void simpanDraf() }, 1500)
  }
  useEffect(() => () => window.clearTimeout(jam.current), [])
  // Kirim ulang draf yang gagal: saat sinyal kembali dan tiap 20 detik selama masih ada yang belum tersimpan.
  const gagalRef = useRef(false); gagalRef.current = simpanStatus === 'gagal'
  useEffect(() => {
    const ulang = () => { if (gagalRef.current) void simpanDraf(true) }
    window.addEventListener('online', ulang)
    const iv = window.setInterval(ulang, 20_000)
    return () => { window.removeEventListener('online', ulang); window.clearInterval(iv) }
  }, [simpanDraf])
  // simpan bila pindah tab atau halaman disembunyikan
  const kotorRef = useRef(false); kotorRef.current = kotor
  useEffect(() => {
    const k = () => { if (document.visibilityState === 'hidden' && kotorRef.current) void simpanDraf(true) }
    document.addEventListener('visibilitychange', k)
    return () => document.removeEventListener('visibilitychange', k)
  }, [simpanDraf])

  async function kumpul() {
    setSibuk(true); setGalat(''); setInfo('')
    try {
      await panggil('lms_lembar_kumpul', { p_tugas: tugasId, p_isian: isian.current, p_catatan: catRef.current, p_url: urlRef.current })
      hapusCadangan(); setSimpanStatus('')
      await muat()
      setInfo('Lembar kerja sudah dikirim.')
      setelah?.()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  async function lampirkan(files: FileList | null) {
    if (!files || !d) return
    const daftar = Array.from(files)
    if (d.lampiran.length + daftar.length > MAKS_LAMPIRAN) { setGalat(`Maksimal ${MAKS_LAMPIRAN} lampiran.`); return }
    setGalat(''); setSibuk(true)
    try {
      let i = 0
      for (const f0 of daftar) {
        i++
        setUnggah(`Mengunggah ${i} dari ${daftar.length}...`)
        const f = await perkecilFoto(f0)
        const b = await unggahBerkas(f, 'tugas_siswa', tugasId, (p) => setUnggah(`Mengunggah ${i} dari ${daftar.length}: ${p}%`))
        await panggil('lms_lampiran_tambah', { p_tugas: tugasId, p_berkas: b.id })
      }
      await muat()
    } catch (e) { setGalat((e as Error).message); await muat() }
    setUnggah(''); setSibuk(false)
  }
  async function lepas(id: string) {
    if (!window.confirm('Lepas lampiran ini?')) return
    try { await panggil('lms_lampiran_lepas', { p_id: id }); await muat() } catch (e) { setGalat((e as Error).message) }
  }

  if (!d) return <div className="kartu jarak"><h3>{judul}</h3>{galat ? <p className="catatan galat" role="alert">{galat}</p> : <p className="catatan">Memuat lembar kerja...</p>}</div>

  const status = d.nilai != null ? `Dinilai: ${d.nilai} dari ${d.nilai_maks}`
    : d.dikumpul ? (d.ada_perubahan ? 'Terkumpul, ada perubahan yang belum dikumpulkan' : `Terkumpul${d.terlambat ? ' (terlambat)' : ''}`) : 'Belum dikumpulkan'
  return (
    <div className="kartu jarak lembar">
      <div className="lencana-baris">
        <span className="lencana">Lembar kerja</span>
        <span className={`status ${d.nilai != null ? 'status-selesai' : d.dikumpul ? 'status-selesai' : 'status-menunggu'}`}>{status}</span>
        {d.tenggat && <span className="status status-menunggu">Tenggat {tglJam(d.tenggat)}</span>}
      </div>
      <h3>{judul}</h3>
      <p className="catatan">Isi langsung pada kolom di bawah. Jawaban tersimpan otomatis sebagai draf. Foto hasil kerja bisa dilampirkan di bagian bawah. Setelah selesai, tekan Kumpulkan.</p>
      <DokumenIsian html={html} isian={awal} terkunci={d.terkunci} onUbah={(k, v) => { isian.current[k] = v; tandai() }} />

      <div className="form jarak">
        <label>Catatan tambahan (opsional)
          <textarea rows={3} maxLength={10000} disabled={d.terkunci} value={catatan} onChange={(e) => { setCatatan(e.target.value); catRef.current = e.target.value; tandai() }} />
          <span className="petunjuk">Misalnya kendala yang dialami, atau jawaban yang tidak muat di kolom.</span>
        </label>
        <label>Tautan hasil kerja (opsional)
          <input type="url" pattern="https://.*" disabled={d.terkunci} value={url} placeholder="https://" onChange={(e) => { setUrl(e.target.value); urlRef.current = e.target.value; tandai() }} />
          <span className="petunjuk">Misalnya tautan proyek, video, atau berkas di Drive. Harus diawali https://.</span>
        </label>
      </div>

      <div className="jarak">
        <strong>Foto atau berkas bukti</strong> <small>({d.lampiran.length} dari {MAKS_LAMPIRAN})</small>
        <div className="lampiran-baris">
          {d.lampiran.map((l) => <Miniatur key={l.id} l={l} lepas={d.terkunci ? undefined : () => void lepas(l.id)} />)}
        </div>
        {d.lampiran.length === 0 && <p className="catatan">Belum ada lampiran. Tidak wajib.</p>}
        {!d.terkunci && d.lampiran.length < MAKS_LAMPIRAN && (
          <label>Tambah foto atau berkas
            <input type="file" multiple accept="image/*,application/pdf" disabled={sibuk} onChange={(e) => { void lampirkan(e.target.files); e.target.value = '' }} />
            <span className="petunjuk">Foto dari kamera diperkecil otomatis. Boleh juga PDF.</span>
          </label>
        )}
        {unggah && <p className="catatan">{unggah}</p>}
      </div>

      {d.umpan_balik && <div className="kartu hasil"><strong>Umpan balik guru</strong><p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{d.umpan_balik}</p></div>}
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {info && <p className="catatan" role="status">{info}</p>}
      {!d.terkunci && (
        <div className="aksi aksi-lekat">
          <span className={`status-simpan status-simpan-${simpanStatus || (kotor ? 'menyimpan' : 'diam')}`} role="status" aria-live="polite">
            {simpanStatus === 'gagal' ? 'Belum terkirim, jawaban aman di HP ini. Dicoba lagi otomatis.' : simpanStatus === 'menyimpan' || kotor ? 'Menyimpan...' : simpanStatus === 'tersimpan' ? 'Tersimpan' : ''}
          </span>
          <button type="button" className="tombol tombol-isi" disabled={sibuk} onClick={() => void kumpul()}>{sibuk ? 'Memproses...' : d.dikumpul ? 'Kumpulkan ulang' : 'Kumpulkan'}</button>
        </div>
      )}
      {d.terkunci && <p className="catatan">Lembar sudah dinilai, tidak bisa diubah lagi.</p>}
    </div>
  )
}

/** Tampilan guru: dokumen terisi milik satu siswa, hanya baca. */
export function LembarJawabanGuru({ tugasId, pdId }: { tugasId: string; pdId: string }) {
  const [j, setJ] = useState<Jawaban | null>(null)
  const [galat, setGalat] = useState('')
  useEffect(() => {
    panggil<Jawaban>('lms_lembar_jawaban', { p_tugas: tugasId, p_pd: pdId }).then(setJ).catch((e) => setGalat((e as Error).message))
  }, [tugasId, pdId])
  if (galat) return <p className="catatan galat" role="alert">{galat}</p>
  if (!j) return <p className="catatan">Memuat jawaban...</p>
  return (
    <div className="jarak">
      {j.dokumen ? <DokumenIsian html={j.dokumen} isian={j.isian} terkunci /> : <p className="catatan">Dokumen lembar tidak tersedia.</p>}
      {j.catatan && <p><strong>Catatan siswa:</strong> <span style={{ whiteSpace: 'pre-wrap' }}>{j.catatan}</span></p>}
      {j.url && <p><a href={j.url} target="_blank" rel="noopener noreferrer">Tautan dari siswa</a></p>}
      {j.lampiran.length > 0 && <div className="lampiran-baris">{j.lampiran.map((l) => <Miniatur key={l.id} l={l} />)}</div>}
      {j.lampiran.length === 0 && <p className="catatan">Tanpa lampiran.</p>}
    </div>
  )
}

/** Pratinjau untuk guru: lembar tampil seperti di siswa, isian hanya di layar, tidak ada yang tersimpan. */
export function LembarPratinjau({ html, judul }: { html: string; judul: string }) {
  const [isian] = useState<Isian>({})
  return (
    <div className="kartu jarak lembar">
      <div className="lencana-baris"><span className="lencana">Lembar kerja</span><span className="status status-menunggu">Pratinjau, tidak tersimpan</span></div>
      <h3>{judul}</h3>
      <DokumenIsian html={html} isian={isian} terkunci={false} />
      <div className="form jarak">
        <label>Catatan tambahan (opsional)<textarea rows={3} /></label>
        <label>Foto atau berkas bukti<input type="file" disabled /></label>
      </div>
      <div className="aksi"><button type="button" className="tombol tombol-isi" disabled>Kumpulkan</button></div>
    </div>
  )
}
