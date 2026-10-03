// Daftar agenda yang akan datang, dipakai di beranda (hanya yang ditandai tampil di beranda) dan portal (semua, sebagai pengingat).
import { Link } from 'react-router-dom'
import { jarak, jamTitik, KATEGORI, tambahHari, tanggalPendek, useAgenda, useSekarang } from '../lib/kalender'

export default function AgendaTerdekat({ hari = 14, semua = false, maks = 5, judul = 'Agenda terdekat' }: { hari?: number; semua?: boolean; maks?: number; judul?: string }) {
  const n = useSekarang(60_000)
  const { agenda, galat } = useAgenda(n.tanggal, tambahHari(n.tanggal, hari))
  const daftar = (agenda ?? []).filter((a) => semua || a.tampil_beranda).slice(0, maks)
  if (galat || !agenda) return null
  return (
    <section aria-label={judul} className="agenda-terdekat">
      <div className="judul-bagian">
        <h2>{judul}</h2>
        <Link to="/akademik">Kalender lengkap</Link>
      </div>
      {daftar.length === 0 ? (
        <p className="catatan">Belum ada agenda dalam {hari} hari ke depan.</p>
      ) : (
        <ul className="agenda-daftar">
          {daftar.map((a) => {
            const j = jarak(a, n.tanggal)
            const dekat = j === 'Hari ini' || j === 'Besok' || j === 'Berlangsung'
            return (
              <li key={a.id} className={dekat ? 'dekat' : ''} style={{ borderLeftColor: KATEGORI[a.kategori].warna }}>
                <div>
                  <strong>{a.judul}</strong>
                  <small>
                    {tanggalPendek(a.mulai)}{a.selesai !== a.mulai ? ` sampai ${tanggalPendek(a.selesai)}` : ''}
                    {a.jam_mulai ? `, ${jamTitik(a.jam_mulai)}${a.jam_selesai ? ` sampai ${jamTitik(a.jam_selesai)}` : ''}` : ''}
                    {a.tempat ? `, ${a.tempat}` : ''}
                  </small>
                </div>
                <span className={'agenda-jarak' + (dekat ? ' dekat' : '')}>{j}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
