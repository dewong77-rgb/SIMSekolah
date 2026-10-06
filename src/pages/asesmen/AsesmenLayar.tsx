import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { panggil } from '../../lib/rpc'
import { biru, dua, nilaiTeks } from '../lmsUtil'

// Layar ujian Asesmen Digital: layar penuh, token, penomoran soal, ragu-ragu, alarm dan pencatatan saat siswa
// meninggalkan halaman. Peramban tidak bisa mengurung siswa, jadi pelanggaran dideteksi, dibunyikan, dan dicatat.
// Data lewat fungsi basis data ad_siswa_*. Kunci jawaban tidak pernah dikirim ke peramban.

export type JadwalSaya = {
  peserta_id: string; ujian: string; jenis: string; durasi_menit: number; status: string; tampil_nilai: boolean
  sesi: string; mulai: string; selesai: string; ruang: string; no_kursi: number | null; mapel: string | null; token_dibuka: boolean
  percobaan_id: string | null; percobaan_selesai: string | null; nilai: number | null
}
type SoalAd = { id: string; nomor: number; tipe: 'pilgan' | 'isian'; pertanyaan: string; opsi: { i: number; t: string }[]; jawaban: string | null; ragu: boolean }
type Muat = {
  selesai?: boolean; percobaan_id: string; sisa_detik: number; durasi_menit: number; ujian: string; jenis: string; mapel: string | null
  pelanggaran: number; terkunci: boolean; ambang: number; kunci_otomatis: boolean; soal: SoalAd[]
}
type Pel = { pelanggaran: number; terkunci: boolean; abaikan?: boolean }
type Status = { selesai: boolean; terkunci: boolean; pelanggaran: number; sisa_detik: number }
type Kirim = { ok: boolean; tampil_nilai: boolean; nilai: number | null }

const labelJenis: Record<string, string> = { uts: 'Ujian Tengah Semester', uas: 'Ujian Akhir Semester', lainnya: 'Asesmen' }
const huruf = 'ABCDEF'
const tunggu = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
const waktu = (detik: number) => `${dua(Math.floor(detik / 60))}:${dua(detik % 60)}`
const sudahDijawab = (s: SoalAd) => (s.jawaban ?? '').trim() !== ''

type NavigatorWake = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }

export default function AsesmenLayar({ jadwal, muatUlang }: { jadwal: JadwalSaya; muatUlang: () => Promise<void> }) {
  const [sesi, setSesi] = useState<Muat | null>(null)
  const [hasil, setHasil] = useState<Kirim | null>(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [token, setToken] = useState('')
  const [paham, setPaham] = useState(false)
  const [sisa, setSisa] = useState(0)
  const [no, setNo] = useState(0)
  const [ragu, setRagu] = useState<Set<string>>(new Set())
  const [panel, setPanel] = useState(false)
  const [pel, setPel] = useState<Pel>({ pelanggaran: 0, terkunci: false })
  const [peringatan, setPeringatan] = useState(false)
  const [perluLayar, setPerluLayar] = useState(false)
  const [konfirmasi, setKonfirmasi] = useState(false)
  const [simpan, setSimpan] = useState<'ok' | 'menyimpan' | 'tertunda'>('ok')

  const percobaanRef = useRef('')
  const akhir = useRef(0)
  const terkirim = useRef(false)
  const audio = useRef<AudioContext | null>(null)
  const layarAktif = useRef(false)
  const antrean = useRef<Record<string, string>>({})
  const sedangSimpan = useRef(false)
  const timerSimpan = useRef(0)
  const kirimRef = useRef<() => Promise<void>>(async () => undefined)
  const raguRef = useRef<Set<string>>(new Set())
  const percobaan = sesi?.percobaan_id ?? ''

  const bunyi = useCallback((ms = 1800) => {
    try {
      const ctx = audio.current
      if (ctx) {
        if (ctx.state === 'suspended') void ctx.resume()
        const t0 = ctx.currentTime
        const gain = ctx.createGain()
        gain.gain.value = 0.5
        gain.connect(ctx.destination)
        const n = Math.max(1, Math.floor(ms / 200))
        for (let i = 0; i < n; i++) {
          const o = ctx.createOscillator()
          o.type = 'square'
          o.frequency.value = i % 2 ? 660 : 990
          o.connect(gain)
          o.start(t0 + i * 0.2)
          o.stop(t0 + i * 0.2 + 0.16)
        }
      }
      if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300])
    } catch { /* tanpa suara */ }
  }, [])

  function siapkanSuara() {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AC) { audio.current = audio.current ?? new AC(); void audio.current.resume() }
    } catch { /* tanpa suara */ }
  }
  const keluarLayar = useCallback(() => {
    layarAktif.current = false
    try { if (document.fullscreenElement) void document.exitFullscreen() } catch { /* abaikan */ }
  }, [])

  // Penyimpanan jawaban: antrean di memori, dikirim ulang bila gagal (sinyal lemah).
  const flush = useCallback(async () => {
    const id = percobaanRef.current
    if (!id || sedangSimpan.current) return
    sedangSimpan.current = true
    try {
      let gagal = false
      for (const soalId of Object.keys(antrean.current)) {
        const nilai = antrean.current[soalId]
        try {
          const r = await panggil<{ ok: boolean; habis?: boolean; terkunci?: boolean }>('ad_siswa_jawab', { p_percobaan: id, p_soal: soalId, p_jawaban: nilai, p_ragu: raguRef.current.has(soalId) })
          if (r.habis) { void kirimRef.current(); return }
          if (r.terkunci) { gagal = true; continue }
          if (antrean.current[soalId] === nilai) delete antrean.current[soalId]
        } catch { gagal = true }
      }
      setSimpan(gagal ? 'tertunda' : Object.keys(antrean.current).length ? 'menyimpan' : 'ok')
    } finally { sedangSimpan.current = false }
  }, [])
  const jadwalFlush = useCallback((ms: number) => {
    setSimpan('menyimpan')
    window.clearTimeout(timerSimpan.current)
    timerSimpan.current = window.setTimeout(() => void flush(), ms)
  }, [flush])

  const kirim = useCallback(async () => {
    if (terkirim.current || !percobaanRef.current) return
    terkirim.current = true
    setSibuk(true); setKonfirmasi(false); setGalat('')
    try {
      for (let i = 0; i < 4 && Object.keys(antrean.current).length > 0; i++) {
        if (sedangSimpan.current) await tunggu(400); else await flush()
      }
      const r = await panggil<Kirim>('ad_siswa_kirim', { p_percobaan: percobaanRef.current })
      setHasil(r)
      setSesi(null)
      percobaanRef.current = ''
      keluarLayar()
      await muatUlang()
    } catch (e) { terkirim.current = false; setGalat((e as Error).message) }
    setSibuk(false)
  }, [flush, keluarLayar, muatUlang])
  useEffect(() => { kirimRef.current = kirim }, [kirim])

  async function mulai(e: FormEvent) {
    e.preventDefault()
    setGalat(''); setHasil(null); setSibuk(true)
    // Izin suara dan layar penuh hanya diberikan peramban untuk sentuhan siswa, jadi diminta sebelum menunggu server.
    siapkanSuara()
    if (typeof document.documentElement.requestFullscreen === 'function') void document.documentElement.requestFullscreen().catch(() => undefined)
    try {
      const r = await panggil<Muat>('ad_siswa_mulai', { p_peserta: jadwal.peserta_id, p_token: token })
      if (r.selesai) { keluarLayar(); await muatUlang(); setSibuk(false); return }
      akhir.current = Date.now() + r.sisa_detik * 1000
      terkirim.current = false
      antrean.current = {}
      percobaanRef.current = r.percobaan_id
      const awal = new Set<string>(r.soal.filter((x) => x.ragu).map((x) => x.id))
      try { (JSON.parse(sessionStorage.getItem(`asd-ragu-${r.percobaan_id}`) ?? '[]') as string[]).forEach((x) => awal.add(x)) } catch { /* abaikan */ }
      raguRef.current = awal
      setRagu(awal)
      setNo(0); setPanel(false); setPeringatan(false); setPerluLayar(false); setKonfirmasi(false); setSimpan('ok')
      setPel({ pelanggaran: r.pelanggaran, terkunci: r.terkunci })
      setSesi(r)
    } catch (er) { keluarLayar(); setGalat((er as Error).message) }
    setSibuk(false)
  }

  // Pewaktu: sisa waktu dihitung dari jawaban server, disinkronkan tiap denyut.
  useEffect(() => {
    if (!percobaan) return
    const tik = () => {
      const s = Math.max(0, Math.ceil((akhir.current - Date.now()) / 1000))
      setSisa(s)
      if (s <= 0) void kirimRef.current()
    }
    tik()
    const t = window.setInterval(tik, 1000)
    return () => window.clearInterval(t)
  }, [percobaan])

  // Denyut: status kunci dari server, sinkron waktu, dan kirim ulang jawaban yang tertunda.
  useEffect(() => {
    if (!percobaan) return
    const cek = async () => {
      try {
        const r = await panggil<Status>('ad_siswa_status', { p_percobaan: percobaan })
        akhir.current = Date.now() + r.sisa_detik * 1000
        setPel({ pelanggaran: r.pelanggaran, terkunci: r.terkunci })
        if (r.selesai) { void kirimRef.current(); return }
      } catch { /* jaringan putus, coba lagi */ }
      if (Object.keys(antrean.current).length > 0) void flush()
    }
    const t = window.setInterval(() => void cek(), 6000)
    const online = () => void flush()
    window.addEventListener('online', online)
    return () => { window.clearInterval(t); window.removeEventListener('online', online) }
  }, [percobaan, flush])

  // Deteksi meninggalkan halaman dan keluar layar penuh.
  useEffect(() => {
    if (!percobaan) return
    const state = { tab: false, layar: false }
    const siap = Date.now() + 3000
    layarAktif.current = !!document.fullscreenElement
    const lapor = async (jenis: 'pindah_tab' | 'keluar_layar') => {
      bunyi(1200)
      for (let i = 0; i < 4; i++) {
        try {
          const r = await panggil<Pel>('ad_siswa_pelanggaran', { p_percobaan: percobaan, p_jenis: jenis })
          setPel({ pelanggaran: r.pelanggaran, terkunci: r.terkunci })
          return
        } catch { await tunggu(1500) }
      }
    }
    const keluarTab = () => { if (state.tab || Date.now() < siap) return; state.tab = true; void lapor('pindah_tab') }
    const kembaliTab = () => { if (!state.tab) return; state.tab = false; bunyi(2200); setPeringatan(true) }
    const onVis = () => { if (document.hidden) keluarTab(); else kembaliTab() }
    const onFocus = () => { if (!document.hidden) kembaliTab() }
    const onFs = () => {
      if (document.fullscreenElement) { layarAktif.current = true; state.layar = false; setPerluLayar(false); return }
      if (!layarAktif.current || state.layar || Date.now() < siap) return
      state.layar = true; setPerluLayar(true); void lapor('keluar_layar'); bunyi(2200)
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', keluarTab)
    window.addEventListener('focus', onFocus)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', keluarTab)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [percobaan, bunyi])

  // Layar tetap menyala, cegah muat ulang tidak sengaja, kunci gulir halaman di belakang, blokir pintasan tertentu.
  useEffect(() => {
    if (!percobaan) return
    let kunci: { release: () => Promise<void> } | null = null
    const minta = async () => { try { const w = (navigator as NavigatorWake).wakeLock; if (w) kunci = await w.request('screen') } catch { /* tidak didukung */ } }
    void minta()
    const lagi = () => { if (!document.hidden) void minta() }
    const sebelum = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const tombol = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'u', 'v'].includes(e.key.toLowerCase())) e.preventDefault()
    }
    document.addEventListener('visibilitychange', lagi)
    window.addEventListener('beforeunload', sebelum)
    window.addEventListener('keydown', tombol)
    const awal = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('visibilitychange', lagi)
      window.removeEventListener('beforeunload', sebelum)
      window.removeEventListener('keydown', tombol)
      document.body.style.overflow = awal
      void kunci?.release()
    }
  }, [percobaan])

  useEffect(() => {
    raguRef.current = ragu
    if (!percobaan) return
    try { sessionStorage.setItem(`asd-ragu-${percobaan}`, JSON.stringify([...ragu])) } catch { /* abaikan */ }
  }, [ragu, percobaan])
  useEffect(() => () => window.clearTimeout(timerSimpan.current), [])

  function jawab(soalId: string, nilai: string, tunda: number) {
    setSesi((s) => (s ? { ...s, soal: s.soal.map((x) => (x.id === soalId ? { ...x, jawaban: nilai } : x)) } : s))
    antrean.current[soalId] = nilai
    jadwalFlush(tunda)
  }
  function tandaiRagu(soalId: string) {
    setRagu((r) => { const n = new Set(r); if (n.has(soalId)) n.delete(soalId); else n.add(soalId); return n })
  }
  function kembaliLayarPenuh() {
    try { void document.documentElement.requestFullscreen().catch(() => undefined) } catch { /* abaikan */ }
    setPerluLayar(false)
  }

  // ---------- Layar ujian ----------
  if (sesi) {
    const soal = sesi.soal
    const s = soal[Math.min(no, soal.length - 1)]
    const terjawab = soal.filter(sudahDijawab).length
    const jumlahRagu = soal.filter((x) => ragu.has(x.id)).length
    const batasPel = sesi.kunci_otomatis ? `${pel.pelanggaran} dari ${sesi.ambang}` : `${pel.pelanggaran}`
    return (
      <div className="cbt" role="application" aria-label={`Ujian ${sesi.ujian}`}
        onContextMenu={(e) => e.preventDefault()}
        onPaste={(e) => e.preventDefault()}
        onCopy={(e) => { if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault() }}
        onCut={(e) => { if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault() }}>
        <header className="cbt-atas">
          <div className="cbt-judul">
            <strong>{sesi.ujian}{sesi.mapel ? `: ${sesi.mapel}` : ''}</strong>
            <small>{labelJenis[sesi.jenis] ?? 'Asesmen'}</small>
          </div>
          <div className="cbt-atas-info">
            <span className={`cbt-lencana ${pel.pelanggaran > 0 ? 'cbt-lencana-awas' : ''}`} title="Jumlah kali meninggalkan halaman ujian">Pelanggaran {batasPel}</span>
            <span className={`cbt-lencana cbt-simpan-${simpan}`} aria-live="polite">
              {simpan === 'ok' ? 'Tersimpan' : simpan === 'menyimpan' ? 'Menyimpan...' : 'Menunggu sinyal'}
            </span>
            <div className={`cbt-waktu ${sisa <= 300 ? 'cbt-waktu-habis' : ''}`} role="timer" aria-label="Sisa waktu">
              <small>Sisa waktu</small>
              <strong>{waktu(sisa)}</strong>
            </div>
          </div>
        </header>

        <div className="cbt-badan">
          <main className="cbt-soal">
            {galat && <p className="catatan galat" role="alert">{galat}</p>}
            <div className="cbt-soal-kepala">
              <span className="cbt-soal-no">Soal No. {no + 1}</span>
            </div>
            <div className="cbt-soal-teks">{s.pertanyaan}</div>

            {s.tipe === 'pilgan' && (
              <div className="cbt-opsi-daftar" role="radiogroup" aria-label={`Pilihan jawaban soal ${no + 1}`}>
                {s.opsi.map((o, n) => (
                  <button key={o.i} type="button" role="radio" aria-checked={s.jawaban === String(o.i)}
                    className={`cbt-opsi ${s.jawaban === String(o.i) ? 'cbt-opsi-pilih' : ''}`} onClick={() => jawab(s.id, String(o.i), 150)}>
                    <span className="cbt-opsi-huruf">{huruf[n]}</span>
                    <span className="cbt-opsi-teks">{o.t}</span>
                  </button>
                ))}
              </div>
            )}
            {s.tipe === 'isian' && (
              <label className="cbt-isian">Jawaban
                <input maxLength={300} autoComplete="off" autoCorrect="off" spellCheck={false} value={s.jawaban ?? ''} placeholder="Ketik jawaban singkat" onChange={(e) => jawab(s.id, e.target.value, 1200)} />
              </label>
            )}
          </main>

          <aside className={`cbt-nomor ${panel ? 'buka' : ''}`} aria-label="Daftar soal">
            <h2>Daftar soal</h2>
            <div className="cbt-grid">
              {soal.map((x, i) => {
                const kelas = ['cbt-no']
                if (sudahDijawab(x)) kelas.push('cbt-no-jawab')
                if (ragu.has(x.id)) kelas.push('cbt-no-ragu')
                if (i === no) kelas.push('cbt-no-kini')
                return (
                  <button key={x.id} type="button" className={kelas.join(' ')} aria-label={`Soal ${i + 1}${sudahDijawab(x) ? ', terjawab' : ''}${ragu.has(x.id) ? ', ragu-ragu' : ''}`}
                    onClick={() => { setNo(i); setPanel(false) }}>{i + 1}</button>
                )
              })}
            </div>
            <ul className="cbt-legenda">
              <li><span className="cbt-no cbt-no-jawab" aria-hidden="true" />Terjawab ({terjawab})</li>
              <li><span className="cbt-no cbt-no-ragu" aria-hidden="true" />Ragu-ragu ({jumlahRagu})</li>
              <li><span className="cbt-no" aria-hidden="true" />Belum dijawab ({soal.length - terjawab})</li>
            </ul>
            <button type="button" className="cbt-tombol cbt-tombol-selesai" onClick={() => { setPanel(false); setKonfirmasi(true) }}>Selesai ujian</button>
          </aside>
        </div>

        <footer className="cbt-bawah">
          <button type="button" className="cbt-tombol" disabled={no === 0} onClick={() => setNo(no - 1)}>Sebelumnya</button>
          <label className="cbt-ragu">
            <input type="checkbox" checked={ragu.has(s.id)} onChange={() => tandaiRagu(s.id)} />
            Ragu-ragu
          </label>
          <button type="button" className="cbt-tombol cbt-tombol-daftar" onClick={() => setPanel(!panel)}>Daftar soal ({terjawab}/{soal.length})</button>
          {no < soal.length - 1
            ? <button type="button" className="cbt-tombol cbt-tombol-utama" onClick={() => setNo(no + 1)}>Berikutnya</button>
            : <button type="button" className="cbt-tombol cbt-tombol-utama" onClick={() => setKonfirmasi(true)}>Selesai</button>}
        </footer>

        {konfirmasi && (
          <div className="cbt-tabir" role="dialog" aria-modal="true" aria-label="Konfirmasi selesai">
            <div className="cbt-dialog">
              <h2>Kirim jawaban sekarang?</h2>
              <p>{terjawab} dari {soal.length} soal terjawab.{soal.length - terjawab > 0 ? ` ${soal.length - terjawab} soal masih kosong.` : ''}{jumlahRagu > 0 ? ` ${jumlahRagu} soal ditandai ragu-ragu.` : ''}</p>
              <p className="cbt-dialog-catatan">Setelah dikirim, jawaban tidak bisa diubah.</p>
              <div className="cbt-dialog-aksi">
                <button type="button" className="cbt-tombol" onClick={() => setKonfirmasi(false)}>Kembali ke soal</button>
                <button type="button" className="cbt-tombol cbt-tombol-utama" disabled={sibuk} onClick={() => void kirim()}>{sibuk ? 'Mengirim...' : 'Ya, kirim jawaban'}</button>
              </div>
            </div>
          </div>
        )}

        {peringatan && !pel.terkunci && !perluLayar && (
          <div className="cbt-tabir cbt-tabir-awas" role="alertdialog" aria-modal="true" aria-label="Peringatan">
            <div className="cbt-dialog">
              <h2>Peringatan</h2>
              <p>Anda meninggalkan halaman ujian. Kejadian ini tercatat dan dapat dilihat pengawas dan panitia.</p>
              <p className="cbt-dialog-angka">Pelanggaran {batasPel}</p>
              {sesi.kunci_otomatis && <p className="cbt-dialog-catatan">Setelah mencapai batas, ujian terkunci sampai pengawas membukanya. Waktu tetap berjalan.</p>}
              <div className="cbt-dialog-aksi">
                <button type="button" className="cbt-tombol cbt-tombol-utama" onClick={() => setPeringatan(false)}>Saya mengerti, kembali ke soal</button>
              </div>
            </div>
          </div>
        )}

        {perluLayar && !pel.terkunci && (
          <div className="cbt-tabir cbt-tabir-awas" role="alertdialog" aria-modal="true" aria-label="Layar penuh">
            <div className="cbt-dialog">
              <h2>Anda keluar dari layar penuh</h2>
              <p>Kejadian ini tercatat. Kembali ke layar penuh untuk melanjutkan ujian.</p>
              <p className="cbt-dialog-angka">Pelanggaran {batasPel}</p>
              <div className="cbt-dialog-aksi">
                <button type="button" className="cbt-tombol cbt-tombol-utama" onClick={kembaliLayarPenuh}>Kembali ke layar penuh</button>
              </div>
            </div>
          </div>
        )}

        {pel.terkunci && (
          <div className="cbt-tabir cbt-tabir-kunci" role="alertdialog" aria-modal="true" aria-label="Ujian dikunci">
            <div className="cbt-dialog">
              <h2>Ujian dikunci</h2>
              <p>Batas pelanggaran tercapai. Angkat tangan dan panggil pengawas. Layar ini terbuka sendiri setelah pengawas membuka kunci.</p>
              <p className="cbt-dialog-catatan">Waktu ujian tetap berjalan: sisa {waktu(sisa)}.</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------- Pintu masuk dan hasil ----------
  const selesai = !!jadwal.percobaan_selesai || !!hasil
  const bisaMulai = jadwal.status === 'aktif' && !selesai
  return (
    <>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {selesai && (
        <div className="kartu hasil">
          <h3 style={{ marginTop: 0 }}>Jawaban terkirim</h3>
          {(hasil?.tampil_nilai ?? jadwal.tampil_nilai)
            ? <p style={{ fontSize: '1.4rem', margin: 0 }}>Nilai {nilaiTeks(hasil?.nilai ?? jadwal.nilai)}</p>
            : <p style={{ margin: 0 }}>Nilai diumumkan oleh panitia.</p>}
        </div>
      )}
      {bisaMulai && (
        <form className="kartu form jarak" onSubmit={(e) => void mulai(e)}>
          <h3 style={{ marginTop: 0 }}>{labelJenis[jadwal.jenis] ?? 'Asesmen'}: {jadwal.ujian}</h3>
          <p>
            {jadwal.mapel ?? 'Mata pelajaran'}, {jadwal.durasi_menit} menit. {jadwal.sesi}, ruang {jadwal.ruang}{jadwal.no_kursi ? `, kursi ${jadwal.no_kursi}` : ''}.
          </p>
          <ul className="cbt-aturan">
            <li>Ujian terbuka di layar penuh. Jangan membuka tab, aplikasi, atau jendela lain.</li>
            <li>Berpindah tab atau keluar dari layar penuh membunyikan alarm dan tercatat. Pengawas melihat catatannya.</li>
            <li>Waktu berjalan di server. Menutup halaman tidak menghentikan waktu.</li>
            <li>Jawaban tersimpan otomatis. Bila sinyal putus, jawaban dikirim ulang saat tersambung.</li>
            <li>Naikkan volume perangkat, matikan mode senyap, dan isi daya sampai cukup.</li>
          </ul>
          <div className="aksi">
            <button type="button" className="tombol" style={biru} onClick={() => { siapkanSuara(); bunyi(1000) }}>Uji suara alarm</button>
          </div>
          <label>Token ujian
            <input className="cbt-token-input" required minLength={4} maxLength={8} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} placeholder="Token dari pengawas" />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400 }}>
            <input type="checkbox" checked={paham} onChange={(e) => setPaham(e.target.checked)} style={{ width: 'auto', marginTop: 5 }} />
            <span>Saya sudah membaca aturan di atas dan siap mengerjakan.</span>
          </label>
          <div className="aksi jarak">
            <button type="submit" className="tombol tombol-isi" disabled={sibuk || !paham || token.trim().length < 4}>
              {sibuk ? 'Memuat...' : jadwal.percobaan_id ? 'Lanjutkan ujian' : 'Mulai ujian'}
            </button>
          </div>
        </form>
      )}
      {!bisaMulai && !selesai && <div className="kartu"><p style={{ margin: 0 }}>Ujian ini belum dibuka atau sudah ditutup.</p></div>}
    </>
  )
}
