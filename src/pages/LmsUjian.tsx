import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { panggil } from '../lib/rpc'
import { biru, dua, merah, nilaiTeks, unduhCsv } from './lmsUtil'
import { TinjauSoal, type Asesmen, type Hasil, type Sesi, type SoalKerja } from './LmsKuis'

// Mode ujian bergaya CBT: layar penuh, token, penomoran soal, ragu-ragu, alarm dan pencatatan saat siswa
// meninggalkan halaman. Peramban tidak bisa mengurung siswa, jadi pelanggaran dideteksi, dibunyikan, dan dicatat.
// Semua data lewat fungsi basis data lms_ujian_*. Jawaban memakai lms_jawab_isi dan lms_kirim yang sama dengan kuis biasa.

type SesiUjian = Sesi & { pelanggaran: number; terkunci: boolean; ambang: number; kunci_otomatis: boolean; jenis: string }
type Pel = { pelanggaran: number; ambang: number; terkunci: boolean }
type StatusUjian = Pel & { selesai: boolean; sekarang: string }
type JawabSimpan = { ok: boolean; habis?: boolean; terkunci?: boolean }

const labelJenis: Record<string, string> = {
  kuis: 'Kuis', ulangan_harian: 'Ulangan harian', ulangan_tengah: 'Ulangan tengah semester', ulangan_semester: 'Ulangan akhir semester',
}
const huruf = 'ABCDEF'
const tunggu = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
const waktu = (detik: number) => `${dua(Math.floor(detik / 60))}:${dua(detik % 60)}`
const sudahDijawab = (s: SoalKerja) => (s.tipe === 'pilgan' ? s.pilihan !== null : (s.teks ?? '').trim() !== '')

type NavigatorWake = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }

export function UjianSiswa({ kelasId, a, muat }: { kelasId: string; a: Asesmen; muat: () => Promise<void> }) {
  const [sesi, setSesi] = useState<SesiUjian | null>(null)
  const [hasil, setHasil] = useState<Hasil | null>(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [token, setToken] = useState('')
  const [paham, setPaham] = useState(false)
  const [sisa, setSisa] = useState(0)
  const [no, setNo] = useState(0)
  const [ragu, setRagu] = useState<Set<string>>(new Set())
  const [panel, setPanel] = useState(false)
  const [pel, setPel] = useState<Pel>({ pelanggaran: 0, ambang: a.maks_pelanggaran, terkunci: false })
  const [peringatan, setPeringatan] = useState(false)
  const [perluLayar, setPerluLayar] = useState(false)
  const [konfirmasi, setKonfirmasi] = useState(false)
  const [simpan, setSimpan] = useState<'ok' | 'menyimpan' | 'tertunda'>('ok')

  const percobaanRef = useRef('')
  const selisih = useRef(0)
  const terkirim = useRef(false)
  const audio = useRef<AudioContext | null>(null)
  const layarAktif = useRef(false)
  const antrean = useRef<Record<string, { pilihan?: number; teks?: string }>>({})
  const sedangSimpan = useRef(false)
  const timerSimpan = useRef(0)
  const kirimRef = useRef<() => Promise<void>>(async () => undefined)
  const percobaan = sesi?.percobaan ?? ''

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
        const item = antrean.current[soalId]
        try {
          const r = await panggil<JawabSimpan>('lms_jawab_isi', { p_percobaan: id, p_soal: soalId, p_pilihan: item.pilihan ?? null, p_teks: item.teks ?? null })
          if (r.habis) { void kirimRef.current(); return }
          if (r.terkunci) { gagal = true; continue }
          if (antrean.current[soalId] === item) delete antrean.current[soalId]
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
      const r = await panggil<Hasil>('lms_kirim', { p_percobaan: percobaanRef.current })
      setHasil(r)
      setSesi(null)
      percobaanRef.current = ''
      keluarLayar()
      await muat()
    } catch (e) { terkirim.current = false; setGalat((e as Error).message) }
    setSibuk(false)
  }, [flush, keluarLayar, muat])
  useEffect(() => { kirimRef.current = kirim }, [kirim])

  async function mulai(e: FormEvent) {
    e.preventDefault()
    setGalat(''); setHasil(null); setSibuk(true)
    // Izin suara dan layar penuh hanya diberikan peramban untuk sentuhan siswa, jadi diminta sebelum menunggu server.
    siapkanSuara()
    const adaLayar = typeof document.documentElement.requestFullscreen === 'function'
    if (adaLayar) void document.documentElement.requestFullscreen().catch(() => undefined)
    try {
      const r = await panggil<SesiUjian>('lms_ujian_mulai', { p_asesmen: a.id, p_token: token })
      selisih.current = new Date(r.sekarang).getTime() - Date.now()
      terkirim.current = false
      antrean.current = {}
      percobaanRef.current = r.percobaan
      let simpanan: string[] = []
      try { simpanan = JSON.parse(sessionStorage.getItem(`cbt-ragu-${r.percobaan}`) ?? '[]') as string[] } catch { /* abaikan */ }
      setRagu(new Set(simpanan))
      setNo(0); setPanel(false); setPeringatan(false); setPerluLayar(false); setKonfirmasi(false); setSimpan('ok')
      setPel({ pelanggaran: r.pelanggaran, ambang: r.ambang, terkunci: r.terkunci })
      setSesi(r)
    } catch (er) { keluarLayar(); setGalat((er as Error).message) }
    setSibuk(false)
  }

  // Pewaktu: dihitung dari jam server.
  useEffect(() => {
    if (!sesi) return
    const batas = new Date(sesi.batas_waktu).getTime()
    const tik = () => {
      const s = Math.max(0, Math.ceil((batas - (Date.now() + selisih.current)) / 1000))
      setSisa(s)
      if (s <= 0) void kirimRef.current()
    }
    tik()
    const t = window.setInterval(tik, 1000)
    return () => window.clearInterval(t)
  }, [sesi?.percobaan, sesi?.batas_waktu]) // eslint-disable-line react-hooks/exhaustive-deps

  // Denyut: status kunci dari server, sinkron jam, dan kirim ulang jawaban yang tertunda.
  useEffect(() => {
    if (!percobaan) return
    const cek = async () => {
      try {
        const r = await panggil<StatusUjian>('lms_ujian_status', { p_percobaan: percobaan })
        selisih.current = new Date(r.sekarang).getTime() - Date.now()
        setPel({ pelanggaran: r.pelanggaran, ambang: r.ambang, terkunci: r.terkunci })
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
          const r = await panggil<Pel & { selesai: boolean }>('lms_ujian_pelanggaran', { p_percobaan: percobaan, p_jenis: jenis })
          setPel({ pelanggaran: r.pelanggaran, ambang: r.ambang, terkunci: r.terkunci })
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
    if (!percobaan) return
    try { sessionStorage.setItem(`cbt-ragu-${percobaan}`, JSON.stringify([...ragu])) } catch { /* abaikan */ }
  }, [ragu, percobaan])
  useEffect(() => () => window.clearTimeout(timerSimpan.current), [])

  function ubahSoal(soalId: string, patch: Partial<SoalKerja>) {
    setSesi((s) => (s ? { ...s, soal: s.soal.map((x) => (x.soal_id === soalId ? { ...x, ...patch } : x)) } : s))
  }
  function pilih(soalId: string, n: number) {
    ubahSoal(soalId, { pilihan: n })
    antrean.current[soalId] = { pilihan: n }
    jadwalFlush(150)
  }
  function ketik(soalId: string, teks: string) {
    ubahSoal(soalId, { teks })
    antrean.current[soalId] = { teks }
    jadwalFlush(1200)
  }
  function tandaiRagu(soalId: string) {
    setRagu((r) => { const n = new Set(r); if (n.has(soalId)) n.delete(soalId); else n.add(soalId); return n })
  }
  function kembaliLayarPenuh() {
    try { void document.documentElement.requestFullscreen().catch(() => undefined) } catch { /* abaikan */ }
    setPerluLayar(false)
  }

  const sisaKesempatan = a.maks_percobaan - (a.percobaan_selesai ?? 0)
  const lulus = hasil && hasil.kkm !== null && hasil.nilai !== null ? hasil.nilai >= hasil.kkm : null

  // ---------- Layar ujian ----------
  if (sesi) {
    const soal = sesi.soal
    const s = soal[Math.min(no, soal.length - 1)]
    const terjawab = soal.filter(sudahDijawab).length
    const jumlahRagu = soal.filter((x) => ragu.has(x.soal_id)).length
    const batasPel = sesi.kunci_otomatis ? `${pel.pelanggaran} dari ${pel.ambang}` : `${pel.pelanggaran}`
    return (
      <div className="cbt" role="application" aria-label={`Ujian ${sesi.judul}`}
        onContextMenu={(e) => e.preventDefault()}
        onPaste={(e) => e.preventDefault()}
        onCopy={(e) => { if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault() }}
        onCut={(e) => { if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault() }}>
        <header className="cbt-atas">
          <div className="cbt-judul">
            <strong>{sesi.judul}</strong>
            <small>{labelJenis[sesi.jenis] ?? 'Ujian'}</small>
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
            {sesi.petunjuk && no === 0 && <p className="cbt-petunjuk">{sesi.petunjuk}</p>}
            {galat && <p className="catatan galat" role="alert">{galat}</p>}
            <div className="cbt-soal-kepala">
              <span className="cbt-soal-no">Soal No. {no + 1}</span>
              <span className="cbt-soal-bobot">Bobot {s.bobot}</span>
            </div>
            <div className="cbt-soal-teks">{s.pertanyaan}</div>

            {s.tipe === 'pilgan' && (
              <div className="cbt-opsi-daftar" role="radiogroup" aria-label={`Pilihan jawaban soal ${no + 1}`}>
                {(s.opsi ?? []).map((o, n) => (
                  <button key={n} type="button" role="radio" aria-checked={s.pilihan === n}
                    className={`cbt-opsi ${s.pilihan === n ? 'cbt-opsi-pilih' : ''}`} onClick={() => pilih(s.soal_id, n)}>
                    <span className="cbt-opsi-huruf">{huruf[n]}</span>
                    <span className="cbt-opsi-teks">{o}</span>
                  </button>
                ))}
              </div>
            )}
            {s.tipe === 'isian' && (
              <label className="cbt-isian">Jawaban
                <input maxLength={300} autoComplete="off" autoCorrect="off" spellCheck={false} value={s.teks ?? ''} placeholder="Ketik jawaban singkat" onChange={(e) => ketik(s.soal_id, e.target.value)} />
              </label>
            )}
            {s.tipe === 'esai' && (
              <label className="cbt-isian">Jawaban
                {s.rubrik && s.rubrik.length > 0 && (
                  <small className="cbt-rubrik">Penilaian: {s.rubrik.map((r) => `${r.kriteria} (${r.skor_maks})`).join(', ')}.</small>
                )}
                <textarea rows={10} maxLength={5000} spellCheck={false} value={s.teks ?? ''} placeholder="Tulis jawaban Anda" onChange={(e) => ketik(s.soal_id, e.target.value)} />
              </label>
            )}
          </main>

          <aside className={`cbt-nomor ${panel ? 'buka' : ''}`} aria-label="Daftar soal">
            <h2>Daftar soal</h2>
            <div className="cbt-grid">
              {soal.map((x, i) => {
                const kelas = ['cbt-no']
                if (sudahDijawab(x)) kelas.push('cbt-no-jawab')
                if (ragu.has(x.soal_id)) kelas.push('cbt-no-ragu')
                if (i === no) kelas.push('cbt-no-kini')
                return (
                  <button key={x.soal_id} type="button" className={kelas.join(' ')} aria-label={`Soal ${i + 1}${sudahDijawab(x) ? ', terjawab' : ''}${ragu.has(x.soal_id) ? ', ragu-ragu' : ''}`}
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
            <input type="checkbox" checked={ragu.has(s.soal_id)} onChange={() => tandaiRagu(s.soal_id)} />
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
              <p>Anda meninggalkan halaman ujian. Kejadian ini tercatat dan dapat dilihat guru.</p>
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
  return (
    <>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
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
      {hasil?.tinjau && hasil.tinjau.map((x, i) => <TinjauSoal key={x.soal_id} s={x} i={i} />)}
      {!hasil && (a.berjalan || sisaKesempatan > 0) && (
        <form className="kartu form jarak" onSubmit={(e) => void mulai(e)}>
          <h3 style={{ marginTop: 0 }}>{labelJenis[a.jenis] ?? 'Ujian'}: tampilan CBT</h3>
          <p>
            {a.jumlah_tampil ? Math.min(a.jumlah_tampil, a.jumlah_soal) : a.jumlah_soal} soal, {a.durasi_menit} menit.
            {a.kkm !== null ? ` KKM ${nilaiTeks(a.kkm)}.` : ''}
            {a.percobaan_selesai ? ` ${a.percobaan_selesai} dari ${a.maks_percobaan} kesempatan terpakai.` : ''}
          </p>
          {a.petunjuk && <p>{a.petunjuk}</p>}
          <ul className="cbt-aturan">
            <li>Ujian terbuka di layar penuh. Jangan membuka tab, aplikasi, atau jendela lain.</li>
            <li>Berpindah tab atau keluar dari layar penuh membunyikan alarm dan tercatat. Guru melihat catatannya.</li>
            {a.kunci_otomatis && <li>Setelah {a.maks_pelanggaran} kali, ujian terkunci sampai pengawas membukanya.</li>}
            <li>Waktu berjalan di server. Menutup halaman tidak menghentikan waktu.</li>
            <li>Jawaban tersimpan otomatis. Bila sinyal putus, jawaban dikirim ulang saat tersambung.</li>
            <li>Naikkan volume perangkat dan pastikan tidak dalam mode senyap.</li>
          </ul>
          <div className="aksi">
            <button type="button" className="tombol" style={biru} onClick={() => { siapkanSuara(); bunyi(1000) }}>Uji suara alarm</button>
          </div>
          {!a.berjalan && (
            <label>Token ujian
              <input className="cbt-token-input" required minLength={4} maxLength={8} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} placeholder="Token dari pengawas" />
            </label>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400 }}>
            <input type="checkbox" checked={paham} onChange={(e) => setPaham(e.target.checked)} style={{ width: 'auto', marginTop: 5 }} />
            <span>Saya sudah membaca aturan di atas dan siap mengerjakan.</span>
          </label>
          <div className="aksi jarak">
            <button type="submit" className="tombol tombol-isi" disabled={sibuk || !paham || (!a.berjalan && token.trim().length < 4)}>
              {sibuk ? 'Memuat...' : a.berjalan ? 'Lanjutkan ujian' : 'Mulai ujian'}
            </button>
          </div>
        </form>
      )}
      {!hasil && !a.berjalan && sisaKesempatan <= 0 && (
        <div className="kartu">
          <p style={{ marginTop: 0 }}>Kesempatan mengerjakan sudah habis.</p>
          {a.percobaan_selesai ? (
            <p style={{ marginBottom: 0 }}>
              {a.menunggu_koreksi && a.nilai_terbaik === null ? 'Jawaban Anda menunggu koreksi guru.' : <>Nilai terbaik Anda: <strong>{nilaiTeks(a.nilai_terbaik)}</strong>.</>}
            </p>
          ) : null}
        </div>
      )}
      <p className="catatan jarak"><Link to={`/portal/lms/${kelasId}`}>Kembali ke kelas</Link></p>
    </>
  )
}

// ---------- Sisi guru dan pengawas ----------

type BarisPantau = {
  peserta_didik_id: string; nama: string; no_urut: number | null; percobaan_id: string | null
  status: 'belum' | 'mengerjakan' | 'selesai'; terjawab: number; total_soal: number; pelanggaran: number; terkunci: boolean
  sisa_detik: number | null; kejadian: { jenis: 'pindah_tab' | 'keluar_layar'; waktu: string }[]
}
const labelKejadian = { pindah_tab: 'Pindah tab', keluar_layar: 'Keluar layar penuh' }
const jamWib = (x: string) => new Date(x).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function PantauUjian({ a }: { a: Asesmen }) {
  const [baris, setBaris] = useState<BarisPantau[] | null>(null)
  const [galat, setGalat] = useState('')
  const [otomatis, setOtomatis] = useState(true)
  const muatPantau = useCallback(async () => {
    try {
      const r = await panggil<{ siswa: BarisPantau[] }>('lms_ujian_pantau', { p_asesmen: a.id })
      setBaris(r.siswa); setGalat('')
    } catch (e) { setGalat((e as Error).message) }
  }, [a.id])
  useEffect(() => {
    void muatPantau()
    if (!otomatis) return
    const t = window.setInterval(() => { if (!document.hidden) void muatPantau() }, 5000)
    return () => window.clearInterval(t)
  }, [muatPantau, otomatis])
  async function kunci(id: string, nilai: boolean) {
    try { await panggil('lms_ujian_kunci', { p_percobaan: id, p_kunci: nilai }); await muatPantau() } catch (e) { setGalat((e as Error).message) }
  }
  const semua = baris ?? []
  const ringkas = {
    mengerjakan: semua.filter((x) => x.status === 'mengerjakan').length,
    selesai: semua.filter((x) => x.status === 'selesai').length,
    belum: semua.filter((x) => x.status === 'belum').length,
    terkunci: semua.filter((x) => x.terkunci && x.status === 'mengerjakan').length,
  }
  return (
    <div className="kartu jarak">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Pantau langsung</h3>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" checked={otomatis} onChange={(e) => setOtomatis(e.target.checked)} style={{ width: 'auto' }} /> Segarkan tiap 5 detik
        </label>
      </div>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      <p className="catatan">
        Mengerjakan {ringkas.mengerjakan}, selesai {ringkas.selesai}, belum masuk {ringkas.belum}
        {ringkas.terkunci > 0 ? `, terkunci ${ringkas.terkunci}` : ''}.
      </p>
      {!baris && <p className="catatan">Memuat...</p>}
      {baris && (
        <div className="tabel-bungkus">
          <table>
            <thead><tr><th>No</th><th>Nama</th><th>Status</th><th>Terjawab</th><th>Sisa</th><th>Pelanggaran</th><th>Aksi</th></tr></thead>
            <tbody>
              {baris.map((b, i) => (
                <tr key={b.peserta_didik_id}>
                  <td>{b.no_urut ?? i + 1}</td>
                  <td>
                    {b.nama}
                    {b.kejadian.length > 0 && (
                      <details><summary><small>Lihat kejadian</small></summary>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                          {b.kejadian.map((k, n) => <li key={n}><small>{jamWib(k.waktu)} {labelKejadian[k.jenis]}</small></li>)}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td>
                    <span className={`status ${b.status === 'selesai' ? 'status-selesai' : b.status === 'mengerjakan' ? 'status-menunggu' : 'status-dibatalkan'}`}>
                      {b.status === 'selesai' ? 'Selesai' : b.status === 'mengerjakan' ? (b.terkunci ? 'Terkunci' : 'Mengerjakan') : 'Belum masuk'}
                    </span>
                  </td>
                  <td>{b.status === 'belum' ? '-' : `${b.terjawab}/${b.total_soal}`}</td>
                  <td>{b.sisa_detik !== null ? waktu(b.sisa_detik) : '-'}</td>
                  <td style={b.pelanggaran > 0 ? { color: '#8a1f1f', fontWeight: 700 } : undefined}>{b.pelanggaran}</td>
                  <td>
                    {b.status === 'mengerjakan' && b.percobaan_id && (
                      b.terkunci
                        ? <button className="tombol" style={biru} onClick={() => void kunci(b.percobaan_id as string, false)}>Buka kunci</button>
                        : <button className="tombol" style={merah} onClick={() => void kunci(b.percobaan_id as string, true)}>Kunci</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {baris && baris.length > 0 && (
        <div className="aksi jarak">
          <button className="tombol" style={biru} onClick={() => unduhCsv(`pantau-ujian-${a.judul}.csv`, [
            ['No', 'Nama', 'Status', 'Terjawab', 'Total soal', 'Pelanggaran', 'Terkunci'],
            ...baris.map((b, i) => [b.no_urut ?? i + 1, b.nama, b.status, b.terjawab, b.total_soal, b.pelanggaran, b.terkunci ? 'ya' : 'tidak']),
          ])}>Unduh CSV</button>
        </div>
      )}
    </div>
  )
}

export function PanelUjianGuru({ a, muat }: { a: Asesmen; muat: () => Promise<void> }) {
  const [aktif, setAktif] = useState(a.mode_ujian)
  const [maks, setMaks] = useState(a.maks_pelanggaran)
  const [kunci, setKunci] = useState(a.kunci_otomatis)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  async function simpan(tokenBaru: boolean) {
    setSibuk(true); setGalat(''); setInfo('')
    try {
      await panggil('lms_ujian_atur', { p_asesmen: a.id, p_aktif: aktif, p_maks: maks, p_kunci: kunci, p_token_baru: tokenBaru })
      await muat()
      setInfo(tokenBaru ? 'Token baru dibuat.' : 'Pengaturan mode ujian disimpan.')
    } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  return (
    <>
      <div className="kartu jarak">
        <h3 style={{ marginTop: 0 }}>Mode ujian (tampilan CBT)</h3>
        <p className="catatan">
          Siswa mengerjakan di layar penuh dengan token, nomor soal, dan penanda ragu-ragu. Berpindah tab atau keluar layar penuh membunyikan alarm dan tercatat.
          Peramban tidak bisa memblokir aplikasi lain atau layar terbagi di HP, jadi awasi juga secara langsung.
        </p>
        {galat && <p className="catatan galat" role="alert">{galat}</p>}
        {info && <p className="catatan" role="status">{info}</p>}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
          <input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} style={{ width: 'auto' }} /> Aktifkan mode ujian untuk {labelJenis[a.jenis] ?? 'ujian ini'}
        </label>
        {aktif && (
          <div className="grid grid-2 jarak">
            <label>Batas pelanggaran
              <input type="number" min={1} max={20} value={maks} onChange={(e) => setMaks(Number(e.target.value))} />
              <span className="petunjuk">Jumlah kali siswa boleh meninggalkan halaman sebelum ditandai atau dikunci.</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 400 }}>
              <input type="checkbox" checked={kunci} onChange={(e) => setKunci(e.target.checked)} style={{ width: 'auto', marginTop: 5 }} />
              <span>Kunci otomatis saat batas tercapai. Bila tidak dicentang, pelanggaran hanya dicatat untuk guru. Disarankan tidak dicentang pada uji coba pertama, karena telepon masuk dan notifikasi juga bisa memicu pelanggaran.</span>
            </label>
          </div>
        )}
        <div className="aksi jarak">
          <button className="tombol tombol-isi" disabled={sibuk} onClick={() => void simpan(false)}>{sibuk ? 'Menyimpan...' : 'Simpan mode ujian'}</button>
        </div>
        {a.mode_ujian && a.token_ujian && (
          <div className="cbt-token-kotak jarak">
            <small>Token ujian (bagikan kepada siswa saat ujian dimulai)</small>
            <strong className="cbt-token">{a.token_ujian}</strong>
            <div className="aksi">
              <button className="tombol" style={biru} disabled={sibuk} onClick={() => void navigator.clipboard?.writeText(a.token_ujian ?? '')}>Salin token</button>
              <button className="tombol" style={biru} disabled={sibuk} onClick={() => void simpan(true)}>Buat token baru</button>
            </div>
          </div>
        )}
      </div>
      {a.mode_ujian && a.status === 'terbit' && <PantauUjian a={a} />}
    </>
  )
}
