// Converts the wide "NeurOmics Database.csv" into the compact JSON the site loads.
// Source layout: column 0 holds row labels, every other column is one ranked gene list.
// Rows 0-7 are study metadata, rows 8+ are the ranked genes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CSV = process.argv[2] ?? resolve(here, '../../NeurOmics Database.csv')
const OUT = process.argv[3] ?? resolve(here, '../public/data/neuromix.json')

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\r') { /* swallowed by the \n branch */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

// "scRNA-seq" / "scRNA Seq" / "scRNA seq" are the same method typed four ways.
const methodKey = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// The explicit words win; the wider lexicon then rescues descriptions that say the
// same thing with different words (enriched, depleted, positively correlated).
const UP_STRICT = /upregulat|up-regulat/i
const DOWN_STRICT = /downregulat|down-regulat/i
const UP_WIDE = /increased|higher|elevated|induced|enriched|positively correlat|accumulat|more abundant/i
const DOWN_WIDE = /decreased|lower|reduced|depleted|negatively correlat|loss of|less abundant|suppress/i

function direction(description) {
  if (UP_STRICT.test(description)) return 'up'
  if (DOWN_STRICT.test(description)) return 'down'
  const up = UP_WIDE.test(description)
  const down = DOWN_WIDE.test(description)
  if (up && !down) return 'up'
  if (down && !up) return 'down'
  return ''
}

// Everything below is written into the descriptions in a consistent house style, so
// it can be lifted out into real fields instead of living in prose.
const RANK_STATS = [
  [/fold[- ]change|fold difference|log ?fc|fold enrichment/i, 'Fold change'],
  [/\bp[- ]?value|\bfdr\b/i, 'P value'],
  [/correlat/i, 'Correlation'],
  [/rank sum/i, 'Rank sum'],
  [/enrichment/i, 'Enrichment'],
  [/abundance|intensity|ibaq/i, 'Abundance'],
  [/\bscore\b/i, 'Score'],
  [/not ranked|no ranking|alphabetical/i, 'Not ranked'],
]

const TOPICS = [
  ['Alzheimer', /alzheimer|amyloid|tauopath|\bapp\b|presenilin/i],
  ['Parkinson', /parkinson|synuclein|lewy|\blrrk2\b/i],
  ['Huntington', /huntingt|polyglutamine|poly ?q|R6\/2|R6\/1|Q1\d\d/i],
  ['ALS and FTD', /\bals\b|amyotrophic|frontotemporal|\bftd\b|tdp[- ]?43|c9orf72/i],
  ['Prion', /prion/i],
  ['Ageing and senescence', /aging|ageing|senescen/i],
  ['Neurodevelopment', /autism|\basd\b|neurodevelop|intellectual disability/i],
  ['Psychiatric', /schizophren|bipolar|depressi/i],
  ['Epilepsy', /epilep|seizure/i],
  ['Multiple sclerosis', /multiple sclerosis|demyelinat/i],
  ['Vascular and stroke', /stroke|ischemi|blood[- ]brain barrier|angiogen|vascular/i],
  ['Cancer', /glioma|glioblastoma|tumou?r|cancer/i],
  ['Synapse', /synap|dendrit|postsynap/i],
  ['Mitochondria', /mitochondri|oxidative phosphorylation|oxphos/i],
  ['Proteostasis', /autophag|proteostas|lysosom|ubiquitin|proteasom|chaperone|aggregat|inclusion/i],
  ['Axon and transport', /axon|kinesin|dynein|\btransport\b|myelin|oligodendrocyte/i],
  ['Glia and immune', /microglia|inflammat|immune|astrocyt|cytokine/i],
  ['RNA processing', /splic|rna[- ]binding|stress granule|translat|m6a|ribosom/i],
  ['DNA repair', /dna repair|mismatch repair|repeat expansion|double[- ]strand/i],
]

// What kind of experiment produced the list. Order matters: an interactome study of
// proteins is an interactome first and a proteomics study second.
const ASSAYS = [
  ['Interactome', /interact|immunoprecipitat|proximity|apex|coip|ip-ms|pulldown|binding partner/i],
  ['Splicing', /splic|exon inclusion|exon exclusion/i],
  ['Screen', /crispr|shrna|\bscreen\b|knockout screen/i],
  ['Modification', /m6a|methylat|sumoylat|phosphorylat|ubiquitinat|acetylat|adp-ribos/i],
  ['Aggregate', /insoluble|inclusion bod|aggregat/i],
  ['Proteomics', /protein|proteom|mass spec|ms\/ms|\btmt\b/i],
  ['Transcriptomics', /rna|transcript|expressed|expression|gene list/i],
]

function assayType(description, method) {
  const blob = `${description} ${method}`
  const hit = ASSAYS.find(([, re_]) => re_.test(blob))
  return hit ? hit[0] : ''
}

// Comparing a human list with a mouse list silently misses every ortholog whose
// symbol differs, so the species has to be visible.
function species(description, tissue) {
  const blob = `${description} ${tissue}`
  if (/\bmouse\b|\bmice\b|murine|R6\/[12]|zQ175|Q111|Q140|Q175|C57BL|knockout mice/i.test(blob)) return 'Mouse'
  if (/\brat\b|rattus/i.test(blob)) return 'Rat'
  if (/human|patient|post ?mortem|ipsc|hesc|HEK293|HeLa|U2-?OS|K562|SH-SY5Y|MCF7|SH SY5Y/i.test(blob)) return 'Human'
  return ''
}

// Most lists in the database sit in a narrow band just around 100 genes, which means
// they are published top-N cut offs. Absence from such a list means very little.
const ROUND_CUTOFFS = new Set([25, 50, 150, 200, 250, 300, 400, 500])
const isTruncated = (size) => (size >= 95 && size <= 110) || ROUND_CUTOFFS.has(size)

function classify(description, title) {
  const blob = `${description} ${title}`
  return TOPICS.filter(([, re_]) => re_.test(blob)).map(([name]) => name)
}

function rankStat(description) {
  const hit = RANK_STATS.find(([re_]) => re_.test(description))
  return hit ? hit[1] : ''
}

const raw = readFileSync(CSV, 'utf8').replace(/^﻿/, '')
const rows = parseCsv(raw)
const width = Math.max(...rows.slice(0, 8).map((r) => r.length))
const at = (r, c) => clean(rows[r]?.[c])

const articleIds = new Map()
const articles = []
const studies = []
const methodCounts = new Map()

for (let c = 1; c < width; c++) {
  const description = at(0, c)
  const title = at(1, c)
  if (!description && !title) continue

  const url = at(7, c)
  const articleKey = `${title}||${url}`
  let articleIdx = articleIds.get(articleKey)
  if (articleIdx === undefined) {
    articleIdx = articles.length
    articleIds.set(articleKey, articleIdx)
    articles.push({ t: title, a: at(2, c), j: at(6, c), u: url })
  }

  // Some cells hold a protein group ("H3-3A; H3-3B"). The first symbol keeps the
  // rank slot; the rest are recorded alongside it so they stay searchable without
  // shifting anyone's rank.
  const genes = []
  const groups = []
  const seen = new Set()
  for (let r = 8; r < rows.length; r++) {
    const cell = clean(rows[r]?.[c]).toUpperCase()
    if (!cell) continue
    const members = cell.split(/[;,]/).map((m) => m.trim()).filter(Boolean)
    if (!members.length || seen.has(members[0])) continue
    seen.add(members[0])
    if (members.length > 1) groups.push([genes.length, members.join('|')])
    genes.push(members[0])
  }
  if (!genes.length) continue

  const method = at(4, c)
  if (method) {
    const k = methodKey(method)
    const bucket = methodCounts.get(k) ?? new Map()
    bucket.set(method, (bucket.get(method) ?? 0) + 1)
    methodCounts.set(k, bucket)
  }

  const year = description.match(/\((\d{4})\)/)
  const author = description.match(/^([A-Z][A-Za-z'’-]+)\s+et\s+al/)

  studies.push({
    d: description,
    ar: articleIdx,
    ts: at(3, c),
    m: method,
    src: at(5, c),
    dir: direction(description),
    y: year ? Number(year[1]) : null,
    au: author ? author[1] : '',
    rs: rankStat(description),
    as: assayType(description, method),
    sp: species(description, at(3, c)),
    tr: isTruncated(genes.length) ? 1 : 0,
    tg: classify(description, title),
    g: genes.join('|'),
    gr: groups.length ? groups : undefined,
  })
}

// Collapse spelling variants onto the most frequently used spelling.
const canonicalMethod = new Map()
for (const [key, bucket] of methodCounts) {
  const best = [...bucket.entries()].sort((a, b) => b[1] - a[1])[0][0]
  canonicalMethod.set(key, best)
}
for (const s of studies) s.mc = s.m ? canonicalMethod.get(methodKey(s.m)) : ''

const uniqueGenes = new Set()
let geneEntries = 0
let groupMembers = 0
for (const s of studies) {
  const list = s.g.split('|')
  geneEntries += list.length
  for (const g of list) uniqueGenes.add(g)
  for (const [, members] of s.gr ?? []) {
    for (const m of members.split('|').slice(1)) {
      if (!uniqueGenes.has(m)) groupMembers++
      uniqueGenes.add(m)
    }
  }
}

const payload = {
  generated: new Date().toISOString().slice(0, 10),
  stats: {
    lists: studies.length,
    articles: articles.length,
    geneEntries,
    uniqueGenes: uniqueGenes.size,
    journals: new Set(articles.map((a) => a.j).filter(Boolean)).size,
  },
  articles,
  studies,
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(payload))
const mb = (Buffer.byteLength(JSON.stringify(payload)) / 1024 / 1024).toFixed(2)
const tagged = studies.filter((s) => s.tg.length).length
const directional = studies.filter((s) => s.dir).length
console.log(`wrote ${OUT}`)
console.log(`${studies.length} gene lists, ${articles.length} articles, ${geneEntries} gene entries, ${uniqueGenes.size} unique genes, ${mb} MB`)
console.log(`direction tagged ${directional}, topic tagged ${tagged}, year parsed ${studies.filter((s) => s.y).length}`)
console.log(`assay classified ${studies.filter((s) => s.as).length}, species inferred ${studies.filter((s) => s.sp).length}, likely truncated ${studies.filter((s) => s.tr).length}`)
console.log(`protein groups split out ${groupMembers} extra searchable symbols`)
