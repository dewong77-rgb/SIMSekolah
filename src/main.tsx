import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Beranda from './pages/Beranda'
import {
  Akademik, Alumni, BeritaHalaman, HubunganIndustri, Jurusan, Kontak,
  Lms, Perpustakaan, Ppdb, Profil, TidakAda,
} from './pages/Halaman-halaman'
import Masuk from './pages/Masuk'
import Portal from './pages/Portal'
const Unggah = lazy(() => import('./pages/Unggah'))
const Akun = lazy(() => import('./pages/Akun'))
const Pengguna = lazy(() => import('./pages/Pengguna'))
const Struktur = lazy(() => import('./pages/Struktur'))
const Penugasan = lazy(() => import('./pages/Penugasan'))
const AjuanSaya = lazy(() => import('./pages/Ajuan').then((m) => ({ default: m.AjuanSaya })))
const AjuanMasuk = lazy(() => import('./pages/Ajuan').then((m) => ({ default: m.AjuanMasuk })))
const RegisterSurat = lazy(() => import('./pages/Persuratan').then((m) => ({ default: m.RegisterSurat })))
const DetailSurat = lazy(() => import('./pages/Persuratan').then((m) => ({ default: m.DetailSurat })))
const KotakDisposisi = lazy(() => import('./pages/Persuratan').then((m) => ({ default: m.KotakDisposisi })))
const GantiSandi = lazy(() => import('./pages/GantiSandi'))
const ProfilSaya = lazy(() => import('./pages/ProfilSaya'))
const RiwayatUnggah = lazy(() => import('./pages/DataSekolah').then((m) => ({ default: m.RiwayatUnggah })))
const PesertaDidik = lazy(() => import('./pages/DataSekolah').then((m) => ({ default: m.PesertaDidik })))
const GuruTendik = lazy(() => import('./pages/DataSekolah').then((m) => ({ default: m.GuruTendik })))
const DaftarRombel = lazy(() => import('./pages/DataSekolah').then((m) => ({ default: m.DaftarRombel })))
const DetailRombel = lazy(() => import('./pages/DataSekolah').then((m) => ({ default: m.DetailRombel })))
import { AuthProvider } from './auth/AuthContext'
import RequireRole from './auth/RequireRole'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Beranda />} />
          <Route path="profil" element={<Profil />} />
          <Route path="jurusan" element={<Jurusan />} />
          <Route path="struktur-organisasi" element={<Suspense fallback={null}><Struktur /></Suspense>} />
          <Route path="hubungan-industri" element={<HubunganIndustri />} />
          <Route path="akademik" element={<Akademik />} />
          <Route path="ppdb" element={<Ppdb />} />
          <Route path="lms" element={<Lms />} />
          <Route path="perpustakaan" element={<Perpustakaan />} />
          <Route path="alumni" element={<Alumni />} />
          <Route path="berita" element={<BeritaHalaman />} />
          <Route path="kontak" element={<Kontak />} />
          <Route path="masuk" element={<Masuk />} />
          <Route
            path="portal"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf', 'siswa', 'orang_tua']}>
                <Portal />
              </RequireRole>
            }
          />
          <Route
            path="portal/unggah"
            element={
              <RequireRole peran={['admin_tu']}>
                <Suspense fallback={null}><Unggah /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/akun"
            element={
              <RequireRole peran={['admin_tu']}>
                <Suspense fallback={null}><Akun /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/pengguna"
            element={
              <RequireRole peran={['admin_tu']} superAdmin>
                <Suspense fallback={null}><Pengguna /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/penugasan"
            element={
              <RequireRole peran={['admin_tu']} superAdmin>
                <Suspense fallback={null}><Penugasan /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/ganti-sandi"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf', 'siswa', 'orang_tua']}>
                <Suspense fallback={null}><GantiSandi /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/profil"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf', 'orang_tua']}>
                <Suspense fallback={null}><ProfilSaya /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/riwayat"
            element={
              <RequireRole peran={['admin_tu']}>
                <Suspense fallback={null}><RiwayatUnggah /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/peserta-didik"
            element={
              <RequireRole peran={['admin_tu', 'guru']}>
                <Suspense fallback={null}><PesertaDidik /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/ptk"
            element={
              <RequireRole peran={['admin_tu', 'guru']}>
                <Suspense fallback={null}><GuruTendik /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/rombel"
            element={
              <RequireRole peran={['admin_tu', 'guru']}>
                <Suspense fallback={null}><DaftarRombel /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/rombel/:id"
            element={
              <RequireRole peran={['admin_tu', 'guru']}>
                <Suspense fallback={null}><DetailRombel /></Suspense>
              </RequireRole>
            }
          />
          <Route path="portal/ajuan" element={<RequireRole peran={['guru', 'staf', 'siswa', 'orang_tua']}><Suspense fallback={null}><AjuanSaya /></Suspense></RequireRole>} />
          <Route path="portal/ajuan-masuk" element={<RequireRole peran={['admin_tu', 'guru', 'staf']}><Suspense fallback={null}><AjuanMasuk /></Suspense></RequireRole>} />
          <Route path="portal/surat" element={<RequireRole peran={['admin_tu', 'guru', 'staf']}><Suspense fallback={null}><RegisterSurat /></Suspense></RequireRole>} />
          <Route path="portal/surat/:id" element={<RequireRole peran={['admin_tu', 'guru', 'staf']}><Suspense fallback={null}><DetailSurat /></Suspense></RequireRole>} />
          <Route path="portal/disposisi" element={<RequireRole peran={['admin_tu', 'guru', 'staf']}><Suspense fallback={null}><KotakDisposisi /></Suspense></RequireRole>} />
          <Route path="*" element={<TidakAda />} />
        </Route>
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
