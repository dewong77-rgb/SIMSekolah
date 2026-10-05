import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import PortalLayout from './components/PortalLayout'
import Beranda from './pages/Beranda'
import {
  Alumni, BeritaHalaman, HubunganIndustri, Jurusan, Kontak,
  Lms, Perpustakaan, Ppdb, Profil, TidakAda,
} from './pages/Halaman-halaman'
import Masuk from './pages/Masuk'
import Portal from './pages/Portal'
const Privasi = lazy(() => import('./pages/Privasi'))
const SambunganDrive = lazy(() => import('./pages/SambunganDrive'))
const Unggah = lazy(() => import('./pages/Unggah'))
const Akun = lazy(() => import('./pages/Akun'))
const Pengguna = lazy(() => import('./pages/Pengguna'))
const Struktur = lazy(() => import('./pages/Struktur'))
const Penugasan = lazy(() => import('./pages/Penugasan'))
const KelolaKalender = lazy(() => import('./pages/KelolaKalender'))
const KelolaJam = lazy(() => import('./pages/KelolaJam'))
const Akademik = lazy(() => import('./pages/Akademik'))
const ProfilSekolah = lazy(() => import('./pages/ProfilSekolah'))
const RegisterSurat = lazy(() => import('./pages/Persuratan').then((m) => ({ default: m.RegisterSurat })))
const DetailSurat = lazy(() => import('./pages/Persuratan').then((m) => ({ default: m.DetailSurat })))
const KotakDisposisi = lazy(() => import('./pages/Persuratan').then((m) => ({ default: m.KotakDisposisi })))
const BukuTamu = lazy(() => import('./pages/BukuTamu'))
const BukuTamuPortal = lazy(() => import('./pages/BukuTamuPortal'))
const GantiSandi = lazy(() => import('./pages/GantiSandi'))
const ProfilSaya = lazy(() => import('./pages/ProfilSaya'))
const ProfilSendiri = lazy(() => import('./pages/ProfilDapodik').then((m) => ({ default: m.ProfilSendiri })))
const DaftarAnak = lazy(() => import('./pages/ProfilDapodik').then((m) => ({ default: m.DaftarAnak })))
const FormAjuan = lazy(() => import('./pages/Ajuan').then((m) => ({ default: m.FormAjuan })))
const AjuanSaya = lazy(() => import('./pages/Ajuan').then((m) => ({ default: m.AjuanSaya })))
const AjuanMasuk = lazy(() => import('./pages/Ajuan').then((m) => ({ default: m.AjuanMasuk })))
const ProfilOrang = lazy(() => import('./pages/ProfilDapodik').then((m) => ({ default: m.ProfilOrang })))
const RiwayatUnggah = lazy(() => import('./pages/DataSekolah').then((m) => ({ default: m.RiwayatUnggah })))
const PesertaDidik = lazy(() => import('./pages/DataSekolah').then((m) => ({ default: m.PesertaDidik })))
const GuruTendik = lazy(() => import('./pages/DataSekolah').then((m) => ({ default: m.GuruTendik })))
const DaftarRombel = lazy(() => import('./pages/DataSekolah').then((m) => ({ default: m.DaftarRombel })))
const DetailRombel = lazy(() => import('./pages/DataSekolah').then((m) => ({ default: m.DetailRombel })))
const DaftarKelas = lazy(() => import('./pages/Lms').then((m) => ({ default: m.DaftarKelas })))
const DetailKelas = lazy(() => import('./pages/Lms').then((m) => ({ default: m.DetailKelas })))
const RuangTugas = lazy(() => import('./pages/LmsTugas').then((m) => ({ default: m.RuangTugas })))
const AdministrasiGuru = lazy(() => import('./pages/LmsGuru').then((m) => ({ default: m.AdministrasiGuru })))
const JurnalKelas = lazy(() => import('./pages/LmsGuru').then((m) => ({ default: m.JurnalKelas })))
const BukuNilai = lazy(() => import('./pages/LmsGuru').then((m) => ({ default: m.BukuNilai })))
const LmsAnak = lazy(() => import('./pages/LmsGuru').then((m) => ({ default: m.LmsAnak })))
const DashboardPembelajaran = lazy(() => import('./pages/LmsDashboard'))
const Penilaian = lazy(() => import('./pages/Penilaian'))
const RencanaAjar = lazy(() => import('./pages/RencanaAjar'))
const PerangkatAjar = lazy(() => import('./pages/PerangkatAjar'))
const PanduanLms = lazy(() => import('./pages/PanduanLms'))
const ProgresSaya = lazy(() => import('./pages/LmsProgres').then((m) => ({ default: m.ProgresSaya })))
const AbsensiGuru = lazy(() => import('./pages/LmsAbsensi'))
const TautanOrtu = lazy(() => import('./pages/LmsProgres').then((m) => ({ default: m.TautanOrtu })))
const RuangKuis = lazy(() => import('./pages/LmsKuis').then((m) => ({ default: m.RuangKuis })))
const RuangPertemuan = lazy(() => import('./pages/Lms').then((m) => ({ default: m.RuangPertemuan })))
const RekapKelas = lazy(() => import('./pages/Lms').then((m) => ({ default: m.RekapKelas })))
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
          <Route path="akademik" element={<Suspense fallback={null}><Akademik /></Suspense>} />
          <Route path="ppdb" element={<Ppdb />} />
          <Route path="lms" element={<Lms />} />
          <Route path="perpustakaan" element={<Perpustakaan />} />
          <Route path="alumni" element={<Alumni />} />
          <Route path="berita" element={<BeritaHalaman />} />
          <Route path="kontak" element={<Kontak />} />
          <Route path="buku-tamu" element={<Suspense fallback={null}><BukuTamu /></Suspense>} />
          <Route path="masuk" element={<Masuk />} />
          <Route path="privasi" element={<Suspense fallback={null}><Privasi /></Suspense>} />
          <Route path="*" element={<TidakAda />} />
        </Route>
        <Route element={<PortalLayout />}>
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
            path="portal/sambungan-drive"
            element={
              <RequireRole peran={['admin_tu']} superAdmin>
                <Suspense fallback={null}><SambunganDrive /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/profil-sekolah"
            element={
              <RequireRole peran={['admin_tu']} superAdmin>
                <Suspense fallback={null}><ProfilSekolah /></Suspense>
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
            path="portal/data-saya"
            element={
              <RequireRole peran={['guru', 'staf', 'siswa']}>
                <Suspense fallback={null}><ProfilSendiri /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/anak"
            element={
              <RequireRole peran={['orang_tua']}>
                <Suspense fallback={null}><DaftarAnak /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/profil/:jenis/:id"
            element={
              <RequireRole peran={['admin_tu', 'orang_tua']}>
                <Suspense fallback={null}><ProfilOrang /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/ajuan/baru/:jenis/:id"
            element={
              <RequireRole peran={['guru', 'staf', 'siswa', 'orang_tua']}>
                <Suspense fallback={null}><FormAjuan /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/ajuan"
            element={
              <RequireRole peran={['guru', 'staf', 'siswa', 'orang_tua']}>
                <Suspense fallback={null}><AjuanSaya /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/ajuan-masuk"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><AjuanMasuk /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kalender"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KelolaKalender /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/jam-pelajaran"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KelolaJam /></Suspense>
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
          <Route path="portal/buku-tamu" element={<RequireRole peran={['admin_tu', 'guru', 'staf']}><Suspense fallback={null}><BukuTamuPortal /></Suspense></RequireRole>} />
          <Route path="portal/surat" element={<RequireRole peran={['admin_tu', 'guru', 'staf']}><Suspense fallback={null}><RegisterSurat /></Suspense></RequireRole>} />
          <Route path="portal/surat/:id" element={<RequireRole peran={['admin_tu', 'guru', 'staf']}><Suspense fallback={null}><DetailSurat /></Suspense></RequireRole>} />
          <Route path="portal/disposisi" element={<RequireRole peran={['admin_tu', 'guru', 'staf']}><Suspense fallback={null}><KotakDisposisi /></Suspense></RequireRole>} />
          <Route path="portal/lms" element={<RequireRole peran={['admin_tu', 'guru', 'siswa']}><Suspense fallback={null}><DaftarKelas /></Suspense></RequireRole>} />
          <Route path="portal/lms/perangkat/:jenis" element={<RequireRole peran={['guru']}><Suspense fallback={null}><PerangkatAjar /></Suspense></RequireRole>} />
          <Route path="portal/penilaian/:jenis" element={<RequireRole peran={['guru', 'siswa']}><Suspense fallback={null}><Penilaian /></Suspense></RequireRole>} />
          <Route path="portal/lms/rencana" element={<RequireRole peran={['guru']}><Suspense fallback={null}><RencanaAjar /></Suspense></RequireRole>} />
          <Route path="portal/lms/dashboard" element={<RequireRole peran={['admin_tu', 'guru']}><Suspense fallback={null}><DashboardPembelajaran /></Suspense></RequireRole>} />
          <Route path="portal/lms/:kelasId" element={<RequireRole peran={['admin_tu', 'guru', 'siswa']}><Suspense fallback={null}><DetailKelas /></Suspense></RequireRole>} />
          <Route path="portal/lms/:kelasId/rekap" element={<RequireRole peran={['admin_tu', 'guru']}><Suspense fallback={null}><RekapKelas /></Suspense></RequireRole>} />
          <Route path="portal/lms/:kelasId/pertemuan/:id" element={<RequireRole peran={['admin_tu', 'guru', 'siswa']}><Suspense fallback={null}><RuangPertemuan /></Suspense></RequireRole>} />
          <Route path="portal/lms/:kelasId/kuis/:id" element={<RequireRole peran={['admin_tu', 'guru', 'siswa']}><Suspense fallback={null}><RuangKuis /></Suspense></RequireRole>} />
          <Route path="portal/lms/:kelasId/tugas/:id" element={<RequireRole peran={['admin_tu', 'guru', 'siswa']}><Suspense fallback={null}><RuangTugas /></Suspense></RequireRole>} />
          <Route path="portal/lms/administrasi" element={<RequireRole peran={['admin_tu', 'guru']}><Suspense fallback={null}><AdministrasiGuru /></Suspense></RequireRole>} />
          <Route path="portal/lms/:kelasId/jurnal" element={<RequireRole peran={['admin_tu', 'guru']}><Suspense fallback={null}><JurnalKelas /></Suspense></RequireRole>} />
          <Route path="portal/lms/:kelasId/nilai" element={<RequireRole peran={['admin_tu', 'guru']}><Suspense fallback={null}><BukuNilai /></Suspense></RequireRole>} />
          <Route path="portal/absensi" element={<RequireRole peran={['admin_tu', 'guru']}><Suspense fallback={null}><AbsensiGuru /></Suspense></RequireRole>} />
          <Route path="portal/progres-lms" element={<RequireRole peran={['siswa']}><Suspense fallback={null}><ProgresSaya /></Suspense></RequireRole>} />
          <Route path="portal/panduan-lms" element={<RequireRole peran={['admin_tu', 'guru', 'siswa']}><Suspense fallback={null}><PanduanLms /></Suspense></RequireRole>} />
          <Route path="portal/tautan-ortu" element={<RequireRole peran={['admin_tu']}><Suspense fallback={null}><TautanOrtu /></Suspense></RequireRole>} />
          <Route path="portal/anak-lms" element={<RequireRole peran={['orang_tua']}><Suspense fallback={null}><LmsAnak /></Suspense></RequireRole>} />
        </Route>
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
