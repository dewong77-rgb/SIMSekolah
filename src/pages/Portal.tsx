import { Link, Navigate } from 'react-router-dom'
import Halaman from '../components/Halaman'
import Ikon from '../components/Ikon'
import { sapaan, usePortal } from '../components/PortalLayout'
import { useAuth } from '../auth/AuthContext'
import { namaPeran } from '../data/menuPortal'
import AgendaTerdekat from '../components/AgendaTerdekat'
import JamSistem from '../components/JamSistem'
import { BerandaBelajar } from './LmsBelajar'

const kalimatPeran = {
  admin_tu: 'Kelola data induk, unggahan Dapodik, ajuan perbaikan, dan akun pengguna.',
  guru: 'Kelola kelas, administrasi mengajar, dan pantau data siswa.',
  staf: 'Pantau disposisi dan data pribadi Anda.',
  siswa: 'Buka kelas, kerjakan tugas, dan pantau progres belajar.',
  orang_tua: 'Pantau data dan perkembangan belajar anak.',
  admin_ujian: 'Kelola ujian, ruang, dan pengawas di Asesmen Digital.',
} as const

/** Aplikasi sekolah di luar SIMSekolah. Alamat IP lokal/server sekolah, dibuka di tab baru. */
const aplikasiLuar = [
  { href: '/dapodik', judul: 'Dapodik Sekolah', ket: 'Aplikasi Dapodik di server sekolah', peran: ['admin_tu', 'guru', 'staf'] },
  { href: '/erapor', judul: 'e-Rapor SMK', ket: 'Penilaian dan rapor peserta didik', peran: ['admin_tu', 'guru', 'staf'] },
] as const

export default function Portal() {
  const { profil, superAdmin, penugasan } = useAuth()
  const { menu, lencana, nama } = usePortal()
  if (!profil) return null
  if (profil.peran === 'admin_ujian') return <Navigate to="/asesmen" replace />
  const ikutJam = profil.peran === 'siswa' || profil.peran === 'guru'

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

      {profil.peran === 'siswa' && <BerandaBelajar />}

      {profil.peran !== 'orang_tua' && (
        <Link to="/asesmen" className="kartu tautan kartu-menu jarak">
          <span className="kartu-menu-ikon"><Ikon nama="centang" ukuran={22} /></span>
          <span className="kartu-menu-isi">
            <h3>Asesmen Digital</h3>
            <small>{profil.peran === 'siswa' ? 'Jadwal, ruang, dan token ujian UTS dan UAS' : profil.peran === 'guru' || profil.peran === 'staf' ? 'Bank soal dan pengawasan ujian UTS dan UAS' : 'Ujian tengah dan akhir semester lintas kelas'}</small>
          </span>
        </Link>
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

      {/* Jam pelajaran hanya relevan bagi yang mengikuti jam bel. Bilah atas sudah memuat jam untuk semua peran. */}
      <div className={'menu-bagian' + (ikutJam ? ' grid grid-2' : '')}>
        <AgendaTerdekat semua hari={14} maks={5} judul="Agenda 14 hari ke depan" />
        {ikutJam && <JamSistem varian="kartu" />}
      </div>

      {aplikasiLuar.some((a) => (a.peran as readonly string[]).includes(profil.peran)) && (
        <section className="menu-bagian" aria-labelledby="k-aplikasi-luar">
          <h2 id="k-aplikasi-luar" className="menu-bagian-judul">Aplikasi sekolah</h2>
          <div className="grid grid-3">
            {aplikasiLuar.filter((a) => (a.peran as readonly string[]).includes(profil.peran)).map((a) => (
              <a key={a.href} href={a.href} target="_blank" rel="noopener noreferrer" className="kartu tautan kartu-menu">
                <span className="kartu-menu-ikon"><Ikon nama="tautan" ukuran={22} /></span>
                <span className="kartu-menu-isi">
                  <h3>{a.judul}</h3>
                  <small>{a.ket}. Dibuka di tab baru.</small>
                </span>
              </a>
            ))}
          </div>
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

      {superAdmin && menu.segera.length > 0 && (
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
