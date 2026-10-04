import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil, tgl } from '../lib/rpc'
import { htmlAman } from '../lib/dokumen'
import { LembarSiswa, LembarPratinjau } from './LmsLembar'
import { LatihanPertemuan } from './LmsKuis'
import { Forum } from './LmsForum'

export type Materi = { id: string; urutan: number; jenis: 'teks' | 'video' | 'tautan' | 'berkas'; judul: string; isi: string | null; url: string | null; selesai: boolean; format: 'teks' | 'html'; untuk: 'siswa' | 'guru'; tugas_id?: string | null }

const labelJenis: Record<string, string> = { teks: 'Bacaan', video: 'Video', tautan: 'Tautan', berkas: 'Berkas' }

/** Mengambil id video YouTube dari tautan biasa. Hanya pola 11 karakter yang diterima. */
function idYoutube(url: string): string | null {
  try {
    const u = new URL(url)
    let id: string | null = null
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1)
    else if (u.hostname.endsWith('youtube.com')) id = u.searchParams.get('v') ?? (u.pathname.startsWith('/embed/') ? u.pathname.slice(7) : null)
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}

export function IsiMateri({ m, siswa, selesai, pratinjau }: { m: Materi; siswa: boolean; selesai: (id: string) => Promise<void>; pratinjau?: boolean }) {
  if (pratinjau && m.tugas_id && m.format === 'html') return <LembarPratinjau html={m.isi ?? ''} judul={m.judul} />
  if (siswa && m.tugas_id && m.format === 'html') return <LembarSiswa tugasId={m.tugas_id} html={m.isi ?? ''} judul={m.judul} />
  const yt = m.jenis === 'video' && m.url ? idYoutube(m.url) : null
  return (
    <div className="kartu jarak">
      <div className="lencana-baris">
        <span className="lencana">{m.jenis === 'teks' && m.format === 'html' ? 'Dokumen' : labelJenis[m.jenis]}</span>
        {m.untuk === 'guru' && <span className="status status-menunggu">Khusus guru, siswa tidak melihat</span>}
        {m.tugas_id && !siswa && <span className="status status-selesai">Lembar kerja, siswa mengisi di sini</span>}
        {m.selesai && <span className="status status-selesai">Selesai dibaca</span>}
      </div>
      <h3>{m.judul}</h3>
      {m.jenis === 'teks' && m.format === 'html' && <div className="dokumen" dangerouslySetInnerHTML={{ __html: htmlAman(m.isi ?? '') }} />}
      {m.jenis === 'teks' && m.format !== 'html' && <div style={{ whiteSpace: 'pre-wrap' }}>{m.isi}</div>}
      {yt && (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
          <iframe
            title={m.judul}
            src={`https://www.youtube-nocookie.com/embed/${yt}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: 8 }}
            allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {m.jenis !== 'teks' && m.url && (!yt || m.jenis !== 'video') && <p><a href={m.url} target="_blank" rel="noopener noreferrer">Buka {m.jenis === 'video' ? 'video' : m.jenis === 'berkas' ? 'berkas' : 'tautan'}</a></p>}
      {siswa && !pratinjau && !m.selesai && <div className="aksi"><button className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => void selesai(m.id)}>Tandai sudah selesai</button></div>}
    </div>
  )
}


type Langkah = {
  absen: { perlu: boolean; status: string | null; terbuka: boolean; pakai_kode: boolean }
  materi: { total: number; selesai: number }
  lembar: { total: number; terkumpul: number }
  latihan: { total: number; selesai: number }
  forum: { topik: number; ikut: boolean }
}
type KelasRingkas = { id: string; mapel: string; rombel: string; guru: string }
type PertemuanRingkas = { id: string; nomor: number; judul: string; tanggal: string; tujuan: string | null; status: string }
type Kunci = 'absen' | 'materi' | 'lembar' | 'latihan' | 'forum'

/** Tampilan siswa untuk satu pertemuan: lima langkah berurutan, satu langkah per layar. */
export function PertemuanSiswa({ kelasId, id }: { kelasId: string; id: string }) {
  const [kelas, setKelas] = useState<KelasRingkas | null>(null)
  const [p, setP] = useState<PertemuanRingkas | null>(null)
  const [l, setL] = useState<Langkah | null>(null)
  const [materi, setMateri] = useState<Materi[] | null>(null)
  const [terkunci, setTerkunci] = useState(false)
  const [aktif, setAktif] = useState<Kunci | null>(null)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [kode, setKode] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [versi, setVersi] = useState(0)

  const muat = useCallback(async () => {
    try {
      const [k, d, lg] = await Promise.all([
        panggil<KelasRingkas[]>('lms_kelas_saya'),
        panggil<PertemuanRingkas[]>('lms_pertemuan_daftar', { p_kelas: kelasId }),
        panggil<Langkah>('lms_langkah_siswa', { p_pertemuan: id }),
      ])
      setKelas(k.find((x) => x.id === kelasId) ?? null)
      setP(d.find((x) => x.id === id) ?? null)
      setL(lg)
      try {
        const r = await panggil<{ materi: Materi[] }>('lms_materi_buka', { p_pertemuan: id })
        setMateri(r.materi); setTerkunci(false)
      } catch (e) {
        if ((e as Error).message.startsWith('Absen dulu')) { setTerkunci(true); setMateri(null) } else throw e
      }
      setVersi((x) => x + 1)
    } catch (e) { setGalat((e as Error).message) }
  }, [kelasId, id])
  useEffect(() => { void muat() }, [muat])

  type ItemLangkah = { k: Kunci; nama: string; ket: string; selesai: boolean; ada: boolean }
  const langkah: ItemLangkah[] = l ? ([
    { k: 'absen', nama: 'Absen', ada: l.absen.perlu, selesai: !!l.absen.status, ket: l.absen.status ? 'Sudah hadir' : l.absen.terbuka ? 'Dibuka, absen sekarang' : 'Belum dibuka' },
    { k: 'materi', nama: 'Baca materi', ada: l.materi.total > 0, selesai: l.materi.total > 0 && l.materi.selesai >= l.materi.total, ket: `${l.materi.selesai} dari ${l.materi.total} dibaca` },
    { k: 'lembar', nama: 'Lembar kerja', ada: l.lembar.total > 0, selesai: l.lembar.total > 0 && l.lembar.terkumpul >= l.lembar.total, ket: `${l.lembar.terkumpul} dari ${l.lembar.total} terkumpul` },
    { k: 'latihan', nama: 'Latihan soal', ada: l.latihan.total > 0, selesai: l.latihan.total > 0 && l.latihan.selesai >= l.latihan.total, ket: `${l.latihan.selesai} dari ${l.latihan.total} selesai` },
    { k: 'forum', nama: 'Diskusi', ada: l.forum.topik > 0, selesai: l.forum.ikut, ket: l.forum.ikut ? 'Sudah ikut' : 'Belum ikut' },
  ] as ItemLangkah[]).filter((x) => x.ada) : []
  const nomorSaatIni = aktif ?? langkah.find((x) => !x.selesai)?.k ?? langkah[0]?.k ?? null
  const selesaiSemua = langkah.length > 0 && langkah.every((x) => x.selesai)

  async function absen(e: FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat(''); setPesan('')
    try {
      const r = await panggil<{ ok: boolean; pesan: string }>('lms_absen', { p_pertemuan: id, p_kode: kode || null })
      if (r.ok) { setPesan(r.pesan); setKode(''); setAktif('materi') } else setGalat(r.pesan)
      await muat()
    } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  async function selesai(materiId: string) {
    try { await panggil('lms_tandai_selesai', { p_materi: materiId }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  const bacaan = (materi ?? []).filter((m) => m.untuk === 'siswa' && !m.tugas_id)
  const lembar = (materi ?? []).filter((m) => m.untuk === 'siswa' && m.tugas_id)
  const butuhAbsen = terkunci

  return (
    <Halaman judul={p?.judul ?? 'Pertemuan'} lead={kelas && p ? `${kelas.mapel} ${kelas.rombel}, ${tgl(p.tanggal)}` : undefined}>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {pesan && <div className="kartu hasil"><strong>{pesan}</strong></div>}
      {selesaiSemua && <div className="kartu hasil"><strong>Semua langkah pertemuan ini sudah selesai.</strong></div>}
      {p?.tujuan && <div className="kartu"><small>Tujuan belajar</small><p style={{ marginBottom: 0 }}>{p.tujuan}</p></div>}

      <nav className="langkah-bar" aria-label="Langkah belajar">
        {langkah.map((x, i) => (
          <button key={x.k} type="button" className={`langkah${nomorSaatIni === x.k ? ' langkah-aktif' : ''}${x.selesai ? ' langkah-selesai' : ''}`} onClick={() => setAktif(x.k)}>
            <span className="langkah-no">{x.selesai ? '✓' : i + 1}</span>
            <span className="langkah-teks"><strong>{x.nama}</strong><small>{x.ket}</small></span>
          </button>
        ))}
      </nav>

      {butuhAbsen && nomorSaatIni !== 'absen' && (
        <div className="kartu jarak">
          <h3>Absen dulu</h3>
          <p>Materi, lembar kerja, latihan, dan diskusi terbuka setelah Anda hadir.</p>
          <div className="aksi"><button type="button" className="tombol tombol-isi" onClick={() => setAktif('absen')}>Ke langkah absen</button></div>
        </div>
      )}

      {nomorSaatIni === 'absen' && (
        <div className="kartu jarak">
          <h3>Absen</h3>
          {l?.absen.status ? <p><span className="status status-selesai">Tercatat: {l.absen.status}</span></p> : l?.absen.terbuka ? (
            <form className="form" onSubmit={absen}>
              {l.absen.pakai_kode && <label>Kode absen<input className="kode-besar" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" required value={kode} onChange={(e) => setKode(e.target.value)} placeholder="4 angka dari guru" /></label>}
              <button className="tombol tombol-isi tombol-besar" disabled={sibuk}>{sibuk ? 'Mengirim...' : 'Saya hadir'}</button>
            </form>
          ) : <p className="catatan">Absen belum dibuka atau sudah ditutup. Tunggu aba-aba guru, lalu ketuk Segarkan.</p>}
          <div className="aksi"><button type="button" className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => void muat()}>Segarkan</button></div>
        </div>
      )}

      {!butuhAbsen && nomorSaatIni === 'materi' && (
        <>
          {bacaan.length === 0 && <div className="kartu"><p className="catatan">Belum ada bacaan.</p></div>}
          {bacaan.map((m) => <IsiMateri key={m.id} m={m} siswa selesai={selesai} />)}
          {bacaan.length > 0 && <div className="aksi"><button type="button" className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => setAktif(langkah[langkah.findIndex((x) => x.k === 'materi') + 1]?.k ?? 'materi')}>Lanjut ke langkah berikutnya</button></div>}
        </>
      )}
      {!butuhAbsen && nomorSaatIni === 'lembar' && (
        <>
          <p className="catatan">Isi langsung di bawah. Jawaban tersimpan otomatis. Tekan Kumpulkan bila sudah selesai.</p>
          {lembar.map((m) => <IsiMateri key={m.id} m={m} siswa selesai={selesai} />)}
        </>
      )}
      {!butuhAbsen && nomorSaatIni === 'latihan' && <LatihanPertemuan kelasId={kelasId} pertemuanId={id} judul={p?.judul ?? ''} kelola={false} perbarui={() => void muat()} versi={versi} />}
      {!butuhAbsen && nomorSaatIni === 'forum' && <Forum pertemuanId={id} kelola={false} />}

      <p className="catatan jarak"><Link to={`/portal/lms/${kelasId}`}>Semua pertemuan {kelas?.mapel ?? ''}</Link></p>
    </Halaman>
  )
}

type Beranda = {
  kelas_id: string; mapel: string; rombel: string; guru: string | null; pertemuan_id: string | null
  judul: string | null; nomor: number | null; tanggal: string | null; absen_terbuka: boolean | null; sudah_absen: boolean | null; perlu_absen: boolean | null
}

/** Kartu besar per mata pelajaran: satu ketukan menuju pertemuan terbaru. */
export function BerandaBelajar() {
  const [d, setD] = useState<Beranda[] | null>(null)
  useEffect(() => {
    let batal = false
    const muat = () => panggil<Beranda[]>('lms_beranda_siswa').then((r) => { if (!batal) setD(r) }).catch(() => undefined)
    void muat()
    const t = setInterval(muat, 60000)
    return () => { batal = true; clearInterval(t) }
  }, [])
  if (!d || d.length === 0) return null
  return (
    <section className="beranda-belajar" aria-label="Belajar hari ini">
      <h2 className="menu-bagian-judul">Belajar hari ini</h2>
      <div className="grid grid-2">
        {d.map((x) => (
          <div key={x.kelas_id} className="kartu beranda-kartu">
            <small>{x.mapel}{x.guru ? `, ${x.guru}` : ''}</small>
            {x.pertemuan_id ? (
              <>
                <h3>{x.judul}</h3>
                {x.absen_terbuka && !x.sudah_absen && <p><span className="status status-menunggu">Absen sudah dibuka</span></p>}
                {x.sudah_absen && <p><span className="status status-selesai">Sudah absen</span></p>}
                <Link to={`/portal/lms/${x.kelas_id}/pertemuan/${x.pertemuan_id}`} className="tombol tombol-isi tombol-besar">{x.absen_terbuka && !x.sudah_absen ? 'Absen dan mulai belajar' : 'Buka pertemuan'}</Link>
              </>
            ) : <p className="catatan">Belum ada pertemuan.</p>}
            <small><Link to={`/portal/lms/${x.kelas_id}`}>Pertemuan sebelumnya</Link></small>
          </div>
        ))}
      </div>
    </section>
  )
}
