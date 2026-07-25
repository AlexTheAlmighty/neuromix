// Live lookups against Enrichr, STRING and NCBI. All three send permissive CORS
// headers, so the browser calls them directly and the site stays a static bundle.
// BioGRID is absent by design: its webservice needs an access key, and a static site
// has nowhere to keep one. STRING covers the interaction panel.

const ENRICHR = 'https://maayanlab.cloud/Enrichr'
const STRING = 'https://string-db.org/api/json'
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const MYGENE = 'https://mygene.info/v3'

const cleanGenes = (list) =>
  [...new Set((Array.isArray(list) ? list : [])
    .map((g) => String(g).trim().toUpperCase())
    .filter(Boolean))].slice(0, 3000)

const cleanSymbol = (gene) => {
  const symbol = String(gene ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9._-]{0,24}$/.test(symbol)) throw new Error('Enter a single gene symbol')
  return symbol
}

// NCBI asks anonymous callers to identify the tool and rate limits them to three
// requests a second. That budget is now per visitor rather than shared by everyone
// behind one server address.
const eutilsParams = (extra) => new URLSearchParams({ ...extra, retmode: 'json', tool: 'neuromix' })

/** Enrichr wants the gene list posted first, then the enrichment fetched by list id. */
export async function enrich({ genes, library }) {
  const symbols = cleanGenes(genes)
  if (!symbols.length) throw new Error('No genes supplied')
  if (!/^[\w.+-]{2,80}$/.test(library ?? '')) throw new Error('Unknown library')

  const form = new FormData()
  form.append('list', symbols.join('\n'))
  form.append('description', 'NeurOmix gene list')
  const added = await fetch(`${ENRICHR}/addList`, { method: 'POST', body: form })
  if (!added.ok) throw new Error(`Enrichr rejected the gene list (HTTP ${added.status})`)
  const { userListId, shortId } = await added.json()

  const res = await fetch(`${ENRICHR}/enrich?userListId=${userListId}&backgroundType=${encodeURIComponent(library)}`)
  if (!res.ok) throw new Error(`Enrichr enrichment failed (HTTP ${res.status})`)
  const body = await res.json()
  const rows = (body[library] ?? []).map((r) => ({
    rank: r[0], term: r[1], p: r[2], z: r[3], score: r[4], genes: r[5], adjP: r[6],
  }))
  return { library, listSize: symbols.length, shortId, rows }
}

/** Official name, aliases, locus and the curated NCBI summary for one human gene. */
async function geneSummaryFromNcbi(symbol) {
  const term = `${symbol}[Preferred Symbol] AND 9606[Taxonomy ID]`
  const search = await fetch(`${EUTILS}/esearch.fcgi?${eutilsParams({ db: 'gene', term, retmax: '1' })}`)
  if (!search.ok) throw new Error(`NCBI lookup failed (HTTP ${search.status})`)
  const found = await search.json()
  const id = found?.esearchresult?.idlist?.[0]
  if (!id) return null

  const detail = await fetch(`${EUTILS}/esummary.fcgi?${eutilsParams({ db: 'gene', id })}`)
  if (!detail.ok) throw new Error(`NCBI summary failed (HTTP ${detail.status})`)
  const body = await detail.json()
  const rec = body?.result?.[id]
  if (!rec) return null

  const location = [rec.chromosome && `chromosome ${rec.chromosome}`, rec.maplocation]
    .filter(Boolean).join(', ')
  return {
    symbol: rec.nomenclaturesymbol || rec.name || symbol,
    name: rec.nomenclaturename || rec.description || '',
    summary: (rec.summary || '').trim(),
    aliases: (rec.otheraliases || '').split(',').map((a) => a.trim()).filter(Boolean),
    alsoKnownAs: (rec.otherdesignations || '').split('|').map((a) => a.trim()).filter(Boolean).slice(0, 4),
    location,
    entrezId: id,
    url: `https://www.ncbi.nlm.nih.gov/gene/${id}`,
    source: 'NCBI Gene',
  }
}

/** Fallback when NCBI is unreachable or rate limiting. */
async function geneSummaryFromMyGene(symbol) {
  const qs = new URLSearchParams({
    q: `symbol:${symbol}`, species: 'human', size: '1',
    fields: 'symbol,name,summary,alias,entrezgene,genomic_pos,type_of_gene',
  })
  const res = await fetch(`${MYGENE}/query?${qs}`)
  if (!res.ok) throw new Error(`MyGene lookup failed (HTTP ${res.status})`)
  const hit = (await res.json())?.hits?.[0]
  if (!hit) return null
  return {
    symbol: hit.symbol ?? symbol,
    name: hit.name ?? '',
    summary: (hit.summary ?? '').trim(),
    aliases: [].concat(hit.alias ?? []).slice(0, 12),
    alsoKnownAs: hit.type_of_gene ? [hit.type_of_gene] : [],
    location: hit.genomic_pos?.chr ? `chromosome ${hit.genomic_pos.chr}` : '',
    entrezId: hit.entrezgene ? String(hit.entrezgene) : '',
    url: hit.entrezgene ? `https://www.ncbi.nlm.nih.gov/gene/${hit.entrezgene}` : '',
    source: 'MyGene.info',
  }
}

export async function geneSummary(gene) {
  const symbol = cleanSymbol(gene)
  let value = await geneSummaryFromNcbi(symbol).catch(() => null)
  if (!value) value = await geneSummaryFromMyGene(symbol).catch(() => null)
  if (!value) return { symbol, found: false }
  value.found = true
  return value
}

export async function interactions(gene) {
  const symbol = cleanSymbol(gene)
  const mapped = await fetch(`${STRING}/get_string_ids?identifiers=${encodeURIComponent(symbol)}&species=9606&limit=1`)
  if (!mapped.ok) throw new Error(`STRING lookup failed (HTTP ${mapped.status})`)
  const ids = await mapped.json()
  if (!ids.length) return { gene: symbol, string: [] }

  const res = await fetch(`${STRING}/interaction_partners?identifiers=${encodeURIComponent(ids[0].stringId)}&species=9606&required_score=300&limit=200`)
  if (!res.ok) throw new Error(`STRING interaction lookup failed (HTTP ${res.status})`)
  const partners = await res.json()
  return {
    gene: symbol,
    string: partners.map((p) => ({
      a: p.preferredName_A,
      b: p.preferredName_B,
      score: Number(p.score),
      evidence: Number(p.escore ?? 0),
      source: 'STRING',
    })),
  }
}
