// Rincian satu kasus BK: konteks siswa, rencana, status, dan catatan konseling.
import TombolIkon from '../../components/TombolIkon'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil, tgl } from '../../lib/rpc'
import { ALASAN_KASUS, BIDANG_BK, JENIS_BK, PEMICU_KASUS, STATUS_BEASISWA, STATUS_KASUS, STATUS_KASUS_TUTUP, hariIni, label, tambahHari } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Detail = {
  kelola: boolean
  kasus: { id: string; peserta_didik_id: string; pemicu: string; alasan_utama: string; ringkasan: string | null; rencana: string | null; status: string; tinjau_tanggal: string | null; hasil: string | null; dibuat_nama: string | null; dibuat_pada: string; ditutup_pada: string | null }
  siswa: { pd: string; nama: string; nisn: string | null; rombel: string | null }
  risiko: { level: string; skor: number; sinyal: string[] } | null
  poin: number
  beasiswa: { program: string; status: string }[]
  catatan: { id: string; tanggal: string; jenis: string; bidang: string; uraian: string; tindak_lanjut: string | null; oleh: string | null; milik_saya: boolean }[]
}

function Isi() {
  const { id = '' } = useParams()
  const [d, setD] = useState<Detail | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [sunting, setSunting] = useState(false)
  // form kasus
  const [status, setStatus] = useState('terbuka')
  const [alasan, setAlasan] = useState('lainnya')
  const [ringkasan, setRingkasan] = useState('')
  const [rencana, setRencana] = useState('')
  const [tinjau, setTinjau] = useState('')
  const [hasil, setHasil] = useState('')
  // form catatan
  const [cid, setCid] = useState<string | null>(null)
  const [tanggal, setTanggal] = useState(hariIni())
  const [jenis, setJenis] = useState('konseling_individu')
  const [bidang, setBidang] = useState('pribadi')
  const [uraian, setUraian] = useState('')
  const [lanjut, setLanjut] = useState('')

  const muat = useCallback(async () => {
    try {
      const x = await panggil<Detail>('bk_kasus_detail', { p_id: id })
      setD(x); setGalat('')
      setStatus(x.kasus.status === 'rujukan' ? 'terbuka' : x.kasus.status); setAlasan(x.kasus.alasan_utama); setRingkasan(x.kasus.ringkasan ?? ''); setRencana(x.kasus.rencana ?? '')
      setTinjau(x.kasus.tinjau_tanggal ?? tambahHari(hariIni(), 14)); setHasil(x.kasus.hasil ?? '')
    } catch (e) { setGalat((e as Error).message) }
  }, [id])
  useEffect(() => { void muat() }, [muat])

  async function jalan(fn: () => Promise<unknown>, pesan: string) {
    setSibuk(true); setGalat(''); setInfo('')
    try { await fn(); setInfo(pesan); await muat() } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }
  const simpanKasus = (e: React.FormEvent) => {
    e.preventDefault()
    void jalan(async () => { await panggil('bk_kasus_ubah', { p_id: id, p_status: status, p_alasan: alasan, p_ringkasan: ringkasan.trim() || null, p_rencana: rencana.trim() || null, p_tinjau: STATUS_KASUS_TUTUP.includes(status) ? null : tinjau || null, p_hasil: hasil.trim() || null }); setSunting(false) }, 'Kasus diperbarui.')
  }
  const simpanCatatan = (e: React.FormEvent) => {
    e.preventDefault()
    if (!d) return
    void jalan(async () => {
      await panggil('bk_catatan_simpan', { p_id: cid, p_pd: d.siswa.pd, p_kasus: id, p_tanggal: tanggal, p_jenis: jenis, p_bidang: bidang, p_uraian: uraian, p_tindak_lanjut: lanjut.trim() || null })
      setCid(null); setUraian(''); setLanjut(''); setTanggal(hariIni())
    }, 'Catatan tersimpan.')
  }
  const ubahCatatan = (c: Detail['catatan'][number]) => { setCid(c.id); setTanggal(c.tanggal); setJenis(c.jenis); setBidang(c.bidang); setUraian(c.uraian); setLanjut(c.tindak_lanjut ?? ''); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }
  const hapusCatatan = (cidHapus: string) => { if (window.confirm('Hapus catatan ini?')) void jalan(() => panggil('bk_catatan_hapus', { p_id: cidHapus }), 'Catatan dihapus.') }

  if (!d) return <Halaman judul="Kasus BK">{galat ? <p className="kartu galat" role="alert">{galat}</p> : <p className="catatan">Memuat...</p>}<p><Link to="/portal/kesiswaan/bk">Kembali ke daftar</Link></p></Halaman>
  const k = d.kasus
  const aktif = ['rujukan', 'terbuka', 'pemantauan'].includes(k.status)
  const tutup = STATUS_KASUS_TUTUP.includes(status)

  return (
    <Halaman judul={d.siswa.nama} lead={`${d.siswa.rombel ?? 'Tanpa rombel'}${d.siswa.nisn ? ` · NISN ${d.siswa.nisn}` : ''}`}>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      <div className="grid grid-2">
        <div className="kartu">
          <div className="aksi" style={{ marginTop: 0, alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Kasus <span className="lencana">{label(STATUS_KASUS, k.status)}</span></h3>
            {d.kelola && !sunting && <button className="tombol" onClick={() => setSunting(true)}>{k.status === 'rujukan' ? 'Terima dan tangani' : 'Ubah'}</button>}
          </div>
          {!sunting ? (
            <>
              <p><strong>{label(ALASAN_KASUS, k.alasan_utama)}</strong> · {label(PEMICU_KASUS, k.pemicu)}{k.dibuat_nama && <small className="catatan"> dibuka oleh {k.dibuat_nama}, {tgl(k.dibuat_pada)}</small>}</p>
              {k.ringkasan && <><h4>Ringkasan</h4><p>{k.ringkasan}</p></>}
              {k.rencana && <><h4>Rencana penanganan</h4><p>{k.rencana}</p></>}
              {aktif && k.tinjau_tanggal && <p className="catatan">Tinjau ulang {tgl(k.tinjau_tanggal)}.</p>}
              {k.hasil && <><h4>Hasil</h4><p>{k.hasil}{k.ditutup_pada && <small className="catatan"> ditutup {tgl(k.ditutup_pada)}</small>}</p></>}
            </>
          ) : (
            <form className="form" onSubmit={simpanKasus}>
              <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS_KASUS.filter(([s]) => s !== 'rujukan').map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select></label>
              <label>Alasan utama<select value={alasan} onChange={(e) => setAlasan(e.target.value)}>{ALASAN_KASUS.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select></label>
              <label>Ringkasan<textarea rows={2} maxLength={1000} value={ringkasan} onChange={(e) => setRingkasan(e.target.value)} /></label>
              <label>Rencana penanganan<textarea rows={3} maxLength={2000} value={rencana} onChange={(e) => setRencana(e.target.value)} /></label>
              {!tutup && <label>Tinjau ulang pada<input type="date" value={tinjau} min={hariIni()} max={tambahHari(hariIni(), 180)} onChange={(e) => setTinjau(e.target.value)} /></label>}
              {tutup && <label>Hasil penanganan (wajib)<textarea rows={2} maxLength={1000} value={hasil} onChange={(e) => setHasil(e.target.value)} required /></label>}
              <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi" disabled={sibuk}>Simpan</button><button type="button" className="tombol" onClick={() => setSunting(false)}>Batal</button></div>
            </form>
          )}
        </div>
        <div className="kartu">
          <h3>Konteks siswa</h3>
          {d.risiko ? <><p><span className="lencana">Risiko {d.risiko.level} ({d.risiko.skor})</span></p><ul>{d.risiko.sinyal.map((s) => <li key={s}>{s}</li>)}{d.risiko.sinyal.length === 0 && <li className="catatan">Tidak ada sinyal otomatis saat ini.</li>}</ul></> : <p className="catatan">Sinyal risiko tidak tersedia.</p>}
          <p>Poin pelanggaran terverifikasi tahun ini: <strong>{d.poin}</strong></p>
          <h4>Beasiswa dan PIP</h4>
          <ul>{d.beasiswa.map((b, i) => <li key={i}>{b.program}: {label(STATUS_BEASISWA, b.status)}</li>)}{d.beasiswa.length === 0 && <li className="catatan">Belum terdaftar di program mana pun. Bila alasannya ekonomi, pertimbangkan mengusulkan PIP lewat Waka Kesiswaan.</li>}</ul>
        </div>
      </div>

      <div className="jarak">
        <h2>Catatan konseling ({d.catatan.length})</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {d.catatan.map((c) => (
            <li key={c.id} className="kartu" style={{ marginBottom: 12 }}>
              <strong>{tgl(c.tanggal)}</strong> · {label(JENIS_BK, c.jenis)} · {label(BIDANG_BK, c.bidang)}{c.oleh && <small className="catatan"> oleh {c.oleh}</small>}
              <p style={{ whiteSpace: 'pre-wrap' }}>{c.uraian}</p>
              {c.tindak_lanjut && <p className="catatan">Tindak lanjut: {c.tindak_lanjut}</p>}
              {d.kelola && c.milik_saya && <div className="aksi" style={{ marginTop: 0 }}><TombolIkon ikon="pena" label="Ubah" onClick={() => ubahCatatan(c)} /><TombolIkon ikon="sampah" label="Hapus" varian="bahaya" onClick={() => hapusCatatan(c.id)} /></div>}
            </li>
          ))}
          {d.catatan.length === 0 && <li className="catatan">Belum ada catatan.</li>}
        </ul>
        {d.kelola && (
          <form className="kartu form" style={{ maxWidth: 640 }} onSubmit={simpanCatatan}>
            <h3>{cid ? 'Ubah catatan' : 'Tambah catatan'}</h3>
            <label>Tanggal<input type="date" value={tanggal} min={tambahHari(hariIni(), -365)} max={hariIni()} onChange={(e) => setTanggal(e.target.value)} required /></label>
            <label>Jenis<select value={jenis} onChange={(e) => setJenis(e.target.value)}>{JENIS_BK.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select></label>
            <label>Bidang<select value={bidang} onChange={(e) => setBidang(e.target.value)}>{BIDANG_BK.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select></label>
            <label>Uraian<textarea rows={4} minLength={3} maxLength={3000} value={uraian} onChange={(e) => setUraian(e.target.value)} required /></label>
            <label>Tindak lanjut<input maxLength={1000} value={lanjut} onChange={(e) => setLanjut(e.target.value)} /></label>
            <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi" disabled={sibuk}>Simpan catatan</button>{cid && <button type="button" className="tombol" onClick={() => { setCid(null); setUraian(''); setLanjut('') }}>Batal ubah</button>}</div>
          </form>
        )}
        {!d.kelola && <p className="catatan">Anda dapat membaca kasus ini. Hanya Guru BK yang menambah atau mengubah catatan.</p>}
      </div>
      <p><Link to="/portal/kesiswaan/bk">Kembali ke daftar kasus</Link></p>
    </Halaman>
  )
}

export default function BKKasus() {
  return <Gerbang perlu={['bk.kelola', 'bk.baca']} judul="Kasus BK">{() => <Isi />}</Gerbang>
}
