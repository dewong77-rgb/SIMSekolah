import { StrictMode } from 'react'
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
          <Route path="*" element={<TidakAda />} />
        </Route>
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
