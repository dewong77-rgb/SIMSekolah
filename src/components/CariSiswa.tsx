import { useEffect, useState } from 'react'
import { panggil } from '../lib/rpc'
import type { SiswaCari } from '../lib/kesiswaan'

/** Kotak cari siswa (minimal 2 huruf). Hasil dibatasi jangkauan pemanggil oleh basis data. */
export default function CariSiswa({ untuk, pilih, dipilih }: { untuk: 'catat' | 'izin' | 'pantau' | 'beasiswa' | 'ekskul'; pilih: (s: SiswaCari | null) => void; dipilih: SiswaCari | null }) {
  const [q, setQ] = useState('')
  const [hasil, setHasil] = useState<SiswaCari[]>([])
  const [galat, setGalat] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) { setHasil([]); return }
    let batal = false
    const t = setTimeout(() => {
      panggil<SiswaCari[]>('kesiswaan_siswa_cari', { p_cari: q.trim(), p_untuk: untuk })
        .then((x) => { if (!batal) { setHasil(x); setGalat('') } })
        .catch((e: Error) => { if (!batal) setGalat(e.message) })
    }, 250)
    return () => { batal = true; clearTimeout(t) }
  }, [q, untuk])

  if (dipilih) {
    return (
      <div className="aksi" style={{ marginTop: 0, alignItems: 'center' }}>
        <strong>{dipilih.nama}</strong><span className="catatan">{dipilih.rombel ?? 'tanpa rombel'}{dipilih.nisn ? ` · NISN ${dipilih.nisn}` : ''}</span>
        <button type="button" className="tombol-ikon" onClick={() => { pilih(null); setQ('') }}>Ganti</button>
      </div>
    )
  }
  return (
    <div>
      <input type="search" placeholder="Cari nama atau NISN siswa" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari siswa" />
      {galat && <p className="galat" role="alert">{galat}</p>}
      {hasil.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', border: '1px solid var(--garis)', borderRadius: 8, maxHeight: 240, overflowY: 'auto' }}>
          {hasil.map((s) => (
            <li key={s.id}>
              <button type="button" className="tombol-ikon" style={{ width: '100%', textAlign: 'left', padding: '8px 12px' }} onClick={() => { pilih(s); setHasil([]) }}>
                {s.nama} <span className="catatan">{s.rombel ?? '-'}{s.nisn ? ` · ${s.nisn}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && hasil.length === 0 && !galat && <p className="catatan">Tidak ada siswa yang cocok di jangkauan Anda.</p>}
    </div>
  )
}
