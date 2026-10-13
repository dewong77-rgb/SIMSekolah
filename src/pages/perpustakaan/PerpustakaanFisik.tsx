import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Halaman from '../../components/Halaman'
import NavPerpus from '../../components/NavPerpus'
import { labelJenis, useIzinPerpus, type Fisik, type PinjamSaya } from '../../lib/perpustakaan'
import { panggil, tgl } from '../../lib/rpc'

// Katalog buku cetak di rak perpustakaan: jumlah, ketersediaan, letak rak, dan pinjaman saya.

export function Ketersediaan({ f }: { f: Fisik }) {
  const ada = Number(f.tersedia)
  return (
    <span className={`status ${ada > 0 ? 'status-selesai' : 'status-ditolak'}`}>
      {ada > 0 ? `Tersedia ${ada} dari ${Number(f.jumlah)}` : Number(f.jumlah) > 0 ? `Dipinjam semua (${Number(f.jumlah)})` : 'Belum ada eksemplar'}
    </span>
  )
}

export default function PerpustakaanFisik() {
  const izin = useIzinPerpus()
  const [daftar, setDaftar] = useState<Fisik[] | null>(null)
  const [saya, setSaya] = useState<PinjamSaya[]>([])
  const [galat, setGalat] = useState('')
  const [q, setQ] = useState('')
  const [hanyaAda, setHanyaAda] = useState(false)

  useEffect(() => {
    panggil<Fisik[]>('perpus_fisik_daftar', { p_q: null, p_semua: false }).then(setDaftar).catch((e: Error) => setGalat(e.message))
    panggil<PinjamSaya[]>('perpus_pinjam_saya').then(setSaya).catch(() => undefined)
  }, [])

  const tampil = useMemo(() => {
    const kata = q.trim().toLowerCase()
    return (daftar ?? []).filter((f) => (!hanyaAda || Number(f.tersedia) > 0)
      && (!kata || [f.judul, f.penulis, f.penerbit, f.isbn, f.mapel, f.subjek, f.nomor_panggil, f.klasifikasi, f.rak].some((x) => x?.toLowerCase().includes(kata))))
  }, [daftar, q, hanyaAda])
  const terbuka = saya.filter((p) => !p.kembali_pada)
  const total = (daftar ?? []).reduce((a, f) => ({ jumlah: a.jumlah + Number(f.jumlah), tersedia: a.tersedia + Number(f.tersedia) }), { jumlah: 0, tersedia: 0 })

  return (
    <Halaman judul="Perpustakaan fisik" lead="Koleksi buku cetak di rak perpustakaan. Cek ketersediaan di sini, lalu pinjam lewat petugas perpustakaan.">
      <NavPerpus aktif="fisik" />
      {izin?.kelola && <div className="aksi"><Link to="/portal/perpustakaan/kelola" className="tombol tombol-isi">Kelola koleksi dan peminjaman</Link></div>}
      {galat && <p className="kartu galat" role="alert">{galat}</p>}

      {terbuka.length > 0 && (
        <div className="kartu jarak">
          <h3>Buku yang sedang saya pinjam</h3>
          <ul className="rujukan-daftar">
            {terbuka.map((p) => (
              <li key={p.id}>
                <div><strong>{p.judul}</strong><small> {p.nomor_induk}{p.rak ? ` · Rak ${p.rak}` : ''}</small></div>
                <span className={`status ${p.terlambat ? 'status-ditolak' : 'status-menunggu'}`}>{p.terlambat ? 'Terlambat, jatuh tempo ' : 'Kembalikan sebelum '}{tgl(p.jatuh_tempo)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {daftar && (
        <div className="lencana-baris jarak">
          <span className="lencana">{daftar.length} judul</span>
          <span className="lencana">{total.jumlah} eksemplar</span>
          <span className="lencana">{total.tersedia} tersedia</span>
        </div>
      )}
      <form className="form jarak" style={{ gridTemplateColumns: '2fr 1fr', alignItems: 'end' }} onSubmit={(e) => e.preventDefault()} role="search">
        <label>Cari buku<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Judul, penulis, mapel, rak, atau nomor panggil" /></label>
        <label className="baris-centang"><input type="checkbox" checked={hanyaAda} onChange={(e) => setHanyaAda(e.target.checked)} /> Hanya yang tersedia</label>
      </form>

      {!daftar && !galat && <p className="catatan">Memuat koleksi...</p>}
      {daftar && daftar.length === 0 && <div className="kartu"><p className="catatan" style={{ margin: 0 }}>Koleksi fisik belum didata.{izin?.kelola ? ' Tambahkan lewat Kelola koleksi.' : ''}</p></div>}
      {daftar && daftar.length > 0 && tampil.length === 0 && <p className="catatan">Tidak ada buku yang cocok.</p>}
      <div className="grid grid-3">
        {tampil.map((f) => (
          <div key={f.id} className="kartu buku-kartu">
            <strong>{f.judul}</strong>
            <small>{[f.penulis, f.tahun_terbit].filter(Boolean).join(', ') || 'Penulis tidak dicatat'}</small>
            <Ketersediaan f={f} />
            {f.saya_pinjam && <span className="lencana buku-populer">Sedang Anda pinjam</span>}
            <span className="lencana-baris">
              <span className="lencana">{labelJenis(f.jenis_buku)}</span>
              {f.rak && <span className="lencana">Rak {f.rak}</span>}
              {f.nomor_panggil && <span className="lencana">{f.nomor_panggil}</span>}
              {f.mapel && <span className="lencana">{f.mapel}</span>}
            </span>
          </div>
        ))}
      </div>
    </Halaman>
  )
}
