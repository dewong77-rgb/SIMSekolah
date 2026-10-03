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
              <RequireRole peran={['admin_tu', 'guru', 'siswa', 'orang_tua']}>
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
            path="portal/profil"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'orang_tua']}>
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
          <Route path="*" element={<TidakAda />} />
        </Route>
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
