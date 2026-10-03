// Bandingkan hasil pembaca TypeScript dengan acuan Python, sel demi sel.
import { readFileSync, readdirSync } from 'node:fs'
import { bacaBerkas } from '../src/dapodik/readers'

const [src, ref] = process.argv.slice(2)
let gagal = 0
for (const f of readdirSync(src).sort()) {
  const t0 = Date.now()
  const book = bacaBerkas(new Uint8Array(readFileSync(`${src}/${f}`)))
  const ms = Date.now() - t0
  const acuan: [string, (string | number | null)[][]][] = JSON.parse(readFileSync(`${ref}/book_${f}.json`, 'utf-8'))
  let sel = 0, beda = 0
  const contoh: string[] = []
  const namaTs = [...book.keys()]
  const namaPy = acuan.map((a) => a[0])
  if (JSON.stringify(namaTs) !== JSON.stringify(namaPy)) { beda++; contoh.push(`nama lembar beda: ${JSON.stringify(namaTs)} vs ${JSON.stringify(namaPy)}`) }
  for (const [nama, rowsPy] of acuan) {
    const rowsTs = book.get(nama)
    if (!rowsTs) continue
    if (rowsTs.length !== rowsPy.length) { beda++; contoh.push(`${nama}: jumlah baris ${rowsTs.length} vs ${rowsPy.length}`) }
    const n = Math.min(rowsTs.length, rowsPy.length)
    for (let i = 0; i < n; i++) {
      const a = rowsTs[i], b = rowsPy[i]
      if (a.length !== b.length) { beda++; if (contoh.length < 5) contoh.push(`${nama} baris ${i + 1}: lebar ${a.length} vs ${b.length}`) }
      const w = Math.max(a.length, b.length)
      for (let j = 0; j < w; j++) {
        sel++
        let x = a[j] ?? null, y = b[j] ?? null
        if (x === '') x = null
        if (x !== y) { beda++; if (contoh.length < 5) contoh.push(`${nama} [${i + 1},${j + 1}] ts=${JSON.stringify(x)} py=${JSON.stringify(y)}`) }
      }
    }
  }
  if (beda) gagal++
  console.log(`${beda ? 'GAGAL' : 'ok   '} ${f}: ${sel} sel, ${beda} beda, ${ms} ms`)
  for (const c of contoh) console.log('   ', c)
}
process.exit(gagal ? 1 : 0)
