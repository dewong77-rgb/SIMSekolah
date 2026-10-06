import { Navigate } from 'react-router-dom'
import Halaman from '../components/Halaman'
import FormMasuk from '../components/FormMasuk'
import { useAuth } from '../auth/AuthContext'

export default function Masuk() {
  const { session } = useAuth()
  if (session) return <Navigate to="/portal" replace />
  return (
    <Halaman judul="Masuk" lead="Pilih peran Anda, lalu masuk dengan username dan password.">
      <FormMasuk />
    </Halaman>
  )
}
