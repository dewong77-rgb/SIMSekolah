import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import Ikon from '../components/Ikon'
import { panggil, tgl, tglJam } from '../lib/rpc'
import { htmlAman } from '../lib/dokumen'
import { LembarSiswa, LembarPratinjau } from './LmsLembar'
import { LatihanPertemuan } from './LmsKuis'
import { Forum } from './LmsForum'
import { PengingatNilai } from './LmsProgres'

export type Materi = { id: string; urutan: number; jenis: 'teks' | 'video' | 'tautan' | 'berkas'; judul: string; isi: string | null; url: string | null; selesai: boolean; format: 'teks' | 'html'; untuk: 'siswa' | 'guru'; tugas_id?: string | null; mulai_pada?: string | null }

const labelJenis: Record<string, string> = { teks: 'Bacaan', video: 'Video', tautan: 'Tautan', berkas: 'Berkas' }

/** Jeda baca minimal sebelum bahan bacaan boleh ditandai selesai. Harus sama dengan batas di lms_tandai_selesai. */
const MENIT_BACA_MINIMAL = 10

function sisaDetikBaca(mulaiPada?: string | null): number {
  if (!mulaiPada) return MENIT_BACA_MINIMAL * 60
  const lewat = (Date.now() - new Date(mulaiPada).getTime()) / 1000
  return Math.max(0, Math.ceil(MENIT_BACA_MINIMAL * 60 - lewat))
}

function formatMenitDetik(detik: number): string {
  const m = Math.floor(detik / 60)
  const s = detik % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

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

export function IsiMateri({ m, siswa, selesai, pratinjau, setelah }: { m: Materi; siswa: boolean; selesai: (id: string) => Promise<void>; pratinjau?: boolean; setelah?: () => void }) {
  if (pratinjau && m.tugas_id && m.format === 'html') return <LembarPratinjau html={m.isi ?? ''} judul={m.judul} />
  if (siswa && m.tugas_id && m.format === 'html') return <LembarSiswa tugasId={m.tugas_id} html={m.isi ?? ''} judul={m.judul} setelah={setelah} />
  const yt = m.jenis === 'video' && m.url ? idYoutube(m.url) : null
  const kenaJeda = siswa && !pratinjau && !m.tugas_id && !m.selesai
  const [kirim, setKirim] = useState(false)
  const [sisa, setSisa] = useState(() => (kenaJeda ? sisaDetikBaca(m.mulai_pada) : 0))
  useEffect(() => {
    if (!kenaJeda) return
    setSisa(sisaDetikBaca(m.mulai_pada))
    const iv = window.setInterval(() => setSisa(sisaDetikBaca(m.mulai_pada)), 1000)
    return () => window.clearInterval(iv)
  }, [kenaJeda, m.mulai_pada])
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
      {siswa && !pratinjau && !m.selesai && (
        <div className="aksi" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          {kenaJeda && sisa > 0
            ? (
              <>
                <button type="button" className="tombol tombol-besar" disabled>Bisa ditandai selesai dalam {formatMenitDetik(sisa)}</button>
                <small className="catatan">Baca dulu pelan-pelan. Waktu berjalan sendiri dan tombol aktif saat habis.</small>
              </>
            )
            : (
              <button type="button" className="tombol tombol-isi tombol-besar" disabled={kirim}
                onClick={() => { setKirim(true); void selesai(m.id).finally(() => setKirim(false)) }}>{kirim ? 'Mengirim...' : 'Saya sudah membaca, tandai selesai'}</button>
            )}
        </div>
      )}
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
  nilai?: { tuntas: boolean; nilai: number | null; kktp?: number; bonus: number; bonus_kuis?: number; bonus_forum?: number; lembar_dinilai: number; lembar_total: number }
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
    { k: 'materi', nama: 'Bahan bacaan', wajib: true, ada: l.materi.total > 0, selesai: l.materi.total > 0 && bacaSelesai, ket: bacaSelesai ? 'Materi sudah dibaca' : `Belum dibaca (${l.materi.selesai} dari ${l.materi.total})` },
    { k: 'lembar', nama: 'Lembar kerja', wajib: true, ada: l.lembar.total > 0, selesai: l.lembar.total > 0 && l.lembar.terkumpul >= l.lembar.total, ket: l.lembar.total > 0 && l.lembar.terkumpul >= l.lembar.total ? 'Lembar kerja sudah dikirim' : bacaSelesai ? `Belum dikirim (${l.lembar.terkumpul} dari ${l.lembar.total})` : 'Baca bahan bacaan dulu' },
    { k: 'forum', nama: 'Diskusi', wajib: false, ada: l.forum.topik > 0, selesai: l.forum.ikut, ket: l.forum.ikut ? 'Forum sudah dibuat' : 'Belum ikut, tulis pertanyaan atau komentar' },
    { k: 'latihan', nama: 'Kuis (opsional)', wajib: false, ada: l.latihan.total > 0, selesai: l.latihan.total > 0 && l.latihan.selesai >= l.latihan.total, ket: l.latihan.total > 0 && l.latihan.selesai >= l.latihan.total ? 'Kuis sudah dikirim' : l.latihan.selesai > 0 ? `Baru ${l.latihan.selesai} dari ${l.latihan.total} dikirim` : 'Belum dikerjakan, nilai tambah' },
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
      {!butuhAbsen && wajibItem.length > 0 && (
        <div className="belajar-progres" role="status">
          <div className="belajar-progres-teks">
            <strong>{selesaiSemua ? 'Semua tahap wajib selesai' : `${wajibItem.filter((x) => x.selesai).length} dari ${wajibItem.length} tahap wajib selesai`}</strong>
            {selesaiSemua && nl?.nilai != null && <span>Nilai pertemuan <strong>{nl.nilai}</strong></span>}
          </div>
          <div className="belajar-bar" aria-hidden="true"><div style={{ width: `${Math.round((wajibItem.filter((x) => x.selesai).length / wajibItem.length) * 100)}%` }} /></div>
        </div>
      )}
      {selesaiSemua && (
        <div className="kartu hasil">
          {nl?.nilai != null
            ? <>Nilai pertemuan: <strong>{nl.nilai}</strong> (KKTP {nl.kktp ?? 70}{(nl.bonus ?? 0) > 0 ? ` + bonus ${nl.bonus}` : ''}).</>
            : 'Nilai keluar otomatis sebesar KKTP begitu tahap wajib selesai.'}
          {' '}Kuis (maksimal +10) dan pertanyaan atau tanggapan di forum (+2 per tulisan, maksimal +5) menambah nilai ini.
        </div>
      )}
      <details className="kartu info-ringkas">
        <summary><Ikon nama="info" ukuran={16} /> Tujuan, kriteria, dan cara penilaian</summary>
        {p?.tujuan && <div><small>Tujuan belajar</small><p style={{ whiteSpace: 'pre-line' }}>{p.tujuan}</p></div>}
        <KartuKriteria pertemuanId={id} nilai={nl?.nilai ?? null} />
        <PengingatNilai ringkas />
      </details>

      {!butuhAbsen && selesaiSemua && langkah.some((x) => !x.wajib) && <p className="catatan">Mau nilai lebih? Kuis dan forum menambah nilai pertemuan.</p>}
      {!butuhAbsen && <nav className="langkah-bar" aria-label="Langkah belajar">
        {(selesaiSemua ? langkah : wajibItem).map((x, i) => (
          <button key={x.k} type="button" className={`langkah${nomorSaatIni === x.k ? ' langkah-aktif' : ''}${x.selesai ? ' langkah-selesai' : ''}${!x.wajib ? ' langkah-opsi' : ''}`} onClick={() => setAktif(x.k)}>
            <span className="langkah-no">{x.selesai ? '✓' : i + 1}</span>
            <span className="langkah-teks"><strong>{x.nama}</strong><small>{x.ket}</small></span>
          </button>
        ))}
      </nav>}

      {!butuhAbsen && !selesaiSemua && wajibItem.length > 0 && nomorSaatIni && (
        <p className="catatan">Langkah {Math.max(1, wajibItem.findIndex((x) => x.k === nomorSaatIni) + 1)} dari {wajibItem.length}: {langkah.find((x) => x.k === nomorSaatIni)?.ket}</p>
      )}

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
              <p>Pertemuan ini terbuka setelah bacaan dan lembar kerja pertemuan {l.akses.sebelumnya.nomor} selesai.</p>
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
          <p>Lembar kerja terbuka setelah bacaan ditandai selesai.</p>
          <div className="aksi"><button type="button" className="tombol tombol-isi" onClick={() => setAktif('materi')}>Ke bahan bacaan</button></div>
        </div>
      )}
      {!butuhAbsen && nomorSaatIni === 'lembar' && bacaSelesai && (
        <>
          <p className="catatan">Isi langsung di bawah. Jawaban tersimpan otomatis. Tekan Kumpulkan bila sudah selesai.</p>
          {lembar.map((m) => <IsiMateri key={m.id} m={m} siswa selesai={selesai} setelah={() => void muat()} />)}
        </>
      )}
      {!butuhAbsen && nomorSaatIni === 'latihan' && <p className="catatan">Kuis ini opsional. Nilainya menjadi tambahan di nilai pertemuan.</p>}
      {!butuhAbsen && nomorSaatIni === 'latihan' && <LatihanPertemuan kelasId={kelasId} pertemuanId={id} judul={p?.judul ?? ''} kelola={false} perbarui={() => void muat()} versi={versi} />}
      {!butuhAbsen && nomorSaatIni === 'forum' && <Forum pertemuanId={id} kelola={false} setelah={() => void muat()} />}

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
