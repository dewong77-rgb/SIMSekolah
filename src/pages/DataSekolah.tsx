// Halaman data sekolah di portal: riwayat unggah, peserta didik, guru dan tendik, rombel.
// Semua dibaca langsung dari Supabase. Akses dijaga RLS (admin TU penuh, guru hanya baca, siswa aktif untuk guru).
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import Pager, { efektif } from '../components/Pager'
const bersih = (q: string) => q.trim().replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ')
const tgl = (t: string | null) => (t ? new Date(t).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : '-')
const waktu = (t: string | null) => (t ? new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-')
const v = (x: unknown) => (x === null || x === undefined || x === '' ? '-' : String(x))

function Rinci({ data }: { data: [string, unknown][] }) {
  return (
    <dl className="daftar" style={{ padding: '8px 4px' }}>
      {data.map(([k, x]) => <Fragment key={k}><dt>{k}</dt><dd>{v(x)}</dd></Fragment>)}
    </dl>
  )
}

function Kembali() {
  return <p className="catatan jarak"><Link to="/portal">Kembali ke portal</Link></p>
}

// ------------------------------------------------------------------ riwayat unggah

type Batch = {
  id: string; jenis_berkas: string; nama_file: string; diunduh_pada: string | null; pengunduh: string | null
  semester_id: string | null; status: string; ringkasan: Record<string, unknown> | null; dibuat_pada: string
}
const namaBerkas: Record<string, string> = {
  profil: 'Profil sekolah', pd_aktif: 'Peserta didik aktif', pd_keluar: 'Peserta didik keluar', guru: 'Guru', tendik: 'Tenaga kependidikan',
  absensi: 'Absensi dan rombel', sekolah_smk: 'Data SMK (jurusan, DUDI, MoU)',
}
const namaRingkasan: Record<string, string> = {
  siswa_unik: 'Siswa', keanggotaan: 'Keanggotaan rombel', keanggotaan_ditulis: 'Keanggotaan ditulis', lembar_rombel: 'Lembar rombel',
  kompetensi_keahlian: 'Kompetensi keahlian', dudi: 'DUDI', mou_kerjasama: 'MoU', mou_dilewati_duplikat: 'MoU duplikat dilewati',
  unit_produksi: 'Unit produksi', praktik_industri: 'Praktik industri', siswa_stub_baru: 'Siswa baru dari absensi',
}

function ringkas(r: Record<string, unknown> | null): { label: string; nilai: string }[] {
  if (!r) return []
  const out: { label: string; nilai: string }[] = []
  for (const [k, x] of Object.entries(r)) {
    if (k === 'isu') continue
    if (typeof x === 'number') out.push({ label: namaRingkasan[k] ?? k.replace(/_/g, ' '), nilai: x.toLocaleString('id-ID') })
    else if (Array.isArray(x)) out.push({ label: namaRingkasan[k] ?? k.replace(/_/g, ' '), nilai: x.join(', ') })
    else if (x && typeof x === 'object') out.push({ label: namaRingkasan[k] ?? k.replace(/_/g, ' '), nilai: Object.entries(x as Record<string, unknown>).map(([a, b]) => `${a}: ${b}`).join(', ') })
    else if (x !== null && x !== undefined) out.push({ label: namaRingkasan[k] ?? k.replace(/_/g, ' '), nilai: String(x) })
  }
  return out
}

export function RiwayatUnggah() {
  const [rows, setRows] = useState<Batch[] | null>(null)
  const [total, setTotal] = useState(0)
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [cari, setCari] = useState('')
  const [q, setQ] = useState('')
  const [galat, setGalat] = useState('')
  const [buka, setBuka] = useState<string | null>(null)

  useEffect(() => { const t = setTimeout(() => { setQ(bersih(cari)); setHal(1) }, 300); return () => clearTimeout(t) }, [cari])

  useEffect(() => {
    const per = efektif(ukuran)
    const dari = (hal - 1) * per
    let qb = supabase.from('import_batch')
      .select('id,jenis_berkas,nama_file,diunduh_pada,pengunduh,semester_id,status,ringkasan,dibuat_pada', { count: 'exact' })
    if (q) qb = qb.or(`nama_file.ilike.%${q}%,jenis_berkas.ilike.%${q}%,pengunduh.ilike.%${q}%`)
    qb.order('dibuat_pada', { ascending: false }).range(dari, dari + per - 1)
      .then(({ data, count, error }) => {
        if (error) setGalat(error.message)
        else { setRows((data ?? []) as Batch[]); setTotal(count ?? 0); setGalat('') }
      })
  }, [hal, ukuran, q])

  return (
    <Halaman judul="Riwayat unggah" lead="Berkas Dapodik yang pernah diunggah, terbaru di atas.">
      <div className="aksi">
        <input type="search" placeholder="Cari nama berkas atau jenis" value={cari} onChange={(e) => setCari(e.target.value)} style={{ minWidth: 260 }} aria-label="Cari" />
      </div>
      {galat && <p className="kartu jarak" role="alert">Galat: {galat}</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Diunggah</th><th>Jenis</th><th>Berkas</th><th>Diunduh dari Dapodik</th><th>Status</th><th>Isu</th></tr></thead>
          <tbody>
            {!rows && !galat && <tr><td colSpan={6}>Memuat...</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={6}>Belum ada unggahan.</td></tr>}
            {rows?.map((b) => {
              const isu = b.ringkasan && typeof b.ringkasan.isu === 'object' && b.ringkasan.isu ? Object.keys(b.ringkasan.isu).length : 0
              return (
                <Fragment key={b.id}>
                  <tr>
                    <td>{waktu(b.dibuat_pada)}</td>
                    <td>{namaBerkas[b.jenis_berkas] ?? b.jenis_berkas}</td>
                    <td>
                      <button className="tombol" style={{ padding: '2px 8px', color: 'var(--warna-utama)' }} aria-expanded={buka === b.id}
                        onClick={() => setBuka(buka === b.id ? null : b.id)}>{buka === b.id ? 'Tutup' : 'Rincian'}</button>{' '}
                      <small>{b.nama_file}</small>
                    </td>
                    <td>{waktu(b.diunduh_pada)}{b.pengunduh ? <small> oleh {b.pengunduh}</small> : null}</td>
                    <td>{b.status}</td>
                    <td>{isu || '-'}</td>
                  </tr>
                  {buka === b.id && (
                    <tr><td colSpan={6}>
                      <Rinci data={[['Semester', b.semester_id], ...ringkas(b.ringkasan).map((r) => [r.label, r.nilai] as [string, unknown])]} />
                    </td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={total} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} server />
      <p className="catatan jarak"><Link to="/portal/unggah">Unggah berkas baru</Link> · <Link to="/portal">Kembali ke portal</Link></p>
    </Halaman>
  )
}

// ------------------------------------------------------------------ peserta didik

type KelasRef = { rombel: { id?: string; nama: string; jenis_rombel: string } | null }
type Pd = {
  id: string; nisn: string | null; nipd: string | null; nama: string; jk: string | null; tempat_lahir: string | null
  tanggal_lahir: string | null; status_peserta_didik: string; keanggotaan_rombel: KelasRef[]
}
type RombelOpsi = { id: string; nama: string }

const kelasUtama = (p: { keanggotaan_rombel: KelasRef[] }) =>
  p.keanggotaan_rombel.map((k) => k.rombel).find((r) => r?.jenis_rombel === 'Kelas Utama')?.nama ?? '-'

function useRombelOpsi() {
  const [opsi, setOpsi] = useState<RombelOpsi[]>([])
  useEffect(() => {
    supabase.from('rombel').select('id,nama,tingkat').eq('jenis_rombel', 'Kelas Utama').order('tingkat').order('nama').limit(200)
      .then(({ data }) => setOpsi((data ?? []) as RombelOpsi[]))
  }, [])
  return opsi
}

export function PesertaDidik() {
  const { profil } = useAuth()
  const tu = profil?.peran === 'admin_tu'
  const [rows, setRows] = useState<Pd[] | null>(null)
  const [total, setTotal] = useState(0)
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [status, setStatus] = useState('aktif')
  const [kelas, setKelas] = useState('')
  const [cari, setCari] = useState('')
  const [q, setQ] = useState('')
  const [galat, setGalat] = useState('')
  const [buka, setBuka] = useState<string | null>(null)
  const [rinci, setRinci] = useState<Record<string, unknown> | null>(null)
  const [hitung, setHitung] = useState<Record<string, number>>({})
  const opsi = useRombelOpsi()

  useEffect(() => { const t = setTimeout(() => { setQ(bersih(cari)); setHal(1) }, 300); return () => clearTimeout(t) }, [cari])

  useEffect(() => {
    if (!tu) return
    for (const s of ['aktif', 'lulus', 'mutasi']) {
      supabase.from('peserta_didik').select('id', { count: 'exact', head: true }).eq('status_peserta_didik', s)
        .then(({ count }) => setHitung((h) => ({ ...h, [s]: count ?? 0 })))
    }
  }, [tu])

  useEffect(() => {
    const per = efektif(ukuran)
    const dari = (hal - 1) * per
    const kolom = 'id,nisn,nipd,nama,jk,tempat_lahir,tanggal_lahir,status_peserta_didik'
    const embed = kelas ? 'keanggotaan_rombel!inner(rombel(id,nama,jenis_rombel))' : 'keanggotaan_rombel(rombel(id,nama,jenis_rombel))'
    let qb = supabase.from('peserta_didik').select(`${kolom},${embed}`, { count: 'exact' })
    if (status !== 'semua') qb = qb.eq('status_peserta_didik', status)
    if (kelas) qb = qb.eq('keanggotaan_rombel.rombel_id', kelas)
    if (q) qb = qb.or(`nama.ilike.%${q}%,nisn.ilike.%${q}%,nipd.ilike.%${q}%`)
    qb.order('nama').range(dari, dari + per - 1).then(({ data, count, error }) => {
      if (error) setGalat(error.message)
      else { setRows((data ?? []) as unknown as Pd[]); setTotal(count ?? 0); setGalat('') }
    })
  }, [hal, ukuran, status, kelas, q])

  const bukaRinci = useCallback(async (id: string) => {
    if (buka === id) { setBuka(null); return }
    setBuka(id); setRinci(null)
    const { data } = await supabase.from('peserta_didik').select('*').eq('id', id).maybeSingle()
    setRinci(data as Record<string, unknown> | null)
  }, [buka])

  return (
    <Halaman judul={tu ? 'Peserta didik' : 'Daftar siswa'} lead={tu ? 'Seluruh peserta didik dari data Dapodik: aktif, lulus, dan mutasi.' : 'Siswa aktif di sekolah.'}>
      {tu && (
        <div className="grid grid-4">
          <div className="kartu"><small>Aktif</small><h3>{(hitung.aktif ?? 0).toLocaleString('id-ID')}</h3></div>
          <div className="kartu"><small>Lulus (alumni)</small><h3>{(hitung.lulus ?? 0).toLocaleString('id-ID')}</h3></div>
          <div className="kartu"><small>Mutasi</small><h3>{(hitung.mutasi ?? 0).toLocaleString('id-ID')}</h3></div>
        </div>
      )}
      <div className="aksi jarak">
        {tu && (
          <select value={status} onChange={(e) => { setStatus(e.target.value); setHal(1) }} aria-label="Status">
            <option value="aktif">Aktif</option><option value="lulus">Lulus</option><option value="mutasi">Mutasi</option><option value="semua">Semua status</option>
          </select>
        )}
        <select value={kelas} onChange={(e) => { setKelas(e.target.value); setHal(1) }} aria-label="Kelas">
          <option value="">Semua kelas</option>
          {opsi.map((o) => <option key={o.id} value={o.id}>{o.nama}</option>)}
        </select>
        <input type="search" placeholder="Cari nama, NISN, atau NIPD" value={cari} onChange={(e) => setCari(e.target.value)} style={{ minWidth: 260 }} aria-label="Cari" />
      </div>
      {galat && <p className="kartu jarak" role="alert">Galat: {galat}</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Nama</th><th>NISN</th><th>JK</th><th>Tempat, tanggal lahir</th><th>Kelas</th>{tu && <th>Status</th>}</tr></thead>
          <tbody>
            {!rows && !galat && <tr><td colSpan={6}>Memuat...</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={6}>Tidak ada data.</td></tr>}
            {rows?.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td>
                    {tu ? (
                      <button className="tombol" style={{ padding: '2px 8px', color: 'var(--warna-utama)', textAlign: 'left' }} aria-expanded={buka === p.id} onClick={() => bukaRinci(p.id)}>{p.nama}</button>
                    ) : p.nama}
                  </td>
                  <td>{v(p.nisn)}</td><td>{v(p.jk)}</td><td>{v(p.tempat_lahir)}, {tgl(p.tanggal_lahir)}</td><td>{kelasUtama(p)}</td>
                  {tu && <td>{p.status_peserta_didik}</td>}
                </tr>
                {buka === p.id && (
                  <tr><td colSpan={6}>
                    {!rinci ? 'Memuat...' : (
                      <Rinci data={[
                        ['NIPD', rinci.nipd], ['Agama', rinci.agama], ['Alamat', [rinci.alamat, rinci.rt && `RT ${rinci.rt}`, rinci.rw && `RW ${rinci.rw}`, rinci.dusun, rinci.kelurahan, rinci.kecamatan, rinci.kode_pos].filter(Boolean).join(', ')],
                        ['Jenis tinggal', rinci.jenis_tinggal], ['Transportasi', rinci.alat_transportasi], ['Telepon', rinci.telepon], ['HP', rinci.hp], ['Email', rinci.email],
                        ['Sekolah asal', rinci.sekolah_asal], ['Anak ke', rinci.anak_ke], ['Penerima KPS', rinci.penerima_kps], ['Layak PIP', rinci.layak_pip],
                        ['Kebutuhan khusus', rinci.kebutuhan_khusus], ['Tanggal keluar', rinci.tanggal_keluar], ['Alasan keluar', rinci.alasan_keluar],
                      ]} />
                    )}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={total} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} server />
      <Kembali />
    </Halaman>
  )
}

// ------------------------------------------------------------------ guru dan tendik

type Ptk = {
  id: string; nama: string; nuptk: string | null; jk: string | null; jenis_ptk: string | null; status_kepegawaian: string | null
  tugas_tambahan: string | null; mengajar: string | null; jabatan_ptk: string | null; total_jjm: number | null
}

export function GuruTendik() {
  const { profil } = useAuth()
  const tu = profil?.peran === 'admin_tu'
  const [rows, setRows] = useState<Ptk[] | null>(null)
  const [total, setTotal] = useState(0)
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [jenis, setJenis] = useState('')
  const [cari, setCari] = useState('')
  const [q, setQ] = useState('')
  const [galat, setGalat] = useState('')
  const [buka, setBuka] = useState<string | null>(null)
  const [rinci, setRinci] = useState<Record<string, unknown> | null>(null)

  useEffect(() => { const t = setTimeout(() => { setQ(bersih(cari)); setHal(1) }, 300); return () => clearTimeout(t) }, [cari])

  useEffect(() => {
    const per = efektif(ukuran)
    const dari = (hal - 1) * per
    let qb = supabase.from('ptk').select('id,nama,nuptk,jk,jenis_ptk,status_kepegawaian,tugas_tambahan,mengajar,jabatan_ptk,total_jjm', { count: 'exact' })
    if (jenis) qb = qb.eq('jenis_ptk', jenis)
    if (q) qb = qb.or(`nama.ilike.%${q}%,nuptk.ilike.%${q}%`)
    qb.order('nama').range(dari, dari + per - 1).then(({ data, count, error }) => {
      if (error) setGalat(error.message)
      else { setRows((data ?? []) as Ptk[]); setTotal(count ?? 0); setGalat('') }
    })
  }, [hal, ukuran, jenis, q])

  async function bukaRinci(id: string) {
    if (buka === id) { setBuka(null); return }
    setBuka(id); setRinci(null)
    const { data } = await supabase.from('ptk').select('*').eq('id', id).maybeSingle()
    setRinci(data as Record<string, unknown> | null)
  }

  return (
    <Halaman judul={tu ? 'Guru dan tendik' : 'Data PTK'} lead="Pendidik dan tenaga kependidikan dari data Dapodik.">
      <div className="aksi">
        <select value={jenis} onChange={(e) => { setJenis(e.target.value); setHal(1) }} aria-label="Jenis PTK">
          <option value="">Semua jenis</option><option value="Guru">Guru</option><option value="Tenaga Kependidikan">Tenaga kependidikan</option><option value="Kepala Sekolah">Kepala sekolah</option>
        </select>
        <input type="search" placeholder="Cari nama atau NUPTK" value={cari} onChange={(e) => setCari(e.target.value)} style={{ minWidth: 260 }} aria-label="Cari" />
      </div>
      {galat && <p className="kartu jarak" role="alert">Galat: {galat}</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Nama</th><th>NUPTK</th><th>Jenis</th><th>Status kepegawaian</th><th>Tugas tambahan</th><th>Mengajar</th><th>JJM</th></tr></thead>
          <tbody>
            {!rows && !galat && <tr><td colSpan={7}>Memuat...</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={7}>Tidak ada data.</td></tr>}
            {rows?.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td>
                    {tu ? (
                      <button className="tombol" style={{ padding: '2px 8px', color: 'var(--warna-utama)', textAlign: 'left' }} aria-expanded={buka === p.id} onClick={() => bukaRinci(p.id)}>{p.nama}</button>
                    ) : p.nama}
                  </td>
                  <td>{v(p.nuptk)}</td><td>{v(p.jenis_ptk)}</td><td>{v(p.status_kepegawaian)}</td><td>{v(p.tugas_tambahan)}</td><td>{v(p.mengajar)}</td><td>{v(p.total_jjm)}</td>
                </tr>
                {buka === p.id && (
                  <tr><td colSpan={7}>
                    {!rinci ? 'Memuat...' : (
                      <Rinci data={[
                        ['NIP', rinci.nip], ['Jenis kelamin', rinci.jk], ['Tempat, tanggal lahir', `${v(rinci.tempat_lahir)}, ${tgl(rinci.tanggal_lahir as string | null)}`],
                        ['Pangkat, golongan', rinci.pangkat_golongan], ['Jabatan', rinci.jabatan_ptk], ['Pendidikan', [rinci.jenjang_pendidikan, rinci.jurusan_prodi].filter(Boolean).join(', ')],
                        ['Sertifikasi', rinci.sertifikasi], ['Kompetensi', rinci.kompetensi], ['TMT kerja', rinci.tmt_kerja], ['TMT pengangkatan', rinci.tmt_pengangkatan],
                        ['Alamat', [rinci.alamat_jalan, rinci.kelurahan, rinci.kecamatan, rinci.kode_pos].filter(Boolean).join(', ')], ['HP', rinci.hp], ['Email', rinci.email],
                      ]} />
                    )}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={total} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} server />
      <Kembali />
    </Halaman>
  )
}

// ------------------------------------------------------------------ rombel

type Rombel = {
  id: string; nama: string; tingkat: number | null; jenis_rombel: string; ruangan: string | null; kurikulum: string | null
  wali_kelas_nama: string | null; semester_id: string; keanggotaan_rombel: { count: number }[]
}

export function DaftarRombel() {
  const [rows, setRows] = useState<Rombel[] | null>(null)
  const [jenis, setJenis] = useState('Kelas Utama')
  const [tingkat, setTingkat] = useState('')
  const [cari, setCari] = useState('')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(10)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    setHal(1)
    let qb = supabase.from('rombel').select('id,nama,tingkat,jenis_rombel,ruangan,kurikulum,wali_kelas_nama,semester_id,keanggotaan_rombel(count)')
    if (jenis !== 'semua') qb = qb.eq('jenis_rombel', jenis)
    if (tingkat) qb = qb.eq('tingkat', Number(tingkat))
    qb.order('tingkat').order('nama').limit(300).then(({ data, error }) => {
      if (error) setGalat(error.message)
      else { setRows((data ?? []) as unknown as Rombel[]); setGalat('') }
    })
  }, [jenis, tingkat])

  const tampil = useMemo(() => {
    const k = cari.trim().toLowerCase()
    return (rows ?? []).filter((r) => !k || [r.nama, r.wali_kelas_nama, r.ruangan].some((x) => (x ?? '').toLowerCase().includes(k)))
  }, [rows, cari])
  const jumlah = useMemo(() => tampil.reduce((a, r) => a + (r.keanggotaan_rombel[0]?.count ?? 0), 0), [tampil])
  const per = efektif(ukuran)
  const irisan = tampil.slice((hal - 1) * per, hal * per)

  return (
    <Halaman judul="Rombel" lead="Rombongan belajar semester berjalan. Pilih rombel untuk melihat anggotanya.">
      <div className="aksi">
        <select value={jenis} onChange={(e) => setJenis(e.target.value)} aria-label="Jenis rombel">
          <option value="Kelas Utama">Kelas utama</option><option value="semua">Semua jenis</option>
        </select>
        <select value={tingkat} onChange={(e) => setTingkat(e.target.value)} aria-label="Tingkat">
          <option value="">Semua tingkat</option><option value="10">Kelas X</option><option value="11">Kelas XI</option><option value="12">Kelas XII</option>
        </select>
        <input type="search" placeholder="Cari rombel, wali kelas, atau ruangan" value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ minWidth: 260 }} aria-label="Cari" />
        <span className="catatan">{tampil.length} rombel, {jumlah.toLocaleString('id-ID')} keanggotaan</span>
      </div>
      {galat && <p className="kartu jarak" role="alert">Galat: {galat}</p>}
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>Rombel</th><th>Tingkat</th><th>Wali kelas</th><th>Ruangan</th><th>Kurikulum</th><th>Anggota</th></tr></thead>
          <tbody>
            {!rows && !galat && <tr><td colSpan={6}>Memuat...</td></tr>}
            {rows && tampil.length === 0 && <tr><td colSpan={6}>Tidak ada data.</td></tr>}
            {irisan.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/portal/rombel/${r.id}`}>{r.nama}</Link></td>
                <td>{v(r.tingkat)}</td><td>{v(r.wali_kelas_nama)}</td><td>{v(r.ruangan)}</td><td>{v(r.kurikulum)}</td>
                <td>{r.keanggotaan_rombel[0]?.count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={tampil.length} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} />
      <Kembali />
    </Halaman>
  )
}

type Anggota = { no_urut: number | null; peserta_didik: { nama: string; nisn: string | null; nipd: string | null; jk: string | null; status_peserta_didik: string } | null }

export function DetailRombel() {
  const { id } = useParams()
  const [rombel, setRombel] = useState<Rombel | null>(null)
  const [anggota, setAnggota] = useState<Anggota[] | null>(null)
  const [galat, setGalat] = useState('')
  const [cari, setCari] = useState('')
  const [hal, setHal] = useState(1)
  const [ukuran, setUkuran] = useState(20)

  useEffect(() => {
    if (!id) return
    supabase.from('rombel').select('id,nama,tingkat,jenis_rombel,ruangan,kurikulum,wali_kelas_nama,semester_id,keanggotaan_rombel(count)').eq('id', id).maybeSingle()
      .then(({ data, error }) => { if (error) setGalat(error.message); else setRombel(data as unknown as Rombel | null) })
    supabase.from('keanggotaan_rombel').select('no_urut,peserta_didik(nama,nisn,nipd,jk,status_peserta_didik)').eq('rombel_id', id).order('no_urut').limit(1000)
      .then(({ data, error }) => { if (error) setGalat(error.message); else setAnggota((data ?? []) as unknown as Anggota[]) })
  }, [id])

  const l = (anggota ?? []).filter((a) => a.peserta_didik?.jk === 'L').length
  const pr = (anggota ?? []).filter((a) => a.peserta_didik?.jk === 'P').length

  const k = cari.trim().toLowerCase()
  const tampilA = (anggota ?? []).filter((a) => !k || [a.peserta_didik?.nama, a.peserta_didik?.nisn, a.peserta_didik?.nipd].some((x) => (x ?? '').toLowerCase().includes(k)))
  const per = efektif(ukuran)
  const irisanA = tampilA.slice((hal - 1) * per, hal * per)

  return (
    <Halaman judul={rombel?.nama ?? 'Rombel'} lead={rombel ? `Wali kelas: ${v(rombel.wali_kelas_nama)}. Semester ${rombel.semester_id}.` : undefined}>
      {galat && <p className="kartu" role="alert">Galat: {galat}</p>}
      {rombel && (
        <div className="grid grid-4">
          <div className="kartu"><small>Anggota</small><h3>{anggota?.length ?? '...'}</h3></div>
          <div className="kartu"><small>Laki-laki</small><h3>{anggota ? l : '...'}</h3></div>
          <div className="kartu"><small>Perempuan</small><h3>{anggota ? pr : '...'}</h3></div>
          <div className="kartu"><small>Ruangan</small><h3>{v(rombel.ruangan)}</h3></div>
        </div>
      )}
      <div className="aksi jarak">
        <input type="search" placeholder="Cari nama, NISN, atau NIPD" value={cari} onChange={(e) => { setCari(e.target.value); setHal(1) }} style={{ minWidth: 260 }} aria-label="Cari anggota" />
      </div>
      <div className="tabel-bungkus jarak">
        <table>
          <thead><tr><th>No</th><th>Nama</th><th>NISN</th><th>NIPD</th><th>JK</th><th>Status</th></tr></thead>
          <tbody>
            {!anggota && !galat && <tr><td colSpan={6}>Memuat...</td></tr>}
            {anggota && tampilA.length === 0 && <tr><td colSpan={6}>{anggota.length === 0 ? 'Belum ada anggota.' : 'Tidak ada yang cocok.'}</td></tr>}
            {irisanA.map((a, i) => (
              <tr key={i}>
                <td>{a.no_urut ?? (hal - 1) * per + i + 1}</td><td>{v(a.peserta_didik?.nama)}</td><td>{v(a.peserta_didik?.nisn)}</td>
                <td>{v(a.peserta_didik?.nipd)}</td><td>{v(a.peserta_didik?.jk)}</td><td>{v(a.peserta_didik?.status_peserta_didik)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager halaman={hal} total={tampilA.length} ukuran={ukuran} ke={setHal} ubahUkuran={setUkuran} />
      <p className="catatan jarak"><Link to="/portal/rombel">Kembali ke daftar rombel</Link></p>
    </Halaman>
  )
}
