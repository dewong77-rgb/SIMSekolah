// Ekstrakurikuler dan organisasi siswa (OSIS, MPK): daftar, anggota, pertemuan dan kehadiran.
import TombolIkon from '../../components/TombolIkon'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import CariSiswa from '../../components/CariSiswa'
import { supabase } from '../../lib/supabase'
import { panggil, tgl } from '../../lib/rpc'
import { PERAN_EKSKUL, PREDIKAT, hariIni, label, tambahHari, type SiswaCari } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Ekskul = { id: string; nama: string; jenis: string; deskripsi: string | null; jadwal: string | null; aktif: boolean; pembina_ptk_id: string | null; pembina: string | null; bisa_ubah: boolean; anggota: number; pertemuan: number }
type Anggota = { id: string; pd: string; nama: string; nisn: string | null; rombel: string | null; peran: string; predikat: string | null; catatan_nilai: string | null; aktif: boolean; hadir: number; pertemuan: number }
type Pertemuan = { id: string; tanggal: string; topik: string | null; hadir: number; total: number }
type Detail = { bisa_ubah: boolean; id: string; nama: string; jenis: string; deskripsi: string | null; jadwal: string | null; tahun_ajaran: string; anggota: Anggota[]; pertemuan: Pertemuan[] }

function FormEkskul({ e, ptk, simpan, batal }: { e: Ekskul | null; ptk: { id: string; nama: string }[]; simpan: (e: Ekskul | null, f: FormData) => Promise<void>; batal: () => void }) {
  return (
    <form className="kartu form" style={{ maxWidth: 560 }} onSubmit={(ev) => { ev.preventDefault(); void simpan(e, new FormData(ev.currentTarget)) }}>
      <h3>{e ? `Ubah ${e.nama}` : 'Ekstrakurikuler baru'}</h3>
      <label>Nama<input name="nama" defaultValue={e?.nama ?? ''} minLength={2} maxLength={100} required /></label>
      <label>Jenis<select name="jenis" defaultValue={e?.jenis ?? 'ekskul'}><option value="ekskul">Ekstrakurikuler</option><option value="organisasi">Organisasi siswa</option></select></label>
      <label>Pembina<select name="pembina" defaultValue={e?.pembina_ptk_id ?? ''}><option value="">Belum ditunjuk</option>{ptk.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}</select></label>
      <label>Jadwal<input name="jadwal" defaultValue={e?.jadwal ?? ''} maxLength={150} placeholder="Misalnya Jumat 14.00 sampai 16.00, lapangan" /></label>
      <label>Deskripsi<textarea name="deskripsi" rows={2} maxLength={500} defaultValue={e?.deskripsi ?? ''} /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input name="aktif" type="checkbox" defaultChecked={e?.aktif ?? true} style={{ width: 'auto' }} />Aktif</label>
      <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi">Simpan</button><button type="button" className="tombol" onClick={batal}>Batal</button></div>
    </form>
  )
}

function Rincian({ id, kembali, ubahDaftar }: { id: string; kembali: () => void; ubahDaftar: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [siswa, setSiswa] = useState<SiswaCari | null>(null)
  const [peran, setPeran] = useState('anggota')
  const [tanggal, setTanggal] = useState(hariIni())
  const [topik, setTopik] = useState('')
  const [hadir, setHadir] = useState<Record<string, boolean>>({})
  const [sunting, setSunting] = useState<string | null>(null)
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(async () => {
    try { const x = await panggil<Detail>('ekskul_detail', { p_id: id }); setD(x); setGalat(''); setHadir((h) => (Object.keys(h).length ? h : Object.fromEntries(x.anggota.filter((a) => a.aktif).map((a) => [a.id, true])))) }
    catch (e) { setGalat((e as Error).message) }
  }, [id])
  useEffect(() => { void muat() }, [muat])

  async function jalan(fn: () => Promise<unknown>, pesan: string) {
    setSibuk(true); setGalat(''); setInfo('')
    try { await fn(); setInfo(pesan); await muat(); ubahDaftar() } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }
  const tambah = () => siswa && jalan(async () => { await panggil('ekskul_anggota_tambah', { p_ekskul: id, p_pd: siswa.id, p_peran: peran }); setSiswa(null) }, 'Anggota ditambahkan.')
  const simpanPertemuan = () => jalan(() => panggil('ekskul_pertemuan_simpan', { p_ekskul: id, p_tanggal: tanggal, p_topik: topik.trim() || null, p_hadir: Object.entries(hadir).filter(([, v]) => v).map(([k]) => k) }), 'Pertemuan tersimpan.')
  const bukaPertemuan = async (pid: string) => {
    try {
      const p = await panggil<{ tanggal: string; topik: string | null; anggota: { id: string; hadir: boolean }[] }>('ekskul_pertemuan_buka', { p_pertemuan: pid })
      setTanggal(p.tanggal); setTopik(p.topik ?? ''); setHadir((h) => ({ ...Object.fromEntries(Object.keys(h).map((k) => [k, false])), ...Object.fromEntries(p.anggota.map((a) => [a.id, a.hadir])) }))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setGalat((e as Error).message) }
  }
  function ubahAnggota(a: Anggota, f: FormData) {
    void jalan(async () => {
      await panggil('ekskul_anggota_ubah', { p_id: a.id, p_peran: String(f.get('peran')), p_predikat: String(f.get('predikat')) || null, p_catatan_nilai: String(f.get('catatan')) || null, p_aktif: f.get('aktif') === 'on' })
      setSunting(null)
    }, 'Data anggota tersimpan.')
  }

  if (!d) return <div>{galat ? <p className="kartu galat" role="alert">{galat}</p> : <p className="catatan">Memuat...</p>}<button className="tombol" onClick={kembali}>Kembali</button></div>
  const aktif = d.anggota.filter((a) => a.aktif)
  const ubahBoleh = d.bisa_ubah
  return (
    <div>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}><button className="tombol" onClick={kembali}>Kembali ke daftar</button><h2 style={{ margin: 0 }}>{d.nama}</h2><small className="catatan">Tahun ajaran {d.tahun_ajaran}</small></div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      <div className="grid grid-2 jarak">
        <div className="kartu">
          <h3>{ubahBoleh ? 'Catat pertemuan' : 'Pertemuan'}</h3>
          {ubahBoleh && <><div className="form">
            <label>Tanggal<input type="date" value={tanggal} min={tambahHari(hariIni(), -60)} max={hariIni()} onChange={(e) => setTanggal(e.target.value)} /></label>
            <label>Topik atau kegiatan<input value={topik} maxLength={200} onChange={(e) => setTopik(e.target.value)} /></label>
          </div>
          <p className="catatan jarak">Centang anggota yang hadir. Menyimpan tanggal yang sama menggantikan catatan sebelumnya.</p>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {aktif.map((a) => <li key={a.id}><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={hadir[a.id] ?? false} onChange={(e) => setHadir((h) => ({ ...h, [a.id]: e.target.checked }))} />{a.nama}</label></li>)}
            {aktif.length === 0 && <li className="catatan">Belum ada anggota aktif.</li>}
          </ul>
          <button className="tombol tombol-isi" disabled={sibuk || aktif.length === 0} onClick={simpanPertemuan}>Simpan pertemuan</button></>}
          {!ubahBoleh && <p className="catatan">Anda dapat melihat anggota dan pertemuan, tidak dapat mengubahnya.</p>}
          <h4>Pertemuan terakhir</h4>
          <ul>{d.pertemuan.map((p) => <li key={p.id}>{tgl(p.tanggal)}{p.topik && `: ${p.topik}`} <small className="catatan">({p.hadir}/{p.total} hadir)</small> <button className="tombol-ikon" onClick={() => bukaPertemuan(p.id)}>Buka</button></li>)}{d.pertemuan.length === 0 && <li className="catatan">Belum ada.</li>}</ul>
        </div>
        <div className="kartu">
          <h3>Anggota ({aktif.length})</h3>
          {ubahBoleh && <div className="form">
            <CariSiswa untuk="ekskul" pilih={setSiswa} dipilih={siswa} />
            <label>Peran<select value={peran} onChange={(e) => setPeran(e.target.value)}>{PERAN_EKSKUL.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <button className="tombol" disabled={!siswa || sibuk} onClick={tambah}>Tambah anggota</button>
          </div>}
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>Nama</th><th>Peran</th><th>Hadir</th><th>Predikat</th><th /></tr></thead>
              <tbody>
                {d.anggota.map((a) => sunting === a.id ? (
                  <tr key={a.id}><td colSpan={5}>
                    <form className="form" onSubmit={(e) => { e.preventDefault(); ubahAnggota(a, new FormData(e.currentTarget)) }}>
                      <strong>{a.nama}</strong>
                      <label>Peran<select name="peran" defaultValue={a.peran}>{PERAN_EKSKUL.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                      <label>Predikat akhir<select name="predikat" defaultValue={a.predikat ?? ''}><option value="">Belum dinilai</option>{PREDIKAT.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                      <label>Catatan penilaian<input name="catatan" defaultValue={a.catatan_nilai ?? ''} maxLength={500} /></label>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input name="aktif" type="checkbox" defaultChecked={a.aktif} style={{ width: 'auto' }} />Masih aktif</label>
                      <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi">Simpan</button><button type="button" className="tombol" onClick={() => setSunting(null)}>Batal</button></div>
                    </form>
                  </td></tr>
                ) : (
                  <tr key={a.id} style={a.aktif ? undefined : { opacity: 0.5 }}>
                    <td>{a.nama}<br /><small className="catatan">{a.rombel ?? '-'}{!a.aktif && ' · nonaktif'}</small></td>
                    <td>{label(PERAN_EKSKUL, a.peran)}</td>
                    <td>{a.pertemuan ? `${Math.round((a.hadir / a.pertemuan) * 100)}%` : '-'}<br /><small className="catatan">{a.hadir}/{a.pertemuan}</small></td>
                    <td>{a.predikat ? label(PREDIKAT, a.predikat) : '-'}</td>
                    <td>{ubahBoleh && <TombolIkon ikon="pena" label="Ubah" onClick={() => setSunting(a.id)} />}</td>
                  </tr>
                ))}
                {d.anggota.length === 0 && <tr><td colSpan={5} className="catatan">Belum ada anggota.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Isi() {
  const [data, setData] = useState<{ bisa_atur: boolean; tahun_ajaran: string; ekskul: Ekskul[] } | null>(null)
  const [ptk, setPtk] = useState<{ id: string; nama: string }[]>([])
  const [galat, setGalat] = useState('')
  const [buka, setBuka] = useState<string | null>(null)
  const [ubah, setUbah] = useState<Ekskul | 'baru' | null>(null)

  const muat = useCallback(() => { panggil<NonNullable<typeof data>>('ekskul_daftar').then((x) => { setData(x); setGalat('') }).catch((e: Error) => setGalat(e.message)) }, [])
  useEffect(() => { muat() }, [muat])
  useEffect(() => { if (data?.bisa_atur) supabase.from('ptk').select('id,nama').order('nama').limit(1000).then(({ data: p }) => setPtk(p ?? [])) }, [data?.bisa_atur])

  async function simpan(e: Ekskul | null, f: FormData) {
    setGalat('')
    try {
      await panggil('ekskul_simpan', { p_id: e?.id ?? null, p_nama: String(f.get('nama')), p_jenis: String(f.get('jenis')), p_deskripsi: String(f.get('deskripsi')) || null, p_pembina_ptk: String(f.get('pembina')) || null, p_jadwal: String(f.get('jadwal')) || null, p_aktif: f.get('aktif') === 'on' })
      setUbah(null); muat()
    } catch (x) { setGalat((x as Error).message) }
  }

  return (
    <Halaman judul="Ekstrakurikuler dan OSIS" lead="Daftar ekskul dan organisasi siswa, anggota per tahun ajaran, kehadiran pertemuan, dan predikat akhir. Pembina hanya melihat ekskul yang dibinanya.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {buka ? <Rincian id={buka} kembali={() => setBuka(null)} ubahDaftar={muat} /> : (
        <>
          {data?.bisa_atur && <div className="aksi" style={{ marginTop: 0 }}><button className="tombol" onClick={() => setUbah('baru')}>Tambah ekskul atau organisasi</button></div>}
          {ubah && data?.bisa_atur && <div className="jarak"><FormEkskul e={ubah === 'baru' ? null : ubah} ptk={ptk} simpan={simpan} batal={() => setUbah(null)} /></div>}
          <div className="grid grid-3 jarak">
            {data?.ekskul.map((e) => (
              <div className="kartu" key={e.id} style={e.aktif ? undefined : { opacity: 0.6 }}>
                <span className="lencana">{e.jenis === 'organisasi' ? 'Organisasi' : 'Ekskul'}{!e.aktif && ' · nonaktif'}</span>
                <h3 style={{ marginTop: 0 }}>{e.nama}</h3>
                <p className="catatan">Pembina: {e.pembina ?? 'belum ditunjuk'}{e.jadwal && <><br />{e.jadwal}</>}</p>
                <p>{e.anggota} anggota aktif · {e.pertemuan} pertemuan (120 hari)</p>
                <div className="aksi" style={{ marginTop: 0 }}>
                  <button className="tombol tombol-isi" onClick={() => setBuka(e.id)}>{e.bisa_ubah ? 'Kelola' : 'Lihat'}</button>
                  {data.bisa_atur && <TombolIkon ikon="pena" label="Ubah" onClick={() => setUbah(e)} />}
                </div>
              </div>
            ))}
            {data && data.ekskul.length === 0 && <p className="catatan">Belum ada ekstrakurikuler yang Anda bina.</p>}
          </div>
          {data?.bisa_atur && <p className="catatan">Pembina juga dapat diberi hak lewat menu Penugasan dengan jabatan Pembina Ekskul dan lingkup berupa nama ekskul yang persis sama.</p>}
        </>
      )}
      <p><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}

export default function EkskulHalaman() {
  return <Gerbang perlu={['ekskul.kelola', 'ekskul.lihat']} judul="Ekstrakurikuler dan OSIS">{() => <Isi />}</Gerbang>
}
