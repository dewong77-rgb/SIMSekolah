// Pratinjau dan cetak formulir resmi Dapodik. Dirender ke body agar saat dicetak hanya kertas yang keluar.
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const GARIS_TTD = '..................................., ....... - ............................ - ...............'

export function TandaTangan({ jabatan, kolom }: { jabatan: string; kolom?: string }) {
  return (
    <>
      <div className="ttd">
        <div>
          <p style={{ margin: 0 }}>{GARIS_TTD}</p>
          <p style={{ margin: 0 }}>{jabatan}</p>
          <div className="ruang" />
          <p style={{ margin: 0 }}>.......................................................</p>
          {kolom && <p style={{ margin: 0 }}>{kolom}</p>}
        </div>
      </div>
      <p className="catatan-kaki">Yang bertanda tangan {jabatan.toLowerCase()} bertanggung jawab secara hukum terhadap kebenaran data yang tercantum.</p>
    </>
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
