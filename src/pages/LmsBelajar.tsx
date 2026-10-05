import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil, tgl, tglJam } from '../lib/rpc'
import { htmlAman } from '../lib/dokumen'
import { LembarSiswa, LembarPratinjau } from './LmsLembar'
import { LatihanPertemuan } from './LmsKuis'
import { Forum } from './LmsForum'

export type Materi = { id: string; urutan: number; jenis: 'teks' | 'video' | 'tautan' | 'berkas'; judul: string; isi: string | null; url: string | null; selesai: boolean; format: 'teks' | 'html'; untuk: 'siswa' | 'guru'; tugas_id?: string | null; mulai_pada?: string | null }

const MENIT_BACA = 10

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

function TombolSelesai({ mulai, onKlik }: { mulai: string | null | undefined; onKlik: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const awal = mulai ? new Date(mulai).getTime() : now
  const lewat = Math.max(0, Math.floor((now - awal) / 1000))
  const sisa = Math.max(0, MENIT_BACA * 60 - lewat)
  const fmt = (d: number) => `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`
  return (
    <div className="aksi" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <div className="catatan">Durasi membaca {fmt(Math.min(lewat, MENIT_BACA * 60))} dari {fmt(MENIT_BACA * 60)}. {sisa > 0 ? `Tombol selesai aktif ${fmt(sisa)} lagi.` : 'Sudah cukup, silakan tandai selesai.'}</div>
      <button className="tombol" disabled={sisa > 0} style={{ color: 'var(--warna-utama)' }} onClick={onKlik}>Tandai sudah selesai</button>
    </div>
  )
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
      {siswa && !pratinjau && !m.selesai && <TombolSelesai mulai={m.mulai_pada} onKlik={() => void selesai(m.id)} />}
    </div>
  )
}


type Langkah = {
  absen: { perlu: boolean; status: string | null; terbuka: boolean; pakai_kode: boolean }
  materi: { total: number; selesai: number }
  lembar: { total: number; terkumpul: number }
  latihan: { total: number; selesai: number }
  forum: { topik: number; ikut: boolean }
  akses?: { boleh: boolean; ditutup: boolean; buka_sampai: string | null; sebelumnya: { id: string; nomor: number; judul: string } | null }
  nilai?: { tuntas: boolean; nilai: number | null; bonus: number; lembar_dinilai: number; lembar_total: number }
}
type KelasRingkas = { id: string; mapel: string; rombel: string; guru: string }
type PertemuanRingkas = { id: string; nomor: number; judul: string; tanggal: string; tujuan: string | null; status: string }
type Kunci = 'materi' | 'lembar' | 'forum' | 'latihan'

/** Tampilan siswa untuk satu pertemuan: lima langkah berurutan, satu langkah per layar. */

type InfoTp = { tp: { kode: string; rumusan: string; kriteria: string | null; nilai_tuntas: number }[]; nilai_tuntas: number | null }

/** Kriteria ketercapaian (KKTP) dan batas tuntas dari rencana ajar. Tidak tampil bila pertemuan tidak terhubung ke rencana. */
export function KartuKriteria({ pertemuanId, nilai }: { pertemuanId: string; nilai?: number | null }) {
  const [t, setT] = useState<InfoTp | null>(null)
  useEffect(() => { panggil<InfoTp>('lms_pertemuan_tp', { p_pertemuan: pertemuanId }).then(setT).catch(() => setT(null)) }, [pertemuanId])
  const ada = (t?.tp ?? []).filter((x) => x.kriteria)
  if (!t || (ada.length === 0 && t.nilai_tuntas == null)) return null
  return (
    <details className="kartu">
      <summary><strong>Kriteria ketercapaian</strong>{t.nilai_tuntas != null ? <small>{' '}| tuntas bila nilai {t.nilai_tuntas} atau lebih{nilai != null ? (nilai >= t.nilai_tuntas ? ', sudah tercapai' : ', belum tercapai') : ''}</small> : null}</summary>
      {ada.map((x) => <div key={x.kode} style={{ marginTop: 8 }}><small>{x.kode}</small><p style={{ margin: 0, whiteSpace: 'pre-line' }}>{x.kriteria}</p></div>)}
    </details>
  )
}

export function PertemuanSiswa({ kelasId, id }: { kelasId: string; id: string }) {
  const [kelas, setKelas] = useState<KelasRingkas | null>(null)
  const [p, setP] = useState<PertemuanRingkas | null>(null)
  const [l, setL] = useState<Langkah | null>(null)
  const [materi, setMateri] = useState<Materi[] | null>(null)
  const [terkunci, setTerkunci] = useState(false)
  const [aktif, setAktif] = useState<Kunci | null>(null)
  const [galat, setGalat] = useState('')
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
        if ((e as Error).message.startsWith('Pertemuan ini terkunci')) { setTerkunci(true); setMateri(null) } else throw e
      }
      setVersi((x) => x + 1)
    } catch (e) { setGalat((e as Error).message) }
  }, [kelasId, id])
  useEffect(() => { void muat() }, [muat])

  type ItemLangkah = { k: Kunci; nama: string; ket: string; selesai: boolean; ada: boolean; wajib: boolean }
  const bacaSelesai = !!l && l.materi.selesai >= l.materi.total
  const langkah: ItemLangkah[] = l ? ([
    { k: 'materi', nama: 'Bahan bacaan', wajib: true, ada: l.materi.total > 0, selesai: l.materi.total > 0 && bacaSelesai, ket: `${l.materi.selesai} dari ${l.materi.total} dibaca` },
    { k: 'lembar', nama: 'Lembar kerja', wajib: true, ada: l.lembar.total > 0, selesai: l.lembar.total > 0 && l.lembar.terkumpul >= l.lembar.total, ket: bacaSelesai ? `${l.lembar.terkumpul} dari ${l.lembar.total} terkumpul` : 'Baca bahan bacaan dulu' },
    { k: 'forum', nama: 'Diskusi', wajib: false, ada: l.forum.topik > 0, selesai: l.forum.ikut, ket: l.forum.ikut ? 'Sudah ikut' : 'Tanya atau komentar' },
    { k: 'latihan', nama: 'Kuis (opsional)', wajib: false, ada: l.latihan.total > 0, selesai: l.latihan.total > 0 && l.latihan.selesai >= l.latihan.total, ket: l.latihan.selesai > 0 ? 'Sudah dikerjakan' : 'Nilai tambah' },
  ] as ItemLangkah[]).filter((x) => x.ada) : []
  const wajibItem = langkah.filter((x) => x.wajib)
  const nomorSaatIni = aktif ?? wajibItem.find((x) => !x.selesai)?.k ?? langkah.find((x) => !x.selesai)?.k ?? langkah[0]?.k ?? null
  const selesaiSemua = wajibItem.length > 0 && wajibItem.every((x) => x.selesai)
  const nl = l?.nilai

  async function selesai(materiId: string) {
    try { await panggil('lms_tandai_selesai', { p_materi: materiId }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  const bacaan = (materi ?? []).filter((m) => m.untuk === 'siswa' && !m.tugas_id)
  const lembar = (materi ?? []).filter((m) => m.untuk === 'siswa' && m.tugas_id)
  const butuhAbsen = terkunci

  return (
    <Halaman judul={p?.judul ?? 'Pertemuan'} lead={kelas && p ? `${kelas.mapel} ${kelas.rombel}, ${tgl(p.tanggal)}` : undefined}>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {selesaiSemua && (
        <div className="kartu hasil">
          <strong>Tiga tahap wajib selesai.</strong>{' '}
          {nl?.nilai != null ? <>Nilai pertemuan: <strong>{nl.nilai}</strong>{nl.bonus > 0 ? ` (termasuk bonus kuis ${nl.bonus})` : ''}.</> : 'Nilai keluar setelah guru menilai lembar kerja.'}
          {' '}Silakan lanjut ke diskusi{langkah.some((x) => x.k === 'latihan') ? ' atau kuis untuk nilai tambah' : ''}.
        </div>
      )}
      {p?.tujuan && <div className="kartu"><small>Tujuan belajar</small><p style={{ marginBottom: 0, whiteSpace: 'pre-line' }}>{p.tujuan}</p></div>}
      <KartuKriteria pertemuanId={id} nilai={nl?.nilai ?? null} />

      {!butuhAbsen && <nav className="langkah-bar" aria-label="Langkah belajar">
        {langkah.map((x, i) => (
          <button key={x.k} type="button" className={`langkah${nomorSaatIni === x.k ? ' langkah-aktif' : ''}${x.selesai ? ' langkah-selesai' : ''}${!x.wajib ? ' langkah-opsi' : ''}`} onClick={() => setAktif(x.k)}>
            <span className="langkah-no">{x.selesai ? '✓' : i + 1}</span>
            <span className="langkah-teks"><strong>{x.nama}</strong><small>{x.ket}</small></span>
          </button>
        ))}
      </nav>}

      {butuhAbsen && (
        <div className="kartu jarak">
          {l?.akses?.ditutup ? (
            <>
              <h3>Pertemuan ditutup</h3>
              <p>Guru menutup pertemuan ini{l.akses.buka_sampai ? ` sejak ${tglJam(l.akses.buka_sampai)}` : ''}. Hubungi guru bila Anda belum sempat mengerjakan.</p>
            </>
          ) : l?.akses?.sebelumnya ? (
            <>
              <h3>Selesaikan pertemuan {l.akses.sebelumnya.nomor} dulu</h3>
              <p>Pertemuan ini terbuka setelah bahan bacaan dan lembar kerja pertemuan {l.akses.sebelumnya.nomor}, {l.akses.sebelumnya.judul}, selesai.</p>
              <div className="aksi"><Link to={`/portal/lms/${kelasId}/pertemuan/${l.akses.sebelumnya.id}`} className="tombol tombol-isi tombol-besar">Ke pertemuan {l.akses.sebelumnya.nomor}</Link></div>
            </>
          ) : <p>Pertemuan ini belum bisa dibuka.</p>}
        </div>
      )}

      {!butuhAbsen && nomorSaatIni === 'materi' && (
        <>
          {bacaan.length === 0 && <div className="kartu"><p className="catatan">Belum ada bacaan.</p></div>}
          {bacaan.map((m) => <IsiMateri key={m.id} m={m} siswa selesai={selesai} />)}
          {bacaan.length > 0 && <div className="aksi"><button type="button" className="tombol" style={{ color: 'var(--warna-utama)' }} onClick={() => setAktif(langkah[langkah.findIndex((x) => x.k === 'materi') + 1]?.k ?? 'materi')}>Lanjut ke lembar kerja</button></div>}
        </>
      )}
      {!butuhAbsen && nomorSaatIni === 'lembar' && !bacaSelesai && (
        <div className="kartu jarak">
          <h3>Baca dulu</h3>
          <p>Lembar kerja terbuka setelah semua bahan bacaan Anda tandai selesai dibaca.</p>
          <div className="aksi"><button type="button" className="tombol tombol-isi" onClick={() => setAktif('materi')}>Ke bahan bacaan</button></div>
        </div>
      )}
      {!butuhAbsen && nomorSaatIni === 'lembar' && bacaSelesai && (
        <>
          <p className="catatan">Isi langsung di bawah. Jawaban tersimpan otomatis. Tekan Kumpulkan bila sudah selesai.</p>
          {lembar.map((m) => <IsiMateri key={m.id} m={m} siswa selesai={selesai} />)}
        </>
      )}
      {!butuhAbsen && nomorSaatIni === 'latihan' && <p className="catatan">Kuis ini opsional. Nilainya menjadi tambahan di nilai pertemuan.</p>}
      {!butuhAbsen && nomorSaatIni === 'latihan' && <LatihanPertemuan kelasId={kelasId} pertemuanId={id} judul={p?.judul ?? ''} kelola={false} perbarui={() => void muat()} versi={versi} />}
      {!butuhAbsen && nomorSaatIni === 'forum' && <p className="catatan">Tanyakan atau komentari bahan bacaan dan lembar kerja di sini.</p>}
      {!butuhAbsen && nomorSaatIni === 'forum' && <Forum pertemuanId={id} kelola={false} />}

      <p className="catatan jarak"><Link to={`/portal/lms/${kelasId}`}>Semua pertemuan {kelas?.mapel ?? ''}</Link></p>
    </Halaman>
  )
}

type Beranda = {
  kelas_id: string; mapel: string; rombel: string; guru: string | null; pertemuan_id: string | null
  judul: string | null; nomor: number | null; tanggal: string | null; absen_terbuka: boolean | null; sudah_absen: boolean | null; perlu_absen: boolean | null; tuntas?: boolean
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
                {x.tuntas ? <p><span className="status status-selesai">Selesai</span></p> : x.sudah_absen ? <p><span className="status status-menunggu">Sedang dikerjakan</span></p> : null}
                <Link to={`/portal/lms/${x.kelas_id}/pertemuan/${x.pertemuan_id}`} className="tombol tombol-isi tombol-besar">{x.tuntas ? 'Buka lagi' : x.sudah_absen ? 'Lanjutkan' : 'Mulai belajar'}</Link>
              </>
            ) : <p className="catatan">Belum ada pertemuan.</p>}
            <small><Link to={`/portal/lms/${x.kelas_id}`}>Pertemuan sebelumnya</Link></small>
          </div>
        ))}
      </div>
    </section>
  )
}
