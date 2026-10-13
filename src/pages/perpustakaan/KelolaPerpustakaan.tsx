import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { useAuth } from '../../auth/AuthContext'
import { panggil, tgl } from '../../lib/rpc'
import {
  DDC, JENIS_BUKU, KATEGORI_UMUM, SUMBER, TINGKAT, alamatBaca, labelJenis, nomorPanggil, hapusDariPenyimpanan, ukuranTeks, unggahBuku, useIzinPerpus, useSampul,
  type BukuPerpus, type Pengelola, type StatusBuku,
} from '../../lib/perpustakaan'
import { Sampul } from './Perpustakaan'
import LaporanPerpustakaan from './LaporanPerpustakaan'

// Pengelolaan koleksi dan pengelola perpustakaan. Untuk super admin, penanggung jawab, dan petugas perpustakaan.

const labelStatus: Record<StatusBuku, string> = { draf: 'Draf', terbit: 'Terbit', arsip: 'Arsip' }
const kelasStatus: Record<StatusBuku, string> = { draf: 'status-menunggu', terbit: 'status-selesai', arsip: 'status-dibatalkan' }
const kosong = {
  judul: '', penulis: '', penerbit: '', tahun_terbit: '', isbn: '', kategori: 'Buku teks pelajaran',
  jenis_buku: 'buku_teks', nomor_induk: '', klasifikasi: '', nomor_panggil: '', edisi: '', kota_terbit: '', bahasa: 'Indonesia', subjek: '', harga: '', jumlah_lisensi: '', mapel: '', tingkat: 'Semua', deskripsi: '',
  sumber_perolehan: 'beli', nomor_lisensi: '', tanggal_perolehan: '', lisensi_berakhir: '', terbit: true,
}

function FormBuku({ awal, npsn, selesai, batal }: { awal: BukuPerpus | null; npsn: string; selesai: () => Promise<void>; batal: () => void }) {
  const [v, setV] = useState(awal ? {
    judul: awal.judul, penulis: awal.penulis ?? '', penerbit: awal.penerbit ?? '', tahun_terbit: awal.tahun_terbit?.toString() ?? '', isbn: awal.isbn ?? '',
    kategori: awal.kategori, jenis_buku: awal.jenis_buku, nomor_induk: awal.nomor_induk ?? '', klasifikasi: awal.klasifikasi ?? '', nomor_panggil: awal.nomor_panggil ?? '',
    edisi: awal.edisi ?? '', kota_terbit: awal.kota_terbit ?? '', bahasa: awal.bahasa, subjek: awal.subjek ?? '', harga: awal.harga?.toString() ?? '', jumlah_lisensi: awal.jumlah_lisensi?.toString() ?? '',
    mapel: awal.mapel ?? '', tingkat: awal.tingkat ?? 'Semua', deskripsi: awal.deskripsi ?? '',
    sumber_perolehan: awal.sumber_perolehan, nomor_lisensi: awal.nomor_lisensi ?? '', tanggal_perolehan: awal.tanggal_perolehan ?? '',
    lisensi_berakhir: awal.lisensi_berakhir ?? '', terbit: awal.status === 'terbit',
  } : kosong)
  const [berkas, setBerkas] = useState<File | null>(null)
  const [langkah, setLangkah] = useState('')
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const ubah = (k: keyof typeof kosong, x: string | boolean) => setV((p) => ({ ...p, [k]: x }))

  async function kirim(e: FormEvent) {
    e.preventDefault()
    setGalat('')
    if (!awal && !berkas) { setGalat('Pilih berkas PDF buku.'); return }
    if (!npsn) { setGalat('Akun ini belum terhubung ke sekolah.'); return }
    setSibuk(true)
    let baru: Awaited<ReturnType<typeof unggahBuku>> | null = null
    try {
      if (berkas) baru = await unggahBuku(berkas, npsn, setLangkah)
      setLangkah('Menyimpan data...')
      await panggil('perpus_buku_simpan', {
        p_id: awal?.id ?? null,
        p_data: {
          ...v, terbit: undefined, status: v.terbit ? 'terbit' : (awal && awal.status === 'arsip' ? 'arsip' : 'draf'),
          berkas_path: baru?.berkas_path ?? awal?.berkas_path, sampul_path: baru ? baru.sampul_path : awal?.sampul_path,
          jumlah_halaman: baru?.jumlah_halaman ?? awal?.jumlah_halaman, ukuran_byte: baru?.ukuran_byte ?? awal?.ukuran_byte,
        },
      })
      if (baru && awal) hapusDariPenyimpanan([awal.berkas_path, awal.sampul_path])
      await selesai()
    } catch (er) {
      if (baru) hapusDariPenyimpanan([baru.berkas_path, baru.sampul_path])
      setGalat((er as Error).message)
    }
    setSibuk(false); setLangkah('')
  }

  return (
    <form className="kartu form jarak" onSubmit={kirim}>
      <h3>{awal ? 'Ubah data buku' : 'Tambah buku'}</h3>
      <label>{awal ? 'Ganti berkas PDF (opsional)' : 'Berkas PDF buku'}
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />
        <span className="petunjuk">Maksimal 50 MB. Sampul dibuat otomatis dari halaman pertama. {awal?.ukuran_byte ? `Berkas saat ini ${ukuranTeks(awal.ukuran_byte)}, ${awal.jumlah_halaman ?? '?'} halaman.` : ''}</span>
      </label>
      <label>Judul<input required minLength={3} maxLength={200} value={v.judul} onChange={(e) => ubah('judul', e.target.value)} /></label>
      <div className="grid grid-2">
        <label>Penulis<input maxLength={200} value={v.penulis} onChange={(e) => ubah('penulis', e.target.value)} /></label>
        <label>Penerbit<input maxLength={200} value={v.penerbit} onChange={(e) => ubah('penerbit', e.target.value)} /></label>
        <label>Tahun terbit<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={v.tahun_terbit} onChange={(e) => ubah('tahun_terbit', e.target.value)} /></label>
        <label>ISBN<input maxLength={30} value={v.isbn} onChange={(e) => ubah('isbn', e.target.value)} /></label>
        <label>Jenis buku<select value={v.jenis_buku} onChange={(e) => ubah('jenis_buku', e.target.value)}>{JENIS_BUKU.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Nomor induk
          <input maxLength={40} value={v.nomor_induk} onChange={(e) => ubah('nomor_induk', e.target.value)} placeholder={awal ? '' : 'Kosongkan untuk otomatis (DIG/tahun/0001)'} />
          <span className="petunjuk">Nomor registrasi unik per buku di sekolah.</span></label>
        <label>Kelas utama DDC
          <select value={v.klasifikasi.slice(0, 1) ? v.klasifikasi.slice(0, 1) + '00' : ''} onChange={(e) => ubah('klasifikasi', e.target.value)}>
            <option value="">Pilih kelas</option>{DDC.map(([k, n]) => <option key={k} value={k}>{k} {n}</option>)}
          </select></label>
        <label>Nomor klasifikasi (DDC)
          <input inputMode="decimal" pattern="[0-9]{3}(\.[0-9]{1,8})?" maxLength={12} value={v.klasifikasi} onChange={(e) => ubah('klasifikasi', e.target.value)} placeholder="004 atau 005.133" />
          <span className="petunjuk">Tiga angka, boleh diikuti titik dan perincian. Informatika umumnya 004 sampai 006.</span></label>
        <label>Nomor panggil
          <input maxLength={60} value={v.nomor_panggil} onChange={(e) => ubah('nomor_panggil', e.target.value)} placeholder="004 TIM i" />
          <button type="button" className="tombol" style={{ justifySelf: 'start' }} onClick={() => ubah('nomor_panggil', nomorPanggil(v.klasifikasi, v.penulis, v.judul))}>Susun otomatis</button></label>
        <label>Edisi atau cetakan<input maxLength={60} value={v.edisi} onChange={(e) => ubah('edisi', e.target.value)} placeholder="Edisi revisi 2022" /></label>
        <label>Kota terbit<input maxLength={80} value={v.kota_terbit} onChange={(e) => ubah('kota_terbit', e.target.value)} /></label>
        <label>Bahasa<input maxLength={40} value={v.bahasa} onChange={(e) => ubah('bahasa', e.target.value)} /></label>
        <label>Kategori atau subjek<input list="kategori-perpus" required maxLength={60} value={v.kategori} onChange={(e) => ubah('kategori', e.target.value)} />
          <datalist id="kategori-perpus">{KATEGORI_UMUM.map((k) => <option key={k} value={k} />)}</datalist></label>
        <label>Mata pelajaran (opsional)<input maxLength={80} value={v.mapel} onChange={(e) => ubah('mapel', e.target.value)} placeholder="Informatika" /></label>
        <label>Tingkat<select value={v.tingkat} onChange={(e) => ubah('tingkat', e.target.value)}>{TINGKAT.map((t) => <option key={t} value={t}>{t === 'Semua' ? 'Semua tingkat' : `Kelas ${t}`}</option>)}</select></label>
        <label>Sumber perolehan<select value={v.sumber_perolehan} onChange={(e) => ubah('sumber_perolehan', e.target.value)}>{SUMBER.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Nomor lisensi atau faktur<input maxLength={100} value={v.nomor_lisensi} onChange={(e) => ubah('nomor_lisensi', e.target.value)} /></label>
        <label>Tanggal perolehan<input type="date" value={v.tanggal_perolehan} onChange={(e) => ubah('tanggal_perolehan', e.target.value)} /></label>
        <label>Harga (Rp)<input inputMode="decimal" value={v.harga} onChange={(e) => ubah('harga', e.target.value.replace(/[^0-9.]/g, ''))} /></label>
        <label>Jumlah lisensi pengguna<input inputMode="numeric" value={v.jumlah_lisensi} onChange={(e) => ubah('jumlah_lisensi', e.target.value.replace(/\D/g, ''))} />
          <span className="petunjuk">Catatan administrasi dari kontrak pembelian. Belum membatasi jumlah pembaca.</span></label>
        <label>Lisensi berakhir (opsional)<input type="date" value={v.lisensi_berakhir} onChange={(e) => ubah('lisensi_berakhir', e.target.value)} />
          <span className="petunjuk">Setelah tanggal ini buku otomatis disembunyikan dari pembaca.</span></label>
      </div>
      <label>Kata kunci atau subjek tambahan<input maxLength={300} value={v.subjek} onChange={(e) => ubah('subjek', e.target.value)} placeholder="jaringan, algoritma, pemrograman" /></label>
      <label>Deskripsi singkat<textarea rows={3} maxLength={2000} value={v.deskripsi} onChange={(e) => ubah('deskripsi', e.target.value)} /></label>
      <label className="baris-centang"><input type="checkbox" checked={v.terbit} onChange={(e) => ubah('terbit', e.target.checked)} /> Terbitkan sekarang (tampil di perpustakaan untuk siswa dan guru)</label>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {sibuk && langkah && <p className="catatan" role="status">{langkah}</p>}
      <div className="aksi">
        <button className="tombol tombol-isi" disabled={sibuk}>{sibuk ? 'Memproses...' : 'Simpan'}</button>
        <button type="button" className="tombol" onClick={batal} disabled={sibuk}>Batal</button>
      </div>
    </form>
  )
}

function PanelPengelola({ bolehAtur }: { bolehAtur: boolean }) {
  const [daftar, setDaftar] = useState<Pengelola[] | null>(null)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')
  const [cari, setCari] = useState('')
  const [hasil, setHasil] = useState<{ id: string; nama: string }[]>([])
  const muat = useCallback(async () => {
    try { setDaftar(await panggil<Pengelola[]>('perpus_pengelola_daftar')) } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])
  useEffect(() => {
    if (!bolehAtur || cari.trim().length < 3) { setHasil([]); return }
    const t = window.setTimeout(() => { panggil<{ id: string; nama: string }[]>('perpus_ptk_cari', { p_q: cari }).then(setHasil).catch(() => setHasil([])) }, 300)
    return () => window.clearTimeout(t)
  }, [cari, bolehAtur])
  async function atur(ptk: string, peran: string, aktif: boolean) {
    setGalat(''); setPesan('')
    try { await panggil('perpus_pengelola_atur', { p_ptk: ptk, p_peran: peran, p_aktif: aktif }); setCari(''); setHasil([]); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  async function otomatis() {
    setGalat(''); setPesan('')
    try {
      const r = await panggil<{ ditambah: number; dilewati: { nama: string; alasan: string }[] }>('perpus_pengelola_otomatis')
      setPesan(`${r.ditambah} pengelola baru ditambahkan.${r.dilewati.length ? ' Dilewati: ' + r.dilewati.map((d) => `${d.nama} (${d.alasan})`).join('; ') + '.' : ''}`)
      await muat()
    } catch (e) { setGalat((e as Error).message) }
  }
  return (
    <div className="kartu jarak">
      <h3>Penanggung jawab dan petugas</h3>
      <p className="catatan">Pengelola dapat menambah, mengubah, menerbitkan, dan menghapus buku. Super admin selalu punya akses yang sama.</p>
      {galat && <p className="catatan galat" role="alert">{galat}</p>}
      {pesan && <p className="catatan" role="status">{pesan}</p>}
      <div className="tabel-bungkus">
        <table>
          <thead><tr><th>Nama</th><th>Peran</th><th>Status</th>{bolehAtur && <th>Aksi</th>}</tr></thead>
          <tbody>
            {!daftar && <tr><td colSpan={4}>Memuat...</td></tr>}
            {daftar?.length === 0 && <tr><td colSpan={4} className="catatan">Belum ada pengelola.</td></tr>}
            {(daftar ?? []).map((p) => (
              <tr key={p.id}>
                <td>{p.nama}{p.sumber === 'otomatis' && <small> (ditunjuk otomatis)</small>}</td>
                <td>{p.peran === 'penanggung_jawab' ? 'Penanggung jawab' : 'Petugas'}</td>
                <td><span className={`status ${p.aktif ? 'status-selesai' : 'status-dibatalkan'}`}>{p.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
                {bolehAtur && <td><button type="button" className="tombol" onClick={() => void atur(p.ptk_id, p.peran, !p.aktif)}>{p.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bolehAtur && (
        <>
          <div className="form jarak">
            <label>Tambah pengelola dari data PTK<input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Ketik minimal 3 huruf nama" /></label>
            {hasil.map((h) => (
              <div key={h.id} className="aksi" style={{ marginTop: 0 }}>
                <span style={{ flex: 1 }}>{h.nama}</span>
                <button type="button" className="tombol" onClick={() => void atur(h.id, 'penanggung_jawab', true)}>Jadikan penanggung jawab</button>
                <button type="button" className="tombol" onClick={() => void atur(h.id, 'petugas', true)}>Jadikan petugas</button>
              </div>
            ))}
          </div>
          <div className="aksi"><button type="button" className="tombol" onClick={() => void otomatis()}>Jalankan penunjukan otomatis</button></div>
        </>
      )}
    </div>
  )
}

export default function KelolaPerpustakaan() {
  const izin = useIzinPerpus()
  const { profil } = useAuth()
  const [buku, setBuku] = useState<BukuPerpus[] | null>(null)
  const [galat, setGalat] = useState('')
  const [form, setForm] = useState<BukuPerpus | 'baru' | null>(null)
  const [tab, setTab] = useState<'koleksi' | 'laporan' | 'pengelola'>('koleksi')
  const muat = useCallback(async () => {
    try { setBuku(await panggil<BukuPerpus[]>('perpus_buku_daftar', { p_q: null, p_kategori: null, p_semua: true })); setGalat('') } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { if (izin?.kelola) void muat() }, [izin?.kelola, muat])
  const sampul = useSampul((buku ?? []).map((b) => b.sampul_path))

  if (!izin) return <Halaman judul="Kelola perpustakaan"><p className="catatan">Memeriksa hak akses...</p></Halaman>
  if (!izin.kelola) {
    return (
      <Halaman judul="Tidak ada akses" lead="Halaman ini untuk penanggung jawab perpustakaan, petugas perpustakaan, dan super admin.">
        <Link to="/portal/perpustakaan" className="tombol tombol-isi">Kembali ke perpustakaan</Link>
      </Halaman>
    )
  }

  async function status(b: BukuPerpus, s: StatusBuku) {
    setGalat('')
    try { await panggil('perpus_buku_status', { p_id: b.id, p_status: s }); await muat() } catch (e) { setGalat((e as Error).message) }
  }
  async function hapus(b: BukuPerpus) {
    const dirujuk = b.dirujuk ? ` Buku ini dilampirkan pada ${b.dirujuk} pertemuan atau tugas; lampirannya ikut terhapus.` : ''
    if (!window.confirm(`Hapus "${b.judul}" secara permanen?${dirujuk} Untuk menyembunyikan saja, pilih Arsipkan.`)) return
    try {
      const r = await panggil<{ berkas_path: string; sampul_path: string | null }>('perpus_buku_hapus', { p_id: b.id })
      hapusDariPenyimpanan([r.berkas_path, r.sampul_path]); await muat()
    } catch (e) { setGalat((e as Error).message) }
  }

  const terbit = (buku ?? []).filter((b) => b.status === 'terbit').length
  const totalBaca = (buku ?? []).reduce((a, b) => a + Number(b.pembaca ?? 0), 0)

  return (
    <Halaman judul="Kelola perpustakaan" lead="Tambah buku digital, atur status terbit, dan tunjuk pengelola.">
      <div className="aksi" style={{ marginTop: 0 }}>
        <Link to="/portal/perpustakaan" className="tombol">Lihat sebagai pembaca</Link>
        <button type="button" className={tab === 'koleksi' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('koleksi')}>Koleksi</button>
        <button type="button" className={tab === 'laporan' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('laporan')}>Laporan baca</button>
        <button type="button" className={tab === 'pengelola' ? 'tombol tombol-isi' : 'tombol'} onClick={() => setTab('pengelola')}>Pengelola</button>
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}

      {tab === 'laporan' && <LaporanPerpustakaan />}
      {tab === 'pengelola' && <PanelPengelola bolehAtur={izin.atur_pengelola} />}

      {tab === 'koleksi' && (
        <>
          <div className="lencana-baris jarak">
            <span className="lencana">{buku?.length ?? 0} judul</span>
            <span className="lencana">{terbit} terbit</span>
            <span className="lencana">{totalBaca} pembaca (dijumlah per buku)</span>
          </div>
          {form
            ? <FormBuku key={form === 'baru' ? 'baru' : form.id} awal={form === 'baru' ? null : form} npsn={profil?.npsn ?? ''} selesai={async () => { setForm(null); await muat() }} batal={() => setForm(null)} />
            : <div className="aksi"><button type="button" className="tombol tombol-isi" onClick={() => setForm('baru')}>Tambah buku</button></div>}

          {!buku && <p className="catatan">Memuat...</p>}
          {buku?.length === 0 && !form && <div className="kartu"><p className="catatan" style={{ margin: 0 }}>Belum ada buku. Tekan Tambah buku, pilih berkas PDF, lalu isi data.</p></div>}
          <div className="tabel-bungkus jarak">
            <table>
              <thead><tr><th>Buku</th><th>Nomor</th><th>Status</th><th>Halaman</th><th>Dibuka · dibaca · pembaca</th><th>Lisensi</th><th>Aksi</th></tr></thead>
              <tbody>
                {(buku ?? []).map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div className="buku-baris">
                        <Sampul url={b.sampul_path ? sampul[b.sampul_path] : undefined} judul={b.judul} />
                        <div><strong>{b.judul}</strong><br /><small>{[b.penulis, b.tahun_terbit, b.kategori].filter(Boolean).join(' · ')}</small></div>
                      </div>
                    </td>
                    <td><small>Induk: {b.nomor_induk ?? '-'}<br />DDC: {b.klasifikasi ?? '-'}<br />Panggil: {b.nomor_panggil ?? '-'}<br />{labelJenis(b.jenis_buku)}</small></td>
                    <td><span className={`status ${kelasStatus[b.status]}`}>{labelStatus[b.status]}</span></td>
                    <td>{b.jumlah_halaman ?? '-'}<br /><small>{ukuranTeks(b.ukuran_byte)}</small></td>
                    <td>{b.dibuka ?? 0} · {b.dibaca ?? 0} · {b.pembaca ?? 0}</td>
                    <td>{b.lisensi_berakhir ? <>s.d. {tgl(b.lisensi_berakhir)}</> : <small>tanpa batas</small>}</td>
                    <td>
                      <div className="aksi" style={{ marginTop: 0 }}>
                        <Link to={alamatBaca(b.id)} className="tombol">Baca</Link>
                        <button type="button" className="tombol" onClick={() => { setForm(b); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Ubah</button>
                        {b.status !== 'terbit' && <button type="button" className="tombol" onClick={() => void status(b, 'terbit')}>Terbitkan</button>}
                        {b.status === 'terbit' && <button type="button" className="tombol" onClick={() => void status(b, 'arsip')}>Arsipkan</button>}
                        <button type="button" className="tombol" style={{ color: '#8a1f1f', borderColor: '#8a1f1f' }} onClick={() => void hapus(b)}>Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Halaman>
  )
}
