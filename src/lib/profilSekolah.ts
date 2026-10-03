// Profil sekolah untuk situs publik: isian manual super admin menang, kosong jatuh ke data Dapodik (RPC profil_sekolah_publik).
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { sekolah as contoh } from '../data/contoh'

export type ProfilSekolah = {
  npsn: string; nama: string; singkatan: string | null; slogan: string | null; tentang: string | null
  visi: string | null; misi: string | null; sejarah: string | null; akreditasi: string | null; tahun_berdiri: number | null
  jenjang: string | null; status_sekolah: string | null; alamat: string | null
  kecamatan: string | null; kabupaten_kota: string | null; provinsi: string | null
  telepon: string | null; email: string | null; website: string | null; whatsapp: string | null; jam_layanan: string | null
  lintang: number | null; bujur: number | null
  instagram: string | null; facebook: string | null; youtube: string | null; tiktok: string | null; x_twitter: string | null
}

// Dapodik menulis awalan wilayah ("Kab. Bogor", "Prov. Jawa Barat"). Untuk tampilan awalan dibuang.
export const bersihWilayah = (t?: string | null) => (t ?? '').replace(/^(Kab\.|Kota|Kec\.|Prov\.)\s*/i, '').trim()

export const nomorWa = (t: string) => t.replace(/\D/g, '').replace(/^0/, '62')

let janji: Promise<ProfilSekolah | null> | null = null
export const muatProfilSekolah = (segar = false) => {
  if (!janji || segar) {
    janji = Promise.resolve(supabase.rpc('profil_sekolah_publik')).then(({ data, error }) => (error || !data ? null : (data as ProfilSekolah))).catch(() => null)
  }
  return janji
}

/** Nilai tampil: selalu ada (jatuh ke contoh bila RPC gagal), dengan `data` mentah bila tersedia. */
export function useSekolah() {
  const [data, setData] = useState<ProfilSekolah | null>(null)
  useEffect(() => {
    let batal = false
    muatProfilSekolah().then((d) => { if (!batal) setData(d) })
    return () => { batal = true }
  }, [])
  const wilayah = [bersihWilayah(data?.kabupaten_kota) || contoh.kabupaten.replace(/^Kabupaten /, ''), bersihWilayah(data?.provinsi) || contoh.provinsi]
  return {
    data,
    nama: contoh.nama,
    npsn: data?.npsn ?? contoh.npsn,
    alamat: data?.alamat ?? null,
    telepon: data?.telepon ?? null,
    email: data?.email ?? null,
    wilayah: `${wilayah[0] ? 'Kabupaten ' + wilayah[0] : ''}${wilayah[1] ? ', ' + wilayah[1] : ''}`,
    sosial: ([['Instagram', data?.instagram], ['Facebook', data?.facebook], ['YouTube', data?.youtube], ['TikTok', data?.tiktok], ['X', data?.x_twitter], ['Situs web', data?.website]] as [string, string | null | undefined][])
      .filter((x): x is [string, string] => !!x[1]),
  }
}
