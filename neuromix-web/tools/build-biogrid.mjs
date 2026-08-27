// Shards tools/biogrid.json into public/data/biogrid/, one file per hash bucket,
// so the interaction panel can fetch just the bucket holding the queried gene
// instead of the whole 17 MB snapshot. Runs in CI alongside build-data.mjs; the
// output is generated, not committed.
//
// The bucket function here and in public/js/api.js must stay identical.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const IN = process.argv[2] ?? resolve(here, 'biogrid.json')
const OUT_DIR = process.argv[3] ?? resolve(here, '../public/data/biogrid')

const BUCKETS = 128
const bucket = (symbol) => {
  let h = 5381
  for (let i = 0; i < symbol.length; i++) h = ((h * 33) ^ symbol.charCodeAt(i)) >>> 0
  return (h % BUCKETS).toString(16).padStart(2, '0')
}

const snapshot = JSON.parse(readFileSync(IN, 'utf8'))
const { symbols, pairs } = snapshot

// Every pair is written under both of its genes, so one fetch answers one gene.
const byGene = new Map()
const add = (gene, partner, phys, gen, pubs) => {
  const rows = byGene.get(gene)
  if (rows) rows.push([partner, phys, gen, pubs])
  else byGene.set(gene, [[partner, phys, gen, pubs]])
}
for (const [ai, bi, phys, gen, pubs] of pairs) {
  add(symbols[ai], symbols[bi], phys, gen, pubs)
  add(symbols[bi], symbols[ai], phys, gen, pubs)
}

// Strongest evidence first: publications, then experimental evidence.
for (const rows of byGene.values()) {
  rows.sort((a, b) => b[3] - a[3] || (b[1] + b[2]) - (a[1] + a[2]) || a[0].localeCompare(b[0]))
}

const shards = Array.from({ length: BUCKETS }, () => ({}))
for (const [gene, rows] of byGene) shards[parseInt(bucket(gene), 16)][gene] = rows

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })
let total = 0
for (let i = 0; i < BUCKETS; i++) {
  const path = resolve(OUT_DIR, `${i.toString(16).padStart(2, '0')}.json`)
  const body = JSON.stringify(shards[i])
  total += Buffer.byteLength(body)
  writeFileSync(path, body)
}
writeFileSync(resolve(OUT_DIR, 'meta.json'), JSON.stringify({
  release: snapshot.release,
  retrieved: snapshot.retrieved,
  genes: byGene.size,
  pairs: pairs.length,
  buckets: BUCKETS,
}))

console.log(`wrote ${BUCKETS} shards + meta.json to ${OUT_DIR}`)
console.log(`${byGene.size} genes, ${pairs.length} pairs, ${(total / 1024 / 1024).toFixed(1)} MB total, `
  + `${(total / BUCKETS / 1024).toFixed(0)} KB per shard on average (BioGRID ${snapshot.release})`)
