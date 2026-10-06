// Tombol pilih gambar dengan pratinjau. Komponen hanya memilih berkas; pemanggil yang mengunggah.
import { useEffect, useRef, useState } from 'react'
import { AKSEPTASI_GAMBAR } from '../lib/gambar'

type Props = {
  label: string
  /** Gambar yang sudah tersimpan (tautan siap tampil). */
  saatIni?: string | null
  bentuk?: 'persegi' | 'bulat' | 'lebar'
  petunjuk?: string
  sibuk?: boolean
  onPilih: (f: File) => void
  onHapus?: () => void
}

export default function PilihGambar({ label, saatIni, bentuk = 'lebar', petunjuk, sibuk, onPilih, onHapus }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [pratinjau, setPratinjau] = useState<string | null>(null)
  useEffect(() => () => { if (pratinjau) URL.revokeObjectURL(pratinjau) }, [pratinjau])
  const src = pratinjau ?? saatIni ?? null
  const gaya: React.CSSProperties =
    bentuk === 'bulat' ? { width: 96, height: 96, borderRadius: '50%' }
    : bentuk === 'persegi' ? { width: 96, height: 96, borderRadius: 12 }
    : { width: '100%', maxWidth: 360, aspectRatio: '16/9', borderRadius: 10 }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <div style={{ ...gaya, background: '#eef1f6', border: '1px dashed var(--garis, #cbd5e1)', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
        {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: bentuk === 'persegi' ? 'contain' : 'cover' }} /> : <small className="catatan">Belum ada</small>}
      </div>
      <input
        ref={ref} type="file" accept={AKSEPTASI_GAMBAR} hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setPratinjau((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(f) })
          onPilih(f)
        }}
      />
      <div className="aksi" style={{ marginTop: 0 }}>
        <button type="button" className="tombol" disabled={sibuk} onClick={() => ref.current?.click()}>{sibuk ? 'Mengunggah...' : src ? 'Ganti gambar' : 'Pilih gambar'}</button>
        {src && onHapus && <button type="button" className="tombol" disabled={sibuk} onClick={() => { setPratinjau(null); onHapus() }}>Hapus</button>}
      </div>
      <small className="catatan">{petunjuk ?? 'JPG, PNG, atau WebP. Diperkecil otomatis.'}</small>
    </div>
  )
}
