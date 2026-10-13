import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import { panggil } from '../../lib/rpc'
import { alamatBaca, useIzinPerpus, useSampul, type BukuPerpus } from '../../lib/perpustakaan'

// Katalog perpustakaan digital: semua pengguna sekolah membaca buku yang diterbitkan pengelola.

export function Sampul({ url, judul }: { url?: string; judul: string }) {
  return url
    ? <img className="buku-sampul" src={url} alt={`Sampul ${judul}`} loading="lazy" />
    : <div className="buku-sampul buku-sampul-kosong" aria-hidden="true"><span>{judul.slice(0, 2).toUpperCase()}</span></div>
}

export default function Perpustakaan() {
  const izin = useIzinPerpus()
  const [buku, setBuku] = useState<BukuPerpus[] | null>(null)
  const [galat, setGalat] = useState('')
  const [q, setQ] = useState('')
  const [kategori, setKategori] = useState('')
  const muat = useCallback(async () => {
    try { setBuku(await panggil<BukuPerpus[]>('perpus_buku_daftar', { p_q: null, p_kategori: null, p_semua: false })); setGalat('') } catch (e) { setGalat((e as Error).message) }
  }, [])
  useEffect(() => { void muat() }, [muat])
  const sampul = useSampul((buku ?? []).map((b) => b.sampul_path))

  const kategoriAda = useMemo(() => [...new Set((buku ?? []).map((b) => b.kategori))].sort(), [buku])
  const tampil = useMemo(() => {
    const kata = q.trim().toLowerCase()
    return (buku ?? []).filter((b) => (!kategori || b.kategori === kategori)
      && (!kata || [b.judul, b.penulis, b.penerbit, b.mapel, b.isbn].some((x) => x?.toLowerCase().includes(kata))))
  }, [buku, q, kategori])
  const lanjut = (buku ?? []).filter((b) => (b.halaman_terakhir ?? 0) > 1).sort((a, b) => a.judul.localeCompare(b.judul)).slice(0, 4)

  return (
    <Halaman judul="Perpustakaan digital" lead="Buku koleksi sekolah yang bisa dibaca langsung di aplikasi. Posisi bacaan tersimpan otomatis.">
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {izin?.kelola && <div className="aksi" style={{ marginTop: 0 }}><Link to="/portal/perpustakaan/kelola" className="tombol tombol-isi">Kelola koleksi</Link></div>}

      {lanjut.length > 0 && (
        <>
          <h2 className="jarak">Lanjutkan membaca</h2>
          <div className="grid grid-4">
            {lanjut.map((b) => (
              <Link key={b.id} to={alamatBaca(b.id, b.halaman_terakhir)} className="kartu buku-kartu">
                <Sampul url={b.sampul_path ? sampul[b.sampul_path] : undefined} judul={b.judul} />
                <strong>{b.judul}</strong>
                <small>Halaman {b.halaman_terakhir}{b.jumlah_halaman ? ` dari ${b.jumlah_halaman}` : ''}</small>
              </Link>
            ))}
          </div>
        </>
      )}

      <form className="form jarak buku-cari" onSubmit={(e) => e.preventDefault()} role="search">
        <label>Cari buku<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Judul, penulis, mapel, atau ISBN" /></label>
        <label>Kategori
          <select value={kategori} onChange={(e) => setKategori(e.target.value)}>
            <option value="">Semua kategori</option>
            {kategoriAda.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      </form>

      {!buku && !galat && <p className="catatan">Memuat koleksi...</p>}
      {buku && buku.length === 0 && (
        <div className="kartu"><p className="catatan" style={{ margin: 0 }}>Belum ada buku yang diterbitkan.{izin?.kelola ? ' Tambahkan lewat Kelola koleksi.' : ' Pengelola perpustakaan sedang menyiapkan koleksi.'}</p></div>
      )}
      {buku && buku.length > 0 && tampil.length === 0 && <p className="catatan">Tidak ada buku yang cocok dengan pencarian.</p>}
      <div className="grid grid-4">
        {tampil.map((b) => (
          <Link key={b.id} to={alamatBaca(b.id, b.halaman_terakhir)} className="kartu buku-kartu">
            <Sampul url={b.sampul_path ? sampul[b.sampul_path] : undefined} judul={b.judul} />
            <strong>{b.judul}</strong>
            <small>{[b.penulis, b.tahun_terbit].filter(Boolean).join(', ') || 'Penulis tidak dicatat'}</small>
            <span className="lencana-baris">
              <span className="lencana">{b.kategori}</span>
              {b.mapel && <span className="lencana">{b.mapel}</span>}
              {b.jumlah_halaman && <span className="lencana">{b.jumlah_halaman} hlm</span>}
            </span>
          </Link>
        ))}
      </div>
    </Halaman>
  )
}
