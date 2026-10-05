// Profil sekolah dibuka untuk super admin dan pemegang izin hubin.kelola_profil (Waka Hubinmas).
import Gerbang from './Gerbang'
import ProfilSekolah from '../ProfilSekolah'

export default function ProfilSekolahHubin() {
  return <Gerbang perlu={['hubin.kelola_profil']} judul="Profil sekolah">{() => <ProfilSekolah />}</Gerbang>
}
