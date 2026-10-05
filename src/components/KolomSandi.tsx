import { useState, type InputHTMLAttributes, type ReactNode } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; petunjuk?: ReactNode }

/** Kolom password dengan tombol mata untuk melihat atau menyembunyikan isian. Dipakai di semua formulir password. */
export default function KolomSandi({ label, petunjuk, ...isian }: Props) {
  const [lihat, setLihat] = useState(false)
  return (
    <label>
      {label}
      <span className="kolom-sandi">
        <input {...isian} type={lihat ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button type="button" className="tombol-mata" aria-pressed={lihat} aria-label={lihat ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setLihat((x) => !x)}>
          {lihat ? (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              <path d="M1 1l22 22" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </span>
      {petunjuk && <span className="petunjuk">{petunjuk}</span>}
    </label>
  )
}
