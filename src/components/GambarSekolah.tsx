// Logo, sampul, dan galeri selayang pandang. Super admin saja. Tiap gambar tersimpan begitu diunggah.
// Folder: publik/sekolah/{npsn}/logo, /selayang-pandang, /galeri/{tahun}
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { hapusGambar, kodeBerkas, tahunIni, UKURAN, unggahGambar, urlPublik } from '../lib/gambar'
import { muatProfilSekolah } from '../lib/profilSekolah'
import PilihGambar from './PilihGambar'

type Foto = { id: string; path: string; keterangan: string | null }

export default function GambarSekolah({ npsn }: { npsn: string }) {
  const [logo, setLogo] = useState<string | null>(null)
  const [sampul, setSampul] = useState<string | null>(null)
  const [galeri, setGaleri] = useState<Foto[]>([])
  const [sibuk, setSibuk] = useState('')
  const [galat, setGalat] = useState('')

  const baca = useCallback(async () => {
    const [m, g] = await Promise.all([
      supabase.from('profil_sekolah_manual').select('logo_path,sampul_path').eq('npsn', npsn).maybeSingle(),
      supabase.from('galeri_sekolah').select('id,path,keterangan').eq('npsn', npsn).order('urutan').order('dibuat_pada', { ascending: false }),
    ])
    setLogo((m.data?.logo_path as string | null) ?? null)
    setSampul((m.data?.sampul_path as string | null) ?? null)
    setGaleri((g.data as Foto[] | null) ?? [])
  }, [npsn])
  useEffect(() => { void baca() }, [baca])

  async function ganti(kolom: 'logo_path' | 'sampul_path', f: File | null) {
    setGalat(''); setSibuk(kolom)
    const lama = kolom === 'logo_path' ? logo : sampul
    try {
      let baru: string | null = null
      if (f) {
        baru = kolom === 'logo_path'
          ? await unggahGambar('publik', `sekolah/${npsn}/logo/logo-${tahunIni()}-${kodeBerkas()}.webp`, f, UKURAN.logo)
          : await unggahGambar('publik', `sekolah/${npsn}/selayang-pandang/sampul-${kodeBerkas()}.webp`, f, UKURAN.sampul)
      }
      const { error } = await supabase.from('profil_sekolah_manual').upsert({ npsn, [kolom]: baru }, { onConflict: 'npsn' })
      if (error) { await hapusGambar('publik', baru); throw new Error(error.message) }
      await hapusGambar('publik', lama)
      void muatProfilSekolah(true)
      await baca()
    } catch (e) { setGalat((e as Error).message) }
    setSibuk('')
  }

  async function tambah(daftar: FileList | null) {
    if (!daftar?.length) return
    setGalat(''); setSibuk('galeri')
    for (const f of Array.from(daftar)) {
      try {
        const path = await unggahGambar('publik', `sekolah/${npsn}/galeri/${tahunIni()}/${kodeBerkas()}.webp`, f, UKURAN.galeri)
        const { error } = await supabase.from('galeri_sekolah').insert({ npsn, path, urutan: galeri.length })
        if (error) { await hapusGambar('publik', path); throw new Error(error.message) }
      } catch (e) { setGalat(`${f.name}: ${(e as Error).message}`); break }
    }
    void muatProfilSekolah(true)
    await baca()
    setSibuk('')
  }

  async function ubahKeterangan(id: string, keterangan: string) {
    const { error } = await supabase.from('galeri_sekolah').update({ keterangan: keterangan.trim() || null }).eq('id', id)
    if (error) setGalat(error.message)
  }

  async function hapus(x: Foto) {
    if (!window.confirm('Hapus foto ini dari galeri?')) return
    const { error } = await supabase.from('galeri_sekolah').delete().eq('id', x.id)
    if (error) return setGalat(error.message)
    await hapusGambar('publik', x.path)
    await baca()
  }

  return (
    <fieldset className="kartu form" style={{ maxWidth: 760 }}>
      <legend><h3>Logo, sampul, dan galeri</h3></legend>
      {galat && <p className="catatan" role="alert">{galat}</p>}
      <div className="grid grid-2">
        <PilihGambar label="Logo sekolah" bentuk="persegi" saatIni={urlPublik(logo)} sibuk={sibuk === 'logo_path'}
          onPilih={(f) => ganti('logo_path', f)} onHapus={logo ? () => ganti('logo_path', null) : undefined}
          petunjuk="Persegi dan latar bening paling rapi. Tampil di header, footer, dan dokumen." />
        <PilihGambar label="Gambar sampul selayang pandang" saatIni={urlPublik(sampul)} sibuk={sibuk === 'sampul_path'}
          onPilih={(f) => ganti('sampul_path', f)} onHapus={sampul ? () => ganti('sampul_path', null) : undefined}
          petunjuk="Foto gedung atau kegiatan, lanskap. Tampil di atas halaman Profil Sekolah." />
      </div>
      <div>
        <strong>Galeri selayang pandang</strong>
        <div className="grid grid-3" style={{ marginTop: 8 }}>
          {galeri.map((x) => (
            <figure key={x.id} style={{ margin: 0, display: 'grid', gap: 6 }}>
              <img src={urlPublik(x.path) ?? ''} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8 }} />
              <input defaultValue={x.keterangan ?? ''} maxLength={200} placeholder="Keterangan foto" aria-label="Keterangan foto" onBlur={(e) => { if (e.target.value !== (x.keterangan ?? '')) void ubahKeterangan(x.id, e.target.value) }} />
              <button type="button" className="tombol" onClick={() => hapus(x)}>Hapus</button>
            </figure>
          ))}
        </div>
        {galeri.length === 0 && <p className="catatan">Belum ada foto.</p>}
        <label style={{ display: 'block', marginTop: 10 }}>
          <span className="tombol tombol-isi" style={{ display: 'inline-block' }}>{sibuk === 'galeri' ? 'Mengunggah...' : 'Tambah foto'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={sibuk === 'galeri'} onChange={(e) => { void tambah(e.target.files); e.target.value = '' }} />
        </label>
      </div>
    </fieldset>
  )
}
