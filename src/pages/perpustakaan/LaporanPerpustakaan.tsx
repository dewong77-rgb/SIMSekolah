import { useCallback, useEffect, useState } from 'react'
import { unduhCsv } from '../../lib/hubin'
import { durasiTeks, type Laporan } from '../../lib/perpustakaan'
import { panggil, tglJam } from '../../lib/rpc'

// Laporan untuk pengelola: siapa membaca apa, berapa lama, dan siapa mengambil rujukan.

const PERIODE = [[7, '7 hari'], [30, '30 hari'], [90, '90 hari'], [365, 'Setahun'], [0, 'Semua']] as const
const CARA: Record<string, string> = { sisip_tugas: 'Kutip ke jawaban tugas', salin_rujukan: 'Salin rujukan', salin_tautan: 'Salin tautan' }
const ASAL: Record<string, string> = { katalog: 'Katalog', pertemuan: 'Lampiran pertemuan', tugas: 'Lampiran tugas' }
const PERAN: Record<string, string> = { siswa: 'Siswa', guru: 'Guru', staf: 'Staf', admin_tu: 'Admin TU', admin_ujian: 'Admin ujian' }

export default function LaporanPerpustakaan() {
  const [hari, setHari] = useState(30)
  const [d, setD] = useState<Laporan | null>(null)
  const [galat, setGalat] = useState('')
  const [cari, setCari] = useState('')
  const muat = useCallback(async () => {
    setD(null); setGalat('')
    try { setD(await panggil<Laporan>('perpus_laporan', { p_hari: hari })) } catch (e) { setGalat((e as Error).message) }
  }, [hari])
  useEffect(() => { void muat() }, [muat])

  const kata = cari.trim().toLowerCase()
  const cocok = (...x: (string | null | undefined)[]) => !kata || x.some((y) => y?.toLowerCase().includes(kata))

  function unduh() {
    if (!d) return
    unduhCsv(`laporan-perpustakaan-${hari || 'semua'}-hari`, [
      ['Per buku'], ['Judul', 'Nomor induk', 'Status', 'Pembaca', 'Sesi', 'Durasi (detik)', 'Dikutip', 'Dilampirkan guru'],
      ...d.per_buku.map((b) => [b.judul, b.nomor_induk, b.status, b.pembaca, b.sesi, b.detik, b.kutipan, b.dirujuk]),
      [], ['Per pembaca'], ['Nama', 'Kelas', 'Peran', 'Sesi', 'Durasi (detik)', 'Judul dibaca', 'Terakhir'],
      ...d.per_pembaca.map((p) => [p.nama, p.kelas, p.peran, p.sesi, p.detik, p.buku, p.terakhir]),
      [], ['Sesi baca'], ['Nama', 'Kelas', 'Buku', 'Mulai', 'Durasi (detik)', 'Halaman awal', 'Halaman akhir', 'Halaman dilihat', 'Asal', 'Tugas atau pertemuan'],
      ...d.sesi_terbaru.map((s) => [s.nama, s.kelas, s.judul, s.mulai, s.detik, s.halaman_awal, s.halaman_akhir, s.halaman_dilihat, ASAL[s.asal], s.asal_judul]),
      [], ['Pengambilan rujukan'], ['Nama', 'Kelas', 'Buku', 'Halaman', 'Cara', 'Tugas', 'Waktu'],
      ...d.kutipan_terbaru.map((k) => [k.nama, k.kelas, k.judul, k.halaman, CARA[k.cara], k.tugas_judul, k.waktu]),
    ])
  }

  const r = d?.ringkasan
  return (
    <div className="jarak">
      <div className="form" style={{ gridTemplateColumns: '1fr 2fr auto', alignItems: 'end' }}>
        <label>Periode<select value={hari} onChange={(e) => setHari(Number(e.target.value))}>{PERIODE.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label>Cari nama, kelas, atau judul<input type="search" value={cari} onChange={(e) => setCari(e.target.value)} /></label>
        <button type="button" className="tombol" onClick={unduh} disabled={!d}>Unduh CSV</button>
      </div>
      {galat && <p className="kartu galat" role="alert">{galat}</p>}
      {!d && !galat && <p className="catatan">Memuat laporan...</p>}
      {d && r && (
        <>
          <div className="lencana-baris jarak">
            <span className="lencana">{r.pembaca} pembaca</span>
            <span className="lencana">{r.sesi} sesi baca</span>
            <span className="lencana">Total {durasiTeks(r.detik)}</span>
            <span className="lencana">Rata-rata {r.sesi ? durasiTeks(r.detik / r.sesi) : '0 dtk'} per sesi</span>
            <span className="lencana">{r.kutipan} rujukan diambil</span>
          </div>
          <p className="catatan">Durasi hanya menghitung waktu layar terbuka dan pembaca beraktivitas (menggulir, mengetuk, atau berpindah halaman). Sesi yang dibiarkan terbuka tidak dihitung.</p>

          <h3 className="jarak">Per buku</h3>
          <div className="tabel-bungkus"><table>
            <thead><tr><th>Buku</th><th>Pembaca</th><th>Sesi</th><th>Durasi</th><th>Dikutip</th><th>Dilampirkan guru</th><th>Terakhir dibaca</th></tr></thead>
            <tbody>
              {d.per_buku.filter((b) => cocok(b.judul, b.nomor_induk)).map((b) => (
                <tr key={b.id}><td>{b.judul}<br /><small>{b.nomor_induk ?? ''} {b.status !== 'terbit' ? `(${b.status})` : ''}</small></td><td>{b.pembaca}</td><td>{b.sesi}</td><td>{durasiTeks(b.detik)}</td><td>{b.kutipan}</td><td>{b.dirujuk}</td><td>{b.terakhir ? tglJam(b.terakhir) : '-'}</td></tr>
              ))}
              {d.per_buku.length === 0 && <tr><td colSpan={7} className="catatan">Belum ada buku.</td></tr>}
            </tbody>
          </table></div>

          <h3 className="jarak">Per pembaca</h3>
          <div className="tabel-bungkus"><table>
            <thead><tr><th>Nama</th><th>Kelas</th><th>Sesi</th><th>Durasi</th><th>Judul dibaca</th><th>Terakhir</th></tr></thead>
            <tbody>
              {d.per_pembaca.filter((p) => cocok(p.nama, p.kelas)).map((p) => (
                <tr key={p.user_id}><td>{p.nama}<br /><small>{PERAN[p.peran ?? ''] ?? p.peran ?? ''}</small></td><td>{p.kelas ?? '-'}</td><td>{p.sesi}</td><td>{durasiTeks(p.detik)}</td><td>{p.buku}</td><td>{tglJam(p.terakhir)}</td></tr>
              ))}
              {d.per_pembaca.length === 0 && <tr><td colSpan={6} className="catatan">Belum ada aktivitas baca pada periode ini.</td></tr>}
            </tbody>
          </table></div>

          <h3 className="jarak">Siapa mengambil rujukan</h3>
          <div className="tabel-bungkus"><table>
            <thead><tr><th>Waktu</th><th>Nama</th><th>Buku</th><th>Halaman</th><th>Cara</th><th>Untuk tugas</th></tr></thead>
            <tbody>
              {d.kutipan_terbaru.filter((k) => cocok(k.nama, k.kelas, k.judul, k.tugas_judul)).map((k, i) => (
                <tr key={i}><td>{tglJam(k.waktu)}</td><td>{k.nama}<br /><small>{k.kelas ?? ''}</small></td><td>{k.judul}</td><td>{k.halaman ?? '-'}</td><td>{CARA[k.cara] ?? k.cara}</td><td>{k.tugas_judul ?? '-'}</td></tr>
              ))}
              {d.kutipan_terbaru.length === 0 && <tr><td colSpan={6} className="catatan">Belum ada rujukan yang diambil.</td></tr>}
            </tbody>
          </table></div>

          <h3 className="jarak">Sesi baca terbaru</h3>
          <div className="tabel-bungkus"><table>
            <thead><tr><th>Mulai</th><th>Nama</th><th>Buku</th><th>Durasi</th><th>Halaman</th><th>Dibuka dari</th></tr></thead>
            <tbody>
              {d.sesi_terbaru.filter((s) => cocok(s.nama, s.kelas, s.judul, s.asal_judul)).map((s, i) => (
                <tr key={i}><td>{tglJam(s.mulai)}</td><td>{s.nama}<br /><small>{s.kelas ?? ''}</small></td><td>{s.judul}</td><td>{durasiTeks(s.detik)}</td>
                  <td>{s.halaman_awal}–{s.halaman_akhir}<br /><small>{s.halaman_dilihat} halaman dilihat</small></td>
                  <td>{ASAL[s.asal] ?? s.asal}{s.asal_judul && <><br /><small>{s.asal_judul}</small></>}</td></tr>
              ))}
              {d.sesi_terbaru.length === 0 && <tr><td colSpan={6} className="catatan">Belum ada sesi baca.</td></tr>}
            </tbody>
          </table></div>

          <h3 className="jarak">Buku yang dilampirkan guru</h3>
          <div className="tabel-bungkus"><table>
            <thead><tr><th>Waktu</th><th>Guru</th><th>Buku</th><th>Halaman</th><th>Dilampirkan pada</th></tr></thead>
            <tbody>
              {d.lampiran_guru.filter((l) => cocok(l.guru, l.judul, l.target)).map((l, i) => (
                <tr key={i}><td>{tglJam(l.waktu)}</td><td>{l.guru}</td><td>{l.judul}</td><td>{l.hal_mulai ? (l.hal_akhir && l.hal_akhir !== l.hal_mulai ? `${l.hal_mulai}–${l.hal_akhir}` : l.hal_mulai) : '-'}</td><td>{l.jenis}: {l.target ?? '-'}</td></tr>
              ))}
              {d.lampiran_guru.length === 0 && <tr><td colSpan={5} className="catatan">Belum ada lampiran.</td></tr>}
            </tbody>
          </table></div>
        </>
      )}
    </div>
  )
}
