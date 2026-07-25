// Gene Analysis: search the database for one or more genes, or find the genes that
// co-occur with them across the lists that contain them.
import {
  store, parseGeneQuery, searchGenes, summariseHits, coOccurringGenes, suggestGenes, geneProfile,
} from '../store.js'
import { el, clear, fmt, pct, sci, escapeHtml, DataTable, toast, debounce } from '../ui.js'
import { on } from '../bus.js'
import { geneSummary, interactions } from '../api.js'
import { openStudy, studyLinkButton, articleLink, directionChip } from './shared.js'

const EXAMPLES = [
  { label: 'HTT', hint: 'Huntingtin, mutated in Huntington disease' },
  { label: 'ATG101, ATG12, ATG13, ATG14, ATG16L1, ATG2A, ATG5, ATP13A2, ATP6V0A1', hint: 'Autophagy genes' },
  { label: 'KIF1A, KIF1B, KIF1C, KIF21A, KIF3A, KIF3B, KIF4A, KIF5A, KIF5B, KIF5C', hint: 'Axonal transport genes' },
]

let input
let exactBox
let results
let interactionBox
let mounted = false

export function mount(root) {
  if (mounted) return
  mounted = true

  input = el('input', {
    type: 'text', id: 'gene-input', placeholder: 'HTT, SNCA, MAPT', autocomplete: 'off',
    list: 'gene-suggestions', spellcheck: 'false',
  })
  const suggestions = el('datalist', { id: 'gene-suggestions' })
  input.addEventListener('input', debounce(() => {
    const last = input.value.split(',').pop().trim()
    clear(suggestions)
    for (const gene of suggestGenes(last)) suggestions.append(el('option', { value: gene }))
  }, 140))
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch() })

  exactBox = el('input', { type: 'checkbox', id: 'exact-match' })

  const controls = el('div', { class: 'panel sticky-side' }, [
    el('div', { class: 'panel-body' }, [
      el('div', { class: 'section-title' }, [el('h2', { text: 'Search' })]),
      el('p', { class: 'hint', style: 'margin-bottom:12px' }, [
        'Search every ranked gene list in NeurOmix. Separate multiple genes with commas.',
      ]),
      el('label', { class: 'field', for: 'gene-input' }, [el('span', { text: 'Gene symbols' }), input, suggestions]),
      el('label', { class: 'check', for: 'exact-match' }, [
        exactBox, 'Exact match only (off matches any symbol containing the text)',
      ]),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => runSearch() }, ['Search database']),
        el('button', { class: 'btn', type: 'button', onclick: () => runCoOccurrence() }, ['Co-occurring genes']),
      ]),
      el('hr', { class: 'divider' }),
      el('div', { class: 'section-title' }, [el('h2', { text: 'Protein interactions' })]),
      el('p', { class: 'hint', style: 'margin-bottom:10px' }, [
        'Live lookup against STRING for a single gene symbol.',
      ]),
      el('button', { class: 'btn', type: 'button', onclick: () => fetchInteractions() }, ['Fetch interactions']),
      interactionBox = el('div', { style: 'margin-top:12px' }),
      el('details', { style: 'margin-top:12px' }, [
        el('summary', { class: 'hint', style: 'cursor:pointer', text: 'How the interaction scores are calculated' }),
        el('p', { class: 'hint', style: 'margin-top:8px' }, [
          'STRING scores combine several lines of evidence (experimental, co-expression, text mining) '
          + 'into one likelihood between 0 and 1. Partners are filtered at a score of 0.3 and capped at 200.',
        ]),
      ]),
    ]),
  ])

  results = el('div')
  root.append(el('div', { class: 'layout' }, [controls, results]))
  showEmptyState()

  on('search-gene', ({ genes }) => {
    input.value = genes.join(', ')
    runSearch()
  })
}

export function onShow() {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const q = params.get('q')
  if (q && q !== input.value) {
    input.value = q
    exactBox.checked = params.get('exact') === '1'
    runSearch()
  }
}

function syncHash() {
  const params = new URLSearchParams()
  if (input.value.trim()) params.set('q', input.value.trim())
  if (exactBox.checked) params.set('exact', '1')
  const next = `#/genes${params.toString() ? `?${params}` : ''}`
  if (location.hash !== next) history.replaceState(null, '', next)
}

function showEmptyState() {
  clear(results)
  results.append(el('div', { class: 'stats' }, [
    stat('Ranked gene lists', fmt(store.stats.lists)),
    stat('Articles', fmt(store.stats.articles)),
    stat('Gene entries', fmt(store.stats.geneEntries)),
    stat('Unique genes', fmt(store.stats.uniqueGenes)),
  ]))
  results.append(el('div', { class: 'empty' }, [
    el('h3', { text: 'Search a gene to begin' }),
    el('p', { text: 'Every hit tells you which experiment found the gene and where it ranked in that experiment.' }),
    el('p', { class: 'hint', style: 'margin-bottom:4px', text: 'Try one of these:' }),
    ...EXAMPLES.map((ex) => el('div', { style: 'margin-bottom:8px' }, [
      el('button', {
        class: 'cell-link example', type: 'button',
        onclick: () => { input.value = ex.label; runSearch() },
      }, [ex.label]),
      el('span', { class: 'hint', text: ex.hint }),
    ])),
  ]))
}

// The NCBI summary is fetched per gene and cached by the server, so it arrives after
// the local results rather than holding them up.
const summaryCache = new Map()

async function fillGeneSummary(symbol, host) {
  const paint = (data) => {
    clear(host)
    if (!data || !data.found) {
      host.append(el('p', { class: 'hint', style: 'margin:0' }, [
        `No reference entry found for ${symbol}. It may be a retired symbol, a clone identifier, `
        + 'or a non-human gene.',
      ]))
      return
    }
    if (data.name) host.append(el('div', { class: 'gene-fullname', text: data.name }))
    if (data.summary) {
      host.append(el('p', { class: 'gene-summary', text: data.summary }))
    } else {
      host.append(el('p', { class: 'hint', text: 'No curated function summary is available for this gene.' }))
    }
    const facts = el('div', { class: 'btn-row', style: 'margin-top:8px' })
    if (data.location) facts.append(el('span', { class: 'chip chip-plain', text: data.location }))
    if (data.aliases?.length) {
      facts.append(el('span', {
        class: 'chip chip-plain',
        title: data.aliases.join(', '),
        text: `also called ${data.aliases.slice(0, 4).join(', ')}${data.aliases.length > 4 ? ` and ${data.aliases.length - 4} more` : ''}`,
      }))
    }
    if (data.url) {
      facts.append(el('a', {
        class: 'chip chip-plain', href: data.url, target: '_blank', rel: 'noopener noreferrer',
        text: `${data.source} entry`,
      }))
    }
    host.append(facts)
  }

  if (summaryCache.has(symbol)) return paint(summaryCache.get(symbol))
  try {
    const data = await geneSummary(symbol)
    summaryCache.set(symbol, data)
    paint(data)
  } catch (err) {
    clear(host)
    host.append(el('p', { class: 'hint', style: 'margin:0' }, [
      `Could not reach the gene reference service (${err.message}). Everything below comes from `
      + 'NeurOmix itself and is unaffected.',
    ]))
  }
}

function profileCard(p) {
  if (!p) return el('div')
  const total = p.lists
  const bar = el('div', { class: 'dirbar', 'aria-hidden': 'true' }, [
    p.up && el('span', { class: 'seg up', style: `width:${(p.up / total) * 100}%` }),
    p.neutral && el('span', { class: 'seg flat', style: `width:${(p.neutral / total) * 100}%` }),
    p.down && el('span', { class: 'seg down', style: `width:${(p.down / total) * 100}%` }),
  ])

  const summaryHost = el('div', { class: 'gene-function' }, [
    el('div', { class: 'loading-row', style: 'padding:0' }, [
      el('div', { class: 'spinner' }),
      el('span', { class: 'hint', text: 'Looking up the gene description' }),
    ]),
  ])
  fillGeneSummary(p.gene, summaryHost)

  return el('div', { class: 'panel profile' }, [
    el('div', { class: 'panel-body' }, [
      el('div', { class: 'profile-head' }, [
        el('h2', { class: 'gene-title', text: p.gene }),
        el('span', { class: 'hint' }, [
          `appears in ${fmt(p.lists)} gene lists from ${fmt(p.articles)} articles across ${fmt(p.journals)} journals`,
        ]),
      ]),
      summaryHost,
      el('div', { class: 'profile-grid' }, [
        el('div', {}, [
          el('div', { class: 'k', text: 'Direction across studies' }),
          bar,
          el('div', { class: 'btn-row', style: 'margin-top:7px' }, [
            el('span', { class: 'chip chip-up', text: `${fmt(p.up)} up` }),
            el('span', { class: 'chip', text: `${fmt(p.neutral)} not directional` }),
            el('span', { class: 'chip chip-down', text: `${fmt(p.down)} down` }),
          ]),
          p.conflicted && el('p', { class: 'hint', style: 'margin-top:8px' }, [
            'Reported in both directions by different experiments, so the direction is context dependent.',
          ]),
        ]),
        el('div', {}, [
          el('div', { class: 'k', text: 'Ranking' }),
          el('div', { class: 'v', text: `Best rank #${fmt(p.bestRank)}` }),
          el('div', { class: 'hint', text: `Typically in the top ${pct(p.medianPercentile, 0)} of the lists it appears in` }),
          el('div', { class: 'k', style: 'margin-top:10px', text: 'How common' }),
          el('div', { class: 'hint' }, [
            p.ubiquity > 0.03
              ? `In ${pct(p.ubiquity, 1)} of all lists, so treat co-occurrence with it cautiously.`
              : `In ${pct(p.ubiquity, 1)} of all lists, so its co-occurrences are fairly specific.`,
          ]),
        ]),
        el('div', {}, [
          el('div', { class: 'k', text: 'Topics' }),
          el('div', { class: 'btn-row', style: 'margin-top:5px' },
            p.topics.slice(0, 8).map(([name, n]) => el('button', {
              class: 'chip chip-plain chip-btn', type: 'button',
              title: `Browse the ${name} studies`,
              onclick: () => { location.hash = `#/studies?topic=${encodeURIComponent(name)}` },
            }, [`${name} (${n})`]))),
        ]),
      ]),
    ]),
  ])
}

const stat = (label, value, sub) => el('div', { class: 'stat' }, [
  el('div', { class: 'label', text: label }),
  el('div', { class: `value${String(value).length > 9 ? ' sm' : ''}`, text: value }),
  sub && el('div', { class: 'sub', text: sub }),
])

function readQuery() {
  const genes = parseGeneQuery(input.value)
  if (!genes.length) {
    toast('Enter at least one gene symbol', { error: true })
    input.focus()
    return null
  }
  return genes
}

function runSearch() {
  const genes = readQuery()
  if (!genes) return
  renderSearch(genes)
}

function renderSearch(genes) {
  syncHash()

  const exact = exactBox.checked
  const hits = searchGenes(genes, { exact })
  clear(results)

  if (!hits.length) {
    results.append(el('div', { class: 'empty' }, [
      el('h3', { text: 'No gene lists contain that query' }),
      el('p', { text: `${genes.join(', ')} was not found${exact ? ' as an exact symbol' : ''}. Try turning exact match off, or check the symbol.` }),
    ]))
    return
  }

  // One queried symbol means we can lead with the profile rather than raw rows.
  const matched = [...new Set(hits.map((h) => h.gene))]
  if (matched.length === 1) results.append(profileCard(geneProfile(matched[0])))

  const s = summariseHits(hits)
  results.append(el('div', { class: 'stats' }, [
    stat('Gene lists', fmt(s.studies), `${fmt(s.hits)} ranked entries`),
    stat('Articles', fmt(s.articles)),
    stat('Symbols matched', fmt(s.genes), exact ? 'exact match' : 'partial match'),
    stat('Best rank', `#${fmt(s.bestRank)}`),
    stat('Direction', `${fmt(s.up)} up / ${fmt(s.down)} down`, `${fmt(s.studies - s.up - s.down)} not directional`),
  ]))

  const table = new DataTable({
    rows: hits,
    exportName: `neuromix_${genes.join('_').slice(0, 40)}`,
    searchPlaceholder: 'Filter these results',
    searchText: (h) => `${h.gene} ${h.study.description} ${h.study.title} ${h.study.journal}`,
    rowClass: (h) => (h.study.direction ? `dir-${h.study.direction}` : ''),
    caption: `<strong>${fmt(hits.length)} ranked entries</strong> across ${fmt(s.studies)} gene lists, sorted by rank. `
      + 'Select an experiment to see its abstract and full ranked list.',
    initialSort: { key: 'rank', dir: 'asc' },
    columns: [
      {
        key: 'article', label: 'Article', className: 'link-cell', sortValue: (h) => h.study.title,
        render: (h) => articleLink(h.study), csv: (h) => h.study.title,
      },
      {
        key: 'experiment', label: 'Experiment', className: 'desc-cell', sortValue: (h) => h.study.description,
        render: (h) => el('div', {}, [
          studyLinkButton(h.study, { onOpen: (study) => openStudy(study, { highlight: new Set(hits.map((x) => x.gene)) }) }),
          el('div', { style: 'margin-top:5px' }, [directionChip(h.study)]),
        ]),
        csv: (h) => h.study.description,
      },
      { key: 'gene', label: 'Gene', className: 'gene', sortValue: (h) => h.gene, render: (h) => h.gene, csv: (h) => h.gene },
      { key: 'rank', label: 'Rank', className: 'num', sortValue: (h) => h.rank, render: (h) => `#${fmt(h.rank)}`, csv: (h) => h.rank },
    ],
  })
  results.append(table.node)
}

function runCoOccurrence() {
  const genes = readQuery()
  if (!genes) return
  syncHash()

  const { seedStudies, seedArticles, rows } = coOccurringGenes(genes, { exact: exactBox.checked })
  clear(results)

  if (!seedStudies) {
    results.append(el('div', { class: 'empty' }, [
      el('h3', { text: 'No gene lists contain that query' }),
      el('p', { text: 'Co-occurrence needs at least one list containing the searched gene.' }),
    ]))
    return
  }
  if (!rows.length) {
    results.append(el('div', { class: 'empty' }, [
      el('h3', { text: 'No genes co-occur in two or more lists' }),
      el('p', { text: `${genes.join(', ')} was found in ${fmt(seedStudies)} gene list(s), but no other gene appears in two or more of them.` }),
    ]))
    return
  }

  // Raw specificity alone rewards a gene seen twice in two lists, which is noise.
  // The p value weighs rarity against how much evidence there actually is.
  const bySpecificity = [...rows].sort((a, b) => a.pValue - b.pValue || b.lists.length - a.lists.length)
  results.append(el('div', { class: 'stats' }, [
    stat('Seed gene lists', fmt(seedStudies), `from ${fmt(seedArticles)} articles`),
    stat('Co-occurring genes', fmt(rows.length), 'in 2 or more of those lists'),
    stat('Most frequent partner', rows[0].gene, `${fmt(rows[0].lists.length)} shared lists`),
    stat('Most specific partner', bySpecificity[0].gene,
      `${fmt(bySpecificity[0].lists.length)} of its ${fmt(bySpecificity[0].everywhere)} lists`),
  ]))

  results.append(el('div', { class: 'callout', style: 'margin-bottom:14px' }, [
    el('strong', { text: 'Two ways to read this. ' }),
    'Shared lists counts how often a gene turns up with your query. Specificity divides that by how often the gene '
    + 'appears anywhere in NeurOmix, so genes that are in everything (heat shock proteins, actin) stop crowding out '
    + 'partners that appear almost exclusively alongside your query. The default sort is by p value, which balances '
    + 'the two: a gene sharing 5 of its only 5 lists beats one sharing 2 of 2. Sort by any column.',
  ]))

  const table = new DataTable({
    rows,
    exportName: `neuromix_cooccurrence_${genes.join('_').slice(0, 40)}`,
    searchPlaceholder: 'Filter co-occurring genes',
    searchText: (r) => `${r.gene} ${r.lists.map((s) => s.description).join(' ')}`,
    caption: `<strong>${fmt(rows.length)} genes</strong> co-occur with ${escapeHtml(genes.join(', '))} in at least two of the `
      + `${fmt(seedStudies)} gene lists that contain the query.`,
    initialSort: { key: 'pValue', dir: 'asc' },
    columns: [
      {
        key: 'gene', label: 'Gene', className: 'gene', sortValue: (r) => r.gene,
        render: (r) => el('button', {
          class: 'cell-link', type: 'button', title: `Search NeurOmix for ${r.gene}`,
          onclick: () => { input.value = r.gene; runSearch() },
        }, [r.gene]),
        csv: (r) => r.gene,
      },
      {
        key: 'lists', label: 'Shared lists', className: 'num', sortValue: (r) => r.lists.length,
        render: (r) => fmt(r.lists.length), csv: (r) => r.lists.length,
      },
      {
        key: 'articles', label: 'Articles', className: 'num', sortValue: (r) => r.articles,
        render: (r) => el('span', {
          title: r.articles === 1
            ? 'All of these lists come from a single paper, so this is one observation, not several'
            : `Independent support from ${r.articles} different articles`,
          text: fmt(r.articles),
        }),
        csv: (r) => r.articles,
      },
      {
        key: 'everywhere', label: 'Lists overall', className: 'num', sortValue: (r) => r.everywhere,
        render: (r) => fmt(r.everywhere), csv: (r) => r.everywhere,
      },
      {
        key: 'specificity', label: 'Specificity', className: 'num', sortValue: (r) => r.specificity,
        render: (r) => el('span', {
          title: `Co-occurs ${r.specificity.toFixed(1)} times more often than its database-wide rate predicts`,
          text: `${r.specificity.toFixed(1)}x`,
        }),
        csv: (r) => r.specificity.toFixed(2),
      },
      {
        key: 'pValue', label: 'P value', className: 'num', sortValue: (r) => r.pValue,
        render: (r) => sci(r.pValue), csv: (r) => r.pValue,
      },
      {
        key: 'articlePValue', label: 'P (by article)', className: 'num', sortValue: (r) => r.articlePValue,
        render: (r) => el('span', {
          title: 'The same test counting articles rather than lists, which is the honest one when '
            + 'a single paper contributed many of the lists containing your gene',
          text: sci(r.articlePValue),
        }),
        csv: (r) => r.articlePValue,
      },
      {
        key: 'bestRank', label: 'Best rank', className: 'num', sortValue: (r) => r.bestRank,
        render: (r) => `#${fmt(r.bestRank)}`, csv: (r) => r.bestRank,
      },
      {
        key: 'experiments', label: 'Experiments', className: 'desc-cell', sortable: false,
        render: (r) => el('div', {}, [
          ...r.lists.slice(0, 4).map((study, i) => el('div', { style: i ? 'margin-top:4px' : '' }, [studyLinkButton(study)])),
          r.lists.length > 4 && el('div', { class: 'hint', text: `and ${fmt(r.lists.length - 4)} more` }),
        ]),
        csv: (r) => r.lists.map((s) => s.description).join(' | '),
      },
    ],
  })
  results.append(table.node)
}

async function fetchInteractions() {
  const genes = parseGeneQuery(input.value)
  if (genes.length !== 1) {
    toast('Interaction lookup takes exactly one gene symbol', { error: true })
    return
  }
  clear(interactionBox)
  interactionBox.append(el('div', { class: 'loading-row' }, [
    el('div', { class: 'spinner' }), el('span', { text: `Querying STRING for ${genes[0]}` }),
  ]))

  try {
    const body = await interactions(genes[0])

    const rows = body.string
      .map((r) => ({ partner: r.b === genes[0] ? r.a : r.b, score: r.score, source: 'STRING' }))
      .filter((r) => r.partner).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

    clear(interactionBox)
    if (!rows.length) {
      interactionBox.append(el('p', { class: 'hint', text: `No interaction partners returned for ${genes[0]}.` }))
      return
    }
    const inNeurOmix = (gene) => store.geneIndex.has(gene)
    interactionBox.append(el('p', { class: 'hint', style: 'margin-bottom:6px' }, [
      `${fmt(rows.length)} partners. Bold symbols also appear somewhere in NeurOmix.`,
    ]))
    const wrap = el('div', { class: 'table-wrap', style: 'max-height:320px; overflow-y:auto' })
    wrap.append(el('table', { class: 'data' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Partner' }), el('th', { text: 'Score', class: 'num' }), el('th', { text: 'Source' }),
      ])]),
      el('tbody', {}, rows.slice(0, 100).map((r) => el('tr', {}, [
        el('td', { class: 'gene' }, [
          inNeurOmix(r.partner)
            ? el('strong', {}, [el('button', {
              class: 'cell-link', type: 'button',
              onclick: () => { input.value = r.partner; runSearch() },
            }, [r.partner])])
            : r.partner,
        ]),
        el('td', { class: 'num', text: r.score === null ? 'n/a' : r.score.toFixed(3) }),
        el('td', {}, [el('span', { class: 'chip chip-plain', text: r.source })]),
      ]))),
    ]))
    interactionBox.append(wrap)
  } catch (err) {
    clear(interactionBox)
    interactionBox.append(el('p', { class: 'hint', text: err.message }))
    toast(err.message, { error: true })
  }
}
