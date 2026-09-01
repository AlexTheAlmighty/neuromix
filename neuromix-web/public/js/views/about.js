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
          + 'number of physical and genetic experiments and the number of distinct publications supporting '
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
