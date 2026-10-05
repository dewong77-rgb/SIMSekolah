// Dashboard risiko siswa: siswa yang perlu dilihat lebih dulu, dengan alasan yang bisa ditelusuri, plus riwayat dan tindak lanjut.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tgl } from '../../lib/rpc'
import { unduhCsv } from '../../lib/hubin'
import { BIDANG_PRESTASI, JENIS_IZIN, KATEGORI, STATUS_CATATAN, STATUS_HADIR, STATUS_IZIN, TINDAK_LANJUT, TINGKAT, hariIni, label, tambahHari, type RombelPilih } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Baris = {
  pd: string; nama: string; nisn: string | null; rombel: string; skor: number; level: string; sinyal: string[]; alpa: number; tidak_hadir: number; terlambat: number
  hari_tercatat: number; poin: number; tindak_lanjut: number; ambang_tercapai: number; perlu_tindak: boolean; lms_hadir: number; lms_total: number; tugas_tunggak: number
}
type Hasil = { dari: string; sampai: string; total: number; tinggi: number; sedang: number; siswa: number; rombel_total: number; rombel_tercatat: number; baris: Baris[] }
type Riwayat = {
  nama: string; nisn: string | null; rombel: string | null; tahun_ajaran: string; poin: number
  pelanggaran: { id: string; tanggal: string; jenis: string; kategori: string; poin: number; status: string; uraian: string | null; dicatat_nama: string | null }[]
  tindak_lanjut: { id: string; tanggal: string; jenis: string; catatan: string | null; dicatat_nama: string | null }[]
  prestasi: { id: string; nama: string; bidang: string; tingkat: string; peringkat: string | null; tanggal: string; status: string }[]
  izin: { id: string; jenis: string; tgl_mulai: string; tgl_selesai: string; status: string; alasan: string }[]
  kehadiran_30_hari: Record<string, number>
  ekskul: { nama: string; peran: string; predikat: string | null }[]
}

const warna: Record<string, string> = { tinggi: '#f8d7da', sedang: '#fdf1d8', rendah: '#e8edf3' }

function Detail({ pd, bisaTindak, tutup, ubah }: { pd: Baris; bisaTindak: boolean; tutup: () => void; ubah: () => void }) {
  const [r, setR] = useState<Riwayat | null>(null)
  const [galat, setGalat] = useState('')
  const [jenis, setJenis] = useState('teguran_lisan')
  const [tanggal, setTanggal] = useState(hariIni())
  const [catatan, setCatatan] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const muat = useCallback(() => { panggil<Riwayat>('kesiswaan_siswa_riwayat', { p_pd: pd.pd }).then(setR).catch((e: Error) => setGalat(e.message)) }, [pd.pd])
  useEffect(() => { muat() }, [muat])

  async function simpan(e: React.FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try { await panggil('tindak_lanjut_catat', { p_pd: pd.pd, p_pelanggaran_id: null, p_jenis: jenis, p_tanggal: tanggal, p_catatan: catatan.trim() || null }); setCatatan(''); muat(); ubah() }
    catch (x) { setGalat((x as Error).message) } finally { setSibuk(false) }
  }
  async function hapus(id: string) {
    setGalat('')
    try { await panggil('tindak_lanjut_hapus', { p_id: id }); muat(); ubah() } catch (x) { setGalat((x as Error).message) }
  }

  const k = r?.kehadiran_30_hari
  return (
    <div className="kartu jarak" style={{ borderLeft: '4px solid var(--warna-aksen)' }}>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{pd.nama} <small className="catatan">{pd.rombel}</small></h3>
        <button className="tombol" onClick={tutup}>Tutup</button>
      </div>
      {galat && <p className="galat" role="alert">{galat}</p>}
      {!r ? <p className="catatan">Memuat riwayat...</p> : (
        <div className="grid grid-2 jarak">
          <div>
            <h4>Alasan masuk daftar</h4>
            <ul>{pd.sinyal.map((s) => <li key={s}>{s}</li>)}{pd.sinyal.length === 0 && <li className="catatan">Tidak ada sinyal.</li>}</ul>
            <h4>Kehadiran 30 hari</h4>
            {k && k.tercatat > 0 ? <p>{STATUS_HADIR.map(([key, n]) => `${n} ${k[key] ?? 0}`).join(' · ')} <small className="catatan">dari {k.tercatat} hari tercatat</small></p> : <p className="catatan">Belum ada kehadiran harian tercatat.</p>}
            <h4>Pelanggaran tahun ajaran {r.tahun_ajaran} <small className="catatan">({r.poin} poin terverifikasi)</small></h4>
            <ul>{r.pelanggaran.map((p) => <li key={p.id}>{tgl(p.tanggal)}: {p.jenis} ({label(KATEGORI, p.kategori)}, {p.poin} poin){p.status !== 'terverifikasi' && <> <span className="lencana">{label(STATUS_CATATAN, p.status)}</span></>}{p.uraian && <><br /><small className="catatan">{p.uraian}</small></>}</li>)}
              {r.pelanggaran.length === 0 && <li className="catatan">Tidak ada.</li>}</ul>
            <h4>Izin terakhir</h4>
            <ul>{r.izin.slice(0, 5).map((i) => <li key={i.id}>{tgl(i.tgl_mulai)}{i.tgl_selesai !== i.tgl_mulai && ` sampai ${tgl(i.tgl_selesai)}`}: {label(JENIS_IZIN, i.jenis)} ({label(STATUS_IZIN, i.status)})</li>)}{r.izin.length === 0 && <li className="catatan">Tidak ada.</li>}</ul>
          </div>
          <div>
            <h4>Tindak lanjut tahun ini</h4>
            <ul>{r.tindak_lanjut.map((t) => (
              <li key={t.id}>{tgl(t.tanggal)}: {label(TINDAK_LANJUT, t.jenis)}{t.dicatat_nama && <small className="catatan"> oleh {t.dicatat_nama}</small>}{t.catatan && <><br /><small className="catatan">{t.catatan}</small></>}
                {bisaTindak && <> <button className="tombol-ikon" onClick={() => hapus(t.id)}>Hapus</button></>}</li>
            ))}{r.tindak_lanjut.length === 0 && <li className="catatan">Belum ada.</li>}</ul>
            {bisaTindak && (
              <form className="form" onSubmit={simpan}>
                <label>Catat tindak lanjut<select value={jenis} onChange={(e) => setJenis(e.target.value)}>{TINDAK_LANJUT.map(([key, n]) => <option key={key} value={key}>{n}</option>)}</select></label>
                <label>Tanggal<input type="date" value={tanggal} min={tambahHari(hariIni(), -120)} max={hariIni()} onChange={(e) => setTanggal(e.target.value)} required /></label>
                <label>Catatan<textarea rows={2} maxLength={1000} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label>
                <button className="tombol tombol-isi" disabled={sibuk}>Simpan tindak lanjut</button>
              </form>
            )}
            <h4>Prestasi</h4>
            <ul>{r.prestasi.map((p) => <li key={p.id}>{p.nama}{p.peringkat && ` (${p.peringkat})`}, {label(BIDANG_PRESTASI, p.bidang)} tingkat {label(TINGKAT, p.tingkat).toLowerCase()}{p.status !== 'terverifikasi' && <> <span className="lencana">{label(STATUS_CATATAN, p.status)}</span></>}</li>)}{r.prestasi.length === 0 && <li className="catatan">Belum ada.</li>}</ul>
            <h4>Ekstrakurikuler</h4>
            <ul>{r.ekskul.map((e) => <li key={e.nama}>{e.nama} ({e.peran}){e.predikat && `, ${label([['sangat_baik', 'sangat baik'], ['baik', 'baik'], ['cukup', 'cukup'], ['perlu_pembinaan', 'perlu pembinaan']], e.predikat)}`}</li>)}{r.ekskul.length === 0 && <li className="catatan">Tidak mengikuti.</li>}</ul>
          </div>
        </div>
      )}
    </div>
  )
}

function Isi({ izin }: { izin: string[] }) {
  const [level, setLevel] = useState('')
  const [rombel, setRombel] = useState('')
  const [cari, setCari] = useState('')
  const [semua, setSemua] = useState(false)
  const [halaman, setHalaman] = useState(0)
  const [rombels, setRombels] = useState<RombelPilih[]>([])
  const [data, setData] = useState<Hasil | null>(null)
  const [galat, setGalat] = useState('')
  const [pilih, setPilih] = useState<Baris | null>(null)
  const BATAS = 50

  useEffect(() => { panggil<RombelPilih[]>('kesiswaan_rombel', { p_untuk: 'pantau' }).then(setRombels).catch(() => setRombels([])) }, [])
  const muat = useCallback(async () => {
    try { setData(await panggil<Hasil>('risiko_daftar', { p_rombel: rombel || null, p_level: level || null, p_cari: cari.trim() || null, p_batas: BATAS, p_mulai: halaman * BATAS, p_semua: semua })); setGalat('') }
    catch (e) { setGalat((e as Error).message) }
  }, [rombel, level, cari, halaman, semua])
  useEffect(() => { void muat() }, [muat])

  const cakupanKurang = data && data.rombel_total > 0 && data.rombel_tercatat < data.rombel_total

  async function ekspor() {
    try {
      const h = await panggil<Hasil>('risiko_daftar', { p_rombel: rombel || null, p_level: level || null, p_cari: cari.trim() || null, p_batas: 200, p_mulai: 0, p_semua: semua })
      unduhCsv('risiko-siswa', [['Nama', 'NISN', 'Rombel', 'Level', 'Skor', 'Alasan', 'Poin', 'Tindak lanjut', 'Perlu tindak'], ...h.baris.map((b) => [b.nama, b.nisn, b.rombel, b.level, b.skor, b.sinyal.join('; '), b.poin, b.tindak_lanjut, b.perlu_tindak ? 'Ya' : ''])])
    } catch (e) { setGalat((e as Error).message) }
  }

  return (
    <Halaman judul="Risiko siswa" lead="Siswa yang perlu dilihat lebih dulu berdasarkan kehadiran 30 hari terakhir, poin pelanggaran, keaktifan LMS, dan tugas tertunggak. Skor adalah penanda untuk memulai percakapan, bukan penilaian terhadap siswa.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {data && (
        <div className="grid grid-3">
          <div className="kartu"><small>Risiko tinggi</small><h2>{data.tinggi}</h2></div>
          <div className="kartu"><small>Risiko sedang</small><h2>{data.sedang}</h2></div>
          <div className="kartu"><small>Siswa dalam jangkauan</small><h2>{data.siswa}</h2></div>
        </div>
      )}
      {cakupanKurang && data && (
        <p className="kartu jarak" role="note">Kehadiran harian baru terisi lengkap di {data.rombel_tercatat} dari {data.rombel_total} rombel (minimal 5 hari dalam 30 hari terakhir). Sinyal alpa, tidak hadir, dan terlambat belum mewakili rombel yang belum terisi, sehingga siswa di sana bisa tampak aman padahal datanya kosong.</p>
      )}
      <div className="aksi" style={{ alignItems: 'center' }}>
        <select value={level} onChange={(e) => { setLevel(e.target.value); setHalaman(0) }} aria-label="Level">
          <option value="">Tinggi dan sedang</option><option value="tinggi">Hanya tinggi</option><option value="sedang">Hanya sedang</option>
        </select>
        <select value={rombel} onChange={(e) => { setRombel(e.target.value); setHalaman(0) }} aria-label="Rombel">
          <option value="">Semua rombel</option>
          {rombels.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
        <input type="search" placeholder="Cari nama atau NISN" value={cari} onChange={(e) => { setCari(e.target.value); setHalaman(0) }} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={semua} onChange={(e) => { setSemua(e.target.checked); setHalaman(0) }} />Tampilkan juga yang tanpa sinyal</label>
        <button className="tombol" onClick={ekspor}>Unduh CSV</button>
      </div>
      {pilih && <Detail pd={pilih} bisaTindak={izin.includes('kesiswaan.pantau')} tutup={() => setPilih(null)} ubah={() => void muat()} />}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Siswa</th><th>Level</th><th>Alasan</th><th>Poin</th><th>Tindak lanjut</th><th /></tr></thead>
          <tbody>
            {data?.baris.map((b) => (
              <tr key={b.pd}>
                <td>{b.nama}<br /><small className="catatan">{b.rombel}</small></td>
                <td><span className="lencana" style={{ background: warna[b.level] }}>{b.level} ({b.skor})</span></td>
                <td>{b.sinyal.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{b.sinyal.map((s) => <li key={s}>{s}</li>)}</ul> : <span className="catatan">-</span>}
                  {b.hari_tercatat < 5 && <small className="catatan">Kehadiran baru tercatat {b.hari_tercatat} hari.</small>}</td>
                <td>{b.poin}</td>
                <td>{b.tindak_lanjut}{b.perlu_tindak && <> <span className="lencana" style={{ background: '#f8d7da', color: '#7a1b24' }}>Perlu tindak</span></>}</td>
                <td><button className="tombol-ikon" onClick={() => { setPilih(b); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Buka</button></td>
              </tr>
            ))}
            {data && data.baris.length === 0 && <tr><td colSpan={6} className="catatan">Tidak ada siswa yang cocok.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="aksi" style={{ alignItems: 'center' }}>
          <button className="tombol" disabled={halaman === 0} onClick={() => setHalaman((h) => h - 1)}>Sebelumnya</button>
          <span className="catatan">{data.total ? `${halaman * BATAS + 1} sampai ${Math.min((halaman + 1) * BATAS, data.total)} dari ${data.total}` : '0'}</span>
          <button className="tombol" disabled={(halaman + 1) * BATAS >= data.total} onClick={() => setHalaman((h) => h + 1)}>Berikutnya</button>
        </div>
      )}
      <details className="kartu jarak">
        <summary>Cara skor dihitung</summary>
        <ul>
          <li>Alpa 3 kali atau lebih dalam 30 hari: +1. Enam kali atau lebih: +2.</li>
          <li>Tidak hadir (alpa, sakit, izin) 8 hari atau lebih: +1. Terlambat 5 kali atau lebih: +1.</li>
          <li>Poin pelanggaran terverifikasi tahun ajaran ini: 50 atau lebih +1, 100 atau lebih +2.</li>
          <li>Keaktifan LMS di bawah 50% dari sedikitnya 6 pertemuan wajib absen: +1. Lima tugas atau lebih lewat tenggat belum dikumpulkan: +1.</li>
          <li>Skor 3 atau lebih: tinggi. Skor 1 sampai 2: sedang. Tanda perlu tindak muncul bila ambang poin yang terlewati lebih banyak daripada tindak lanjut yang sudah dicatat.</li>
        </ul>
      </details>
      <p><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}

export default function Risiko() {
  return <Gerbang perlu={['kesiswaan.pantau']} judul="Risiko siswa">{(izin) => <Isi izin={izin} />}</Gerbang>
}
