// Pelanggaran siswa: catat, verifikasi Waka, dan katalog jenis serta ambang poin.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import CariSiswa from '../../components/CariSiswa'
import { panggil, tgl } from '../../lib/rpc'
import { KATEGORI, STATUS_CATATAN, hariIni, label, tambahHari, type RombelPilih, type SiswaCari } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Jenis = { id: string; kategori: string; nama: string; poin: number; aktif: boolean }
type Ambang = { id: string; poin_min: number; tindakan: string; keterangan: string | null; aktif: boolean }
type Katalog = { bisa_atur: boolean; jenis: Jenis[]; ambang: Ambang[] }
type Baris = {
  id: string; nama: string; nisn: string | null; rombel: string | null; jenis_id: string | null; jenis_nama: string; kategori: string; poin: number
  tanggal: string; uraian: string | null; status: string; dicatat_nama: string | null; catatan_keputusan: string | null; bisa_tarik: boolean
}

function FormCatat({ katalog, sesudah }: { katalog: Katalog; sesudah: () => void }) {
  const [siswa, setSiswa] = useState<SiswaCari | null>(null)
  const [jenis, setJenis] = useState('')
  const [tanggal, setTanggal] = useState(hariIni())
  const [uraian, setUraian] = useState('')
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const aktif = katalog.jenis.filter((j) => j.aktif)

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    if (!siswa || !jenis) { setGalat('Pilih siswa dan jenis pelanggaran.'); return }
    setSibuk(true); setGalat(''); setInfo('')
    try {
      await panggil('pelanggaran_catat', { p_pd: siswa.id, p_jenis_id: jenis, p_tanggal: tanggal, p_uraian: uraian.trim() || null })
      setInfo(`Pelanggaran ${siswa.nama} tercatat dan menunggu verifikasi Waka Kesiswaan.`)
      setSiswa(null); setJenis(''); setUraian(''); sesudah()
    } catch (x) { setGalat((x as Error).message) } finally { setSibuk(false) }
  }

  return (
    <form className="kartu form" style={{ maxWidth: 640 }} onSubmit={kirim}>
      <h3>Catat pelanggaran</h3>
      <p className="catatan">Catatan baru berstatus menunggu. Siswa dan orang tua baru melihatnya setelah Waka Kesiswaan memverifikasi.</p>
      <CariSiswa untuk="catat" pilih={setSiswa} dipilih={siswa} />
      <label>Jenis pelanggaran
        <select value={jenis} onChange={(e) => setJenis(e.target.value)} required>
          <option value="">Pilih jenis</option>
          {KATEGORI.map(([k, n]) => (
            <optgroup key={k} label={n}>
              {aktif.filter((j) => j.kategori === k).map((j) => <option key={j.id} value={j.id}>{j.nama} ({j.poin} poin)</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label>Tanggal kejadian
        <input type="date" value={tanggal} min={tambahHari(hariIni(), -365)} max={hariIni()} onChange={(e) => setTanggal(e.target.value)} required />
      </label>
      <label>Uraian singkat (fakta yang terlihat, bukan dugaan)
        <textarea rows={3} maxLength={1000} value={uraian} onChange={(e) => setUraian(e.target.value)} />
      </label>
      {galat && <p className="galat" role="alert">{galat}</p>}
      {info && <p role="status">{info}</p>}
      <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Menyimpan...' : 'Simpan catatan'}</button>
    </form>
  )
}

function Daftar({ bisaPutuskan, ulang }: { bisaPutuskan: boolean; ulang: number }) {
  const [status, setStatus] = useState(bisaPutuskan ? 'diajukan' : 'semua')
  const [rombel, setRombel] = useState('')
  const [cari, setCari] = useState('')
  const [halaman, setHalaman] = useState(0)
  const [rombels, setRombels] = useState<RombelPilih[]>([])
  const [data, setData] = useState<{ total: number; bisa_putuskan: boolean; baris: Baris[] } | null>(null)
  const [galat, setGalat] = useState('')
  const [catatan, setCatatan] = useState<Record<string, string>>({})
  const [sibuk, setSibuk] = useState('')
  const BATAS = 50

  useEffect(() => { panggil<RombelPilih[]>('kesiswaan_rombel', { p_untuk: 'catat' }).then(setRombels).catch(() => setRombels([])) }, [])
  const muat = useCallback(async () => {
    try { setData(await panggil('pelanggaran_daftar', { p_status: status, p_rombel: rombel || null, p_cari: cari.trim() || null, p_batas: BATAS, p_mulai: halaman * BATAS })); setGalat('') }
    catch (e) { setGalat((e as Error).message) }
  }, [status, rombel, cari, halaman])
  useEffect(() => { void muat() }, [muat, ulang])

  async function aksi(id: string, fn: string, args: Record<string, unknown>) {
    setSibuk(id); setGalat('')
    try { await panggil(fn, { p_id: id, ...args }); await muat() } catch (e) { setGalat((e as Error).message) } finally { setSibuk('') }
  }
  async function hapus(b: Baris) {
    const alasan = window.prompt(`Alasan menghapus catatan ${b.nama} (${b.jenis_nama})?`)
    if (alasan && alasan.trim().length >= 3) await aksi(b.id, 'pelanggaran_hapus', { p_alasan: alasan.trim() })
  }

  return (
    <div>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setHalaman(0) }} aria-label="Status">
          <option value="semua">Semua status</option>
          {STATUS_CATATAN.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <select value={rombel} onChange={(e) => { setRombel(e.target.value); setHalaman(0) }} aria-label="Rombel">
          <option value="">Semua rombel</option>
          {rombels.map((r) => <option key={r.id} value={r.id}>{r.nama}</option>)}
        </select>
        <input type="search" placeholder="Cari nama atau NISN" value={cari} onChange={(e) => { setCari(e.target.value); setHalaman(0) }} />
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Siswa</th><th>Pelanggaran</th><th>Poin</th><th>Tanggal</th><th>Status</th><th>Dicatat</th><th /></tr></thead>
          <tbody>
            {data?.baris.map((b) => (
              <tr key={b.id}>
                <td>{b.nama}<br /><small className="catatan">{b.rombel ?? '-'}</small></td>
                <td>{b.jenis_nama} <span className="lencana">{label(KATEGORI, b.kategori)}</span>{b.uraian && <><br /><small className="catatan">{b.uraian}</small></>}</td>
                <td>{b.poin}</td>
                <td>{tgl(b.tanggal)}</td>
                <td>{label(STATUS_CATATAN, b.status)}{b.catatan_keputusan && <><br /><small className="catatan">{b.catatan_keputusan}</small></>}</td>
                <td>{b.dicatat_nama ?? '-'}</td>
                <td style={{ minWidth: 200 }}>
                  {bisaPutuskan && b.status === 'diajukan' && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <input placeholder="Catatan (wajib bila ditolak)" value={catatan[b.id] ?? ''} onChange={(e) => setCatatan((c) => ({ ...c, [b.id]: e.target.value }))} />
                      <div className="aksi" style={{ marginTop: 0 }}>
                        <button className="tombol tombol-isi" disabled={sibuk === b.id} onClick={() => aksi(b.id, 'pelanggaran_putuskan', { p_setuju: true, p_catatan: catatan[b.id]?.trim() || null })}>Verifikasi</button>
                        <button className="tombol" disabled={sibuk === b.id} onClick={() => aksi(b.id, 'pelanggaran_putuskan', { p_setuju: false, p_catatan: catatan[b.id]?.trim() || null })}>Tolak</button>
                      </div>
                    </div>
                  )}
                  {b.bisa_tarik && <button className="tombol-ikon" disabled={sibuk === b.id} onClick={() => aksi(b.id, 'pelanggaran_tarik', {})}>Tarik</button>}
                  {bisaPutuskan && b.status !== 'diajukan' && <button className="tombol-ikon" disabled={sibuk === b.id} onClick={() => hapus(b)}>Hapus</button>}
                </td>
              </tr>
            ))}
            {data && data.baris.length === 0 && <tr><td colSpan={7} className="catatan">Tidak ada catatan.</td></tr>}
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
    </div>
  )
}

function FormJenis({ j, kategoriAwal, simpan, batal }: { j: Jenis | null; kategoriAwal: string; simpan: (j: Jenis | null, d: { kategori: string; nama: string; poin: number; aktif: boolean }) => Promise<void>; batal: () => void }) {
  const [kategori, setKategori] = useState(j?.kategori ?? kategoriAwal)
  const [nama, setNama] = useState(j?.nama ?? '')
  const [poin, setPoin] = useState(String(j?.poin ?? 5))
  const [aktif, setAktif] = useState(j?.aktif ?? true)
  return (
    <form className="kartu form" style={{ maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); void simpan(j, { kategori, nama, poin: Number(poin), aktif }) }}>
      <h3>{j ? 'Ubah jenis pelanggaran' : 'Jenis pelanggaran baru'}</h3>
      <label>Kategori<select value={kategori} onChange={(e) => setKategori(e.target.value)}>{KATEGORI.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      <label>Nama<input value={nama} onChange={(e) => setNama(e.target.value)} minLength={3} maxLength={150} required /></label>
      <label>Poin<input type="number" min={1} max={500} value={poin} onChange={(e) => setPoin(e.target.value)} required /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} style={{ width: 'auto' }} />Aktif (bisa dipilih saat mencatat)</label>
      <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi">Simpan</button><button type="button" className="tombol" onClick={batal}>Batal</button></div>
    </form>
  )
}

function KatalogTab({ katalog, muat }: { katalog: Katalog; muat: () => void }) {
  const [ubahJenis, setUbahJenis] = useState<Jenis | 'baru' | null>(null)
  const [ubahAmbang, setUbahAmbang] = useState<Ambang | 'baru' | null>(null)
  const [galat, setGalat] = useState('')
  const atur = katalog.bisa_atur

  async function simpanJenis(j: Jenis | null, d: { kategori: string; nama: string; poin: number; aktif: boolean }) {
    setGalat('')
    try { await panggil('pelanggaran_jenis_simpan', { p_id: j?.id ?? null, p_kategori: d.kategori, p_nama: d.nama, p_poin: d.poin, p_aktif: d.aktif }); setUbahJenis(null); muat() }
    catch (e) { setGalat((e as Error).message) }
  }
  async function simpanAmbang(a: Ambang | null, f: FormData) {
    setGalat('')
    try {
      await panggil('kesiswaan_ambang_simpan', { p_id: a?.id ?? null, p_poin_min: Number(f.get('poin')), p_tindakan: String(f.get('tindakan')), p_keterangan: String(f.get('ket') ?? '') || null, p_aktif: f.get('aktif') === 'on' })
      setUbahAmbang(null); muat()
    } catch (e) { setGalat((e as Error).message) }
  }

  return (
    <div className="jarak">
      {!atur && <p className="catatan">Katalog dan ambang diatur oleh Waka Kesiswaan. Anda dapat melihatnya sebagai acuan saat mencatat.</p>}
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="grid grid-2">
        <div>
          <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}><h3 style={{ margin: 0 }}>Jenis pelanggaran dan poin</h3>{atur && <button className="tombol" onClick={() => setUbahJenis('baru')}>Tambah</button>}</div>
          {ubahJenis && atur && <FormJenis j={ubahJenis === 'baru' ? null : ubahJenis} kategoriAwal="ringan" simpan={simpanJenis} batal={() => setUbahJenis(null)} />}
          {KATEGORI.map(([k, n]) => (
            <div key={k} className="kartu jarak">
              <h4 style={{ marginTop: 0 }}>{n}</h4>
              <table><tbody>
                {katalog.jenis.filter((j) => j.kategori === k).map((j) => (
                  <tr key={j.id} style={j.aktif ? undefined : { opacity: 0.5 }}>
                    <td>{j.nama}{!j.aktif && ' (nonaktif)'}</td><td style={{ whiteSpace: 'nowrap' }}>{j.poin} poin</td>
                    <td>{atur && <button className="tombol-ikon" onClick={() => setUbahJenis(j)}>Ubah</button>}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>
        <div>
          <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}><h3 style={{ margin: 0 }}>Ambang poin dan tindakan</h3>{atur && <button className="tombol" onClick={() => setUbahAmbang('baru')}>Tambah</button>}</div>
          <p className="catatan">Poin yang dihitung adalah poin terverifikasi pada tahun ajaran berjalan. Ambang yang terlewati memunculkan tanda perlu tindak di dashboard risiko.</p>
          {ubahAmbang && atur && (
            <form className="kartu form" style={{ maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); void simpanAmbang(ubahAmbang === 'baru' ? null : ubahAmbang, new FormData(e.currentTarget)) }}>
              <label>Poin minimal<input name="poin" type="number" min={1} max={2000} defaultValue={ubahAmbang === 'baru' ? '' : ubahAmbang.poin_min} required /></label>
              <label>Tindakan<input name="tindakan" defaultValue={ubahAmbang === 'baru' ? '' : ubahAmbang.tindakan} minLength={3} maxLength={150} required /></label>
              <label>Keterangan<input name="ket" defaultValue={ubahAmbang === 'baru' ? '' : ubahAmbang.keterangan ?? ''} maxLength={500} /></label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input name="aktif" type="checkbox" defaultChecked={ubahAmbang === 'baru' ? true : ubahAmbang.aktif} style={{ width: 'auto' }} />Aktif</label>
              <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi">Simpan</button><button type="button" className="tombol" onClick={() => setUbahAmbang(null)}>Batal</button></div>
            </form>
          )}
          <div className="kartu jarak">
            <table><tbody>
              {katalog.ambang.map((a) => (
                <tr key={a.id} style={a.aktif ? undefined : { opacity: 0.5 }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{a.poin_min} poin</td><td>{a.tindakan}{a.keterangan && <><br /><small className="catatan">{a.keterangan}</small></>}</td>
                  <td>{atur && <button className="tombol-ikon" onClick={() => setUbahAmbang(a)}>Ubah</button>}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
          <p className="catatan">Isi awal katalog dan ambang adalah contoh umum SMK, bukan tata tertib sekolah. Sesuaikan dengan tata tertib resmi sebelum dipakai.</p>
        </div>
      </div>
    </div>
  )
}

function Isi({ izin }: { izin: string[] }) {
  const bisaCatat = izin.includes('kesiswaan.catat')
  const waka = izin.includes('kesiswaan.verifikasi')
  const [tab, setTab] = useState<'daftar' | 'catat' | 'katalog'>(waka ? 'daftar' : bisaCatat ? 'catat' : 'daftar')
  const [katalog, setKatalog] = useState<Katalog | null>(null)
  const [ulang, setUlang] = useState(0)
  const [galat, setGalat] = useState('')
  const muatKatalog = useCallback(() => { panggil<Katalog>('kesiswaan_katalog').then(setKatalog).catch((e: Error) => setGalat(e.message)) }, [])
  useEffect(() => { muatKatalog() }, [muatKatalog])

  return (
    <Halaman judul="Pelanggaran siswa" lead="Catatan pelanggaran dengan poin dan sanksi bertahap. Catatan baru menunggu verifikasi Waka Kesiswaan sebelum terlihat oleh siswa dan orang tua.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      <div className="aksi" style={{ marginTop: 0 }}>
        <button className={tab === 'daftar' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('daftar')}>Daftar catatan</button>
        {bisaCatat && <button className={tab === 'catat' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('catat')}>Catat pelanggaran</button>}
        <button className={tab === 'katalog' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('katalog')}>Katalog dan ambang</button>
      </div>
      <div className="jarak">
        {tab === 'daftar' && <Daftar bisaPutuskan={waka} ulang={ulang} />}
        {tab === 'catat' && katalog && <FormCatat katalog={katalog} sesudah={() => setUlang((u) => u + 1)} />}
        {tab === 'katalog' && katalog && <KatalogTab katalog={katalog} muat={muatKatalog} />}
      </div>
      <p><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}

export default function Pelanggaran() {
  return <Gerbang perlu={['kesiswaan.catat', 'kesiswaan.pantau', 'kesiswaan.verifikasi']} judul="Pelanggaran siswa">{(izin) => <Isi izin={izin} />}</Gerbang>
}
