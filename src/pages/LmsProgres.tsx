import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import Ikon from '../components/Ikon'
import { panggil, tglJam } from '../lib/rpc'
import { biru, nilaiTeks } from './lmsUtil'

// Progres belajar: untuk siswa (milik sendiri) dan orang tua (anak yang ditautkan). Hanya baca.
// Tambahan: halaman admin TU untuk menautkan akun orang tua ke anak.

export type NilaiPertemuanSiswa = {
  id: string; nomor: number | null; judul: string
  nilai: {
    tuntas: boolean; nilai: number | null; kktp: number
    bacaan_total: number; bacaan_selesai: number; lembar_total: number; lembar_terkumpul: number; lembar_dinilai: number
    kuis: number | null; bonus_kuis: number; bonus_forum: number
  }
}

export type KelasRingkas = {
  kelas_id: string; mapel: string; rombel: string; guru: string
  sesi: number; hadir: number; izin: number; sakit: number; alpa: number
  materi_total: number; materi_selesai: number
  pertemuan?: NilaiPertemuanSiswa[]
  kuis: { judul: string; jenis: string; kkm: number | null; status: 'belum' | 'disembunyikan' | 'menunggu' | 'nilai'; nilai: number | null }[]
  tugas: { judul: string; tenggat: string | null; nilai_maks: number; status: string; nilai: number | null }[]
}

/** Email teknis akun orang tua adalah <NIK>@ortu.invalid. Ditampilkan sebagian saja. */
const namaAkun = (email: string) => {
  const m = /^(\d{16})@ortu\.invalid$/.exec(email)
  return m ? `NIK ibu ${m[1].slice(0, 6)}******${m[1].slice(-4)}` : email
}

const labelTugas: Record<string, string> = { belum: 'Belum', terkumpul: 'Terkumpul', terlambat: 'Terlambat', dinilai: 'Dinilai' }
const labelJenis: Record<string, string> = { kuis: 'Kuis', ulangan_harian: 'Ulangan harian', ulangan_tengah: 'UTS', ulangan_semester: 'UAS' }

function teksKuis(q: KelasRingkas['kuis'][number]): string {
  if (q.status === 'belum') return 'Belum dikerjakan'
  if (q.status === 'disembunyikan') return 'Dikerjakan, nilai ditampilkan oleh guru'
  if (q.status === 'menunggu') return 'Menunggu koreksi guru'
  const lulus = q.kkm !== null && q.nilai !== null ? (Number(q.nilai) >= Number(q.kkm) ? ', mencapai KKM' : ', di bawah KKM') : ''
  return `${nilaiTeks(q.nilai)}${lulus}`
}

/** Pengingat cara nilai pertemuan terbentuk: yang wajib dan yang menambah nilai. Aturan mengikuti lms_nilai_pertemuan_pd. */
export function PengingatNilai({ ringkas = false }: { ringkas?: boolean }) {
  if (ringkas) {
    return (
      <p className="catatan">
        <strong>Wajib:</strong> baca bahan bacaan (minimal 10 menit) dan kirim lembar kerja. <strong>Mau nilai lebih tinggi:</strong> kerjakan kuis dan tulis pertanyaan di forum.
      </p>
    )
  }
  return (
    <div className="kartu">
      <strong>Cara nilai pertemuan terbentuk</strong>
      <ul style={{ margin: '6px 0 0', paddingLeft: '1.2rem' }}>
        <li><strong>Wajib:</strong> baca bahan bacaan (minimal 10 menit) dan kirim lembar kerja. Setelah dua-duanya selesai, nilai pertemuan keluar sebesar KKTP.</li>
        <li><strong>Nilai lebih tinggi:</strong> kerjakan kuis (maksimal +10) dan tulis pertanyaan atau tanggapan di forum (+2 per tulisan minimal 20 karakter, maksimal +5). Guru yang menilai lembar kerja juga bisa menaikkan nilai dasar di atas KKTP.</li>
        <li>Nilai maksimal 100. Kuis dan forum baru dihitung setelah dua tahap wajib selesai.</li>
      </ul>
    </div>
  )
}

const ringkasJudul = (j: string) => {
  const t = j.replace(/^M\d+\s*[:.]\s*/i, '')
  return t.length > 60 ? `${t.slice(0, 60).trimEnd()}...` : t
}

function TabelNilaiPertemuan({ daftar }: { daftar: NilaiPertemuanSiswa[] }) {
  return (
    <div className="tabel-bungkus jarak"><table>
      <thead><tr><th>Pertemuan</th><th>Tahap wajib</th><th>Tambahan</th><th>Nilai</th></tr></thead>
      <tbody>{daftar.map((p) => {
        const n = p.nilai
        const wajib = n.tuntas ? 'Selesai' : `Bacaan ${n.bacaan_selesai}/${n.bacaan_total}, lembar ${n.lembar_terkumpul}/${n.lembar_total}`
        const tambahan = !n.tuntas
          ? (n.kuis !== null ? `Kuis ${nilaiTeks(n.kuis)}, dihitung setelah tahap wajib` : 'Dihitung setelah tahap wajib')
          : [n.kuis !== null ? `Kuis +${nilaiTeks(n.bonus_kuis)}` : 'Kuis belum', n.bonus_forum > 0 ? `Forum +${nilaiTeks(n.bonus_forum)}` : 'Forum belum'].join(', ')
        const bisaNaik = n.tuntas && n.lembar_total > 0 && n.lembar_dinilai < n.lembar_total
        return (
          <tr key={p.id}>
            <td>M{p.nomor ?? '-'}<br /><small>{ringkasJudul(p.judul)}</small></td>
            <td>{wajib}</td>
            <td>{tambahan}</td>
            <td>{n.nilai === null ? 'Belum' : <strong>{nilaiTeks(n.nilai)}</strong>}{bisaNaik && <><br /><small>Bisa naik setelah guru menilai lembar</small></>}</td>
          </tr>
        )
      })}</tbody>
    </table></div>
  )
}

export function KartuKelas({ k, tautan }: { k: KelasRingkas; tautan: boolean }) {
  const persen = k.sesi > 0 ? Math.round((k.hadir / k.sesi) * 100) : null
  const tugasSelesai = k.tugas.filter((t) => t.status !== 'belum').length
  const pt = k.pertemuan ?? []
  const bagian = ([
    pt.length > 0 ? { id: 'nilai', label: 'Nilai pertemuan', n: pt.length } : null,
    k.kuis.length > 0 ? { id: 'kuis', label: 'Kuis dan ulangan', n: k.kuis.length } : null,
    k.tugas.length > 0 ? { id: 'tugas', label: 'Tugas', n: k.tugas.length } : null,
  ].filter(Boolean)) as { id: string; label: string; n: number }[]
  const [aktif, setAktif] = useState(bagian[0]?.id ?? '')
  const buka = bagian.some((x) => x.id === aktif) ? aktif : bagian[0]?.id
  return (
    <div className="kartu progres-kelas">
      <h3 style={{ marginTop: 0 }}>
        {tautan ? <Link to={`/portal/lms/${k.kelas_id}`}>{k.mapel}</Link> : k.mapel} <small>{k.rombel}, {k.guru}</small>
      </h3>
      <div className="pantau-ringkas progres-ringkas">
        <div className="ringkas-kartu"><span className="ringkas-ikon"><Ikon nama="centang" ukuran={20} /></span><div><strong>{persen === null ? '-' : `${persen}%`}</strong><span>Hadir {k.hadir}, izin {k.izin}, sakit {k.sakit}, alpa {k.alpa} dari {k.sesi}</span></div></div>
        <div className="ringkas-kartu"><span className="ringkas-ikon"><Ikon nama="buku" ukuran={20} /></span><div><strong>{k.materi_selesai} <small>dari {k.materi_total}</small></strong><span>Materi dibaca</span></div></div>
        <div className="ringkas-kartu"><span className="ringkas-ikon"><Ikon nama="dokumen" ukuran={20} /></span><div><strong>{tugasSelesai} <small>dari {k.tugas.length}</small></strong><span>Tugas dikumpulkan</span></div></div>
      </div>
      {bagian.length > 0 && (
        <>
          <div className="tab-bar" role="tablist" aria-label={`Rincian ${k.mapel}`}>
            {bagian.map((x) => (
              <button key={x.id} type="button" role="tab" aria-selected={buka === x.id} className={'tab-item' + (buka === x.id ? ' aktif' : '')} onClick={() => setAktif(x.id)}>
                {x.label}<span className="angka">{x.n}</span>
              </button>
            ))}
          </div>
          {buka === 'nilai' && <TabelNilaiPertemuan daftar={pt} />}
          {buka === 'kuis' && (
            <div className="tabel-bungkus"><table>
              <thead><tr><th>Kuis dan ulangan</th><th>Hasil</th></tr></thead>
              <tbody>{k.kuis.map((q, n) => <tr key={n}><td>{q.judul}<br /><small>{labelJenis[q.jenis] ?? q.jenis}</small></td><td>{teksKuis(q)}</td></tr>)}</tbody>
            </table></div>
          )}
          {buka === 'tugas' && (
            <div className="tabel-bungkus"><table>
              <thead><tr><th>Tugas</th><th>Tenggat</th><th>Status</th><th>Nilai</th></tr></thead>
              <tbody>{k.tugas.map((t, n) => (
                <tr key={n}><td>{t.judul}</td><td>{t.tenggat ? tglJam(t.tenggat) : '-'}</td><td>{labelTugas[t.status] ?? t.status}</td>
                  <td>{t.nilai === null ? '-' : `${nilaiTeks(t.nilai)}/${t.nilai_maks}`}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}
    </div>
  )
}

/** Progres belajar siswa sendiri, lintas mata pelajaran. */
export function ProgresSaya() {
  const [data, setData] = useState<{ nama: string; kelas: KelasRingkas[] } | null>(null)
  const [galat, setGalat] = useState('')
  const [pilih, setPilih] = useState<string | null>(null)
  useEffect(() => { panggil<{ nama: string; kelas: KelasRingkas[] }>('lms_progres_saya').then(setData).catch((e: Error) => setGalat(e.message)) }, [])
  return (
    <Halaman judul="Nilai dan progres" lead="Pilih mata pelajaran untuk melihat kehadiran, nilai pertemuan, kuis, dan tugas.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      {!data && !galat && <p className="catatan">Memuat...</p>}
      {data && data.kelas.length > 0 && (
        <details className="kartu info-ringkas"><summary><Ikon nama="info" ukuran={16} /> Cara nilai pertemuan terbentuk</summary><PengingatNilai /></details>
      )}
      {data && data.kelas.length === 0 && <div className="kartu"><p>Belum ada kelas ajar untuk rombel Anda.</p></div>}
      {data && data.kelas.length > 1 && (
        <div className="chip-bar" role="tablist" aria-label="Mata pelajaran">
          {data.kelas.map((k) => (
            <button key={k.kelas_id} type="button" role="tab" aria-selected={(pilih ?? data.kelas[0].kelas_id) === k.kelas_id} className={'chip' + ((pilih ?? data.kelas[0].kelas_id) === k.kelas_id ? ' aktif' : '')} onClick={() => setPilih(k.kelas_id)}>{k.mapel}</button>
          ))}
        </div>
      )}
      {data && data.kelas.length > 0 && (() => {
        const k = data.kelas.find((x) => x.kelas_id === pilih) ?? data.kelas[0]
        return <KartuKelas key={k.kelas_id} k={k} tautan />
      })()}
      <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

type Ortu = { user_id: string; email: string; anak: { id: string; nama: string; nisn: string | null }[] }
type Siswa = { id: string; nama: string; nisn: string | null; rombel: string | null }

/** Admin TU: tautkan akun orang tua ke anak. Akun orang tua dibuat dulu di Pengguna dan akun. */
export function TautanOrtu() {
  const [daftar, setDaftar] = useState<Ortu[] | null>(null)
  const [galat, setGalat] = useState('')
  const [pilih, setPilih] = useState('')
  const [q, setQ] = useState('')
  const [hasil, setHasil] = useState<Siswa[] | null>(null)
  const [sibuk, setSibuk] = useState(false)
  const muat = useCallback(async () => {
    try { setDaftar(await panggil<Ortu[]>('ortu_tautan_daftar')) } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])
  async function cari(e: FormEvent) {
    e.preventDefault()
    setGalat('')
    try { setHasil(await panggil<Siswa[]>('ortu_cari_siswa', { p_q: q })) } catch (er) { setGalat((er as Error).message) }
  }
  async function tautkan(pd: string) {
    if (!pilih) { setGalat('Pilih akun orang tua dulu.'); return }
    setSibuk(true); setGalat('')
    try { await panggil('ortu_tautkan', { p_user: pilih, p_pd: pd }); await muat() } catch (er) { setGalat((er as Error).message) }
    setSibuk(false)
  }
  return (
    <Halaman judul="Tautan orang tua" lead="Hubungkan akun orang tua ke anaknya supaya bisa melihat profil dan progres belajar.">
      {galat && <p className="catatan galat" role="alert">Galat: {galat}</p>}
      <div className="kartu form">
        <h3>Tautkan anak</h3>
        <label>Akun orang tua
          <select value={pilih} onChange={(e) => setPilih(e.target.value)}>
            <option value="">Pilih akun</option>
            {(daftar ?? []).map((o) => <option key={o.user_id} value={o.user_id}>{namaAkun(o.email)} ({o.anak.length} anak)</option>)}
          </select>
          {daftar && daftar.length === 0 && <span className="petunjuk">Belum ada akun orang tua. Buat dulu di Pengguna dan akun, peran Orang tua.</span>}
        </label>
        <form onSubmit={(e) => void cari(e)} className="aksi">
          <input aria-label="Cari siswa" placeholder="Nama atau NISN siswa" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          <button className="tombol tombol-isi">Cari</button>
        </form>
        {hasil && hasil.length === 0 && <p className="catatan">Siswa tidak ditemukan. Ketik minimal 2 huruf nama atau NISN lengkap.</p>}
        {hasil && hasil.length > 0 && (
          <div className="tabel-bungkus"><table>
            <thead><tr><th>Nama</th><th>NISN</th><th>Rombel</th><th></th></tr></thead>
            <tbody>{hasil.map((s) => (
              <tr key={s.id}><td>{s.nama}</td><td>{s.nisn ?? '-'}</td><td>{s.rombel ?? '-'}</td>
                <td><button className="tombol" style={biru} disabled={sibuk} onClick={() => void tautkan(s.id)}>Tautkan</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <div className="judul-bagian jarak"><h2>Tautan yang ada</h2></div>
      {!daftar && <p className="catatan">Memuat...</p>}
      {(daftar ?? []).map((o) => (
        <div key={o.user_id} className="kartu" style={{ marginTop: 8 }}>
          <p style={{ margin: 0 }}><strong>{namaAkun(o.email)}</strong></p>
          {o.anak.length === 0
            ? <p className="catatan">Belum ditautkan ke anak.</p>
            : <ul style={{ margin: '4px 0 0' }}>{o.anak.map((a) => <li key={a.id}>{a.nama} <small>{a.nisn ?? ''}</small></li>)}</ul>}
        </div>
      ))}
      <p className="catatan jarak">Melepas tautan belum tersedia di aplikasi. Hubungi pengembang bila ada tautan yang keliru.</p>
      <p className="catatan"><Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}
