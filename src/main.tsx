import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import PortalLayout from './components/PortalLayout'
import Beranda from './pages/Beranda'
import {
  Alumni, HubunganIndustri, Jurusan, Kontak,
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
const BeritaDaftar = lazy(() => import('./pages/Berita').then((m) => ({ default: m.BeritaDaftar })))
const BeritaBaca = lazy(() => import('./pages/Berita').then((m) => ({ default: m.BeritaBaca })))
const TracerAlumni = lazy(() => import('./pages/TracerAlumni'))
const HubinKerjasama = lazy(() => import('./pages/hubin/HubinKerjasama'))
const HubinJurusan = lazy(() => import('./pages/hubin/HubinJurusan'))
const HubinBerita = lazy(() => import('./pages/hubin/HubinBerita'))
const HubinTracer = lazy(() => import('./pages/hubin/HubinTracer'))
const ProfilSekolahHubin = lazy(() => import('./pages/hubin/ProfilSekolahHubin'))
const KesiswaanBeranda = lazy(() => import('./pages/kesiswaan/KesiswaanBeranda'))
const KesPelanggaran = lazy(() => import('./pages/kesiswaan/Pelanggaran'))
const KesPrestasi = lazy(() => import('./pages/kesiswaan/Prestasi'))
const KesPrestasiPublik = lazy(() => import('./pages/kesiswaan/PrestasiPublik'))
const EkskulPublik = lazy(() => import('./pages/EkskulPrestasiPublik').then((m) => ({ default: m.EkstrakurikulerPublik })))
const PrestasiPublikHal = lazy(() => import('./pages/EkskulPrestasiPublik').then((m) => ({ default: m.PrestasiPublikHalaman })))
const KesIzin = lazy(() => import('./pages/kesiswaan/IzinSiswa'))
const KesKehadiran = lazy(() => import('./pages/kesiswaan/KehadiranHarian'))
const KesRisiko = lazy(() => import('./pages/kesiswaan/Risiko'))
const KesEkskul = lazy(() => import('./pages/kesiswaan/Ekskul'))
const KesBeasiswa = lazy(() => import('./pages/kesiswaan/Beasiswa'))
const KesBK = lazy(() => import('./pages/kesiswaan/BK'))
const KesBKKasus = lazy(() => import('./pages/kesiswaan/BKKasus'))
const CatatanSaya = lazy(() => import('./pages/kesiswaan/CatatanSaya'))
const SarprasInventaris = lazy(() => import('./pages/sarpras/SarprasInventaris'))
const SarprasUsulan = lazy(() => import('./pages/sarpras/SarprasUsulan'))
const SarprasBuku = lazy(() => import('./pages/sarpras/SarprasBuku'))
const SarprasKerusakan = lazy(() => import('./pages/sarpras/SarprasKerusakan'))
const SarprasPermintaan = lazy(() => import('./pages/sarpras/SarprasPermintaan'))
const SarprasKartu = lazy(() => import('./pages/sarpras/SarprasKartu'))
const KurikulumStruktur = lazy(() => import('./pages/kurikulum/KurikulumStruktur'))
const KurikulumBeban = lazy(() => import('./pages/kurikulum/KurikulumBeban'))
const KurikulumWali = lazy(() => import('./pages/kurikulum/KurikulumWali'))
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
const AsesmenLayout = lazy(() => import('./pages/asesmen/AsesmenLayout'))
const AsesmenBeranda = lazy(() => import('./pages/asesmen/AsesmenBeranda'))
const UjianDetail = lazy(() => import('./pages/asesmen/AsesmenAdmin').then((m) => ({ default: m.UjianDetail })))
const RuangDaftar = lazy(() => import('./pages/asesmen/AsesmenAdmin').then((m) => ({ default: m.RuangDaftar })))
const BankDaftar = lazy(() => import('./pages/asesmen/AsesmenBank').then((m) => ({ default: m.BankDaftar })))
const BankDetail = lazy(() => import('./pages/asesmen/AsesmenBank').then((m) => ({ default: m.BankDetail })))
const PengawasDaftar = lazy(() => import('./pages/asesmen/AsesmenPengawas').then((m) => ({ default: m.PengawasDaftar })))
const Pantau = lazy(() => import('./pages/asesmen/AsesmenPengawas').then((m) => ({ default: m.Pantau })))
const UjianSaya = lazy(() => import('./pages/asesmen/AsesmenSiswa').then((m) => ({ default: m.UjianSaya })))
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
          <Route path="ekstrakurikuler" element={<Suspense fallback={null}><EkskulPublik /></Suspense>} />
          <Route path="prestasi" element={<Suspense fallback={null}><PrestasiPublikHal /></Suspense>} />
          <Route path="struktur-organisasi" element={<Suspense fallback={null}><Struktur /></Suspense>} />
          <Route path="hubungan-industri" element={<HubunganIndustri />} />
          <Route path="akademik" element={<Suspense fallback={null}><Akademik /></Suspense>} />
          <Route path="ppdb" element={<Ppdb />} />
          <Route path="lms" element={<Lms />} />
          <Route path="perpustakaan" element={<Perpustakaan />} />
          <Route path="alumni" element={<Alumni />} />
          <Route path="berita" element={<Suspense fallback={null}><BeritaDaftar /></Suspense>} />
          <Route path="berita/:slug" element={<Suspense fallback={null}><BeritaBaca /></Suspense>} />
          <Route path="alumni/tracer" element={<Suspense fallback={null}><TracerAlumni /></Suspense>} />
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
              <RequireRole peran={['admin_tu', 'guru', 'staf', 'siswa', 'orang_tua', 'admin_ujian']}>
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
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><ProfilSekolahHubin /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/hubin/kerjasama"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><HubinKerjasama /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/hubin/jurusan"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><HubinJurusan /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/hubin/berita"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><HubinBerita /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/hubin/tracer"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><HubinTracer /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/sarpras/inventaris"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><SarprasInventaris /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/sarpras/usulan"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><SarprasUsulan /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/sarpras/kerusakan"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><SarprasKerusakan /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/sarpras/permintaan"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><SarprasPermintaan /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/sarpras/kartu"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><SarprasKartu /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/sarpras/buku"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><SarprasBuku /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesiswaanBeranda /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan/pelanggaran"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesPelanggaran /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan/prestasi"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesPrestasi /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan/prestasi-publik"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesPrestasiPublik /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan/izin"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesIzin /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan/kehadiran"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesKehadiran /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan/risiko"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesRisiko /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan/bk"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesBK /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan/bk/:id"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesBKKasus /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan/ekskul"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesEkskul /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kesiswaan/beasiswa"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KesBeasiswa /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/catatan-saya"
            element={
              <RequireRole peran={['siswa']}>
                <Suspense fallback={null}><CatatanSaya orangTua={false} /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/catatan-anak"
            element={
              <RequireRole peran={['orang_tua']}>
                <Suspense fallback={null}><CatatanSaya orangTua /></Suspense>
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
            path="portal/kurikulum/struktur"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KurikulumStruktur /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kurikulum/beban"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KurikulumBeban /></Suspense>
              </RequireRole>
            }
          />
          <Route
            path="portal/kurikulum/wali-kelas"
            element={
              <RequireRole peran={['admin_tu', 'guru', 'staf']}>
                <Suspense fallback={null}><KurikulumWali /></Suspense>
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
        <Route path="asesmen" element={<Suspense fallback={null}><AsesmenLayout /></Suspense>}>
          <Route index element={<RequireRole peran={['admin_tu', 'guru', 'staf', 'siswa', 'admin_ujian']}><Suspense fallback={null}><AsesmenBeranda /></Suspense></RequireRole>} />
          <Route path="ujian/:id" element={<RequireRole peran={['admin_tu', 'guru', 'staf']} izin="asesmen.kelola"><Suspense fallback={null}><UjianDetail /></Suspense></RequireRole>} />
          <Route path="ruang" element={<RequireRole peran={['admin_tu', 'guru', 'staf']} izin="asesmen.kelola"><Suspense fallback={null}><RuangDaftar /></Suspense></RequireRole>} />
          <Route path="bank" element={<RequireRole peran={['admin_tu', 'guru', 'staf', 'admin_ujian']}><Suspense fallback={null}><BankDaftar /></Suspense></RequireRole>} />
          <Route path="bank/:id" element={<RequireRole peran={['admin_tu', 'guru', 'staf', 'admin_ujian']}><Suspense fallback={null}><BankDetail /></Suspense></RequireRole>} />
          <Route path="pengawas" element={<RequireRole peran={['admin_tu', 'guru', 'staf']}><Suspense fallback={null}><PengawasDaftar /></Suspense></RequireRole>} />
          <Route path="pantau/:sr" element={<RequireRole peran={['admin_tu', 'guru', 'staf', 'admin_ujian']}><Suspense fallback={null}><Pantau /></Suspense></RequireRole>} />
          <Route path="ujian-saya/:peserta" element={<RequireRole peran={['siswa']}><Suspense fallback={null}><UjianSaya /></Suspense></RequireRole>} />
        </Route>
      </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
