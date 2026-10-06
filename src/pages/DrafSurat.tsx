// Draf surat dan SK dari bidang: disusun dari data sistem, diajukan ke Kepala Sekolah, lalu didaftarkan Tata Usaha ke register Persuratan.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { panggil, tglJam } from '../lib/rpc'
import { pilihanTahunAjaran, tahunAjaranSekarang } from '../lib/kurikulum'
import {
  GAYA_DOKUMEN, NAMA_JENIS, blokKeHtml, cetakDokumen, isiBawaan, susunBlok, unduhDocx, type Diktum, type IsiDraf, type JenisDraf,
} from '../lib/dokumenDraf'

type Izin = { buat: boolean; setujui: boolean; daftarkan: boolean }
type Baris = { id: string; jenis: JenisDraf; judul: string; tahun_ajaran: string; status: string; nomor_surat: string | null; dibuat_nama: string | null; diubah_pada: string }
type Draf = Baris & { isi: Partial<IsiDraf>; tanggal_surat: string | null; catatan: string | null; surat_id: string | null }
type Detail = {
  draf: Draf; ks: { nama: string; nip: string | null } | null
  boleh_ubah: boolean; boleh_ajukan: boolean; boleh_putuskan: boolean; boleh_daftarkan: boolean; boleh_batal: boolean
}

const STATUS: Record<string, { label: string; warna: string }> = {
  draf: { label: 'Draf', warna: '#eceff3' },
  diajukan: { label: 'Menunggu Kepala Sekolah', warna: '#fdf1d8' },
  dikembalikan: { label: 'Dikembalikan', warna: '#fbe4e4' },
  disetujui: { label: 'Disetujui, belum didaftarkan', warna: '#e3f4e7' },
  terdaftar: { label: 'Terdaftar di register', warna: '#e3f4e7' },
  dibatalkan: { label: 'Dibatalkan', warna: '#eceff3' },
}
const Lencana = ({ s }: { s: string }) => <span className="lencana" style={{ background: STATUS[s]?.warna, color: '#222', marginBottom: 0 }}>{STATUS[s]?.label ?? s}</span>
const baris = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean)

function Editor({ id, kembali }: { id: string; kembali: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [judul, setJudul] = useState('')
  const [nomor, setNomor] = useState('')
  const [tanggal, setTanggal] = useState('')
  const [isi, setIsi] = useState<IsiDraf | null>(null)
  const [catatan, setCatatan] = useState('')
  const [daftar, setDaftar] = useState({ nomor: '', tanggal: '', tautan: '' })
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [kotor, setKotor] = useState(false)

  const muat = useCallback(async () => {
    try {
      const x = await panggil<Detail | null>('surat_draf_detail', { p_id: id })
      if (!x) { setGalat('Draf tidak ditemukan atau Anda tidak berhak melihatnya.'); return }
      setD(x)
      setJudul(x.draf.judul); setNomor(x.draf.nomor_surat ?? ''); setTanggal(x.draf.tanggal_surat ?? '')
      setIsi({ ...isiBawaan(x.draf.jenis, x.draf.tahun_ajaran, x.ks), ...x.draf.isi, lampiran: x.draf.isi.lampiran } as IsiDraf)
      setDaftar({ nomor: x.draf.nomor_surat ?? '', tanggal: x.draf.tanggal_surat ?? '', tautan: '' })
      setKotor(false)
    } catch (e) { setGalat((e as Error).message) }
  }, [id])
  useEffect(() => { void muat() }, [muat])

  const blok = useMemo(() => (d && isi ? susunBlok({ judul, nomor_surat: nomor || null, tanggal_surat: tanggal || null, tahun_ajaran: d.draf.tahun_ajaran }, isi) : []), [d, isi, judul, nomor, tanggal])
  const ubah = <K extends keyof IsiDraf>(k: K, v: IsiDraf[K]) => { setIsi((x) => (x ? { ...x, [k]: v } : x)); setKotor(true) }

  async function jalankan(fn: () => Promise<unknown>, pesan: string, muatUlang = true) {
    setGalat(''); setInfo(''); setSibuk(true)
    try { await fn(); setInfo(pesan); if (muatUlang) await muat() } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }
  const simpanPanggil = () => panggil('surat_draf_simpan', { p_id: id, p_judul: judul, p_nomor: nomor || null, p_tanggal: tanggal || null, p_isi: isi })
  const simpan = () => jalankan(simpanPanggil, 'Draf tersimpan.')
  const ajukan = () => jalankan(async () => { await simpanPanggil(); await panggil('surat_draf_ajukan', { p_id: id }) }, 'Draf diajukan ke Kepala Sekolah.')

  if (!d || !isi) return <Halaman judul="Draf surat"><p className="catatan">{galat || 'Memuat draf...'}</p></Halaman>
  const bolehUbah = d.boleh_ubah
  const lampiranInfo = isi.lampiran?.tipe === 'pembagian_tugas' ? `${isi.lampiran.guru.length} guru, ${isi.lampiran.total_jam} JP` : isi.lampiran?.tipe === 'wali_kelas' ? `${isi.lampiran.baris.length} wali kelas` : '-'

  return (
    <Halaman judul={d.draf.judul} lead={`${NAMA_JENIS[d.draf.jenis]} · tahun ajaran ${d.draf.tahun_ajaran} · disusun oleh ${d.draf.dibuat_nama ?? '-'}`}>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="tombol" onClick={kembali}>Semua draf</button>
        <Lencana s={d.draf.status} />
        {kotor && bolehUbah && <small>Ada perubahan yang belum disimpan.</small>}
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      {d.draf.status === 'dikembalikan' && d.draf.catatan && <p className="kartu"><strong>Dikembalikan Kepala Sekolah:</strong> {d.draf.catatan}</p>}
      {d.draf.status === 'terdaftar' && d.draf.surat_id && <p className="kartu">Sudah masuk register surat keluar. <Link to={`/portal/surat/${d.draf.surat_id}`}>Lihat di Persuratan</Link></p>}

      <div className="kartu form jarak">
        <h3>Aksi</h3>
        <div className="aksi" style={{ marginTop: 0, flexWrap: 'wrap' }}>
          {bolehUbah && <button className="tombol" disabled={sibuk} onClick={simpan}>Simpan</button>}
          {bolehUbah && <button className="tombol" disabled={sibuk} onClick={() => jalankan(() => panggil('surat_draf_segarkan', { p_id: id }), 'Lampiran disegarkan dari data terbaru.')}>Segarkan lampiran dari data</button>}
          {d.boleh_ajukan && <button className="tombol tombol-isi" disabled={sibuk} onClick={ajukan}>Ajukan ke Kepala Sekolah</button>}
          <button className="tombol" onClick={() => unduhDocx(blok, d.draf.judul)}>Unduh Word (.docx)</button>
          <button className="tombol" onClick={() => cetakDokumen(blok)}>Cetak atau simpan PDF</button>
          {d.boleh_batal && <button className="tombol" style={{ color: '#a11' }} disabled={sibuk} onClick={() => { if (window.confirm('Batalkan draf ini?')) void jalankan(() => panggil('surat_draf_batal', { p_id: id }), 'Draf dibatalkan.') }}>Batalkan draf</button>}
        </div>
        <p className="catatan">Lampiran berisi salinan data saat draf dibuat atau disegarkan: {lampiranInfo}. Tanda tangan elektronik tetap dibubuhkan di luar sistem ini (NDE).</p>
      </div>

      {d.boleh_putuskan && (
        <div className="kartu form jarak">
          <h3>Keputusan Kepala Sekolah</h3>
          <label>Catatan (wajib bila dikembalikan)<textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label>
          <div className="aksi" style={{ marginTop: 0 }}>
            <button className="tombol tombol-isi" disabled={sibuk} onClick={() => jalankan(() => panggil('surat_draf_putuskan', { p_id: id, p_setuju: true, p_catatan: catatan || null }), 'Draf disetujui.')}>Setujui</button>
            <button className="tombol" disabled={sibuk} onClick={() => jalankan(() => panggil('surat_draf_putuskan', { p_id: id, p_setuju: false, p_catatan: catatan }), 'Draf dikembalikan ke penyusun.')}>Kembalikan</button>
          </div>
        </div>
      )}

      {d.boleh_daftarkan && (
        <div className="kartu form jarak">
          <h3>Daftarkan ke register surat keluar</h3>
          <p className="catatan">Nomor agenda dibuat otomatis. Isi nomor surat resmi dari NDE.</p>
          <div className="grid grid-3">
            <label>Nomor surat<input value={daftar.nomor} onChange={(e) => setDaftar({ ...daftar, nomor: e.target.value })} placeholder="390/PK.03.03.05/SMKN1/VII/2026" /></label>
            <label>Tanggal surat<input type="date" value={daftar.tanggal} onChange={(e) => setDaftar({ ...daftar, tanggal: e.target.value })} /></label>
            <label>Tautan berkas (opsional)<input value={daftar.tautan} onChange={(e) => setDaftar({ ...daftar, tautan: e.target.value })} placeholder="https://" /></label>
          </div>
          <div className="aksi" style={{ marginTop: 0 }}>
            <button className="tombol tombol-isi" disabled={sibuk} onClick={() => jalankan(() => panggil('surat_draf_daftarkan', { p_id: id, p_nomor: daftar.nomor, p_tanggal: daftar.tanggal || null, p_tautan: daftar.tautan || null }), 'Terdaftar di register surat keluar.')}>Daftarkan</button>
          </div>
        </div>
      )}

      <div className="kartu form jarak">
        <h3>Isi surat</h3>
        <fieldset disabled={!bolehUbah} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          <label>Judul draf (untuk daftar dan register)<input value={judul} onChange={(e) => { setJudul(e.target.value); setKotor(true) }} /></label>
          <div className="grid grid-2">
            <label>Nomor surat (boleh dikosongkan, Tata Usaha mengisi saat mendaftarkan)<input value={nomor} onChange={(e) => { setNomor(e.target.value); setKotor(true) }} /></label>
            <label>Tanggal ditetapkan<input type="date" value={tanggal} onChange={(e) => { setTanggal(e.target.value); setKotor(true) }} /></label>
          </div>
          <label>Kop surat (satu baris per baris kop)<textarea rows={5} value={isi.kop.join('\n')} onChange={(e) => ubah('kop', baris(e.target.value))} /></label>
          <label>Tentang (satu baris per baris judul)<textarea rows={2} value={isi.tentang.join('\n')} onChange={(e) => ubah('tentang', baris(e.target.value))} /></label>
          <label>Menimbang (satu butir per baris)<textarea rows={4} value={isi.menimbang.join('\n')} onChange={(e) => ubah('menimbang', baris(e.target.value))} /></label>
          <label>Mengingat (satu butir per baris)<textarea rows={8} value={isi.mengingat.join('\n')} onChange={(e) => ubah('mengingat', baris(e.target.value))} /></label>
          <label>Memperhatikan (satu butir per baris)<textarea rows={3} value={isi.memperhatikan.join('\n')} onChange={(e) => ubah('memperhatikan', baris(e.target.value))} /></label>
          <label>Menetapkan<textarea rows={2} value={isi.menetapkan} onChange={(e) => ubah('menetapkan', e.target.value)} /></label>
          {isi.diktum.map((x: Diktum, i: number) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
              <input value={x.k} aria-label={`Label diktum ${i + 1}`} onChange={(e) => ubah('diktum', isi.diktum.map((y, j) => (j === i ? { ...y, k: e.target.value } : y)))} />
              <textarea rows={2} value={x.t} aria-label={`Isi diktum ${i + 1}`} onChange={(e) => ubah('diktum', isi.diktum.map((y, j) => (j === i ? { ...y, t: e.target.value } : y)))} />
            </div>
          ))}
          <div className="grid grid-2">
            <label>Ditetapkan di<input value={isi.tempat} onChange={(e) => ubah('tempat', e.target.value)} /></label>
            <label>Jabatan penandatangan<input value={isi.jabatan_ttd} onChange={(e) => ubah('jabatan_ttd', e.target.value)} /></label>
            <label>Nama penandatangan<input value={isi.nama_ttd} onChange={(e) => ubah('nama_ttd', e.target.value)} /></label>
            <label>NIP penandatangan<input value={isi.nip_ttd} onChange={(e) => ubah('nip_ttd', e.target.value)} /></label>
          </div>
        </fieldset>
      </div>

      <div className="kartu jarak">
        <h3>Pratinjau</h3>
        <style>{GAYA_DOKUMEN}</style>
        <div className="dokumen" style={{ background: '#fff', border: '1px solid #ccd', padding: '24px 28px', maxWidth: 820, overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: blokKeHtml(blok) }} />
      </div>
    </Halaman>
  )
}

export default function DrafSurat() {
  const [izin, setIzin] = useState<Izin | null | undefined>(undefined)
  const [daftar, setDaftar] = useState<Baris[]>([])
  const [galat, setGalat] = useState('')
  const [jenis, setJenis] = useState<JenisDraf>('sk_wali_kelas')
  const [ta, setTa] = useState(tahunAjaranSekarang())
  const [sibuk, setSibuk] = useState(false)
  const [param, setParam] = useSearchParams()
  const id = param.get('id')

  const muat = useCallback(async () => {
    try { setDaftar((await panggil<Baris[]>('surat_draf_daftar')) ?? []) } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void panggil<Izin | null>('surat_draf_izin').then(setIzin).catch(() => setIzin(null)) }, [])
  useEffect(() => { if (!id) void muat() }, [muat, id])

  if (izin === undefined) return <Halaman judul="Draf surat dan SK"><p className="catatan">Memeriksa hak akses...</p></Halaman>
  if (!izin || !(izin.buat || izin.setujui || izin.daftarkan)) {
    return (
      <Halaman judul="Tidak ada akses" lead="Draf surat dan SK untuk penyusun dari bidang (Waka dan staf kurikulum), Kepala Sekolah, dan Tata Usaha Persuratan.">
        <Link to="/portal" className="tombol tombol-isi">Kembali ke portal</Link>
      </Halaman>
    )
  }
  if (id) return <Editor id={id} kembali={() => setParam({})} />

  async function buat() {
    setGalat(''); setSibuk(true)
    try { const baru = await panggil<string>('surat_draf_buat', { p_jenis: jenis, p_ta: ta }); setParam({ id: baru }) } catch (e) { setGalat((e as Error).message) }
    setSibuk(false)
  }

  return (
    <Halaman judul="Draf surat dan SK" lead="Susun SK dari data sistem (wali kelas, pembagian tugas guru), ajukan ke Kepala Sekolah, lalu Tata Usaha mendaftarkannya ke register surat keluar.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {izin.buat && (
        <div className="kartu form">
          <h3>Draf baru</h3>
          <div className="grid grid-3">
            <label>Jenis
              <select value={jenis} onChange={(e) => setJenis(e.target.value as JenisDraf)}>
                {(Object.keys(NAMA_JENIS) as JenisDraf[]).map((k) => <option key={k} value={k}>{NAMA_JENIS[k]}</option>)}
              </select>
            </label>
            <label>Tahun ajaran
              <select value={ta} onChange={(e) => setTa(e.target.value)}>{pilihanTahunAjaran().map((x) => <option key={x}>{x}</option>)}</select>
            </label>
          </div>
          <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi" disabled={sibuk} onClick={buat}>{sibuk ? 'Menyusun...' : 'Susun draf'}</button></div>
          <p className="catatan">Lampiran diambil dari data Beban mengajar dan Wali kelas (hanya yang sudah disetujui) pada saat draf dibuat.</p>
        </div>
      )}
      <div className="kartu jarak">
        <h3>Daftar draf</h3>
        <div className="tabel-bungkus">
          <table>
            <thead><tr><th>Judul</th><th>Jenis</th><th>Status</th><th>Disusun oleh</th><th>Terakhir diubah</th><th><span className="sr-only">Buka</span></th></tr></thead>
            <tbody>
              {daftar.length === 0 && <tr><td colSpan={6}>Belum ada draf.</td></tr>}
              {daftar.map((x) => (
                <tr key={x.id}>
                  <td>{x.judul}{x.nomor_surat ? <small style={{ display: 'block' }}>No. {x.nomor_surat}</small> : null}</td>
                  <td>{NAMA_JENIS[x.jenis]}</td><td><Lencana s={x.status} /></td><td>{x.dibuat_nama ?? '-'}</td><td>{tglJam(x.diubah_pada)}</td>
                  <td><button className="tombol" style={{ padding: '4px 10px' }} onClick={() => setParam({ id: x.id })}>Buka</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="catatan jarak"><Link to="/portal/surat">Kembali ke register surat</Link></p>
    </Halaman>
  )
}
