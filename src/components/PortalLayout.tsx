import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { itemAktif, namaPeran, susunMenu, type MenuPortal } from '../data/menuPortal'
import { sekolah } from '../data/contoh'
import JamSistem from './JamSistem'
import { panggil } from '../lib/rpc'
import Ikon from './Ikon'

export type Lencana = Partial<Record<'ajuan_masuk' | 'ajuan_saya' | 'disposisi' | 'surat', number>>

type NilaiPortal = { menu: MenuPortal; lencana: Lencana; nama: string | null }
const KonteksPortal = createContext<NilaiPortal | null>(null)

/** Menu dan lencana yang sama dipakai sidebar dan halaman utama portal. */
export function usePortal(): NilaiPortal {
  const k = useContext(KonteksPortal)
  return k ?? { menu: { kelompok: [], segera: [] }, lencana: {}, nama: null }
}

function namaTampil(email: string | undefined): string {
  if (!email) return 'Pengguna'
  // Akun massal memakai email teknis (NIK atau NIP di depan @). Tampilkan bagian depannya.
  return email.endsWith('.invalid') ? email.split('@')[0] : email
}

// Dapodik menyimpan nama huruf besar semua. Tampilkan huruf awal kapital per kata.
function kapital(n: string): string {
  return n.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
}

const sapaan = () => {
  const j = new Date().getHours()
  return j < 11 ? 'Selamat pagi' : j < 15 ? 'Selamat siang' : j < 19 ? 'Selamat sore' : 'Selamat malam'
}
export { sapaan }

export default function PortalLayout() {
  const { session, profil, superAdmin, penugasan, keluar } = useAuth()
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [akun, setAkun] = useState(false)
  const [lencana, setLencana] = useState<Lencana>({})
  const [nama, setNama] = useState<string | null>(null)
  const akunRef = useRef<HTMLDivElement>(null)

  const wajibGanti = !!(session?.user.app_metadata as Record<string, unknown> | undefined)?.wajib_ganti_sandi
  const punyaMenu = !!profil && !wajibGanti

  const menu = useMemo<MenuPortal>(() => {
    if (!profil) return { kelompok: [], segera: [] }
    return susunMenu(profil.peran, superAdmin, penugasan)
  }, [profil, superAdmin, penugasan])

  useEffect(() => {
    window.scrollTo(0, 0)
    setDrawer(false)
    setAkun(false)
  }, [pathname])

  // Lencana dimuat ulang tiap pindah halaman agar angka ikut turun setelah ajuan atau disposisi dikerjakan.
  useEffect(() => {
    if (!punyaMenu) return
    let batal = false
    void (async () => {
      const [aj, sr] = await Promise.allSettled([
        panggil<{ menunggu: number; antrean: number; saya: number }>('ajuan_ringkasan'),
        panggil<{ disposisi_menunggu: number; belum_disposisi: number }>('surat_ringkasan'),
      ])
      if (batal) return
      const l: Lencana = {}
      if (aj.status === 'fulfilled') { l.ajuan_masuk = aj.value.menunggu + aj.value.antrean; l.ajuan_saya = aj.value.saya }
      if (sr.status === 'fulfilled') { l.disposisi = sr.value.disposisi_menunggu; l.surat = sr.value.belum_disposisi }
      setLencana(l)
    })()
    return () => { batal = true }
  }, [punyaMenu, pathname])

  // Nama dari data PTK atau peserta didik. Gagal atau kosong: header memakai email.
  const userId = session?.user.id
  useEffect(() => {
    if (!userId || !profil) { setNama(null); return }
    let batal = false
    panggil<string | null>('nama_saya').then((n) => { if (!batal) setNama(n ? kapital(n) : null) }).catch(() => { if (!batal) setNama(null) })
    return () => { batal = true }
  }, [userId, profil])

  useEffect(() => {
    if (!akun) return
    const tutupLuar = (e: MouseEvent) => { if (!akunRef.current?.contains(e.target as Node)) setAkun(false) }
    const tutupEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAkun(false) }
    document.addEventListener('mousedown', tutupLuar)
    document.addEventListener('keydown', tutupEsc)
    return () => { document.removeEventListener('mousedown', tutupLuar); document.removeEventListener('keydown', tutupEsc) }
  }, [akun])

  const aktif = itemAktif(menu.kelompok, pathname)
  const email = session?.user.email
  const tampil = nama ?? namaTampil(email)
  const inisial = (tampil[0] ?? 'P').toUpperCase()
  const ada = (to: string) => menu.kelompok.some((k) => k.item.some((i) => i.to === to))
  const nAjuan = ada('/portal/ajuan-masuk') ? lencana.ajuan_masuk ?? 0 : 0
  const nDisposisi = ada('/portal/disposisi') ? lencana.disposisi ?? 0 : 0
  const totalPerhatian = nAjuan + nDisposisi

  return (
    <KonteksPortal.Provider value={{ menu, lencana, nama }}>
      <div className={'portal' + (punyaMenu ? '' : ' tanpa-menu')}>
        <a href="#isi-portal" className="lewati">Lewati ke isi</a>

        {punyaMenu && drawer && <div className="portal-tabir" onClick={() => setDrawer(false)} aria-hidden="true" />}

        {punyaMenu && (
          <aside id="menu-portal" className={'portal-samping' + (drawer ? ' buka' : '')} aria-label="Menu portal">
            <div className="samping-kepala">
              <Link to="/portal" className="merek" aria-label="Beranda portal">
                <span className="logo" aria-hidden="true">S1</span>
                <span className="merek-teks">
                  <strong>{sekolah.nama}</strong>
                  <small>Portal sekolah</small>
                </span>
              </Link>
              <button className="ikon-tombol samping-tutup" onClick={() => setDrawer(false)} aria-label="Tutup menu">
                <Ikon nama="tutup" />
              </button>
            </div>

            <nav className="samping-nav">
              <NavLink to="/portal" end className={({ isActive }) => 'samping-item' + (isActive ? ' aktif' : '')}>
                <Ikon nama="beranda" /><span>Beranda</span>
              </NavLink>
              {menu.kelompok.map((k) => (
                <div className="samping-kelompok" key={k.judul}>
                  <p className="samping-judul">{k.judul}</p>
                  {k.item.map((i) => {
                    const n = i.lencana ? lencana[i.lencana] ?? 0 : 0
                    return (
                      <Link
                        key={i.to}
                        to={i.to}
                        className={'samping-item' + (aktif?.to === i.to ? ' aktif' : '')}
                        aria-current={aktif?.to === i.to ? 'page' : undefined}
                      >
                        <Ikon nama={i.ikon} /><span>{i.label}</span>
                        {n > 0 && <b className="angka" aria-label={`${n} menunggu`}>{n > 99 ? '99+' : n}</b>}
                      </Link>
                    )
                  })}
                </div>
              ))}
            </nav>

            <div className="samping-kaki">
              <Link to="/" className="samping-item"><Ikon nama="luar" /><span>Situs sekolah</span></Link>
              <button className="samping-item" onClick={keluar}><Ikon nama="keluar" /><span>Keluar</span></button>
            </div>
          </aside>
        )}

        <div className="portal-utama">
          <header className="portal-atas">
            {punyaMenu ? (
              <button
                className="ikon-tombol atas-menu"
                aria-expanded={drawer}
                aria-controls="menu-portal"
                onClick={() => setDrawer(true)}
                aria-label="Buka menu"
              >
                <Ikon nama="menu" ukuran={22} />
              </button>
            ) : (
              <Link to="/" className="merek" aria-label="Situs sekolah">
                <span className="logo" aria-hidden="true">S1</span>
                <span className="merek-teks"><strong>{sekolah.nama}</strong><small>Portal sekolah</small></span>
              </Link>
            )}
            {punyaMenu && (
              <nav className="remah" aria-label="Posisi halaman">
                <Link to="/portal">Portal</Link>
                {aktif && <><Ikon nama="panah" ukuran={14} /><span aria-current="page">{aktif.label}</span></>}
              </nav>
            )}
            <div className="atas-kanan">
              <JamSistem varian="ringkas" />
              {punyaMenu && totalPerhatian > 0 && (
                <Link
                  to={nAjuan > 0 ? '/portal/ajuan-masuk' : '/portal/disposisi'}
                  className="ikon-tombol lonceng"
                  aria-label={`${totalPerhatian} hal menunggu tindakan Anda`}
                  title={`${totalPerhatian} menunggu tindakan Anda`}
                >
                  <Ikon nama="lonceng" /><b className="angka">{totalPerhatian > 99 ? '99+' : totalPerhatian}</b>
                </Link>
              )}
              {session && (
                <div className="akun-menu" ref={akunRef}>
                  <button className="akun-tombol" aria-expanded={akun} aria-haspopup="menu" onClick={() => setAkun(!akun)}>
                    <span className="avatar-bulat" aria-hidden="true">{inisial}</span>
                    <span className="akun-teks">
                      <strong>{tampil}</strong>
                      <small>{profil ? namaPeran[profil.peran] : 'Akun'}{superAdmin ? ' (super admin)' : ''}</small>
                    </span>
                  </button>
                  {akun && (
                    <div className="akun-kotak" role="menu">
                      {profil && (
                        <div className="akun-info">
                          <small>Masuk sebagai</small>
                          <strong>{tampil}</strong>
                          <small>{namaPeran[profil.peran]} · NPSN {profil.npsn}</small>
                          <small>{namaTampil(email)}</small>
                          {penugasan.length > 0 && (
                            <ul className="label-tugas">
                              {penugasan.map((p, i) => <li key={i}>{p.jabatan_nama}{p.lingkup_label ? `: ${p.lingkup_label}` : ''}</li>)}
                            </ul>
                          )}
                        </div>
                      )}
                      {profil && !wajibGanti && menu.kelompok.filter((k) => k.judul.startsWith('Tugas tambahan')).map((k) => (
                        <div key={k.judul}>
                          <small className="akun-info" style={{ display: 'block', paddingBottom: 0 }}>{k.judul.replace('Tugas tambahan: ', '')}</small>
                          {k.item.map((i) => <Link key={i.to} role="menuitem" to={i.to}><Ikon nama={i.ikon} />{i.label}</Link>)}
                        </div>
                      ))}
                      {profil && !wajibGanti && (
                        <>
                          {profil.peran !== 'siswa' && <Link role="menuitem" to="/portal/profil"><Ikon nama="pengguna" />Profil dan password</Link>}
                          <Link role="menuitem" to="/portal/ganti-sandi"><Ikon nama="kunci" />Ganti password</Link>
                        </>
                      )}
                      <Link role="menuitem" to="/"><Ikon nama="luar" />Situs sekolah</Link>
                      <button role="menuitem" onClick={keluar}><Ikon nama="keluar" />Keluar</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          <main id="isi-portal" className="portal-isi">
            <Outlet />
          </main>
          <footer className="portal-kaki">
            <small>{sekolah.nama} · Sistem Informasi Manajemen Sekolah · Data bersumber dari Dapodik</small>
          </footer>
        </div>
      </div>
    </KonteksPortal.Provider>
  )
}
