// About: what the database is, how to read the results, and the downloads.
import { store } from '../store.js'
import { el, fmt, downloadCsv, toast } from '../ui.js'

let mounted = false

export function mount(root) {
  if (mounted) return
  mounted = true
  const s = store.stats

  root.append(el('div', { class: 'stats' }, [
    tile('Ranked gene lists', fmt(s.lists)),
    tile('Articles', fmt(s.articles)),
    tile('Journals', fmt(s.journals)),
    tile('Gene entries', fmt(s.geneEntries)),
    tile('Unique gene symbols', fmt(s.uniqueGenes)),
  ]))

  root.append(el('div', { class: 'panel' }, [
    el('div', { class: 'panel-body prose' }, [
      el('h1', { text: 'About NeurOmix' }),
      el('p', {
        text: 'NeurOmix is a manually curated collection of ranked gene lists from high throughput omics '
          + 'experiments in neuroscience and neurological disease: transcriptomics, proteomics, CRISPR screens and more. '
          + 'Each list is ranked by a statistic from the original paper, such as fold change, p value or correlation '
          + 'coefficient, so a gene\'s position in a list carries meaning.',
      }),

      el('h2', { text: 'Gene analysis' }),
      el('p', {
        text: 'Search one gene or a comma separated list. Every row of the result is one experiment that '
          + 'reported the gene, showing where it ranked in that experiment\'s list.',
      }),
      el('ul', {}, [
        el('li', {}, [el('strong', { text: 'Article' }), ' links to the original publication.']),
        el('li', {}, [el('strong', { text: 'Experiment' }), ' opens the abstract, the tissue source, the method, and the full ranked gene list.']),
        el('li', {}, [el('strong', { text: 'Rank' }), ' is the gene\'s position in that experiment\'s ranked list, and the sorting statistic is named in the experiment description.']),
        el('li', {}, ['Rows carry a labelled chip and a coloured edge for lists of upregulated or downregulated genes.']),
        el('li', {}, [el('strong', { text: 'Co-occurring genes' }), ' takes every list containing your gene and reports the other genes that show up in two or more of them.']),
      ]),
      el('p', {
        text: 'Exact match restricts results to the symbol you typed. With it off, a search for KIF also returns '
          + 'KIF1A, KIF5B and every other symbol containing those letters, which is how the original tool behaved.',
      }),

      el('h2', { text: 'Gene list analysis' }),
      el('p', {
        text: 'Load any NeurOmix list from the study picker or paste your own. Compare to NeurOmix ranks every '
          + 'other list by how many genes it shares with yours, and shows which of your genes are the most widely shared.',
      }),
      el('p', {
        text: 'The enrichment buttons pass your list to Enrichr and return the enriched terms for that library, '
          + 'with the strongest hits charted by combined score and shaded by adjusted p value.',
      }),

      el('h2', { text: 'Protein interactions' }),
      el('p', {
        text: 'The gene analysis panel queries STRING live. Its scores combine several lines of evidence '
          + '(experimental, co-expression, text mining) into a single likelihood between 0 and 1. Partners '
          + 'below 0.3 are not shown.',
      }),

      el('h2', { text: 'Downloads' }),
      el('div', { class: 'btn-row', style: 'margin-bottom:14px' }, [
        el('button', { class: 'btn btn-primary', type: 'button', onclick: downloadStudies }, ['Study metadata (CSV)']),
        el('button', { class: 'btn', type: 'button', onclick: downloadLong }, ['Full database, long format (CSV)']),
        el('a', { class: 'btn', href: '/data/neuromix.json', download: 'neuromix.json' }, ['Raw JSON']),
      ]),
      el('div', { class: 'callout' }, [
        'The long format export writes one row per ranked gene, which is ',
        el('strong', { text: fmt(s.geneEntries) }),
        ' rows. It is built in your browser and takes a moment.',
      ]),

      el('h2', { text: 'Citing the sources' }),
      el('p', {
        text: 'Every gene list belongs to its original publication. Follow the article link on any result and cite '
          + 'that paper, not this interface. Enrichment results come from Enrichr (maayanlab.cloud), interaction data '
          + 'from STRING, and gene summaries from NCBI Gene.',
      }),
    ]),
  ]))
}

export function onShow() {}

const tile = (label, value) => el('div', { class: 'stat' }, [
  el('div', { class: 'label', text: label }),
  el('div', { class: 'value', text: value }),
])

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
