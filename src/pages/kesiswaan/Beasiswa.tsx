// Beasiswa dan PIP: program, calon, ceklis berkas, status, dan pencairan. Tidak menyimpan nomor rekening.
import TombolIkon from '../../components/TombolIkon'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import CariSiswa from '../../components/CariSiswa'
import { panggil, tgl } from '../../lib/rpc'
import { unduhCsv } from '../../lib/hubin'
import { JENIS_BEASISWA, STATUS_BEASISWA, hariIni, label, type SiswaCari } from '../../lib/kesiswaan'
import Gerbang from './Gerbang'

type Program = {
  id: string; nama: string; jenis: string; penyelenggara: string | null; tahun_ajaran: string; kuota: number | null; syarat: string | null; berkas_wajib: string[]
  tenggat: string | null; aktif: boolean; jumlah: number; calon: number; proses: number; ditetapkan: number; dicairkan: number; tidak_lolos: number
}
type Peserta = { id: string; pd: string; nama: string; nisn: string | null; rombel: string | null; layak_pip: string | null; status: string; berkas: Record<string, boolean>; catatan: string | null; tgl_cair: string | null }

const tahunAjaranIni = () => { const d = new Date(); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}/${y + 1}` }

function FormProgram({ p, simpan, batal }: { p: Program | null; simpan: (p: Program | null, f: FormData) => Promise<void>; batal: () => void }) {
  return (
    <form className="kartu form" style={{ maxWidth: 600 }} onSubmit={(e) => { e.preventDefault(); void simpan(p, new FormData(e.currentTarget)) }}>
      <h3>{p ? `Ubah ${p.nama}` : 'Program baru'}</h3>
      <label>Nama program<input name="nama" defaultValue={p?.nama ?? ''} minLength={3} maxLength={150} required /></label>
      <div className="grid grid-2">
        <label>Jenis<select name="jenis" defaultValue={p?.jenis ?? 'pip'}>{JENIS_BEASISWA.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Tahun ajaran<input name="ta" defaultValue={p?.tahun_ajaran ?? tahunAjaranIni()} pattern="[0-9]{4}/[0-9]{4}" required /></label>
        <label>Kuota (boleh kosong)<input name="kuota" type="number" min={1} max={5000} defaultValue={p?.kuota ?? ''} /></label>
        <label>Tenggat usulan<input name="tenggat" type="date" defaultValue={p?.tenggat ?? ''} /></label>
      </div>
      <label>Penyelenggara<input name="penyelenggara" defaultValue={p?.penyelenggara ?? ''} maxLength={150} /></label>
      <label>Syarat singkat<textarea name="syarat" rows={2} maxLength={1000} defaultValue={p?.syarat ?? ''} /></label>
      <label>Berkas wajib (satu per baris)<textarea name="berkas" rows={4} defaultValue={(p?.berkas_wajib ?? ['Fotokopi KK', 'Surat keterangan tidak mampu']).join('\n')} /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input name="aktif" type="checkbox" defaultChecked={p?.aktif ?? true} style={{ width: 'auto' }} />Aktif</label>
      <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi">Simpan</button><button type="button" className="tombol" onClick={batal}>Batal</button></div>
    </form>
  )
}

function Peserta_({ program, kembali, ubahDaftar }: { program: Program; kembali: () => void; ubahDaftar: () => void }) {
  const [daftar, setDaftar] = useState<Peserta[] | null>(null)
  const [galat, setGalat] = useState('')
  const [info, setInfo] = useState('')
  const [siswa, setSiswa] = useState<SiswaCari | null>(null)
  const [status, setStatus] = useState('')
  const [sunting, setSunting] = useState<string | null>(null)
  const [sibuk, setSibuk] = useState(false)

  const muat = useCallback(() => { panggil<Peserta[]>('beasiswa_siswa_daftar', { p_program: program.id }).then((x) => { setDaftar(x); setGalat('') }).catch((e: Error) => setGalat(e.message)) }, [program.id])
  useEffect(() => { muat() }, [muat])

  async function jalan(fn: () => Promise<unknown>, pesan: (r: unknown) => string) {
    setSibuk(true); setGalat(''); setInfo('')
    try { const r = await fn(); setInfo(pesan(r)); muat(); ubahDaftar() } catch (e) { setGalat((e as Error).message) } finally { setSibuk(false) }
  }
  function simpan(p: Peserta, f: FormData) {
    const berkas = Object.fromEntries(program.berkas_wajib.map((b, i) => [b, f.get(`b${i}`) === 'on']))
    void jalan(async () => { await panggil('beasiswa_siswa_atur', { p_id: p.id, p_status: String(f.get('status')), p_berkas: berkas, p_catatan: String(f.get('catatan')) || null, p_tgl_cair: String(f.get('cair')) || null }); setSunting(null) }, () => `Data ${p.nama} tersimpan.`)
  }
  const tampil = (daftar ?? []).filter((p) => !status || p.status === status)

  return (
    <div>
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}><button className="tombol" onClick={kembali}>Kembali ke program</button><h2 style={{ margin: 0 }}>{program.nama}</h2><small className="catatan">{program.tahun_ajaran}{program.kuota && ` · kuota ${program.kuota}`}</small></div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {info && <p className="kartu" role="status">{info}</p>}
      <div className="kartu jarak" style={{ maxWidth: 700 }}>
        <h3>Tambah calon</h3>
        <CariSiswa untuk="beasiswa" pilih={setSiswa} dipilih={siswa} />
        <div className="aksi">
          <button className="tombol" disabled={!siswa || sibuk} onClick={() => siswa && jalan(async () => { const n = await panggil<number>('beasiswa_siswa_tambah', { p_program: program.id, p_pds: [siswa.id] }); setSiswa(null); return n }, (n) => (n ? 'Calon ditambahkan.' : 'Siswa itu sudah ada di program ini.'))}>Tambah siswa ini</button>
          {program.jenis === 'pip' && <button className="tombol" disabled={sibuk} onClick={() => jalan(() => panggil<number>('beasiswa_tambah_layak_pip', { p_program: program.id }), (n) => `${n} siswa berstatus layak PIP di data Dapodik ditambahkan sebagai calon.`)}>Tambah semua yang layak PIP (data Dapodik)</button>}
        </div>
      </div>
      <div className="aksi" style={{ alignItems: 'center' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Semua status</option>{STATUS_BEASISWA.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <TombolIkon ikon="unduh" label="Unduh CSV" disabled={!tampil.length} onClick={() => unduhCsv(`beasiswa-${program.nama}`, [['Nama', 'NISN', 'Rombel', 'Status', 'Berkas lengkap', 'Tanggal cair', 'Catatan'], ...tampil.map((p) => [p.nama, p.nisn, p.rombel, label(STATUS_BEASISWA, p.status), program.berkas_wajib.length ? `${program.berkas_wajib.filter((b) => p.berkas[b]).length}/${program.berkas_wajib.length}` : '', p.tgl_cair ?? '', p.catatan])])} />
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Siswa</th><th>Status</th><th>Berkas</th><th>Catatan</th><th /></tr></thead>
          <tbody>
            {tampil.map((p) => sunting === p.id ? (
              <tr key={p.id}><td colSpan={5}>
                <form className="form" onSubmit={(e) => { e.preventDefault(); simpan(p, new FormData(e.currentTarget)) }}>
                  <strong>{p.nama}</strong>
                  <label>Status<select name="status" defaultValue={p.status}>{STATUS_BEASISWA.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                  {program.berkas_wajib.map((b, i) => <label key={b} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input name={`b${i}`} type="checkbox" defaultChecked={!!p.berkas[b]} style={{ width: 'auto' }} />{b}</label>)}
                  <label>Tanggal pencairan (bila dicairkan)<input name="cair" type="date" max={hariIni()} defaultValue={p.tgl_cair ?? ''} /></label>
                  <label>Catatan<input name="catatan" defaultValue={p.catatan ?? ''} maxLength={500} /></label>
                  <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi" disabled={sibuk}>Simpan</button><button type="button" className="tombol" onClick={() => setSunting(null)}>Batal</button></div>
                </form>
              </td></tr>
            ) : (
              <tr key={p.id}>
                <td>{p.nama}<br /><small className="catatan">{p.rombel ?? '-'}{p.layak_pip === 'Ya' && ' · layak PIP di Dapodik'}</small></td>
                <td>{label(STATUS_BEASISWA, p.status)}{p.tgl_cair && <><br /><small className="catatan">cair {tgl(p.tgl_cair)}</small></>}</td>
                <td>{program.berkas_wajib.length ? `${program.berkas_wajib.filter((b) => p.berkas[b]).length}/${program.berkas_wajib.length}` : '-'}</td>
                <td>{p.catatan ?? ''}</td>
                <td><TombolIkon ikon="pena" label="Ubah" onClick={() => setSunting(p.id)} /></td>
              </tr>
            ))}
            {daftar && tampil.length === 0 && <tr><td colSpan={5} className="catatan">Belum ada siswa.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Isi() {
  const [data, setData] = useState<Program[] | null>(null)
  const [galat, setGalat] = useState('')
  const [ubah, setUbah] = useState<Program | 'baru' | null>(null)
  const [buka, setBuka] = useState<Program | null>(null)
  const muat = useCallback(() => { panggil<Program[]>('beasiswa_daftar').then((x) => { setData(x); setGalat('') }).catch((e: Error) => setGalat(e.message)) }, [])
  useEffect(() => { muat() }, [muat])

  async function simpan(p: Program | null, f: FormData) {
    setGalat('')
    try {
      await panggil('beasiswa_program_simpan', {
        p_id: p?.id ?? null, p_nama: String(f.get('nama')), p_jenis: String(f.get('jenis')), p_penyelenggara: String(f.get('penyelenggara')) || null, p_tahun_ajaran: String(f.get('ta')),
        p_kuota: f.get('kuota') ? Number(f.get('kuota')) : null, p_syarat: String(f.get('syarat')) || null,
        p_berkas_wajib: String(f.get('berkas')).split('\n').map((x) => x.trim()).filter(Boolean), p_tenggat: String(f.get('tenggat')) || null, p_aktif: f.get('aktif') === 'on',
      })
      setUbah(null); muat()
    } catch (x) { setGalat((x as Error).message) }
  }

  return (
    <Halaman judul="Beasiswa dan PIP" lead="Program bantuan, calon penerima, kelengkapan berkas, penetapan, dan pencairan. Sistem hanya mencatat status proses; nomor rekening dan data keuangan keluarga tidak disimpan di sini.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {buka ? <Peserta_ program={data?.find((p) => p.id === buka.id) ?? buka} kembali={() => setBuka(null)} ubahDaftar={muat} /> : (
        <>
          <div className="aksi" style={{ marginTop: 0 }}><button className="tombol" onClick={() => setUbah('baru')}>Tambah program</button></div>
          {ubah && <div className="jarak"><FormProgram p={ubah === 'baru' ? null : ubah} simpan={simpan} batal={() => setUbah(null)} /></div>}
          <div className="grid grid-3 jarak">
            {data?.map((p) => (
              <div className="kartu" key={p.id} style={p.aktif ? undefined : { opacity: 0.6 }}>
                <span className="lencana">{label(JENIS_BEASISWA, p.jenis)} · {p.tahun_ajaran}{!p.aktif && ' · nonaktif'}</span>
                <h3 style={{ marginTop: 0 }}>{p.nama}</h3>
                <p className="catatan">{p.penyelenggara ?? ''}{p.tenggat && ` · tenggat ${tgl(p.tenggat)}`}</p>
                <p>{p.jumlah} siswa: {p.calon} calon, {p.proses} diproses, {p.ditetapkan} ditetapkan, {p.dicairkan} dicairkan, {p.tidak_lolos} tidak lolos atau mundur{p.kuota && `. Kuota ${p.kuota}.`}</p>
                <div className="aksi" style={{ marginTop: 0 }}><button className="tombol tombol-isi" onClick={() => setBuka(p)}>Kelola siswa</button><button className="tombol" onClick={() => setUbah(p)}>Ubah</button></div>
              </div>
            ))}
            {data && data.length === 0 && <p className="catatan">Belum ada program. Tambahkan program PIP atau beasiswa lain.</p>}
          </div>
        </>
      )}
      <p><Link to="/portal/kesiswaan">Kembali ke Kesiswaan</Link></p>
    </Halaman>
  )
}

export default function BeasiswaHalaman() {
  return <Gerbang perlu={['kesiswaan.beasiswa']} judul="Beasiswa dan PIP">{() => <Isi />}</Gerbang>
}
