// Pratinjau dan cetak formulir resmi Dapodik. Dirender ke body agar saat dicetak hanya kertas yang keluar.
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const GARIS_TTD = '..................................., ....... - ............................ - ...............'

export function TandaTangan({ jabatan, kolom, jabatanKiri, nama, nip }: { jabatan: string; kolom?: string; jabatanKiri?: string; nama?: string | null; nip?: string | null }) {
  const blok = (j: string, n?: string | null, np?: string | null) => (
    <div>
      <p style={{ margin: 0 }}>{jabatanKiri ? '\u00a0' : GARIS_TTD}</p>
      <p style={{ margin: 0 }}>{j}</p>
      <div className="ruang" />
      <p style={{ margin: 0 }}>{n ? <strong style={{ textDecoration: 'underline' }}>{n}</strong> : '.......................................................'}</p>
      <p style={{ margin: 0 }}>{kolom ?? (jabatanKiri ? `NIP : ${np ?? ''}` : '')}</p>
    </div>
  )
  return (
    <div style={{ breakInside: 'avoid' }}>
      {jabatanKiri && <p style={{ margin: '18px 0 0', textAlign: 'right' }}>{GARIS_TTD}</p>}
      <div className="ttd" style={jabatanKiri ? { justifyContent: 'space-between' } : undefined}>
        {jabatanKiri && blok(jabatanKiri)}
        {blok(jabatan, nama, nip)}
      </div>
      <p className="catatan-kaki">Yang bertanda tangan {jabatanKiri ? `${jabatanKiri.toLowerCase()} dan ${jabatan.toLowerCase()}` : jabatan.toLowerCase()} bertanggung jawab secara hukum terhadap kebenaran data yang tercantum.</p>
    </div>
  )
}

export default function CetakFormulir({ judul, kode, tutup, children }: { judul: string; kode: string; tutup: () => void; children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add('sedang-cetak')
    return () => document.body.classList.remove('sedang-cetak')
  }, [])
  return createPortal(
    <div className="cetak-lapisan" role="dialog" aria-label={`Pratinjau ${judul}`}>
      <div className="cetak-bar tanpa-cetak">
        <button className="tombol tombol-isi" onClick={() => window.print()}>Cetak</button>
        <button className="tombol" onClick={tutup}>Tutup</button>
        <small className="catatan">Pilih kertas A4 lanskap. Matikan "Header dan footer" pada dialog cetak agar rapi.</small>
      </div>
      <article className="cetak-kertas">
        <p className="kode">{kode}</p>
        <h1>{judul.toUpperCase()}</h1>
        {children}
      </article>
    </div>,
    document.body,
  )
}
