import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { panggil, tglJam } from '../lib/rpc'
import Ikon from '../components/Ikon'

// Forum diskusi per pertemuan, bergaya media sosial: kiriman, komentar, dan balasan komentar.
// Teks biasa. Hanya yang sudah lolos gerbang absen yang bisa membuka.

type Topik = {
  id: string; judul: string; isi: string; penulis_nama: string; penulis_peran: string
  dikunci: boolean; dibuat_pada: string; milik_saya: boolean; jumlah_balasan: number; terakhir: string
}
type Balasan = {
  id: string; isi: string; penulis_nama: string; penulis_peran: string; dibuat_pada: string; milik_saya: boolean
  induk_id?: string | null; balas_ke?: string | null
}

const WARNA = ['#1a3e6f', '#0f766e', '#7c3aed', '#b45309', '#be185d', '#1d4ed8', '#4d7c0f']
const inisial = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?'
const warna = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return WARNA[h % WARNA.length] }

function Avatar({ nama, kecil }: { nama: string; kecil?: boolean }) {
  return <span className={`forum-avatar${kecil ? ' forum-avatar-kecil' : ''}`} style={{ background: warna(nama) }} aria-hidden="true">{inisial(nama)}</span>
}

/** "baru saja", "5 menit lalu", "2 jam lalu", "3 hari lalu"; lebih lama dari seminggu memakai tanggal. */
function waktuRingkas(iso: string): string {
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (d < 60) return 'baru saja'
  if (d < 3600) return `${Math.floor(d / 60)} menit lalu`
  if (d < 86400) return `${Math.floor(d / 3600)} jam lalu`
  if (d < 7 * 86400) return `${Math.floor(d / 86400)} hari lalu`
  return tglJam(iso)
}

/** Judul topik diambil dari baris pertama tulisan, karena kiriman gaya media sosial tidak memakai kolom judul. */
function judulDari(isi: string): string {
  const baris = isi.trim().split('\n')[0]
  return baris.length > 80 ? `${baris.slice(0, 79).trimEnd()}…` : baris
}

function NamaPenulis({ nama, peran }: { nama: string; peran: string }) {
  return <><strong>{nama}</strong>{peran === 'guru' && <span className="forum-guru">Guru</span>}</>
}

/** Kotak tulis: satu kolom, tombol kirim muncul saat ada isi. */
function KotakTulis({ nama, placeholder, kirim, batal, fokus, label }: {
  nama: string; placeholder: string; kirim: (isi: string) => Promise<void>; batal?: () => void; fokus?: boolean; label: string
}) {
  const [isi, setIsi] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!isi.trim()) return
    setSibuk(true); setGalat('')
    try { await kirim(isi); setIsi(''); batal?.() } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <form className="forum-tulis" onSubmit={submit}>
      <Avatar nama={nama} kecil />
      <div className="forum-tulis-isi">
        <textarea aria-label={label} required rows={isi || fokus ? 3 : 1} maxLength={5000} autoFocus={fokus} value={isi}
          placeholder={placeholder} onChange={(e) => setIsi(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit() }} />
        {galat && <p className="catatan galat" role="alert">{galat}</p>}
        {(isi || batal) && (
          <div className="forum-tulis-aksi">
            {batal && <button type="button" className="forum-tautan" onClick={batal}>Batal</button>}
            <button className="tombol tombol-isi forum-kirim" disabled={sibuk || !isi.trim()}><Ikon nama="kirim" ukuran={14} /> {sibuk ? 'Mengirim...' : 'Kirim'}</button>
          </div>
        )}
      </div>
    </form>
  )
}

function Komentar({ b, balasan, terkunci, kelola, nama, balas, hapus }: {
  b: Balasan; balasan: Balasan[]; terkunci: boolean; kelola: boolean; nama: string
  balas: (isi: string, induk: string) => Promise<void>; hapus: (id: string) => void
}) {
  const [membalas, setMembalas] = useState<string | null>(null)
  const bolehHapus = (x: Balasan) => kelola || x.milik_saya
  const baris = (x: Balasan, anak: boolean) => (
    <div className={anak ? 'forum-komentar forum-balasan' : 'forum-komentar'} key={x.id}>
      <Avatar nama={x.penulis_nama} kecil />
      <div className="forum-komentar-isi">
        <div className="forum-gelembung">
          <div className="forum-nama"><NamaPenulis nama={x.penulis_nama} peran={x.penulis_peran} /></div>
          <p>{anak && x.balas_ke && x.balas_ke !== x.penulis_nama && <span className="forum-sebut">@{x.balas_ke} </span>}{x.isi}</p>
        </div>
        <div className="forum-aksi">
          <span title={tglJam(x.dibuat_pada)}>{waktuRingkas(x.dibuat_pada)}</span>
          {!terkunci && <button type="button" className="forum-tautan" onClick={() => setMembalas(membalas === x.id ? null : x.id)}>Balas</button>}
          {bolehHapus(x) && <button type="button" className="forum-tautan forum-hapus" onClick={() => hapus(x.id)}>Hapus</button>}
        </div>
        {membalas === x.id && (
          <KotakTulis nama={nama} fokus label={`Balasan untuk ${x.penulis_nama}`} placeholder={`Balas ${x.penulis_nama}...`}
            kirim={(isi) => balas(isi, x.id)} batal={() => setMembalas(null)} />
        )}
      </div>
    </div>
  )
  return (
    <div className="forum-utas">
      {baris(b, false)}
      {balasan.length > 0 && <div className="forum-anak">{balasan.map((x) => baris(x, true))}</div>}
    </div>
  )
}

function Kiriman({ t, kelola, nama, muat, bukaAwal }: { t: Topik; kelola: boolean; nama: string; muat: () => Promise<void>; bukaAwal: boolean }) {
  const [buka, setBuka] = useState(bukaAwal)
  const [daftar, setDaftar] = useState<Balasan[] | null>(null)
  const [galat, setGalat] = useState('')
  const muatBalasan = useCallback(async () => {
    try { setDaftar(await panggil<Balasan[]>('lms_forum_balasan_daftar', { p_topik: t.id })) } catch (e) { setGalat((e as Error).message) }
  }, [t.id])
  useEffect(() => { if (buka) void muatBalasan() }, [buka, muatBalasan])

  // Komentar utama terbaru di atas, balasan di bawah komentarnya berurutan dari yang lama.
  const { utama, anak } = useMemo(() => {
    const semua = daftar ?? []
    const ids = new Set(semua.map((x) => x.id))
    const utama = semua.filter((x) => !x.induk_id || !ids.has(x.induk_id)).slice().reverse()
    const anak = new Map<string, Balasan[]>()
    for (const x of semua) if (x.induk_id && ids.has(x.induk_id)) anak.set(x.induk_id, [...(anak.get(x.induk_id) ?? []), x])
    return { utama, anak }
  }, [daftar])

  async function kirimKomentar(isi: string, induk?: string) {
    await panggil('lms_forum_balas', { p_topik: t.id, p_isi: isi, ...(induk ? { p_induk: induk } : {}) })
    await muatBalasan(); await muat()
  }
  async function hapus(jenis: 'topik' | 'balasan', id: string) {
    if (!window.confirm(jenis === 'topik' ? 'Hapus kiriman ini beserta komentarnya dari tampilan?' : 'Hapus komentar ini? Balasan di bawahnya ikut terhapus.')) return
    setGalat('')
    try { await panggil('lms_forum_hapus', { p_jenis: jenis, p_id: id }); if (jenis === 'topik') await muat(); else { await muatBalasan(); await muat() } } catch (e) { setGalat((e as Error).message) }
  }
  async function kunci() {
    setGalat('')
    try { await panggil('lms_forum_kunci', { p_topik: t.id, p_kunci: !t.dikunci }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  const tampilJudul = !t.isi.trim().startsWith(t.judul.replace(/…$/, ''))
  const terkunci = t.dikunci && !kelola
  return (
    <article className={`kartu forum-kiriman${t.penulis_peran === 'guru' ? ' forum-kiriman-guru' : ''}`}>
      <header className="forum-kepala">
        <Avatar nama={t.penulis_nama} />
        <div>
          <div className="forum-nama"><NamaPenulis nama={t.penulis_nama} peran={t.penulis_peran} />{t.dikunci && <span className="status status-dibatalkan">Dikunci</span>}</div>
          <small title={tglJam(t.dibuat_pada)}>{waktuRingkas(t.dibuat_pada)}</small>
        </div>
        {(kelola || t.milik_saya) && (
          <div className="forum-kepala-aksi">
            {kelola && <button type="button" className="forum-tautan" onClick={() => void kunci()}>{t.dikunci ? 'Buka kunci' : 'Kunci'}</button>}
            <button type="button" className="forum-tautan forum-hapus" onClick={() => void hapus('topik', t.id)}>Hapus</button>
          </div>
        )}
      </header>
      {tampilJudul && <h3 className="forum-judul">{t.judul}</h3>}
      <p className="forum-teks">{t.isi}</p>
      <button type="button" className="forum-hitung" aria-expanded={buka} onClick={() => setBuka(!buka)}>
        {buka ? 'Sembunyikan komentar' : t.jumlah_balasan > 0 ? `Lihat ${t.jumlah_balasan} komentar` : 'Tulis komentar'}
        {buka && t.jumlah_balasan > 0 ? ` (${t.jumlah_balasan})` : ''}
      </button>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {buka && (
        <div className="forum-komentar-daftar">
          {terkunci
            ? <p className="catatan">Diskusi ini dikunci guru.</p>
            : <KotakTulis nama={nama} label="Tulis komentar" placeholder="Tulis komentar atau jawaban..." kirim={(isi) => kirimKomentar(isi)} />}
          {!daftar && !galat && <p className="catatan">Memuat...</p>}
          {daftar && utama.length === 0 && <p className="catatan">Belum ada komentar. Jadilah yang pertama.</p>}
          {utama.map((b) => (
            <Komentar key={b.id} b={b} balasan={anak.get(b.id) ?? []} terkunci={terkunci} kelola={kelola} nama={nama}
              balas={(isi, induk) => kirimKomentar(isi, induk)} hapus={(id) => void hapus('balasan', id)} />
          ))}
        </div>
      )}
    </article>
  )
}

/** Forum satu pertemuan. Kiriman pembuka dari guru tampil di atas dan langsung terbuka. */
export function Forum({ pertemuanId, kelola, setelah, nama }: { pertemuanId: string; kelola: boolean; setelah?: () => void; nama?: string }) {
  const [daftar, setDaftar] = useState<Topik[] | null>(null)
  const [galat, setGalat] = useState('')
  const muat = useCallback(async () => {
    try { setDaftar(await panggil<Topik[]>('lms_forum_daftar', { p_pertemuan: pertemuanId })) } catch (e) { setGalat((e as Error).message) }
  }, [pertemuanId])
  useEffect(() => { void muat() }, [muat])
  const sesudahAksi = useCallback(async () => { await muat(); setelah?.() }, [muat, setelah])
  const [namaSaya, setNamaSaya] = useState<string | null>(null)
  useEffect(() => {
    if (nama) return
    panggil<string | null>('nama_saya').then(setNamaSaya).catch(() => setNamaSaya(null))
  }, [nama])
  const saya = nama ?? namaSaya ?? (kelola ? 'Guru' : 'Saya')

  async function kirimKiriman(isi: string) {
    await panggil('lms_forum_buat', { p_pertemuan: pertemuanId, p_judul: judulDari(isi), p_isi: isi })
    await sesudahAksi()
  }
  // Kiriman guru (pembuka diskusi) di atas, sisanya menurut aktivitas terbaru.
  const urut = useMemo(() => {
    const d = daftar ?? []
    return [...d.filter((x) => x.penulis_peran === 'guru').reverse(), ...d.filter((x) => x.penulis_peran !== 'guru')]
  }, [daftar])
  return (
    <section className="forum" aria-label="Forum diskusi">
      <div className="judul-bagian jarak"><h2>Diskusi</h2></div>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      <div className="kartu forum-baru">
        <KotakTulis nama={saya} label="Tulis kiriman baru" placeholder="Punya pertanyaan atau pendapat? Tulis di sini..." kirim={kirimKiriman} />
      </div>
      {!daftar && !galat && <p className="catatan">Memuat...</p>}
      {daftar && daftar.length === 0 && <div className="kartu"><p className="catatan">Belum ada diskusi. Jadilah yang pertama bertanya.</p></div>}
      {urut.map((t, i) => <Kiriman key={t.id} t={t} kelola={kelola} nama={saya} muat={sesudahAksi} bukaAwal={i === 0} />)}
    </section>
  )
}
