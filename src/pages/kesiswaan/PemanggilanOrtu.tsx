// Pemanggilan orang tua berjenjang. Pengelola kesiswaan menjadwalkan; wali kelas menindaklanjuti dengan berita acara.
// Panggilan 1 sampai 3, lalu kunjungan rumah dan SP 1. Orang tua tidak hadir (dikonfirmasi wali kelas) langsung naik ke tahap berikutnya.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { panggil, tgl, tglJam } from '../../lib/rpc'
import { kodeBerkas } from '../../lib/gambar'
import { STATUS_PANGGILAN, hariIni, label, namaTahapPanggilan, tambahHari, useAksesKes } from '../../lib/kesiswaan'

type Kandidat = { pd: string; nama: string; nisn: string | null; rombel: string | null; wali: string | null; alfa: number; sakit: number; izin: number; melebihi: string[]; kondisi: string; urutan: number }
type Panggilan = {
  id: string; pd: string; nama: string; nisn: string | null; rombel: string | null; wali: string | null; urutan: number; periode: string
  alfa: number; sakit: number; izin: number; tgl_panggil: string; catatan_jadwal: string | null; status: string; dibuat_nama: string | null; dibuat_pada: string
  tgl_pelaksanaan: string | null; ringkasan: string | null; kesepakatan: string | null; sp_terbit: boolean; sp_nomor: string | null
  lampiran_path: string | null; lampiran_nama: string | null; diisi_nama: string | null; diisi_pada: string | null; rangkaian: string
  bisa_isi: boolean; bisa_batal: boolean
}
const KONDISI: Record<string, string> = {
  baru: 'Melewati ambang: Panggilan 1', lanjut: 'Masih melewati ambang setelah panggilan sebelumnya',
  tidak_hadir: 'Orang tua tidak hadir: naik tahap', membaik: 'Membaik: tidak lagi melewati ambang',
}
const JENIS_BERKAS: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
const ekstensi = (f: File) => f.name.split('.').pop()?.toLowerCase() ?? ''
const bulanLalu = () => { const d = new Date(hariIni() + 'T00:00:00'); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const namaBulan = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

function BarisKandidat({ k, bulan, muat }: { k: Kandidat; bulan: string; muat: () => void }) {
  const [tglP, setTglP] = useState(tambahHari(hariIni(), 3))
  const [cat, setCat] = useState('')
  const [buka, setBuka] = useState(false)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const jalan = async (fn: () => Promise<unknown>) => { setSibuk(true); setGalat(''); try { await fn(); muat() } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) } }
  const mel = (n: string) => k.melebihi.includes(n)
  return (
    <tr>
      <td>{k.nama}<br /><small className="catatan">{k.nisn ?? '-'}</small></td>
      <td>{k.rombel ?? '-'}<br /><small className="catatan">Wali: {k.wali ?? '-'}</small></td>
      <td style={mel('alfa') ? { fontWeight: 700 } : undefined}>{k.alfa}</td>
      <td style={mel('sakit') ? { fontWeight: 700 } : undefined}>{k.sakit}</td>
      <td style={mel('izin') ? { fontWeight: 700 } : undefined}>{k.izin}</td>
      <td>
        <strong>{k.kondisi === 'membaik' ? 'Tutup rangkaian' : namaTahapPanggilan(k.urutan)}</strong><br /><small className="catatan">{KONDISI[k.kondisi]}</small>
        {buka && k.kondisi !== 'membaik' && (
          <div className="aksi" style={{ alignItems: 'center' }}>
            <label>Tanggal <input type="date" value={tglP} min={hariIni()} onChange={(e) => setTglP(e.target.value)} /></label>
            <input placeholder="Catatan untuk wali kelas (opsional)" value={cat} onChange={(e) => setCat(e.target.value)} maxLength={500} aria-label="Catatan" />
            <button className="tombol tombol-isi" disabled={sibuk} onClick={() => jalan(() => panggil('panggilan_buat', { p_pd: k.pd, p_bulan: bulan, p_tgl: tglP, p_catatan: cat || null }))}>Jadwalkan</button>
            <button className="tombol" onClick={() => setBuka(false)}>Batal</button>
          </div>
        )}
        {galat && <p className="galat" role="alert">{galat}</p>}
      </td>
      <td>
        {k.kondisi === 'membaik'
          ? <button className="tombol" disabled={sibuk} onClick={() => jalan(() => panggil('panggilan_tutup', { p_pd: k.pd, p_catatan: 'Tidak lagi melewati ambang' }))}>Tutup</button>
          : !buka && <button className="tombol tombol-isi" onClick={() => setBuka(true)}>Jadwalkan</button>}
      </td>
    </tr>
  )
}

function Perlu() {
  const [bulan, setBulan] = useState(bulanLalu())
  const [data, setData] = useState<{ bulan: string; ambang: { alfa: number; sakit: number; izin: number }; baris: Kandidat[] } | null>(null)
  const [galat, setGalat] = useState('')
  const muat = useCallback(() => {
    panggil<NonNullable<typeof data>>('panggilan_kandidat', { p_bulan: bulan + '-01' }).then((x) => { setData(x); setGalat('') }).catch((e: Error) => { setGalat(e.message); setData(null) })
  }, [bulan])
  useEffect(() => { muat() }, [muat])
  const a = data?.ambang
  return (
    <div>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <label>Bulan yang dinilai <input type="month" value={bulan} max={bulanLalu()} onChange={(e) => e.target.value && setBulan(e.target.value)} /></label>
      </div>
      <p className="catatan">
        {a ? `Ambang per bulan: alfa lebih dari ${a.alfa}, sakit lebih dari ${a.sakit}, atau izin lebih dari ${a.izin}. ` : ''}
        Siswa yang melewati ambang pada bulan {data ? namaBulan(data.bulan) : 'ini'} dijadwalkan untuk Panggilan 1 di bulan berjalan. Dispensasi dan keterlambatan tidak dihitung.
      </p>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Siswa</th><th>Kelas</th><th>Alfa</th><th>Sakit</th><th>Izin</th><th>Tahap</th><th /></tr></thead>
          <tbody>
            {!data && !galat && <tr><td colSpan={7} className="catatan">Memuat...</td></tr>}
            {data?.baris.length === 0 && <tr><td colSpan={7} className="catatan">Tidak ada siswa yang perlu dipanggil untuk bulan ini.</td></tr>}
            {data?.baris.map((k) => <BarisKandidat key={k.pd} k={k} bulan={bulan + '-01'} muat={muat} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KartuPanggilan({ p, muat }: { p: Panggilan; muat: () => void }) {
  const { profil } = useAuth()
  const [buka, setBuka] = useState(false)
  const [hadir, setHadir] = useState(true)
  const [tglP, setTglP] = useState(hariIni())
  const [ringkasan, setRingkasan] = useState('')
  const [sepakat, setSepakat] = useState('')
  const [sp, setSp] = useState(false)
  const [spNo, setSpNo] = useState('')
  const [berkas, setBerkas] = useState<File | null>(null)
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const homeVisit = p.urutan >= 4

  async function kirim() {
    setGalat('')
    const jenis = berkas ? JENIS_BERKAS[ekstensi(berkas)] : undefined
    if (berkas && !jenis) return setGalat('Lampiran harus berupa PDF, PNG, JPG, atau WebP.')
    if (berkas && berkas.size > 5 * 1024 * 1024) return setGalat('Ukuran lampiran maksimal 5 MB.')
    setSibuk(true)
    let path: string | null = null
    try {
      if (berkas && jenis) {
        path = `${profil?.npsn}/${p.id}/lampiran-${kodeBerkas()}.${ekstensi(berkas)}`
        const { error } = await supabase.storage.from('panggilan-ortu').upload(path, berkas, { contentType: jenis, upsert: false })
        if (error) throw new Error(error.message)
      }
      await panggil('panggilan_tindaklanjut', {
        p_id: p.id, p_hadir: homeVisit ? true : hadir, p_tgl: tglP, p_ringkasan: ringkasan, p_kesepakatan: sepakat || null,
        p_sp_terbit: homeVisit ? sp : false, p_sp_nomor: homeVisit ? spNo || null : null, p_lampiran_path: path, p_lampiran_nama: berkas?.name ?? null,
      })
      setBuka(false); muat()
    } catch (e) {
      if (path) await supabase.storage.from('panggilan-ortu').remove([path]).catch(() => undefined)
      setGalat((e as Error).message)
    } finally { setSibuk(false) }
  }
  async function lampiran() {
    if (!p.lampiran_path) return
    const { data, error } = await supabase.storage.from('panggilan-ortu').createSignedUrl(p.lampiran_path, 300, { download: p.lampiran_nama ?? 'lampiran' })
    if (error || !data) return setGalat(error?.message ?? 'Tautan berkas gagal dibuat.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  async function batal() {
    if (!window.confirm(`Batalkan jadwal ${namaTahapPanggilan(p.urutan)} untuk ${p.nama}?`)) return
    try { await panggil('panggilan_batalkan', { p_id: p.id }); muat() } catch (e) { setGalat((e as Error).message) }
  }

  const lewat = p.status === 'dijadwalkan' && p.tgl_panggil < hariIni()
  return (
    <div className="kartu">
      <div className="aksi" style={{ marginTop: 0, justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{p.nama} <small className="catatan">{p.rombel ?? '-'} · Wali: {p.wali ?? '-'}</small></h3>
        <strong>{label(STATUS_PANGGILAN, p.status)}</strong>
      </div>
      <p style={{ margin: '6px 0' }}><strong>{namaTahapPanggilan(p.urutan)}</strong>, {tgl(p.tgl_panggil)}{lewat && <b className="galat"> · lewat jadwal</b>}</p>
      <small className="catatan">Dasar: {namaBulan(p.periode)}, alfa {p.alfa}, sakit {p.sakit}, izin {p.izin}. Dijadwalkan {p.dibuat_nama ?? '-'}, {tglJam(p.dibuat_pada)}{p.catatan_jadwal ? `. ${p.catatan_jadwal}` : ''}</small>
      {p.diisi_pada && (
        <div style={{ marginTop: 8 }}>
          <small className="catatan">Berita acara oleh {p.diisi_nama ?? '-'}, pelaksanaan {tgl(p.tgl_pelaksanaan)}</small>
          <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{p.ringkasan}</p>
          {p.kesepakatan && <p className="catatan" style={{ whiteSpace: 'pre-wrap' }}>Kesepakatan: {p.kesepakatan}</p>}
          {p.sp_terbit && <p className="catatan">SP 1 diberikan{p.sp_nomor ? `, nomor ${p.sp_nomor}` : ''}.</p>}
        </div>
      )}
      <div className="aksi">
        {p.lampiran_path && <button className="tombol" onClick={lampiran}>Lihat lampiran</button>}
        {p.bisa_isi && !buka && <button className="tombol tombol-isi" onClick={() => setBuka(true)}>Isi tindak lanjut</button>}
        {p.bisa_batal && !buka && <button className="tombol" onClick={batal}>Batalkan jadwal</button>}
      </div>
      {buka && (
        <div className="jarak">
          {!homeVisit && (
            <div className="aksi" style={{ marginTop: 0 }} role="radiogroup" aria-label="Kehadiran orang tua">
              <button type="button" aria-pressed={hadir} className={hadir ? 'tombol tombol-isi' : 'tombol'} onClick={() => setHadir(true)}>Orang tua hadir</button>
              <button type="button" aria-pressed={!hadir} className={!hadir ? 'tombol tombol-isi' : 'tombol'} onClick={() => setHadir(false)}>Orang tua tidak hadir</button>
            </div>
          )}
          {!homeVisit && !hadir && <p className="catatan">Tindak lanjut langsung naik ke tahap berikutnya tanpa menunggu bulan depan.</p>}
          <label>Tanggal pelaksanaan <input type="date" value={tglP} max={hariIni()} onChange={(e) => setTglP(e.target.value)} /></label>
          <textarea rows={4} maxLength={3000} value={ringkasan} onChange={(e) => setRingkasan(e.target.value)} style={{ width: '100%' }} aria-label="Berita acara"
            placeholder={hadir || homeVisit ? 'Berita acara: yang dibahas, penyebab ketidakhadiran, dan hasil pertemuan (minimal 10 karakter)' : 'Keterangan: bagaimana orang tua dihubungi dan jawabannya (minimal 10 karakter)'} />
          {(hadir || homeVisit) && <textarea rows={2} maxLength={2000} value={sepakat} onChange={(e) => setSepakat(e.target.value)} style={{ width: '100%' }} aria-label="Kesepakatan" placeholder="Kesepakatan dengan orang tua (opsional)" />}
          {homeVisit && (
            <div className="aksi" style={{ alignItems: 'center' }}>
              <label><input type="checkbox" checked={sp} onChange={(e) => setSp(e.target.checked)} /> SP 1 sudah diberikan</label>
              <input placeholder="Nomor SP 1 (opsional)" value={spNo} onChange={(e) => setSpNo(e.target.value)} maxLength={100} aria-label="Nomor SP" />
            </div>
          )}
          <label>Lampiran berita acara atau foto <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} /></label>
          <div className="aksi">
            <button className="tombol tombol-isi" disabled={sibuk} onClick={kirim}>{sibuk ? 'Menyimpan...' : 'Simpan'}</button>
            <button className="tombol" disabled={sibuk} onClick={() => { setBuka(false); setGalat('') }}>Batal</button>
          </div>
        </div>
      )}
      {galat && <p className="galat" role="alert">{galat}</p>}
    </div>
  )
}

function Daftar({ status }: { status: string }) {
  const [data, setData] = useState<{ kelola: boolean; baris: Panggilan[] } | null>(null)
  const [galat, setGalat] = useState('')
  const muat = useCallback(() => {
    panggil<NonNullable<typeof data>>('panggilan_daftar', { p_status: status || null }).then((x) => { setData(x); setGalat('') }).catch((e: Error) => setGalat(e.message))
  }, [status])
  useEffect(() => { muat() }, [muat])
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {!data && !galat && <p className="catatan">Memuat...</p>}
      {data?.baris.map((p) => <KartuPanggilan key={p.id} p={p} muat={muat} />)}
      {data?.baris.length === 0 && <p className="catatan">Tidak ada data.</p>}
    </div>
  )
}

export default function PemanggilanOrtu() {
  const { punya, memuat } = useAksesKes()
  const kelola = punya('panggilan.kelola')
  const wali = punya('panggilan.wali')
  const [tab, setTab] = useState<'perlu' | 'menunggu' | 'riwayat'>('perlu')
  useEffect(() => { if (!memuat) setTab(kelola ? 'perlu' : 'menunggu') }, [memuat, kelola])

  if (memuat) return <Halaman judul="Pemanggilan orang tua"><p className="catatan">Memeriksa hak akses...</p></Halaman>
  if (!kelola && !wali) return <Halaman judul="Tidak ada akses" lead="Pemanggilan orang tua untuk pengelola kesiswaan dan wali kelas."><Link to="/portal" className="tombol tombol-isi">Kembali ke portal</Link></Halaman>
  return (
    <Halaman judul="Pemanggilan orang tua" lead="Siswa yang sering tidak hadir dipanggil bertahap bersama orang tua: panggilan 1 sampai 3, lalu kunjungan rumah dan SP 1. Wali kelas mengisi berita acara setiap tahap.">
      <div className="aksi" style={{ marginTop: 0 }}>
        {kelola && <button className={tab === 'perlu' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('perlu')}>Perlu dipanggil</button>}
        <button className={tab === 'menunggu' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('menunggu')}>{kelola ? 'Menunggu wali kelas' : 'Perlu saya tindaklanjuti'}</button>
        <button className={tab === 'riwayat' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('riwayat')}>Riwayat</button>
      </div>
      <div className="jarak">
        {tab === 'perlu' && kelola && <Perlu />}
        {tab === 'menunggu' && <Daftar status="dijadwalkan" />}
        {tab === 'riwayat' && <Daftar status="" />}
      </div>
      <p className="catatan jarak"><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}
