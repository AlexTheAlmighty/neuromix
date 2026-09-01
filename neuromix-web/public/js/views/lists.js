// Gene List Analysis: load a NeurOmix list (or paste your own), compare it back
// against the database, and run Enrichr libraries over it.
import { store, parseGeneQuery, compareToDatabase, filterStudies } from '../store.js'
import { el, clear, fmt, pct, sci, DataTable, toast, debounce, copyText, hoverCard, hideHoverCard } from '../ui.js'
import { barChart } from '../charts.js'
import { on } from '../bus.js'
import { enrich } from '../api.js'
import { openStudy, studyLinkButton, articleLink, directionChip, slug } from './shared.js'

// Sizes come from Enrichr's own datasetStatistics endpoint, so the tooltips state what
// each library actually contains rather than a number copied from an old paper.
// "terms" is how many gene sets the library holds, "genes" its total coverage.
const LIBRARIES = [
  {
    group: 'Pathways',
    open: true,
    items: [
      ['KEGG pathways', 'KEGG_2026', 'Curated maps of metabolism, signalling and disease. The standard first look at which pathways a list belongs to, and small enough that the multiple testing burden stays light.', 352, 8110],
      ['Reactome pathways', 'Reactome_Pathways_2024', 'Expert curated pathways broken down to the level of individual reactions, so it resolves sub-steps that KEGG merges into one map.', 2105, 11671],
      ['WikiPathways', 'WikiPathways_2024_Human', 'Community curated pathways. Broader and more current than KEGG on niche and disease specific processes, at the cost of uneven curation depth.', 829, 8281],
      ['MSigDB hallmarks', 'MSigDB_Hallmark_2020', 'Fifty refined signatures, each summarising a well defined biological state. Only fifty tests, so a hit here survives correction easily. Best used as a coarse first pass.', 50, 4383],
      ['BioPlanet', 'BioPlanet_2019', 'NCATS BioPlanet, which merges overlapping pathways from several sources into one non-redundant set. Useful when KEGG and Reactome return the same result under different names.', 1510, 9813],
    ],
  },
  {
    group: 'Gene ontology',
    open: true,
    items: [
      ['GO biological process', 'GO_Biological_Process_2026', 'What the gene products do, from broad processes down to specific ones. The most widely reported enrichment analysis, and the largest of the three GO branches.', 5954, 15557],
      ['GO cellular component', 'GO_Cellular_Component_2026', 'Where the gene products are: organelles, membranes, complexes. Strong signal for lists that come from fractionation or localisation experiments.', 510, 12491],
      ['GO molecular function', 'GO_Molecular_Function_2026', 'What the gene products do biochemically: binding, catalysis, transport. Narrower and often more interpretable than biological process.', 1394, 12297],
      ['SynGO synapse function', 'SynGO_2024', 'Expert curated synapse biology, every annotation backed by published experimental evidence. Small and strict by design, so absence of a hit is weak evidence.', 134, 1555],
    ],
  },
  {
    group: 'Phenotype and disease',
    items: [
      ['DisGeNET', 'DisGeNET', 'Gene to disease associations pooled from curated repositories, GWAS catalogues, animal models and the literature. The broadest disease resource here.', 9828, 17464],
      ['GWAS catalog', 'GWAS_Catalog_2025', 'Genes mapped to traits by genome wide association studies. Tests whether your list overlaps common variant risk loci rather than expression changes.', 2369, 15030],
      ['Human Phenotype Ontology', 'Human_Phenotype_Ontology', 'Clinical features of hereditary disease, standardised. Covers only 3,096 genes, so it is specific but has narrow reach.', 1779, 3096],
      ['MGI mouse KO phenotypes', 'MGI_Mammalian_Phenotype_Level_4_2024', 'Observed phenotypes of knockout and transgenic mice. The best available read on what happens when a gene is removed in a whole animal.', 5003, 11625],
      ['ClinVar variants', 'ClinVar_2025', 'Genes carrying clinically interpreted variants. Skewed towards genes that get sequenced in the clinic, so a miss is not evidence of no role.', 609, 3481],
      ['Orphanet rare disease', 'Orphanet_Augmented_2021', 'Rare disease gene associations, extended by expression based prediction. Useful for neurodevelopmental and metabolic conditions under-covered elsewhere.', 3774, 17851],
      ['PhenGenI phenotypes', 'PhenGenI_Association_2021', 'NCBI Phenotype-Genotype Integrator: GWAS catalog merged with dbGaP, OMIM, eQTL and dbSNP.', 950, 20414],
      ['Jensen DISEASES', 'Jensen_DISEASES', 'Disease associations mined automatically from the literature. Wider than curated sets and noisier, so treat it as a hypothesis generator.', 1811, 15755],
      ['Huntington signatures', 'HDSigDB_Human_2021', 'The Huntington Disease Signature Database: expression signatures from HD models and patient tissue. Directly relevant given how much of NeurOmix is HD work.', 2564, 31158],
    ],
  },
  {
    group: 'Cell type and tissue',
    items: [
      ['Allen Brain Atlas', 'Allen_Brain_Atlas_10x_scRNA_2021', 'Single cell transcriptomes by brain cell type. The most directly relevant cell type resource for a neuroscience gene list.', 766, 12361],
      ['Azimuth cell types', 'Azimuth_2023', 'Reference single cell atlases across many human tissues. Fine grained labels, but only about nine marker genes per term, so it needs a focused list.', 1425, 3712],
      ['CellMarker', 'CellMarker_2024', 'Manually curated cell type markers from published single cell studies, covering human and mouse.', 1692, 12642],
      ['PanglaoDB markers', 'PanglaoDB_Augmented_2021', 'Cell type markers derived from single cell RNA-seq, extended by co-expression. Fewer, broader cell types than Azimuth.', 178, 6654],
      ['Descartes fetal atlas', 'Descartes_Cell_Types_and_Tissue_2021', 'Cell types of human fetal tissue. Useful when asking whether a list looks developmental.', 172, 9763],
      ['GTEx tissue expression', 'GTEx_Tissues_V8_2023', 'Bulk tissue expression across the body from around 1,000 donors. Tells you whether a list is brain enriched or ubiquitous.', 511, 8076],
      ['Jensen TISSUES', 'Jensen_TISSUES', 'Tissue expression assembled from literature mining, proteomics and expression data. Very wide coverage at 19,586 genes.', 1842, 19586],
    ],
  },
  {
    group: 'Transcription factors',
    items: [
      ['ChEA TF targets', 'ChEA_2022', 'Transcription factor targets from published ChIP experiments. Directly measured binding rather than motif prediction.', 757, 18365],
      ['ENCODE TF ChIP-seq', 'ENCODE_TF_ChIP-seq_2015', 'TF binding from the ENCODE project. Deep coverage per factor but concentrated in a handful of cell lines.', 816, 26382],
      ['TRRUST regulons', 'TRRUST_Transcription_Factors_2019', 'Small, manually curated TF to target relationships with the direction of regulation recorded. High precision, low recall.', 571, 3264],
      ['ARCHS4 TF co-expression', 'ARCHS4_TFs_Coexp', 'Transcription factors co-expressed with your genes across roughly 140,000 public RNA-seq samples. Correlation, not binding.', 1724, 25983],
      ['TF perturbation signatures', 'TF_Perturbations_Followed_by_Expression', 'What actually changes when a TF is knocked down or over-expressed. The functional counterpart to binding data.', 1958, 19741],
    ],
  },
  {
    group: 'Kinases and phosphorylation',
    items: [
      ['Kinase Library', 'The_Kinase_Library_2024', 'Atlas of serine, threonine and tyrosine kinase substrate specificity determined experimentally on peptide libraries.', 392, 9122],
      ['KEA kinase substrates', 'KEA_2015', 'Kinase to substrate relationships collected from the literature and phosphorylation databases.', 428, 3102],
      ['ARCHS4 kinase co-expression', 'ARCHS4_Kinases_Coexp', 'Kinases co-expressed with your list across public RNA-seq. Suggests which kinases operate in the same context.', 498, 19612],
      ['Kinase perturbation up', 'Kinase_Perturbations_from_GEO_up', 'Kinase perturbations that raise expression of your genes.', 285, 17660],
      ['Kinase perturbation down', 'Kinase_Perturbations_from_GEO_down', 'Kinase perturbations that lower expression of your genes.', 285, 17850],
    ],
  },
  {
    group: 'Protein complexes, domains and localisation',
    items: [
      ['CORUM complexes', 'CORUM', 'Manually curated mammalian protein complexes, each backed by experimental evidence. Only about five genes per complex, so hits are precise.', 1658, 2741],
      ['huMAP complexes', 'huMAP', 'Protein complexes inferred from large scale affinity purification mass spectrometry. Broader and less strict than CORUM.', 995, 2243],
      ['PPI hub proteins', 'PPI_Hub_Proteins', 'Highly connected proteins whose interaction partners are enriched in your list. A quick read on which hubs sit behind a gene set.', 385, 16399],
      ['Pfam and InterPro domains', 'Pfam_InterPro_Domains', 'Shared protein domains and families. Reveals structural themes that pathway analysis misses entirely.', 311, 7588],
      ['InterPro domains', 'InterPro_Domains_2019', 'A larger domain annotation set than the Pfam and InterPro combination, with wider gene coverage.', 1071, 12444],
      ['Subcellular location barcode', 'SubCell_BarCode', 'Subcellular localisation determined by fractionation proteomics across five cell lines.', 104, 12419],
      ['Jensen COMPARTMENTS', 'Jensen_COMPARTMENTS', 'Subcellular localisation assembled from curation, experiments and text mining. Much wider coverage than SubCell BarCode.', 2283, 18329],
    ],
  },
  {
    group: 'Expression, ageing and perturbation',
    items: [
      ['Gene perturbations up', 'Gene_Perturbations_from_GEO_up', 'Genetic perturbations, across roughly seven million samples, that increase expression of your genes.', 2460, 31132],
      ['Gene perturbations down', 'Gene_Perturbations_from_GEO_down', 'Genetic perturbations that decrease expression of your genes.', 2460, 30832],
      ['LINCS CRISPR knockout', 'LINCS_L1000_CRISPR_KO_Consensus_Sigs', 'Consensus expression signatures from CRISPR knockouts in the LINCS L1000 collection.', 10424, 9440],
      ['Ageing signatures up', 'Aging_Perturbations_from_GEO_up', 'Genes that go up with age across published ageing comparisons.', 286, 15309],
      ['Ageing signatures down', 'Aging_Perturbations_from_GEO_down', 'Genes that go down with age. Worth pairing with the up set, since a one sided hit is easy to over-read.', 286, 16129],
      ['GTEx ageing signatures', 'GTEx_Aging_Signatures_2021', 'Age associated expression changes measured tissue by tissue in GTEx donors.', 270, 11980],
    ],
  },
  {
    group: 'Drugs and compounds',
    items: [
      ['Drug atlas proteomics', 'Proteomics_Drug_Atlas_2023', 'Proteome wide changes caused by 875 compounds. Measures protein rather than transcript, unlike everything else in this group.', 1748, 8220],
      ['LINCS drug up', 'LINCS_L1000_Chem_Pert_up', 'Small molecules that raise expression of your genes. The largest library here by far, so expect a heavy correction.', 33132, 9559],
      ['LINCS drug down', 'LINCS_L1000_Chem_Pert_down', 'Small molecules that lower expression of your genes.', 33132, 9448],
      ['LINCS consensus signatures', 'LINCS_L1000_Chem_Pert_Consensus_Sigs', 'One consensus signature per compound rather than one per experiment, which cuts the number of tests roughly threefold.', 10850, 9525],
      ['GEO drug up', 'Drug_Perturbations_from_GEO_up', 'Drug treatments in public GEO data that raise expression of your genes.', 906, 24350],
      ['GEO drug down', 'Drug_Perturbations_from_GEO_down', 'Drug treatments that lower expression of your genes.', 906, 23877],
      ['DSigDB drug signatures', 'DSigDB', 'Drug to gene relationships combining approved drug targets, kinase inhibitor profiles and perturbation data.', 4026, 19513],
      ['DGIdb drug targets', 'DGIdb_Drug_Targets_2024', 'Which of your genes are druggable, from the Drug Gene Interaction Database. Targets rather than expression responses.', 659, 2513],
    ],
  },
  {
    group: 'microRNA',
    items: [
      ['TargetScan predictions', 'TargetScan_microRNA_2017', 'Predicted microRNA targets from conserved seed sequence matching. Prediction, so expect false positives.', 683, 17598],
      ['miRTarBase validated', 'miRTarBase_2017', 'Experimentally validated microRNA to target interactions, each supported by a published assay.', 3240, 14893],
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
      ...LIBRARIES.map((group) => el('details', { class: 'tool-group', open: Boolean(group.open) }, [
        el('summary', {}, [
          el('h3', { text: group.group }),
          el('span', { class: 'tool-count', text: group.items.length }),
        ]),
        el('div', { class: 'tool-grid' }, group.items.map(([label, library, blurb, terms, genes]) => {
          const button = el('button', {
            class: 'tool', type: 'button', dataset: { library },
            'aria-pressed': 'false',
            onclick: (e) => runEnrichment(label, library, e.currentTarget),
          }, [label])
          hoverCard(button, (host) => {
            host.append(
              el('div', { class: 'hc-title', text: label }),
              el('div', { class: 'hc-id', text: library }),
              el('p', { class: 'hc-body', text: blurb }),
              el('div', { class: 'hc-stats' }, [
                el('span', {}, [el('b', { text: fmt(terms) }), ' gene sets']),
                el('span', {}, [el('b', { text: fmt(genes) }), ' genes covered']),
                el('span', {}, [el('b', { text: Math.round(genes / terms) }), ' genes per set on average']),
              ]),
            )
          })
          return button
        })),
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

  const { rows, topGenes, queried, unmatched, significantCount, threshold } = compareToDatabase(genes)
  clear(results)

  results.append(el('div', { class: 'stats' }, [
    stat('Genes queried', fmt(queried), `${fmt(queried - unmatched.length)} known to NeurOmix`),
    stat('Matching gene lists', fmt(rows.length), 'sharing 2 or more genes'),
    stat('Statistically significant', fmt(significantCount), `of ${fmt(rows.length)} after correction`),
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
        render: (r) => el('details', { class: 'genes-toggle' }, [
          el('summary', { text: `${fmt(r.shared.length)} gene${r.shared.length === 1 ? '' : 's'}` }),
          el('span', { class: 'genes-inline', text: r.shared.join(', ') }),
        ]),
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
  hideHoverCard()

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
