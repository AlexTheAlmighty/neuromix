// Weekly PubMed sweep: fetch title + abstract for every paper published in the
// allowlist journals inside the date window, drop anything already in the ledger
// or already in the database, and write the candidates file that triage reads.
//
//   node curation/tools/sweep.mjs [--days 14]
//
// Uses NCBI E-utilities anonymously (3 requests/second budget, so requests are
// spaced 400 ms apart). No dependencies.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ALLOWLIST = resolve(here, '../allowlist.json')
const LEDGER = resolve(here, '../ledger.json')
const DATA = resolve(here, '../../neuromix-web/public/data/neuromix.json')
const WORK = resolve(here, '../work')

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const DAYS = Number(process.argv[process.argv.indexOf('--days') + 1]) || 14

// Database journal names are informal; these map them onto PubMed journal titles.
// Entries mapped to null are not journals and cannot be swept.
const ALIASES = {
  'Preprint': null,
  'BioRxiv': null,
  'Stem Cell': null, // ambiguous: could be Cell Stem Cell or Stem Cell Reports, both queryable on their own
  'Nature Reports': null, // not a real journal name; origin unclear
  'PNAS': 'Proc Natl Acad Sci U S A',
  'EMBO': 'The EMBO Journal',
  'Journal of Molecular and Cellular Proteomics': 'Molecular & Cellular Proteomics',
  'Molecular & Cellular Proteomics': 'Molecular & Cellular Proteomics',
  'Journal of Proteome': 'Journal of Proteome Research',
  'Journal of Proteomics': 'Journal of Proteomics',
  'Parkinsons Disease': 'NPJ Parkinsons Disease',
  'Cell Death and Disease': 'Cell Death & Disease',
  'The Lancet': 'Lancet',
  'Nature Structural and Molecular Biology': 'Nature Structural & Molecular Biology',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const decode = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim()
const normTitle = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const allowlist = JSON.parse(readFileSync(ALLOWLIST, 'utf8'))
const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { swept: {} }
const existingTitles = new Set()
if (existsSync(DATA)) {
  const payload = JSON.parse(readFileSync(DATA, 'utf8'))
  for (const a of payload.articles) existingTitles.add(normTitle(a.t))
} else {
  console.warn('No neuromix.json found; duplicate-article detection against the database is off.')
}

const journals = [...new Set(
  allowlist.journals
    .map((j) => (j.name in ALIASES ? ALIASES[j.name] : j.name))
    .filter(Boolean),
)]

const fmt = (d) => `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
const to = new Date()
const from = new Date(to.getTime() - DAYS * 86400 * 1000)

const term = `(${journals.map((j) => `"${j}"[Journal]`).join(' OR ')}) AND ("${fmt(from)}"[PDAT] : "${fmt(to)}"[PDAT])`

console.log(`sweeping ${journals.length} journals, ${fmt(from)} to ${fmt(to)}`)
const search = await fetch(`${EUTILS}/esearch.fcgi`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ db: 'pubmed', term, retmax: '3000', retmode: 'json', tool: 'neuromix-curation' }),
})
if (!search.ok) throw new Error(`esearch failed (HTTP ${search.status})`)
const found = await search.json()
const pmids = found.esearchresult?.idlist ?? []
console.log(`${pmids.length} papers in window`)

const fresh = pmids.filter((id) => !ledger.swept[id])
console.log(`${fresh.length} not yet in ledger`)

const candidates = []
let dupes = 0
for (let i = 0; i < fresh.length; i += 100) {
  await sleep(400)
  const batch = fresh.slice(i, i + 100)
  const res = await fetch(`${EUTILS}/efetch.fcgi`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ db: 'pubmed', id: batch.join(','), retmode: 'xml', tool: 'neuromix-curation' }),
  })
  if (!res.ok) throw new Error(`efetch failed (HTTP ${res.status})`)
  const xml = await res.text()
  for (const m of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)) {
    const rec = m[1]
    const pmid = rec.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1]
    const title = decode(rec.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1] ?? '')
    const journal = decode(rec.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/)?.[1] ?? '')
    const abstract = [...rec.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)].map((a) => decode(a[1])).join(' ')
    const doi = rec.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/)?.[1] ?? ''
    if (!pmid || !title) continue
    if (existingTitles.has(normTitle(title))) { dupes++; continue }
    candidates.push({ pmid, doi, journal, title, abstract })
  }
  process.stdout.write(`  fetched ${Math.min(i + 100, fresh.length)}/${fresh.length}\r`)
}
console.log()

mkdirSync(WORK, { recursive: true })
const stamp = new Date().toISOString().slice(0, 10)
const out = resolve(WORK, `candidates-${stamp}.json`)
writeFileSync(out, JSON.stringify({
  swept: stamp, windowDays: DAYS, journals: journals.length,
  inWindow: pmids.length, newToLedger: fresh.length, alreadyInDatabase: dupes,
  candidates,
}, null, 1))
console.log(`wrote ${out}`)
console.log(`${candidates.length} candidates for triage (${dupes} already in the database, ${pmids.length - fresh.length} previously swept)`)
