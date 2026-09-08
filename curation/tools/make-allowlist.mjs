// Regenerates curation/allowlist.json from the built database: every journal that
// has contributed at least MIN_LISTS gene lists to NeurOmix. This is, by
// construction, the tier standard the human curator has already applied.
// Run "npm run build:data" in neuromix-web first if the data file is missing.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(here, '../../neuromix-web/public/data/neuromix.json')
const OUT = resolve(here, '../allowlist.json')
const MIN_LISTS = 3
// Journals the curator has excluded by name regardless of count (2026-09-07).
const EXCLUDE = new Set(['iScience'])

const payload = JSON.parse(readFileSync(DATA, 'utf8'))
const counts = new Map()
for (const s of payload.studies) {
  const j = payload.articles[s.ar].j
  if (j) counts.set(j, (counts.get(j) ?? 0) + 1)
}
const journals = [...counts]
  .filter(([name, n]) => n >= MIN_LISTS && !EXCLUDE.has(name))
  .sort((a, b) => b[1] - a[1])
  .map(([name, lists]) => ({ name, lists }))

writeFileSync(OUT, JSON.stringify({
  generated: payload.generated,
  rule: `journals contributing at least ${MIN_LISTS} gene lists to NeurOmix`,
  journals,
}, null, 1))
console.log(`wrote ${OUT}: ${journals.length} journals (of ${counts.size} total in the database)`)
