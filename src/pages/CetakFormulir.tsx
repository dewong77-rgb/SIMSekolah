// Cetak formulir Dapodik (F-PTK atau F-PD) dari data SIMS. Susunan bagian sama dengan tampilan profil,
// ditambah semua bagian riwayat. Bagian yang masih kosong tetap tercetak agar bisa dilengkapi dengan tulisan tangan.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Halaman from '../components/Halaman'
import { supabase } from '../lib/supabase'
import { muatProfilSekolah, type ProfilSekolah } from '../lib/profilSekolah'
import { bagianUntuk, tampilIsi, type BarisRiwayat } from '../lib/formulir'
import { susunPtk, susunSiswa, type Hasil, type Seksi } from './ProfilDapodik'

const kosong = (x: unknown) => x === null || x === undefined || String(x).trim() === ''

export default function CetakFormulir() {
  const { jenis, id } = useParams()
  const valid = (jenis === 'ptk' || jenis === 'siswa') && !!id
  const [hasil, setHasil] = useState<Hasil | null | undefined>(undefined)
  const [riwayat, setRiwayat] = useState<BarisRiwayat[]>([])
  const [sekolah, setSekolah] = useState<ProfilSekolah | null>(null)
  const [sembunyiKosong, setSembunyiKosong] = useState(false)

  useEffect(() => {
    if (!valid) return
    let batal = false
    Promise.all([
      supabase.rpc('profil_dapodik', { p_jenis: jenis, p_id: id }),
      supabase.rpc('riwayat_baca', { p_jenis: jenis, p_subjek: id }),
      muatProfilSekolah(),
    ]).then(([p, r, s]) => {
      if (batal) return
      setHasil(p.error ? null : (p.data as Hasil | null) ?? null)
      setRiwayat((r.data as BarisRiwayat[] | null) ?? [])
      setSekolah(s)
    })
    return () => { batal = true }
  }, [valid, jenis, id])

  if (!valid) return <Halaman judul="Cetak formulir"><p className="catatan">Alamat tidak valid.</p></Halaman>
  if (hasil === undefined) return <Halaman judul="Cetak formulir"><p className="catatan">Memuat...</p></Halaman>
  if (!hasil || (hasil.jenis !== 'ptk' && hasil.jenis !== 'siswa')) {
    return <Halaman judul="Cetak formulir"><p className="catatan">Profil tidak ditemukan, atau Anda tidak berhak mencetaknya.</p></Halaman>
  }

  const ptk = hasil.jenis === 'ptk'
  const seksi: Seksi[] = hasil.jenis === 'ptk' ? susunPtk(hasil) : susunSiswa(hasil)
  const nama = String(hasil.data.nama ?? '')
  const tanggalCetak = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const namaSekolah = sekolah?.nama ?? ''

  return (
    <Halaman judul="Cetak formulir" lead="Periksa isinya, lalu cetak atau simpan sebagai PDF. Bagian yang kosong dapat dilengkapi dengan tulisan tangan.">
      <div className="aksi tanpa-cetak">
        <button className="tombol tombol-isi" type="button" onClick={() => window.print()}>Cetak atau simpan PDF</button>
        <label className="pilih-baris"><input type="checkbox" checked={sembunyiKosong} onChange={(e) => setSembunyiKosong(e.target.checked)} /> Sembunyikan bagian riwayat yang kosong</label>
        <button className="tombol" type="button" style={{ color: 'var(--warna-utama)' }} onClick={() => history.back()}>Kembali</button>
      </div>

      <article className="formulir-cetak kartu-cetak jarak">
        <header className="formulir-kop">
          <div>
            <h2>{ptk ? 'FORMULIR PENDIDIK DAN TENAGA KEPENDIDIKAN' : 'FORMULIR PESERTA DIDIK'}</h2>
            <p>{namaSekolah}{sekolah?.npsn ? ` · NPSN ${sekolah.npsn}` : ''}</p>
            {sekolah?.alamat && <p>{sekolah.alamat}</p>}
          </div>
          <div className="formulir-kode"><strong>{ptk ? 'F-PTK' : 'F-PD'}</strong><span>Tanggal cetak: {tanggalCetak}</span></div>
        </header>

        {seksi.map((b) => (
          <table key={b.judul} className="formulir-tabel">
            <caption>{b.judul}</caption>
            <tbody>
              {b.baris.map(([k, v]) => (
                <tr key={k}><th scope="row">{k}</th><td>{kosong(v) ? '' : v}</td></tr>
              ))}
            </tbody>
          </table>
        ))}

        {bagianUntuk(hasil.jenis).map((b) => {
          const baris = riwayat.filter((x) => x.bagian === b.kunci)
          if (sembunyiKosong && baris.length === 0) return null
          return (
            <table key={b.kunci} className="formulir-tabel formulir-riwayat">
              <caption>{b.judul}</caption>
              <thead><tr><th style={{ width: '2rem' }}>No</th>{b.kolom.map((c) => <th key={c.kunci}>{c.label}</th>)}</tr></thead>
              <tbody>
                {(baris.length ? baris : [null, null]).map((x, i) => (
                  <tr key={x?.id ?? i}>
                    <td>{x ? i + 1 : ''}</td>
                    {b.kolom.map((c) => <td key={c.kunci}>{x ? tampilIsi(x.data[c.kunci]) : ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        })}

        <p className="formulir-pernyataan">
          Yang bertanda tangan di bawah ini bertanggung jawab secara hukum terhadap kebenaran data yang tercantum.
        </p>
        <div className="kartu-tanda-tangan">
          <div><p>Mengetahui,<br />Kepala {namaSekolah}</p><br /><br /><p>(……………………………………)</p></div>
          <div>
            <p>……………………, {tanggalCetak}<br />{ptk ? 'Pendidik / Tenaga Kependidikan' : 'Peserta didik / orang tua / wali'}</p>
            <br /><br /><p><strong>{nama}</strong></p>
          </div>
        </div>
      </article>
    </Halaman>
  )
}
