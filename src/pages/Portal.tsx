import { Link } from 'react-router-dom'
import Halaman from '../components/Halaman'
import Ikon from '../components/Ikon'
import { sapaan, usePortal } from '../components/PortalLayout'
import { useAuth } from '../auth/AuthContext'
import { namaPeran } from '../data/menuPortal'

const kalimatPeran = {
  admin_tu: 'Kelola data induk, unggahan Dapodik, ajuan perbaikan, dan akun pengguna.',
  guru: 'Kelola kelas, administrasi mengajar, dan pantau data siswa.',
  staf: 'Pantau disposisi dan data pribadi Anda.',
  siswa: 'Buka kelas, kerjakan tugas, dan pantau progres belajar.',
  orang_tua: 'Pantau data dan perkembangan belajar anak.',
} as const

export default function Portal() {
  const { profil, superAdmin, penugasan } = useAuth()
  const { menu, lencana, nama } = usePortal()
  if (!profil) return null

  const perhatian = [
    { n: lencana.ajuan_masuk ?? 0, teks: 'ajuan perbaikan data menunggu keputusan atau pengerjaan', to: '/portal/ajuan-masuk', ikon: 'kotak' },
    { n: lencana.disposisi ?? 0, teks: 'disposisi menunggu Anda', to: '/portal/disposisi', ikon: 'surat' },
    { n: lencana.surat ?? 0, teks: 'surat belum didisposisikan', to: '/portal/surat', ikon: 'surat' },
  ].filter((p) => p.n > 0 && menu.kelompok.some((k) => k.item.some((i) => i.to === p.to)))

  return (
    <Halaman
      judul={nama && profil.peran !== 'orang_tua' ? `${sapaan()}, ${nama.split(' ')[0]}` : sapaan()}
      lead={`${namaPeran[profil.peran]}${superAdmin ? ' (super admin)' : ''}. ${kalimatPeran[profil.peran]}`}
    >
      {penugasan.length > 0 && (
        <ul className="label-tugas" aria-label="Penugasan saya">
          {penugasan.map((p, i) => (
            <li key={i}><strong>{p.jabatan_nama}</strong>{p.lingkup_label ? <small>: {p.lingkup_label}</small> : null}</li>
          ))}
        </ul>
      )}

      {perhatian.length > 0 && (
        <section className="perhatian" aria-label="Perlu tindakan">
          {perhatian.map((p) => (
            <Link key={p.to + p.teks} to={p.to} className="perhatian-item">
              <span className="perhatian-ikon"><Ikon nama={p.ikon} /></span>
              <span><strong>{p.n}</strong> {p.teks}</span>
              <Ikon nama="panah" ukuran={16} />
            </Link>
          ))}
        </section>
      )}

      {menu.kelompok.map((k) => (
        <section key={k.judul} className="menu-bagian" aria-labelledby={`k-${k.judul}`}>
          <h2 id={`k-${k.judul}`} className="menu-bagian-judul">{k.judul}</h2>
          <div className="grid grid-3">
            {k.item.map((i) => {
              const n = i.lencana ? lencana[i.lencana] ?? 0 : 0
              return (
                <Link key={i.to} to={i.to} className="kartu tautan kartu-menu">
                  <span className="kartu-menu-ikon"><Ikon nama={i.ikon} ukuran={22} /></span>
                  <span className="kartu-menu-isi">
                    <h3>{i.label}{n > 0 && <b className="angka">{n > 99 ? '99+' : n}</b>}</h3>
                    {i.ket && <small>{i.ket}</small>}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}

      {menu.segera.length > 0 && (
        <details className="segera-daftar">
          <summary>Fitur dalam rencana ({menu.segera.length})</summary>
          <ul>
            {menu.segera.map((s) => <li key={s.nama}><strong>{s.nama}</strong> <small>{s.bidang}</small></li>)}
          </ul>
          <p className="catatan">Belum tersambung ke basis data. Akan muncul di menu setelah selesai dibangun.</p>
        </details>
      )}
    </Halaman>
  )
}
