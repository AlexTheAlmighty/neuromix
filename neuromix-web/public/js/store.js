// Loads the database once and answers every lookup the UI needs.
// Postings are packed as studyIndex * RANK_SPAN + rank so the index stays a flat
// array of numbers instead of ~92k tuple objects.
const RANK_SPAN = 1024

export const store = {
  ready: false,
  stats: null,
  articles: [],
  studies: [],
  geneIndex: new Map(),
  geneArticles: new Map(),
  geneNames: [],
  // Symbols the build rewrote to their current HGNC name, so a search for the name a
  // paper used still finds the data.
  renamed: new Map(),
  symbolCheck: null,
  articleCount: 0,
  facets: { journals: [], methods: [], tissues: [], topics: [], years: [], stats: [], assays: [], species: [] },
}

export async function loadDatabase() {
  const res = await fetch('/data/neuromix.json')
  if (!res.ok) throw new Error(`Could not load the database (HTTP ${res.status})`)
  const payload = await res.json()

  store.stats = payload.stats
  store.articles = payload.articles
  store.renamed = new Map(Object.entries(payload.renamedSymbols ?? {}))
  store.symbolCheck = payload.symbolCheck ?? null
  store.studies = payload.studies.map((s, i) => {
    const article = payload.articles[s.ar]
    const genes = s.g.split('|')
    return {
      i,
      description: s.d,
      tissue: s.ts,
      method: s.m,
      methodGroup: s.mc || s.m,
      dataSource: s.src,
      direction: s.dir,
      year: s.y ?? null,
      author: s.au ?? '',
      rankStat: s.rs ?? '',
      assay: s.as ?? '',
      species: s.sp ?? '',
      truncated: Boolean(s.tr),
      article: s.ar,
      topics: s.tg ?? [],
      title: article.t,
      abstract: article.a,
      journal: article.j,
      url: article.u,
      genes,
      groups: (s.gr ?? []).map(([at, members]) => [at, members.split('|')]),
      size: genes.length,
    }
  })

  const index = new Map()
  const add = (gene, posting) => {
    const postings = index.get(gene)
    if (postings) postings.push(posting)
    else index.set(gene, [posting])
  }
  for (const study of store.studies) {
    const base = study.i * RANK_SPAN
    study.genes.forEach((gene, rank) => add(gene, base + rank))
    // Members of a protein group share the rank slot of the symbol they were filed under.
    for (const [at, members] of study.groups) {
      for (const member of members.slice(1)) add(member, base + at)
    }
  }
  store.geneIndex = index
  store.geneNames = [...index.keys()].sort()
  store.articleCount = payload.articles.length

  // How many distinct articles mention each gene. A gene in five lists from one paper
  // is far weaker evidence than a gene in five lists from five labs.
  const perArticle = new Map()
  for (const study of store.studies) {
    for (const gene of study.genes) {
      const seen = perArticle.get(gene)
      if (seen) seen.add(study.article)
      else perArticle.set(gene, new Set([study.article]))
    }
  }
  store.geneArticles = new Map([...perArticle].map(([gene, set]) => [gene, set.size]))

  const tally = (pick) => {
    const counts = new Map()
    for (const s of store.studies) {
      for (const v of [].concat(pick(s) ?? [])) {
        if (v === '' || v === null || v === undefined) continue
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
  }
  store.facets = {
    journals: tally((s) => s.journal),
    methods: tally((s) => s.methodGroup),
    tissues: tally((s) => s.tissue),
    topics: tally((s) => s.topics),
    stats: tally((s) => s.rankStat),
    assays: tally((s) => s.assay),
    species: tally((s) => s.species),
    years: tally((s) => s.year).sort((a, b) => b[0] - a[0]),
  }

  store.ready = true
  return store
}

/* ---------- helpers ---------- */

export function parseGeneQuery(text) {
  return [...new Set(
    String(text ?? '')
      .split(/[\s,;]+/)
      .map((g) => g.trim().toUpperCase())
      .filter(Boolean),
  )]
}

const decode = (posting) => ({
  studyIndex: Math.floor(posting / RANK_SPAN),
  rank: (posting % RANK_SPAN) + 1,
})

/** How many gene lists contain this symbol. Used to discount ubiquitous genes. */
export const listsContaining = (gene) => store.geneIndex.get(gene)?.length ?? 0

/** How many distinct articles contain this symbol. */
export const articlesContaining = (gene) => store.geneArticles.get(gene) ?? 0

export const countArticles = (studies) => new Set(studies.map((s) => s.article)).size

/**
 * A background is what "normal" means for a specificity score. Comparing an
 * interactome result against every list in the database mostly rediscovers that
 * proteomics finds abundant proteins; comparing it against other interactome studies
 * is the control that actually separates signal from stickiness.
 */
export function makeBackground(studies = store.studies, { perArticle = false } = {}) {
  const counts = new Map()
  if (perArticle) {
    const seen = new Map()
    for (const study of studies) {
      for (const gene of study.genes) {
        const set = seen.get(gene)
        if (set) set.add(study.article)
        else seen.set(gene, new Set([study.article]))
      }
    }
    for (const [gene, set] of seen) counts.set(gene, set.size)
    return { size: countArticles(studies), counts, perArticle: true }
  }
  for (const study of studies) for (const gene of study.genes) counts.set(gene, (counts.get(gene) ?? 0) + 1)
  return { size: studies.length, counts, perArticle: false }
}

export const BACKGROUNDS = [
  { id: 'all', label: 'All gene lists' },
  { id: 'assay', label: 'Lists using the same assay type' },
  { id: 'species', label: 'Lists from the same species' },
  { id: 'filter', label: 'The current filter' },
]

/** Build the background named by id, relative to a reference set of studies. */
export function backgroundFor(id, reference = [], { perArticle = false } = {}) {
  if (id === 'filter') return makeBackground(reference, { perArticle })
  if (id === 'assay') {
    const assays = new Set(reference.map((s) => s.assay).filter(Boolean))
    if (assays.size) return makeBackground(store.studies.filter((s) => assays.has(s.assay)), { perArticle })
  }
  if (id === 'species') {
    const kinds = new Set(reference.map((s) => s.species).filter(Boolean))
    if (kinds.size) return makeBackground(store.studies.filter((s) => kinds.has(s.species)), { perArticle })
  }
  return makeBackground(store.studies, { perArticle })
}

/**
 * If a query uses a symbol HGNC has retired, return the current one. Papers keep the
 * name they were published under, so someone searching that name should still arrive.
 */
export const currentSymbol = (query) => (store.geneIndex.has(query) ? null : store.renamed.get(query) ?? null)

/** Gene symbols matching one query term: exact hit, or every symbol containing it. */
export function matchSymbols(query, exact) {
  if (exact) {
    if (store.geneIndex.has(query)) return [query]
    const current = store.renamed.get(query)
    return current && store.geneIndex.has(current) ? [current] : []
  }
  const redirect = currentSymbol(query)
  if (redirect) return [redirect, ...store.geneNames.filter((n) => n !== redirect && n.includes(query))]
  const out = []
  for (const name of store.geneNames) if (name.includes(query)) out.push(name)
  return out
}

export function suggestGenes(prefix, limit = 8) {
  const q = prefix.trim().toUpperCase()
  if (q.length < 2) return []
  const starts = []
  const contains = []
  for (const name of store.geneNames) {
    if (name.startsWith(q)) { if (starts.length < limit) starts.push(name) }
    else if (contains.length < limit && name.includes(q)) contains.push(name)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}

/* ---------- statistics ---------- */

const logGamma = (z) => {
  // Lanczos approximation, plenty accurate for list sizes in the thousands.
  const g = 7
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}
const logChoose = (n, k) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1)

/**
 * P(overlap >= k) when drawing a list of n genes from a genome of `universe`,
 * given a query list of K genes. This is what separates a real overlap from the
 * overlap two long lists have by chance.
 */
export function overlapPValue(k, K, n, universe = 20000) {
  if (k <= 0) return 1
  const max = Math.min(K, n)
  if (k > max) return 0
  let total = 0
  for (let x = k; x <= max; x++) {
    total += Math.exp(logChoose(K, x) + logChoose(universe - K, n - x) - logChoose(universe, n))
  }
  return Math.min(1, Math.max(total, Number.MIN_VALUE))
}

/* ---------- gene search (Gene Analysis tab) ---------- */

export function searchGenes(queries, { exact = false } = {}) {
  const hits = []
  const seen = new Set()
  for (const query of queries) {
    for (const symbol of matchSymbols(query, exact)) {
      for (const posting of store.geneIndex.get(symbol)) {
        const key = `${symbol}:${posting}`
        if (seen.has(key)) continue
        seen.add(key)
        const { studyIndex, rank } = decode(posting)
        hits.push({ query, gene: symbol, rank, study: store.studies[studyIndex] })
      }
    }
  }
  hits.sort((a, b) => a.rank - b.rank || a.gene.localeCompare(b.gene))
  return hits
}

export function summariseHits(hits) {
  const studies = new Set()
  const articles = new Set()
  const genes = new Set()
  let up = 0
  let down = 0
  for (const h of hits) {
    if (!studies.has(h.study.i)) {
      studies.add(h.study.i)
      if (h.study.direction === 'up') up++
      if (h.study.direction === 'down') down++
    }
    articles.add(h.study.title)
    genes.add(h.gene)
  }
  return {
    hits: hits.length,
    studies: studies.size,
    articles: articles.size,
    genes: genes.size,
    up,
    down,
    bestRank: hits.length ? Math.min(...hits.map((h) => h.rank)) : null,
  }
}

/**
 * Everything about one gene in one object: where it ranks, which way it moves,
 * and which topics it belongs to.
 */
export function geneProfile(gene) {
  const postings = store.geneIndex.get(gene)
  if (!postings) return null
  const hits = postings.map((p) => {
    const { studyIndex, rank } = decode(p)
    const study = store.studies[studyIndex]
    return { study, rank, percentile: rank / study.size }
  })
  const up = hits.filter((h) => h.study.direction === 'up').length
  const down = hits.filter((h) => h.study.direction === 'down').length
  const percentiles = hits.map((h) => h.percentile).sort((a, b) => a - b)
  const topics = new Map()
  const journals = new Set()
  for (const h of hits) {
    journals.add(h.study.journal)
    for (const t of h.study.topics) topics.set(t, (topics.get(t) ?? 0) + 1)
  }
  return {
    gene,
    hits,
    lists: hits.length,
    articles: new Set(hits.map((h) => h.study.title)).size,
    up,
    down,
    neutral: hits.length - up - down,
    bestRank: Math.min(...hits.map((h) => h.rank)),
    medianPercentile: percentiles[Math.floor(percentiles.length / 2)],
    topics: [...topics.entries()].sort((a, b) => b[1] - a[1]),
    journals: journals.size,
    // A gene in hundreds of lists is not telling you much about any one of them.
    ubiquity: hits.length / store.studies.length,
    conflicted: up >= 3 && down >= 3,
  }
}

/* ---------- co-occurrence ---------- */

export function coOccurringGenes(queries, { exact = false, minLists = 2 } = {}) {
  const seedSymbols = new Set()
  const seedStudies = new Set()
  for (const query of queries) {
    for (const symbol of matchSymbols(query, exact)) {
      seedSymbols.add(symbol)
      for (const posting of store.geneIndex.get(symbol)) seedStudies.add(Math.floor(posting / RANK_SPAN))
    }
  }
  if (!seedStudies.size) return { seedStudies: 0, rows: [] }

  const counts = new Map()
  for (const studyIndex of seedStudies) {
    const study = store.studies[studyIndex]
    study.genes.forEach((gene, rank) => {
      if (seedSymbols.has(gene)) return
      const entry = counts.get(gene) ?? { gene, lists: [], articleIds: new Set(), bestRank: Infinity }
      entry.lists.push(study)
      entry.articleIds.add(study.article)
      entry.bestRank = Math.min(entry.bestRank, rank + 1)
      counts.set(gene, entry)
    })
  }

  const K = seedStudies.size
  const seedArticles = new Set([...seedStudies].map((i) => store.studies[i].article)).size
  const total = store.studies.length
  const rows = []
  for (const entry of counts.values()) {
    if (entry.lists.length < minLists) continue
    const everywhere = listsContaining(entry.gene)
    // Expected co-occurrence if the partner were sprinkled at its database-wide rate.
    const expected = (K * everywhere) / total
    entry.everywhere = everywhere
    entry.articles = entry.articleIds.size
    entry.articlesEverywhere = articlesContaining(entry.gene)
    entry.specificity = expected > 0 ? entry.lists.length / expected : 0
    entry.pValue = overlapPValue(entry.lists.length, K, everywhere, total)
    // The same test at article resolution, which is the honest one when a single
    // paper contributed many of the seed lists.
    entry.articlePValue = overlapPValue(entry.articles, seedArticles, entry.articlesEverywhere, store.articleCount)
    rows.push(entry)
  }
  rows.sort((a, b) => b.lists.length - a.lists.length || a.bestRank - b.bestRank || a.gene.localeCompare(b.gene))
  return { seedStudies: K, seedArticles, rows }
}

/* ---------- gene list comparison (Gene List Analysis tab) ---------- */

export function compareToDatabase(genes, { minShared = 2, universe = 20000 } = {}) {
  const query = new Set(genes)
  const rows = []
  const frequency = new Map()

  for (const study of store.studies) {
    const shared = []
    for (const gene of study.genes) if (query.has(gene)) shared.push(gene)
    if (shared.length < minShared) continue
    rows.push({
      study,
      shared,
      count: shared.length,
      // Share of the query list recovered by this study, which keeps small
      // focused lists from being buried under 700-gene lists.
      coverage: shared.length / query.size,
      pValue: overlapPValue(shared.length, query.size, study.size, universe),
    })
    for (const gene of shared) frequency.set(gene, (frequency.get(gene) ?? 0) + 1)
  }

  rows.sort((a, b) => b.count - a.count || b.coverage - a.coverage)
  // Bonferroni over the comparisons actually made.
  const threshold = rows.length ? 0.05 / rows.length : 0.05
  for (const row of rows) row.significant = row.pValue < threshold

  const topGenes = [...frequency.entries()]
    .map(([gene, lists]) => ({ gene, lists }))
    .sort((a, b) => b.lists - a.lists || a.gene.localeCompare(b.gene))

  return {
    rows,
    topGenes,
    queried: query.size,
    matchedGenes: topGenes.length,
    significantCount: rows.filter((r) => r.significant).length,
    threshold,
    unmatched: [...query].filter((g) => !store.geneIndex.has(g)),
  }
}

/* ---------- consensus signature across a set of lists ---------- */

/**
 * Ask a set of experiments to vote. Each list gives every gene a score from 1 at
 * the top of the list down to 0 at the bottom, so agreement near the top counts
 * for more than a mention near the bottom. The vote is then divided by how often
 * the gene appears database-wide, so heat shock and housekeeping genes do not win
 * every ballot by turning up everywhere.
 */
export function consensusSignature(studies, {
  minVoters = 2, limit = 40, perArticle = true, background = null,
} = {}) {
  const bg = background ?? makeBackground(store.studies, { perArticle })
  const votes = new Map()

  for (const study of studies) {
    const n = study.size
    study.genes.forEach((gene, rank) => {
      const weight = 1 - rank / n
      const entry = votes.get(gene) ?? {
        gene, lists: 0, articleIds: new Set(), best: Infinity, in: [],
        perArticleWeight: new Map(),
      }
      entry.lists++
      entry.articleIds.add(study.article)
      entry.best = Math.min(entry.best, rank + 1)
      // One paper that published thirty lists should not out-vote thirty papers, so
      // each article contributes only its single strongest placement of the gene.
      const prior = entry.perArticleWeight.get(study.article) ?? 0
      if (weight > prior) entry.perArticleWeight.set(study.article, weight)
      if (entry.in.length < 6) entry.in.push(study)
      votes.set(gene, entry)
    })
  }

  const voterLists = studies.length
  const voterArticles = countArticles(studies)
  const K = perArticle ? voterArticles : voterLists
  const rows = []

  for (const entry of votes.values()) {
    entry.articles = entry.articleIds.size
    const support = perArticle ? entry.articles : entry.lists
    if (support < minVoters) continue
    entry.weight = perArticle
      ? [...entry.perArticleWeight.values()].reduce((a, b) => a + b, 0)
      : (entry.weight ?? sumListWeights(entry, studies))
    const everywhere = bg.counts.get(entry.gene) ?? 0
    const expected = (K * everywhere) / (bg.size || 1)
    entry.everywhere = everywhere
    entry.specificity = expected > 0 ? support / expected : 0
    entry.fraction = support / K
    entry.support = support
    entry.score = entry.weight * Math.log(1 + entry.specificity)
    rows.push(entry)
  }
  rows.sort((a, b) => b.score - a.score)
  return {
    rows: rows.slice(0, limit),
    voters: K,
    voterLists,
    voterArticles,
    perArticle,
    backgroundSize: bg.size,
    considered: rows.length,
  }
}

// Per-list weighting needs the raw sum, which the per-article map does not hold.
function sumListWeights(entry, studies) {
  let total = 0
  for (const study of studies) {
    const at = study.genes.indexOf(entry.gene)
    if (at >= 0) total += 1 - at / study.size
  }
  return total
}

/**
 * Genes that are enriched in one set of experiments relative to another, which is
 * what most real questions look like: mouse model versus human tissue, early versus
 * late, up versus down.
 */
export function compareSets(setA, setB, { perArticle = true, minCount = 2 } = {}) {
  const bgA = makeBackground(setA, { perArticle })
  const bgB = makeBackground(setB, { perArticle })
  const universe = new Set([...bgA.counts.keys(), ...bgB.counts.keys()])
  const population = bgA.size + bgB.size
  const rows = []

  for (const gene of universe) {
    const a = bgA.counts.get(gene) ?? 0
    const b = bgB.counts.get(gene) ?? 0
    if (a + b < minCount) continue
    const rateA = a / (bgA.size || 1)
    const rateB = b / (bgB.size || 1)
    // Laplace smoothing keeps a 3-of-3 versus 0-of-40 from dividing by zero.
    const enrichment = (rateA + 1 / (bgA.size + 1)) / (rateB + 1 / (bgB.size + 1))
    const pValue = a >= b
      ? overlapPValue(a, bgA.size, a + b, population)
      : overlapPValue(b, bgB.size, a + b, population)
    rows.push({ gene, a, b, rateA, rateB, enrichment, pValue, favours: a / (bgA.size || 1) >= b / (bgB.size || 1) ? 'A' : 'B' })
  }
  rows.sort((x, y) => x.pValue - y.pValue || y.enrichment - x.enrichment)
  const threshold = rows.length ? 0.05 / rows.length : 0.05
  for (const row of rows) row.significant = row.pValue < threshold
  return {
    rows,
    sizeA: bgA.size,
    sizeB: bgB.size,
    perArticle,
    threshold,
    significantCount: rows.filter((r) => r.significant).length,
  }
}

/**
 * Genes supported by the largest number of distinct experiment types. Convergence
 * across methods is much harder to fake than repetition within one method.
 */
export function evidenceConvergence(studies, { minTypes = 2, limit = 60 } = {}) {
  const byGene = new Map()
  for (const study of studies) {
    const type = study.assay || 'Unclassified'
    for (const gene of study.genes) {
      const entry = byGene.get(gene) ?? { gene, types: new Set(), articleIds: new Set(), lists: 0 }
      entry.types.add(type)
      entry.articleIds.add(study.article)
      entry.lists++
      byGene.set(gene, entry)
    }
  }
  const rows = []
  for (const entry of byGene.values()) {
    if (entry.types.size < minTypes) continue
    entry.typeCount = entry.types.size
    entry.typeList = [...entry.types].sort()
    entry.articles = entry.articleIds.size
    entry.everywhere = listsContaining(entry.gene)
    rows.push(entry)
  }
  rows.sort((a, b) => b.typeCount - a.typeCount || b.articles - a.articles || a.gene.localeCompare(b.gene))
  const types = new Set(studies.map((s) => s.assay || 'Unclassified'))
  return { rows: rows.slice(0, limit), typeCount: types.size, types: [...types].sort(), considered: rows.length }
}

/* ---------- study browser ---------- */

export function filterStudies({
  text = '', journal = '', method = '', direction = '', topic = '', year = '', assay = '', species = '',
} = {}) {
  const needle = text.trim().toLowerCase()
  const terms = needle ? needle.split(/\s+/) : []
  return store.studies.filter((s) => {
    if (journal && s.journal !== journal) return false
    if (method && s.methodGroup !== method) return false
    if (direction && s.direction !== direction) return false
    if (topic && !s.topics.includes(topic)) return false
    if (assay && s.assay !== assay) return false
    if (species && s.species !== species) return false
    if (year && String(s.year) !== String(year)) return false
    if (!terms.length) return true
    const haystack = `${s.description} ${s.title} ${s.journal} ${s.tissue} ${s.method} ${s.topics.join(' ')}`.toLowerCase()
    return terms.every((t) => haystack.includes(t))
  })
}
