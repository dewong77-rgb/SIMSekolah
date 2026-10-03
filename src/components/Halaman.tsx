import type { ReactNode } from 'react'

export default function Halaman({
  judul,
  lead,
  children,
}: {
  judul: string
  lead?: string
  children?: ReactNode
}) {
  return (
    <>
      <section className="kepala-halaman">
        <div className="wadah">
          <h1>{judul}</h1>
          {lead && <p className="lead">{lead}</p>}
        </div>
      </section>
      <section className="wadah bagian">{children}</section>
    </>
  )
}

export function Segera({ nama }: { nama: string }) {
  return (
    <div className="kartu segera">
      <span className="lencana">Segera hadir</span>
      <h3>{nama}</h3>
      <p>Fitur ini sedang dirancang dan belum tersambung ke basis data.</p>
    </div>
  )
}
