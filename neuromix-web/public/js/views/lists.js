// Gene List Analysis: load a NeurOmix list (or paste your own), compare it back
// against the database, and run Enrichr libraries over it.
import { store, parseGeneQuery, compareToDatabase, filterStudies } from '../store.js'
import { el, clear, fmt, pct, sci, DataTable, toast, debounce, copyText } from '../ui.js'
import { barChart } from '../charts.js'
import { on } from '../bus.js'
import { enrich } from '../api.js'
import { openStudy, studyLinkButton, articleLink, directionChip, slug } from './shared.js'

const LIBRARIES = [
  {
    group: 'Gene ontology', items: [
      ['GO Biological Process', 'GO_Biological_Process_2023', 'Curated annotations linking genes to biological processes.'],
      ['GO Cellular Component', 'GO_Cellular_Component_2023', 'Curated annotations linking genes to cellular components.'],
      ['GO Molecular Function', 'GO_Molecular_Function_2023', 'Curated annotations linking genes to molecular functions.'],
      ['SynGO function', 'SynGO_2024', 'Expert curated resource for synapse function and gene enrichment.'],
    ],
  },
  {
    group: 'Phenotype and disease', items: [
      ['MGI mouse KO phenotypes', 'MGI_Mammalian_Phenotype_Level_4_2021', 'Transgenic mouse phenotypes: 15,572 genes, 10,295 phenotypes.'],
      ['Human Phenotype Ontology', 'Human_Phenotype_Ontology', 'Over 13,000 terms and 156,000 annotations to hereditary disease.'],
      ['PhenGenI phenotypes', 'PhenGenI_Association_2021', 'GWAS catalog merged with dbGaP, OMIM, eQTL and dbSNP.'],
      ['DisGeNET gene to disease', 'DisGeNET', 'Gene to disease associations from curated repositories and GWAS.'],
    ],
  },
  {
    group: 'Protein function', items: [
      ['Subcellular location barcode', 'SubCell_BarCode', 'Subcellular location of 12,418 genes across five cell types.'],
      ['Pfam domains', 'Pfam_InterPro_Domains', 'Protein domain prediction from the InterPro database.'],
      ['CORUM protein complexes', 'CORUM', 'Manually curated mammalian protein complexes.'],
      ['miRNA targets', 'TargetScan_microRNA', 'Predicted and validated microRNA target interactions.'],
    ],
  },
  {
    group: 'Expression', items: [
      ['GTEx tissue expression', 'GTEx_Tissues_V8_2023', 'Tissue expression from 1,000 individuals across 17,000 samples.'],
      ['Allen Brain Atlas', 'Allen_Brain_Atlas_10x_scRNA_2021', 'Single cell transcriptomics by brain cell type.'],
      ['ChEA TF targets', 'ChEA_2022', 'Transcription factor binding profiles: 757 TFs, 917,047 associations.'],
      ['Gene perturbations up', 'Gene_Perturbations_from_GEO_up', 'Genetic perturbations that increase expression of the list.'],
      ['Gene perturbations down', 'Gene_Perturbations_from_GEO_down', 'Genetic perturbations that decrease expression of the list.'],
      ['LINCS CRISPR KO', 'LINCS_L1000_CRISPR_KO_Consensus_Sigs', 'Expression signatures from 7,500 CRISPR knockout experiments.'],
    ],
  },
  {
    group: 'Drugs', items: [
      ['Drug atlas', 'Proteomics_Drug_Atlas_2023', 'Proteome wide expression changes from 875 compounds.'],
      ['GEO drug up', 'Drug_Perturbations_from_GEO_up', 'Drugs associated with increased expression of the list.'],
      ['GEO drug down', 'Drug_Perturbations_from_GEO_down', 'Drugs associated with decreased expression of the list.'],
      ['LINCS drug up', 'LINCS_L1000_Chem_Pert_up', 'Small molecules that increase expression, 33,600 compounds.'],
      ['LINCS drug down', 'LINCS_L1000_Chem_Pert_down', 'Small molecules that decrease expression, 33,600 compounds.'],
    ],
  },
  {
    group: 'Kinases', items: [
      ['ARCHS4 kinase co-expression', 'ARCHS4_Kinases_Coexp', 'Kinases co-expressed with the list across 140,000 samples.'],
      ['Kinase Library', 'The_Kinase_Library_2023', 'Serine/threonine kinase target atlas: 303 kinases, 30,300 associations.'],
    ],
  },
]

let keywordInput
let studyPicker
let studyPreview
let textarea
let countLabel
let results
let mounted = false
let activeTool = null
let visibleStudies = []

export function mount(root) {
  if (mounted) return
  mounted = true

  keywordInput = el('input', { type: 'search', id: 'list-keyword', placeholder: 'e.g. microglia, tau, CRISPR' })
  studyPicker = el('div', {
    class: 'study-picker', id: 'list-study', role: 'listbox', tabindex: '0',
    'aria-label': 'Choose a study to load its gene list',
  })
  // The preview lives on the body so it is never clipped by the panel around it.
  studyPreview = el('div', { class: 'study-preview', hidden: true })
  document.body.append(studyPreview)
  textarea = el('textarea', { id: 'list-genes', placeholder: 'PSEN1, APP, MAPT, SNCA', rows: 6, spellcheck: 'false' })
  countLabel = el('span', { class: 'hint' })

  keywordInput.addEventListener('input', debounce(() => populateStudies(keywordInput.value), 180))
  studyPicker.addEventListener('mouseleave', hidePreview)
  studyPicker.addEventListener('keydown', onPickerKey)
  window.addEventListener('scroll', hidePreview, { passive: true })
  textarea.addEventListener('input', updateCount)

  const controls = el('div', { class: 'panel sticky-side' }, [
    el('div', { class: 'panel-body' }, [
      el('div', { class: 'section-title' }, [el('h2', { text: 'Build a gene list' })]),
      el('label', { class: 'field', for: 'list-keyword' }, [
        el('span', { text: 'Filter studies by keyword' }), keywordInput,
      ]),
      el('div', { class: 'field' }, [
        el('span', { class: 'field-label', text: 'Pick a study to load its ranked list' }),
        studyPicker,
        el('span', { class: 'hint', style: 'display:block; margin-top:5px' }, [
          'Hover or arrow through a study to read its full description.',
        ]),
      ]),
      el('label', { class: 'field', for: 'list-genes' }, [
        el('span', { text: 'Gene list (comma or space separated)' }), textarea,
      ]),
      el('div', { class: 'btn-row', style: 'margin-bottom:12px' }, [
        countLabel,
        el('button', {
          class: 'btn btn-sm btn-ghost', type: 'button', style: 'margin-left:auto',
          onclick: () => copyText(parseGeneQuery(textarea.value).join(', '), 'Gene list copied'),
        }, ['Copy']),
        el('button', {
          class: 'btn btn-sm btn-ghost', type: 'button',
          onclick: () => { textarea.value = ''; updateCount() },
        }, ['Clear']),
      ]),
      el('button', {
        class: 'btn btn-primary', type: 'button', style: 'width:100%',
        onclick: () => runComparison(),
      }, ['Compare to NeurOmix database']),
      el('hr', { class: 'divider' }),
      el('div', { class: 'section-title' }, [
        el('h2', { text: 'Enrichment analysis' }),
        el('span', { class: 'hint', text: 'via Enrichr' }),
      ]),
      ...LIBRARIES.map((group) => el('div', { class: 'tool-group' }, [
        el('h3', { text: group.group }),
        el('div', { class: 'tool-grid' }, group.items.map(([label, library, hint]) => el('button', {
          class: 'tool', type: 'button', title: hint, dataset: { library },
          'aria-pressed': 'false',
          onclick: (e) => runEnrichment(label, library, e.currentTarget),
        }, [label]))),
      ])),
    ]),
  ])

  results = el('div')
  root.append(el('div', { class: 'layout' }, [controls, results]))

  populateStudies('')
  updateCount()
  showEmptyState()

  on('analyse-list', ({ study }) => {
    textarea.value = study.genes.join(', ')
    updateCount()
    location.hash = '#/lists'
    runComparison()
  })
}

export function onShow() {}

function updateCount() {
  const genes = parseGeneQuery(textarea.value)
  const known = genes.filter((g) => store.geneIndex.has(g)).length
  countLabel.textContent = genes.length
    ? `${fmt(genes.length)} genes, ${fmt(known)} known to NeurOmix`
    : 'No genes entered yet'
}

function populateStudies(keyword) {
  visibleStudies = filterStudies({ text: keyword }).slice(0, 400)
  clear(studyPicker)
  hidePreview()

  if (!visibleStudies.length) {
    studyPicker.append(el('p', { class: 'hint', style: 'padding:10px', text: 'No studies match that keyword.' }))
    return
  }

  visibleStudies.forEach((study, i) => {
    const row = el('button', {
      class: 'study-option',
      type: 'button',
      role: 'option',
      'aria-selected': 'false',
      dataset: { index: i },
      onclick: () => selectStudy(study, row),
      onmouseenter: () => showPreview(study, row),
      onfocus: () => showPreview(study, row),
    }, [
      el('span', { class: 'so-desc', text: study.description }),
      el('span', { class: 'so-meta' }, [
        study.year && el('span', { text: study.year }),
        study.journal && el('span', { text: study.journal }),
        el('span', { text: `${fmt(study.size)} genes` }),
        study.direction && el('span', {
          class: study.direction === 'up' ? 'so-up' : 'so-down',
          text: study.direction === 'up' ? 'up' : 'down',
        }),
      ]),
    ])
    studyPicker.append(row)
  })
}

function selectStudy(study, row) {
  for (const other of studyPicker.querySelectorAll('.study-option')) {
    other.setAttribute('aria-selected', String(other === row))
  }
  textarea.value = study.genes.join(', ')
  updateCount()
  toast(`Loaded ${fmt(study.size)} genes from the selected list`)
}

function showPreview(study, row) {
  clear(studyPreview)
  studyPreview.append(
    el('div', { class: 'sp-title', text: study.title }),
    el('div', { class: 'btn-row', style: 'margin-bottom:8px' }, [
      study.journal && el('span', { class: 'chip chip-plain', text: `${study.journal}${study.year ? `, ${study.year}` : ''}` }),
      study.assay && el('span', { class: 'chip chip-plain', text: study.assay }),
      study.direction && el('span', {
        class: `chip chip-${study.direction}`,
        text: study.direction === 'up' ? 'Upregulated' : 'Downregulated',
      }),
    ]),
    el('p', { class: 'sp-desc', text: study.description }),
    el('div', { class: 'sp-meta' }, [
      study.tissue && el('div', {}, [el('b', { text: 'Tissue: ' }), study.tissue]),
      study.method && el('div', {}, [el('b', { text: 'Method: ' }), study.method]),
      study.rankStat && el('div', {}, [el('b', { text: 'Ranked by: ' }), study.rankStat.toLowerCase()]),
      el('div', {}, [el('b', { text: 'List size: ' }), `${fmt(study.size)} genes`,
        study.truncated ? ' (looks like a published top-N cut off)' : '']),
    ]),
  )

  studyPreview.hidden = false
  position(row)
}

// Sit to the right of the picker where there is room, otherwise below the row.
function position(row) {
  const rowBox = row.getBoundingClientRect()
  const pickBox = studyPicker.getBoundingClientRect()
  const width = Math.min(430, window.innerWidth - 24)
  studyPreview.style.width = `${width}px`

  let left = pickBox.right + 14
  let top = rowBox.top
  if (left + width > window.innerWidth - 12) {
    left = Math.max(12, Math.min(pickBox.left, window.innerWidth - width - 12))
    top = rowBox.bottom + 8
  }
  // Clamp at both ends so the panel cannot escape the viewport when the row it is
  // anchored to has been scrolled past.
  const height = studyPreview.offsetHeight
  top = Math.max(12, Math.min(top, window.innerHeight - height - 12))

  studyPreview.style.left = `${left}px`
  studyPreview.style.top = `${top}px`
}

function hidePreview() {
  if (studyPreview) studyPreview.hidden = true
}

function onPickerKey(e) {
  const rows = [...studyPicker.querySelectorAll('.study-option')]
  if (!rows.length) return
  const active = document.activeElement.closest?.('.study-option')
  const at = active ? rows.indexOf(active) : -1

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at <= 0 ? 0 : at - 1)
    rows[next].focus()
    rows[next].scrollIntoView({ block: 'nearest' })
  } else if ((e.key === 'Enter' || e.key === ' ') && active) {
    e.preventDefault()
    active.click()
  } else if (e.key === 'Escape') {
    hidePreview()
  }
}

function showEmptyState() {
  clear(results)
  results.append(el('div', { class: 'empty' }, [
    el('h3', { text: 'Analyse any gene list' }),
    el('p', { text: 'Load one of the 1,037 NeurOmix lists from the panel on the left, or paste your own list of symbols.' }),
    el('ul', { class: 'prose' }, [
      el('li', { text: 'Compare to NeurOmix ranks every other gene list by how many genes it shares with yours.' }),
      el('li', { text: 'The enrichment buttons send the list to Enrichr and return the enriched terms with a chart of the strongest hits.' }),
    ]),
    el('div', { class: 'btn-row', style: 'margin-top:12px' }, [
      el('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          textarea.value = 'ATG101, ATG12, ATG13, ATG14, ATG16L1, ATG2A, ATG5, ATP13A2, ATP6V0A1, MAP1LC3B, SQSTM1, ULK1, WIPI2'
          updateCount()
          runComparison()
        },
      }, ['Try an autophagy gene list']),
    ]),
  ]))
}

const stat = (label, value, sub) => el('div', { class: 'stat' }, [
  el('div', { class: 'label', text: label }),
  el('div', { class: `value${String(value).length > 9 ? ' sm' : ''}`, text: value }),
  sub && el('div', { class: 'sub', text: sub }),
])

function readGenes() {
  const genes = parseGeneQuery(textarea.value)
  if (genes.length < 2) {
    toast('Enter at least two genes to analyse', { error: true })
    textarea.focus()
    return null
  }
  return genes
}

function runComparison() {
  const genes = readGenes()
  if (!genes) return
  clearActiveTool()

  const { rows, topGenes, queried, matchedGenes, unmatched, significantCount, threshold } = compareToDatabase(genes)
  clear(results)

  results.append(el('div', { class: 'stats' }, [
    stat('Genes queried', fmt(queried), `${fmt(queried - unmatched.length)} known to NeurOmix`),
    stat('Matching gene lists', fmt(rows.length), 'sharing 2 or more genes'),
    stat('Statistically significant', fmt(significantCount), `of ${fmt(rows.length)} after correction`),
    stat('Genes with a match', fmt(matchedGenes), pct(matchedGenes / queried, 0) + ' of the list'),
    stat('Best overlap', rows.length ? `${fmt(rows[0].count)} genes` : 'none', rows.length ? pct(rows[0].coverage, 0) + ' of your list' : ''),
  ]))

  if (rows.length) {
    results.append(el('div', { class: 'callout', style: 'margin-bottom:14px' }, [
      `Two long lists share genes by chance alone. Of the ${fmt(rows.length)} lists sharing at least two genes with `,
      `yours, ${fmt(significantCount)} overlap more than chance predicts (p below ${sci(threshold)}, `,
      'Bonferroni corrected). Use the toggle above the table to hide the rest.',
    ]))
  }

  if (!rows.length) {
    results.append(el('div', { class: 'empty' }, [
      el('h3', { text: 'No gene list shares two or more genes with this list' }),
      el('p', { text: 'Try a longer list, or check that the symbols are current HGNC names.' }),
    ]))
    return
  }

  const chartRows = topGenes.slice(0, 20).map((g) => ({
    label: g.gene,
    value: g.lists,
    tooltip: [['Gene lists containing it', fmt(g.lists)]],
  }))
  results.append(el('div', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', { text: 'Most widely shared genes' }),
      el('p', { text: `How many NeurOmix gene lists each of your genes turns up in, across the ${fmt(rows.length)} matching lists.` }),
    ]),
    el('div', { class: 'panel-body' }, [barChart({
      rows: chartRows,
      valueLabel: 'Gene lists',
      format: (v) => fmt(Math.round(v)),
      labelWidth: 150,
    })]),
  ]))

  const onlySignificant = el('input', { type: 'checkbox', id: 'sig-only' })
  const sigToggle = el('label', { class: 'check', style: 'margin:0', for: 'sig-only' }, [
    onlySignificant, 'Significant only',
  ])
  onlySignificant.addEventListener('change', () => {
    table.setRows(onlySignificant.checked ? rows.filter((r) => r.significant) : rows)
  })

  const table = new DataTable({
    rows,
    exportName: 'neuromix_list_comparison',
    searchPlaceholder: 'Filter matching studies',
    searchText: (r) => `${r.study.description} ${r.study.title} ${r.study.journal} ${r.shared.join(' ')}`,
    rowClass: (r) => (r.study.direction ? `dir-${r.study.direction}` : ''),
    caption: `<strong>${fmt(rows.length)} gene lists</strong> share at least two genes with your list.`,
    toolbarExtra: sigToggle,
    initialSort: { key: 'pValue', dir: 'asc' },
    columns: [
      {
        key: 'article', label: 'Article', className: 'link-cell', sortValue: (r) => r.study.title,
        render: (r) => articleLink(r.study), csv: (r) => r.study.title,
      },
      {
        key: 'experiment', label: 'Experiment', className: 'desc-cell', sortValue: (r) => r.study.description,
        render: (r) => el('div', {}, [
          studyLinkButton(r.study, { onOpen: (study) => openStudy(study, { highlight: new Set(genes) }) }),
          el('div', { style: 'margin-top:5px' }, [directionChip(r.study)]),
        ]),
        csv: (r) => r.study.description,
      },
      {
        key: 'count', label: 'Shared', className: 'num', sortValue: (r) => r.count,
        render: (r) => fmt(r.count), csv: (r) => r.count,
      },
      {
        key: 'coverage', label: 'Of your list', className: 'num', sortValue: (r) => r.coverage,
        render: (r) => pct(r.coverage, 0), csv: (r) => (r.coverage * 100).toFixed(1),
      },
      {
        key: 'pValue', label: 'P value', className: 'num', sortValue: (r) => r.pValue,
        render: (r) => el('span', {}, [
          sci(r.pValue),
          r.significant ? el('span', { class: 'chip chip-up', style: 'margin-left:6px', text: 'sig' }) : null,
        ]),
        csv: (r) => r.pValue,
      },
      {
        key: 'shared', label: 'Shared genes', sortable: false,
        render: (r) => el('span', { class: 'genes-inline', text: r.shared.join(', ') }),
        csv: (r) => r.shared.join(' '),
      },
    ],
  })
  results.append(table.node)

  if (unmatched.length) {
    results.append(el('div', { class: 'panel' }, [
      el('div', { class: 'panel-body' }, [
        el('p', { class: 'hint', style: 'margin:0' }, [
          `${fmt(unmatched.length)} symbols are not in NeurOmix at all: `,
          el('span', { class: 'genes-inline', text: unmatched.slice(0, 60).join(', ') + (unmatched.length > 60 ? ' …' : '') }),
        ]),
      ]),
    ]))
  }
}

function clearActiveTool() {
  activeTool?.setAttribute('aria-pressed', 'false')
  activeTool = null
}

async function runEnrichment(label, library, button) {
  const genes = readGenes()
  if (!genes) return

  clearActiveTool()
  activeTool = button
  button.setAttribute('aria-pressed', 'true')

  clear(results)
  results.append(el('div', { class: 'panel' }, [
    el('div', { class: 'loading-row' }, [
      el('div', { class: 'spinner' }),
      el('span', { text: `Running ${label} on ${fmt(genes.length)} genes` }),
    ]),
  ]))

  try {
    const body = await enrich({ genes, library })
    renderEnrichment(label, library, body, genes)
  } catch (err) {
    clear(results)
    results.append(el('div', { class: 'empty' }, [
      el('h3', { text: 'Enrichment could not be run' }),
      el('p', { text: err.message }),
      el('p', { class: 'hint', text: 'Enrichr is queried live from your browser, so this needs an internet connection.' }),
    ]))
    toast(err.message, { error: true })
  }
}

function renderEnrichment(label, library, body, genes) {
  clear(results)
  const rows = body.rows ?? []
  if (!rows.length) {
    results.append(el('div', { class: 'empty' }, [
      el('h3', { text: `No enriched terms in ${label}` }),
      el('p', { text: 'Enrichr returned no terms for this gene list in that library.' }),
    ]))
    return
  }

  const significant = rows.filter((r) => r.adjP < 0.05).length
  results.append(el('div', { class: 'stats' }, [
    stat('Library', label),
    stat('Terms returned', fmt(rows.length)),
    stat('Significant terms', fmt(significant), 'adjusted p below 0.05'),
    stat('Top term', rows[0].term.length > 24 ? `${rows[0].term.slice(0, 23)}…` : rows[0].term, `adj p ${sci(rows[0].adjP)}`),
  ]))

  const top = [...rows].sort((a, b) => b.score - a.score).slice(0, 8)
  results.append(el('div', { class: 'panel' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', { text: `Top terms by combined score` }),
      el('p', { text: `${label}. Darker bars have a smaller adjusted p value.` }),
    ]),
    el('div', { class: 'panel-body' }, [barChart({
      rows: top.map((r) => ({
        label: r.term,
        value: r.score,
        fillValue: -Math.log10(Math.max(r.adjP, 1e-300)),
        tooltip: [
          ['Combined score', r.score.toFixed(1)],
          ['Adjusted p', sci(r.adjP)],
          ['Overlapping genes', r.genes.join(', ')],
        ],
      })),
      valueLabel: 'Combined score',
      format: (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v).toLocaleString('en-US')),
      labelWidth: 220,
      fillLegend: { low: 'weaker', high: 'stronger' },
      caption: 'Bar length is the Enrichr combined score. Full statistics are in the table below.',
    })]),
  ]))

  const table = new DataTable({
    rows,
    exportName: `neuromix_${slug(library)}`,
    searchPlaceholder: 'Filter terms',
    searchText: (r) => `${r.term} ${r.genes.join(' ')}`,
    caption: `<strong>${fmt(rows.length)} terms</strong> from ${label} for ${fmt(body.listSize ?? genes.length)} genes.`,
    initialSort: { key: 'p', dir: 'asc' },
    columns: [
      { key: 'term', label: 'Term', className: 'desc-cell', sortValue: (r) => r.term, render: (r) => r.term, csv: (r) => r.term },
      { key: 'p', label: 'P value', className: 'num', sortValue: (r) => r.p, render: (r) => sci(r.p), csv: (r) => r.p },
      { key: 'adjP', label: 'Adjusted p', className: 'num', sortValue: (r) => r.adjP, render: (r) => sci(r.adjP), csv: (r) => r.adjP },
      { key: 'score', label: 'Combined score', className: 'num', sortValue: (r) => r.score, render: (r) => r.score.toFixed(1), csv: (r) => r.score },
      {
        key: 'overlap', label: 'Overlap', className: 'num', sortValue: (r) => r.genes.length,
        render: (r) => fmt(r.genes.length), csv: (r) => r.genes.length,
      },
      {
        key: 'genes', label: 'Overlapping genes', sortable: false,
        render: (r) => el('span', { class: 'genes-inline', text: r.genes.join(', ') }),
        csv: (r) => r.genes.join(' '),
      },
    ],
  })
  results.append(table.node)

  if (body.shortId) {
    results.append(el('p', { class: 'hint', style: 'margin-top:10px' }, [
      'Full Enrichr report: ',
      el('a', { href: `https://maayanlab.cloud/Enrichr/enrich?dataset=${body.shortId}`, target: '_blank', rel: 'noopener noreferrer', text: 'open on maayanlab.cloud' }),
    ]))
  }
}
