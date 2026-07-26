// Downloads the HGNC complete set and writes the compact lookup that build-data.mjs
// uses to check gene symbols. The result is committed, so a deploy never depends on
// genenames.org being up, and a symbol check is reproducible months later.
//
//   node tools/update-hgnc.mjs
//
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, 'hgnc.json')
const SOURCE = 'https://storage.googleapis.com/public-download-files/hgnc/tsv/tsv/hgnc_complete_set.txt'

console.log(`fetching ${SOURCE}`)
const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`HGNC download failed (HTTP ${res.status})`)
const text = await res.text()

const rows = text.split('\n')
const head = rows[0].split('\t')
const at = (name) => {
  const i = head.indexOf(name)
  if (i < 0) throw new Error(`HGNC file is missing the "${name}" column; the format may have changed`)
  return i
}
const iSymbol = at('symbol')
const iStatus = at('status')
const iPrev = at('prev_symbol')
const iAlias = at('alias_symbol')
const iLocus = at('locus_group')

const approved = new Set()
const locusGroup = new Map()
const prev = new Map()
const alias = new Map()

// HGNC quotes multi-valued fields and separates them with a pipe.
const values = (field) => (field || '').replace(/^"|"$/g, '').split('|').map((v) => v.trim()).filter(Boolean)
const add = (map, key, symbol) => {
  const k = key.toUpperCase()
  if (map.has(k)) map.get(k).add(symbol)
  else map.set(k, new Set([symbol]))
}

let skipped = 0
for (let i = 1; i < rows.length; i++) {
  const f = rows[i].split('\t')
  if (f.length < head.length - 2) { if (rows[i].trim()) skipped++; continue }
  const symbol = f[iSymbol]?.trim()
  if (!symbol || f[iStatus] !== 'Approved') continue
  approved.add(symbol.toUpperCase())
  locusGroup.set(symbol.toUpperCase(), f[iLocus] || '')
  for (const p of values(f[iPrev])) add(prev, p, symbol)
  for (const a of values(f[iAlias])) add(alias, a, symbol)
}
if (skipped) console.log(`  ${skipped} malformed rows skipped`)

// A retired symbol that is now the approved symbol of a different gene must never be
// rewritten: the name is in active use and rewriting it would silently move data
// from one gene to another.
const clash = []
const one = (map, dropApproved) => {
  const single = {}
  const many = {}
  for (const [key, set] of map) {
    if (dropApproved && approved.has(key)) { clash.push(key); continue }
    if (set.size === 1) single[key] = [...set][0]
    else many[key] = [...set].sort()
  }
  return { single, many }
}
const prevSplit = one(prev, true)
const aliasSplit = one(alias, true)

const payload = {
  source: SOURCE,
  retrieved: new Date().toISOString().slice(0, 10),
  counts: {
    approved: approved.size,
    previousUnambiguous: Object.keys(prevSplit.single).length,
    previousAmbiguous: Object.keys(prevSplit.many).length,
    aliasUnambiguous: Object.keys(aliasSplit.single).length,
    aliasAmbiguous: Object.keys(aliasSplit.many).length,
    inUseElsewhere: clash.length,
  },
  approved: [...approved].sort(),
  // Only protein coding and similar groups matter for the report wording.
  locusGroup: Object.fromEntries([...locusGroup].filter(([, v]) => v && v !== 'protein-coding gene')),
  previous: prevSplit.single,
  previousAmbiguous: prevSplit.many,
  alias: aliasSplit.single,
  aliasAmbiguous: aliasSplit.many,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(payload))
console.log(`wrote ${OUT}`)
console.table(payload.counts)
console.log(`${clash.length} retired symbols are in active use as another gene's approved symbol and will never be rewritten`)
