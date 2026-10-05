// Bimbingan dan Konseling: kasus pencegahan putus sekolah (ATS), siswa berisiko yang belum ditangani, dan ringkasan.
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import CariSiswa from '../../components/CariSiswa'
import { panggil, tgl } from '../../lib/rpc'
import { ALASAN_KASUS, PEMICU_KASUS, STATUS_KASUS, hariIni, label, tambahHari, type SiswaCari } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Ringkasan = {
  tahun_ajaran: string; kelola: boolean
  aktif: { rujukan: number; terbuka: number; pemantauan: number }
  tinjau_lewat: number
  ditutup: { selesai_bertahan: number; pindah: number; putus_sekolah: number; ditutup: number }
  catatan_30_hari: number
}
type Kasus = {
  id: string; pd: string; nama: string; nisn: string | null; rombel: string | null; status: string; alasan_utama: string; pemicu: string
  tinjau_tanggal: string | null; lewat_tinjau: boolean; dibuat_pada: string; ditutup_pada: string | null; catatan: number; terakhir: string | null
}
type Berisiko = { tersedia: boolean; total?: number; baris: { pd: string; nama: string; rombel: string; skor: number; level: string; sinyal: string[]; poin: number }[] }

type Draf = { pd: string; nama: string; sinyal: string[]; pemicu: 'risiko' | 'manual' | 'orang_tua' }

function FormBuka({ draf, selesai, batal }: { draf: Draf; selesai: (id: string) => void; batal: () => void }) {
  const [alasan, setAlasan] = useState(draf.sinyal.some((s) => s.startsWith('Alpa') || s.startsWith('Tidak hadir')) ? 'kehadiran' : 'ekonomi')
  const [pemicu, setPemicu] = useState<string>(draf.pemicu)
  const [ringkasan, setRingkasan] = useState(draf.sinyal.join('; '))
  const [rencana, setRencana] = useState('')
  const [tinjau, setTinjau] = useState(tambahHari(hariIni(), 14))
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    setSibuk(true); setGalat('')
    try {
      const id = await panggil<string>('bk_kasus_buka', { p_pd: draf.pd, p_alasan: alasan, p_ringkasan: ringkasan.trim() || null, p_rencana: rencana.trim() || null, p_tinjau: tinjau || null, p_pemicu: pemicu })
      selesai(id)
    } catch (x) { setGalat((x as Error).message) } finally { setSibuk(false) }
  }
  return (
    <form className="kartu form jarak" style={{ maxWidth: 640 }} onSubmit={kirim}>
      <h3>Buka kasus: {draf.nama}</h3>
      {galat && <p className="galat" role="alert">{galat}</p>}
      <label>Alasan utama<select value={alasan} onChange={(e) => setAlasan(e.target.value)}>{ALASAN_KASUS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      <label>Asal kasus<select value={pemicu} onChange={(e) => setPemicu(e.target.value)}>{PEMICU_KASUS.filter(([k]) => k !== 'rujukan').map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      <label>Ringkasan<textarea rows={2} maxLength={1000} value={ringkasan} onChange={(e) => setRingkasan(e.target.value)} /></label>
      <label>Rencana penanganan<textarea rows={2} maxLength={2000} value={rencana} onChange={(e) => setRencana(e.target.value)} placeholder="Misalnya konseling, kunjungan rumah, usul PIP" /></label>
      <label>Tinjau ulang pada<input type="date" value={tinjau} min={hariIni()} max={tambahHari(hariIni(), 180)} onChange={(e) => setTinjau(e.target.value)} /></label>
      <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi" disabled={sibuk}>Buka kasus</button><button type="button" className="tombol" onClick={batal}>Batal</button></div>
    </form>
  )
}

function Isi() {
  const nav = useNavigate()
  const [r, setR] = useState<Ringkasan | null>(null)
  const [kasus, setKasus] = useState<Kasus[]>([])
  const [risiko, setRisiko] = useState<Berisiko | null>(null)
  const [filter, setFilter] = useState<'aktif' | 'selesai' | 'semua'>('aktif')
  const [cari, setCari] = useState('')
  const [galat, setGalat] = useState('')
  const [draf, setDraf] = useState<Draf | null>(null)
  const [manual, setManual] = useState<SiswaCari | null>(null)

  const muat = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        panggil<Ringkasan>('bk_beranda'),
        panggil<Berisiko>('bk_berisiko', { p_level: 'tinggi' }),
        panggil<Kasus[]>('bk_kasus_daftar', { p_status: filter, p_cari: cari.trim() || null }),
      ])
      setR(a); setRisiko(b); setKasus(c); setGalat('')
    } catch (e) { setGalat((e as Error).message) }
  }, [filter, cari])
  useEffect(() => { void muat() }, [muat])

  const kelola = r?.kelola ?? false
  const tutup = r ? r.ditutup.selesai_bertahan + r.ditutup.pindah + r.ditutup.putus_sekolah + r.ditutup.ditutup : 0

  return (
    <Halaman judul="Bimbingan dan konseling" lead="Catatan konseling dan pencegahan putus sekolah. Isi catatan hanya terbaca oleh Guru BK dan Waka Kesiswaan. Setiap pembukaan masuk jejak audit.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {r && (
        <>
          <div className="grid grid-3">
            <div className="kartu"><small>Rujukan baru</small><h2>{r.aktif.rujukan}</h2><p className="catatan">Dari wali kelas dan guru, menunggu diterima BK.</p></div>
            <div className="kartu"><small>Kasus aktif</small><h2>{r.aktif.terbuka + r.aktif.pemantauan}</h2><p className="catatan">{r.aktif.terbuka} ditangani, {r.aktif.pemantauan} dipantau.</p></div>
            <div className="kartu"><small>Tinjau ulang terlewat</small><h2>{r.tinjau_lewat}</h2><p className="catatan">Kasus yang melewati tanggal tinjau.</p></div>
          </div>
          <div className="kartu jarak">
            <h3>Hasil penanganan tahun ajaran {r.tahun_ajaran}</h3>
            <p>{tutup === 0 ? 'Belum ada kasus yang ditutup.' : `${r.ditutup.selesai_bertahan} bertahan · ${r.ditutup.pindah} pindah · ${r.ditutup.putus_sekolah} putus sekolah (ATS) · ${r.ditutup.ditutup} ditutup lainnya`}</p>
            <p className="catatan">{r.catatan_30_hari} catatan konseling dalam 30 hari terakhir.</p>
          </div>
        </>
      )}

      {draf && <FormBuka draf={draf} selesai={(id) => nav(`/portal/kesiswaan/bk/${id}`)} batal={() => setDraf(null)} />}

      {kelola && !draf && (
        <div className="kartu jarak" style={{ maxWidth: 640 }}>
          <h3>Buka kasus untuk siswa tertentu</h3>
          <div className="form">
            <CariSiswa untuk="pantau" pilih={setManual} dipilih={manual} />
            <button className="tombol tombol-isi" disabled={!manual} onClick={() => manual && setDraf({ pd: manual.id, nama: manual.nama, sinyal: [], pemicu: 'manual' })}>Lanjut</button>
          </div>
        </div>
      )}

      <div className="jarak">
        <h2>Risiko tinggi tanpa kasus</h2>
        {risiko && !risiko.tersedia && <p className="catatan">Daftar ini membutuhkan hak memantau siswa berisiko.</p>}
        {risiko?.tersedia && (
          <div className="tabel-bungkus">
            <table>
              <thead><tr><th>Siswa</th><th>Alasan masuk daftar</th><th /></tr></thead>
              <tbody>
                {risiko.baris.map((b) => (
                  <tr key={b.pd}>
                    <td>{b.nama}<br /><small className="catatan">{b.rombel} · skor {b.skor}</small></td>
                    <td><ul style={{ margin: 0, paddingLeft: 18 }}>{b.sinyal.map((s) => <li key={s}>{s}</li>)}</ul></td>
                    <td>{kelola && <button className="tombol-ikon" onClick={() => { setDraf({ pd: b.pd, nama: b.nama, sinyal: b.sinyal, pemicu: 'risiko' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Buka kasus</button>}</td>
                  </tr>
                ))}
                {risiko.baris.length === 0 && <tr><td colSpan={3} className="catatan">Semua siswa risiko tinggi sudah punya kasus aktif.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="catatan">Skor risiko adalah penanda untuk memulai percakapan. Alasan sebenarnya putus sekolah sering tidak terlihat di data sekolah, seperti ekonomi keluarga, bekerja, atau pernikahan. Karena itu kasus dapat dibuka juga dari rujukan guru dan temuan BK.</p>
      </div>

      <div className="jarak">
        <h2>Kasus</h2>
        <div className="aksi" style={{ alignItems: 'center', marginTop: 0 }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter status">
            <option value="aktif">Aktif</option><option value="selesai">Selesai</option><option value="semua">Semua</option>
          </select>
          <input type="search" placeholder="Cari nama atau NISN" value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <div className="tabel-bungkus jarak">
          <table>
            <thead><tr><th>Siswa</th><th>Status</th><th>Alasan utama</th><th>Tinjau ulang</th><th>Catatan</th><th /></tr></thead>
            <tbody>
              {kasus.map((k) => (
                <tr key={k.id}>
                  <td>{k.nama}<br /><small className="catatan">{k.rombel ?? '-'} · {label(PEMICU_KASUS, k.pemicu)}</small></td>
                  <td><span className="lencana">{label(STATUS_KASUS, k.status)}</span></td>
                  <td>{label(ALASAN_KASUS, k.alasan_utama)}</td>
                  <td>{k.tinjau_tanggal ? tgl(k.tinjau_tanggal) : '-'}{k.lewat_tinjau && <> <span className="lencana" style={{ background: '#f8d7da', color: '#7a1b24' }}>Terlewat</span></>}</td>
                  <td>{k.catatan}{k.terakhir && <><br /><small className="catatan">terakhir {tgl(k.terakhir)}</small></>}</td>
                  <td><Link className="tombol-ikon" to={`/portal/kesiswaan/bk/${k.id}`}>Buka</Link></td>
                </tr>
              ))}
              {kasus.length === 0 && <tr><td colSpan={6} className="catatan">Tidak ada kasus.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}

export default function BK() {
  return <Gerbang perlu={['bk.kelola', 'bk.baca']} judul="Bimbingan dan konseling">{() => <Isi />}</Gerbang>
}
