// About: what the database is, how to read the results, and the downloads.
import { store } from '../store.js'
import { el, fmt, downloadCsv, toast } from '../ui.js'
import { barChart, columnChart } from '../charts.js'

let mounted = false

export function mount(root) {
  if (mounted) return
  mounted = true
  const s = store.stats

  // Text on the left and statistics on the right on wide screens. Narrower screens stack
  // them, statistics first, which is the order they sit in here.
  const statsColumn = el('div', { class: 'about-stats' })
  const layout = el('div', { class: 'about-layout' }, [statsColumn])
  root.append(layout)

  statsColumn.append(el('div', { class: 'stats' }, [
    tile('Ranked gene lists', fmt(s.lists)),
    tile('Articles', fmt(s.articles)),
    tile('Journals', fmt(s.journals)),
    tile('Gene entries', fmt(s.geneEntries)),
    tile('Unique gene symbols', fmt(s.uniqueGenes)),
  ]))
  if (store.generated) {
    const built = new Date(`${store.generated}T00:00:00Z`)
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    statsColumn.append(el('p', { class: 'hint', text: `Database last updated ${built}.` }))
  }

  if (store.overview) statsColumn.append(overview(store.overview))

  layout.append(el('div', { class: 'panel about-text' }, [
    el('div', { class: 'panel-body prose' }, [
      el('h1', { text: 'About NeurOmix' }),
      el('p', {
        text: 'NeurOmix is a manually curated database of ranked gene lists from high-throughput studies. '
          + 'The database is oriented towards neuroscience and brings together datasets from transcriptomics, '
          + 'proteomics, CRISPR screens, interactomics, and many other large-scale experimental approaches.',
      }),
      el('p', {
        text: 'Each gene list preserves the ranking used in the original study, such as fold change, P value, '
          + 'or correlation coefficient. This means a gene\'s position within a list retains its biological '
          + 'meaning from the original experiment.',
      }),
      el('p', {
        text: 'Every gene symbol is checked against HGNC when the database is built. Retired symbols are '
          + 'updated to their current names where the mapping is unambiguous, and searching for the name a '
          + 'paper used still finds the data.',
      }),

      el('h2', { text: 'Gene analysis' }),
      el('p', {
        text: 'Search for a single gene or enter multiple genes separated by commas. NeurOmix searches across '
          + 'all curated experiments and returns every gene list containing the queried gene. Each result '
          + 'represents one gene to experiment match and includes:',
      }),
      el('ul', {}, [
        el('li', {}, [el('strong', { text: 'Article' }), ': links directly to the original publication.']),
        el('li', {}, [el('strong', { text: 'Experiment' }), ': opens a detailed description containing the study abstract, tissue source, experimental method, and complete ranked gene list.']),
        el('li', {}, [el('strong', { text: 'Rank' }), ': shows the gene\'s position within the original ranked list. The statistic used to rank the list is provided in the experiment description.']),
        el('li', {}, [el('strong', { text: 'Direction' }), ': gene lists representing upregulated or downregulated genes are visually labelled.']),
        el('li', {}, [el('strong', { text: 'Co-occurring genes' }), ': identifies genes that repeatedly appear in the same curated gene lists as the queried gene.']),
      ]),
      el('p', {
        text: 'Exact match restricts the search to the gene symbol entered. When exact matching is disabled, '
          + 'partial symbols are also returned; for example, searching KIF can retrieve KIF1A, KIF5B, and '
          + 'other symbols containing those characters.',
      }),

      el('h2', { text: 'Gene list analysis' }),
      el('p', {
        text: 'NeurOmix can also analyse complete gene lists. Select any curated list from the built-in study '
          + 'picker or paste a custom list.',
      }),
      el('p', {
        text: 'Compare to NeurOmix compares the input list with every curated gene list in the database, ranks '
          + 'experiments by the number of shared genes, and identifies which genes from the input list occur '
          + 'most broadly across the database.',
      }),
      el('p', {
        text: 'Gene lists can also be analysed using Enrichr. NeurOmix submits the selected genes to the chosen '
          + 'Enrichr library and returns enriched terms, associated genes, statistical results, and a graphical '
          + 'summary of the strongest hits ranked by combined score and shaded by adjusted p value.',
      }),

      el('h2', { text: 'Protein interactions' }),
      el('p', {
        text: 'The gene analysis page can look up protein interaction partners of a selected gene from two '
          + 'sources, side by side. BioGRID is read from a snapshot bundled with this site, so lookups are '
          + 'instant and work offline: every experimentally observed human interaction is shown, with the '
          + 'number of physical experiments and the number of distinct publications supporting '
          + 'each pair. BioGRID curates only direct experimental evidence, so it contains nothing predicted '
          + 'or text mined. STRING is queried live and integrates several forms of evidence, including '
          + 'experimental data, co-expression, database annotations, and text mining, into a confidence '
          + 'score ranging from 0 to 1, so it reaches further but includes predicted associations. Every '
          + 'partner either source holds is shown.',
      }),

      el('h2', { text: 'Downloads' }),
      el('p', { text: 'NeurOmix data are available for download in several formats:' }),
      el('div', { class: 'btn-row', style: 'margin-bottom:14px' }, [
        el('button', { class: 'btn btn-primary', type: 'button', onclick: downloadStudies }, ['Study metadata (CSV)']),
        el('button', { class: 'btn', type: 'button', onclick: downloadLong }, ['Full database, long format (CSV)']),
        el('a', { class: 'btn', href: '/data/neuromix.json', download: 'neuromix.json' }, ['Raw JSON']),
      ]),
      el('div', { class: 'callout' }, [
        'The long-format database contains one row for each ranked gene entry, which is ',
        el('strong', { text: fmt(s.geneEntries) }),
        ' rows. Because the file is generated directly in the browser, large exports may take a moment to prepare.',
      ]),

      el('h2', { text: 'Citing the data' }),
      el('p', {
        text: 'Every gene list in NeurOmix originates from a published study. When using a gene list or '
          + 'experimental result, follow the article link and cite the original publication rather than '
          + 'NeurOmix alone. Additional analyses use external resources:',
      }),
      el('ul', {}, [
        el('li', {}, [el('strong', { text: 'Enrichment analysis' }), ': Enrichr (maayanlab.cloud)']),
        el('li', {}, [el('strong', { text: 'Protein interaction data' }), ': BioGRID (thebiogrid.org) and STRING (string-db.org)']),
        el('li', {}, [el('strong', { text: 'Gene summaries' }), ': NCBI Gene']),
      ]),
      el('p', {
        text: 'NeurOmix is intended to make these distributed experimental results easier to explore while '
          + 'preserving a direct connection to the studies that generated them.',
      }),
    ]),
  ]))
}

export function onShow() {}

const tile = (label, value) => el('div', { class: 'stat' }, [
  el('div', { class: 'label', text: label }),
  el('div', { class: 'value', text: value }),
])

/* ---------- database statistics ---------- */

const geneHref = (gene) => `#/genes?q=${encodeURIComponent(gene)}&exact=1`

const panel = (title, caption, body, wide = false) => el('section', { class: `panel${wide ? ' wide' : ''}` }, [
  el('div', { class: 'panel-head' }, [
    el('h2', { text: title }),
    caption ? el('p', { text: caption }) : null,
  ]),
  el('div', { class: 'panel-body' }, body),
])

const dataTable = (header, rows, cell) => el('div', { class: 'table-wrap' }, [
  el('table', { class: 'data' }, [
    el('thead', {}, [el('tr', {}, header.map((h, i) => el('th', { text: h, class: i ? 'num' : null })))]),
    el('tbody', {}, rows.map((row) => el('tr', {}, row.map(cell)))),
  ]),
])

const plainCell = (value) => (typeof value === 'number'
  ? el('td', { class: 'num', text: fmt(value) })
  : el('td', {}, [value]))

// Every chart keeps a readable table underneath it.
const tableToggle = (header, rows) => el('details', { class: 'chart-table' }, [
  el('summary', { text: 'Show table' }),
  dataTable(header, rows, plainCell),
])

function speciesMatrix(rows) {
  const peak = Math.max(...rows.flatMap(([, ...counts]) => counts), 1)
  const cell = (value) => {
    if (typeof value !== 'number') return el('td', { text: value })
    const style = value
      ? `background: color-mix(in srgb, var(--accent) ${Math.round(6 + (value / peak) * 44)}%, transparent)`
      : 'color: var(--muted)'
    return el('td', { class: 'num', text: fmt(value), style })
  }
  return dataTable(['Method', 'Human', 'Mouse', 'Rat'], rows, cell)
}

function overview(o) {
  const bars = (rows, valueLabel, options = {}) => barChart({
    rows, valueLabel, axis: false, rowHeight: 26, labelWidth: 140, format: fmt, ...options,
  })
  const toRows = (pairs) => pairs.map(([label, value]) => ({ label, value }))

  const termScale = o.keyTerms[0]?.[1] ?? 0
  const termSplit = Math.ceil(o.keyTerms.length / 2)
  const termChart = (terms) => bars(toRows(terms), 'Articles', { maxValue: termScale })

  return el('div', { class: 'overview' }, [
    panel('Gene lists by publication year', null, [
      columnChart({
        rows: o.years.map(([year, value]) => ({ label: String(year), value })),
        valueLabel: 'Gene lists',
        format: fmt,
      }),
      tableToggle(['Year', 'Gene lists'], o.years.map(([year, n]) => [String(year), n])),
    ], true),

    panel('Experimental method', null, [
      bars(toRows(o.methods), 'Gene lists'),
      tableToggle(['Method', 'Gene lists'], o.methods),
    ]),

    panel('Disease coverage', null, [
      bars(o.diseases.map(([label, value, articles]) => ({
        label,
        value,
        tooltip: [['Gene lists', fmt(value)], ['Articles', fmt(articles)]],
      })), 'Gene lists'),
      tableToggle(['Disease', 'Gene lists', 'Articles'], o.diseases),
    ]),

    panel('Key terms', 'Articles mentioning each term.', [
      el('div', { class: 'split' }, [
        termChart(o.keyTerms.slice(0, termSplit)),
        termChart(o.keyTerms.slice(termSplit)),
      ]),
      tableToggle(['Term', 'Articles'], o.keyTerms),
    ], true),

    panel('Method by species', null, [speciesMatrix(o.methodSpecies)], true),

    panel('Most recurrent genes', 'Number of independent articles.', [
      bars(o.genes.map(([label, value, lists]) => ({
        label,
        value,
        tooltip: [['Articles', fmt(value)], ['Gene lists', fmt(lists)]],
      })), 'Articles', { onSelect: (row) => { location.hash = geneHref(row.label) } }),
      tableToggle(['Gene', 'Articles', 'Gene lists'], o.genes.map(([gene, articles, lists]) => [
        el('a', { href: geneHref(gene), text: gene }), articles, lists,
      ])),
    ]),

    panel('Source journals', 'Articles per journal.', [
      bars(toRows(o.journals), 'Articles', { labelWidth: 150 }),
      tableToggle(['Journal', 'Articles'], o.journals),
    ]),
  ])
}

function downloadStudies() {
  downloadCsv(
    'neuromix_studies',
    ['Experiment description', 'Article title', 'Journal', 'Tissue source', 'Method', 'Data source', 'Direction', 'List size', 'Article link'],
    store.studies.map((s) => [s.description, s.title, s.journal, s.tissue, s.method, s.dataSource, s.direction || 'none', s.size, s.url]),
  )
}

function downloadLong() {
  toast('Building the long format export')
  setTimeout(() => {
    const rows = []
    for (const s of store.studies) {
      s.genes.forEach((gene, i) => rows.push([s.description, s.title, i + 1, gene]))
    }
    downloadCsv('neuromix_long', ['Experiment description', 'Article title', 'Rank', 'Gene'], rows)
  }, 30)
}
