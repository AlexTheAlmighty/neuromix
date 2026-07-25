// Study browser: every gene list in the database, with facets, plus the three set
// level analyses (consensus, convergence, set versus set) built from whatever the
// filters leave behind.
import {
  store, filterStudies, consensusSignature, evidenceConvergence, compareSets,
  backgroundFor, BACKGROUNDS, countArticles,
} from '../store.js'
import { el, clear, fmt, pct, sci, truncate, DataTable, debounce, downloadCsv, toast } from '../ui.js'
import { barChart } from '../charts.js'
import { emit } from '../bus.js'
import { openStudy, studyLinkButton, articleLink, directionChip } from './shared.js'

let table
let statsRow
let panelHost
let controls = {}
let current = []
let pinned = null
let pinnedLabel = ''
let mounted = false

export function mount(root) {
  if (mounted) return
  mounted = true

  const search = el('input', {
    type: 'search', id: 'study-search', placeholder: 'microglia tau proteomics', 'aria-label': 'Search studies',
  })
  const topic = selectFrom('study-topic', 'All topics', store.facets.topics)
  const assay = selectFrom('study-assay', 'All assay types', store.facets.assays)
  const species = selectFrom('study-species', 'All species', store.facets.species)
  const journal = selectFrom('study-journal', 'All journals', store.facets.journals)
  const method = selectFrom('study-method', 'All methods', store.facets.methods)
  const year = selectFrom('study-year', 'All years', store.facets.years)
  const direction = el('select', { id: 'study-direction', 'aria-label': 'Direction' }, [
    el('option', { value: '', text: 'Any direction' }),
    el('option', { value: 'up', text: 'Upregulated' }),
    el('option', { value: 'down', text: 'Downregulated' }),
  ])
  controls = { search, topic, assay, species, journal, method, year, direction }

  const perArticle = el('input', { type: 'checkbox', id: 'per-article', checked: true })
  const background = el('select', { id: 'bg-select', 'aria-label': 'Background for specificity' },
    BACKGROUNDS.map((b) => el('option', { value: b.id, text: b.label })))
  controls.perArticle = perArticle
  controls.background = background

  const apply = () => refresh()
  search.addEventListener('input', debounce(apply, 200))
  for (const node of [topic, assay, species, journal, method, year, direction]) {
    node.addEventListener('change', apply)
  }

  const filterBar = el('div', { class: 'panel', style: 'margin-bottom:18px' }, [
    el('div', { class: 'panel-body' }, [
      el('div', { class: 'section-title' }, [
        el('h2', { text: 'Browse every gene list' }),
        el('span', { class: 'hint', text: `${fmt(store.stats.lists)} lists from ${fmt(store.stats.articles)} articles` }),
      ]),
      el('div', { class: 'hero-search' }, [
        search, topic, assay, species, journal, method, year, direction,
        el('button', {
          class: 'btn btn-ghost', type: 'button',
          onclick: () => {
            for (const key of ['search', 'topic', 'assay', 'species', 'journal', 'method', 'year', 'direction']) {
              controls[key].value = ''
            }
            refresh()
          },
        }, ['Reset']),
      ]),
      el('hr', { class: 'divider' }),
      el('div', { class: 'analysis-bar' }, [
        el('div', { class: 'btn-row' }, [
          el('button', { class: 'btn btn-primary', type: 'button', id: 'build-consensus', onclick: buildConsensus },
            ['Consensus signature']),
          el('button', { class: 'btn', type: 'button', onclick: buildConvergence }, ['Evidence convergence']),
          el('button', { class: 'btn', type: 'button', id: 'pin-set', onclick: pinSet }, ['Pin as set A']),
          el('button', { class: 'btn', type: 'button', id: 'compare-set', disabled: true, onclick: compareToPinned },
            ['Compare to set A']),
        ]),
        el('div', { class: 'analysis-opts' }, [
          el('label', { class: 'check', style: 'margin:0', for: 'per-article' }, [
            perArticle, 'One vote per article',
          ]),
          el('label', { class: 'inline-field', for: 'bg-select' }, [
            el('span', { text: 'Compare against' }), background,
          ]),
        ]),
      ]),
      el('p', { class: 'hint', style: 'margin:8px 0 0' }, [
        'One vote per article stops a single paper that contributed many lists from dominating the result. '
        + 'The background decides what "unusually common" is measured against.',
      ]),
    ]),
  ])

  statsRow = el('div', { class: 'stats' })
  panelHost = el('div')
  const host = el('div')
  root.append(filterBar, statsRow, panelHost, host)

  table = new DataTable({
    rows: [],
    exportName: 'neuromix_studies',
    searchable: false,
    pageSize: 25,
    initialSort: { key: 'size', dir: 'desc' },
    columns: [
      {
        key: 'article', label: 'Article', className: 'link-cell', sortValue: (s) => s.title,
        render: (s) => el('div', {}, [
          articleLink(s),
          el('div', { class: 'hint', style: 'margin-top:3px', text: `${s.journal}${s.year ? `, ${s.year}` : ''}` }),
        ]),
        csv: (s) => s.title,
      },
      {
        key: 'description', label: 'Experiment', className: 'desc-cell', sortValue: (s) => s.description,
        render: (s) => el('div', {}, [
          studyLinkButton(s),
          el('div', { class: 'btn-row', style: 'margin-top:6px' }, [
            directionChip(s),
            s.assay && el('span', { class: 'chip chip-plain', text: s.assay }),
            s.species && el('span', { class: 'chip chip-plain', text: s.species }),
            s.truncated && el('span', {
              class: 'chip chip-plain',
              title: 'This list looks like a published top-N cut off, so a gene missing from it may simply have ranked below the cut off.',
              text: 'top-N cut off',
            }),
          ]),
        ]),
        csv: (s) => s.description,
      },
      {
        key: 'tissue', label: 'Tissue', sortValue: (s) => s.tissue,
        render: (s) => truncate(s.tissue, 40) || 'Not recorded', csv: (s) => s.tissue,
      },
      { key: 'size', label: 'Genes', className: 'num', sortValue: (s) => s.size, render: (s) => fmt(s.size), csv: (s) => s.size },
      {
        key: 'actions', label: '', sortable: false, csv: false,
        render: (s) => el('div', { class: 'btn-row' }, [
          el('button', { class: 'btn btn-sm', type: 'button', onclick: () => openStudy(s) }, ['Details']),
          el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => emit('analyse-list', { study: s }) }, ['Analyse']),
        ]),
      },
    ],
  })
  host.append(table.node)
  refresh()
}

export function onShow() {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  for (const [key, node] of [['topic', controls.topic], ['assay', controls.assay], ['species', controls.species]]) {
    const value = params.get(key)
    if (value && node.value !== value && [...node.options].some((o) => o.value === value)) {
      node.value = value
      refresh()
    }
  }
}

function selectFrom(id, allLabel, entries) {
  return el('select', { id, 'aria-label': allLabel }, [
    el('option', { value: '', text: allLabel }),
    ...entries.map(([value, count]) => el('option', { value, text: `${value} (${count})` })),
  ])
}

function refresh() {
  current = filterStudies({
    text: controls.search.value,
    topic: controls.topic.value,
    assay: controls.assay.value,
    species: controls.species.value,
    journal: controls.journal.value,
    method: controls.method.value,
    year: controls.year.value,
    direction: controls.direction.value,
  })
  const articles = countArticles(current)
  const genes = current.reduce((n, s) => n + s.size, 0)
  const truncated = current.filter((s) => s.truncated).length

  clear(statsRow)
  statsRow.append(
    statTile('Gene lists shown', fmt(current.length)),
    statTile('Articles', fmt(articles), current.length ? `${(current.length / articles).toFixed(1)} lists per article` : ''),
    statTile('Ranked gene entries', fmt(genes)),
    statTile('Likely top-N cut offs', fmt(truncated), current.length ? pct(truncated / current.length, 0) + ' of the set' : ''),
  )
  clear(panelHost)
  table.setRows(current)
}

const options = () => ({
  perArticle: controls.perArticle.checked,
  background: backgroundFor(controls.background.value, current, { perArticle: controls.perArticle.checked }),
})

function guard(min = 3) {
  if (current.length < min) {
    clear(panelHost)
    panelHost.append(el('div', { class: 'callout', style: 'margin-bottom:18px' }, [
      `Filter down to at least ${min} gene lists first. A set analysis needs something to compare.`,
    ]))
    return false
  }
  return true
}

/* ---------- consensus ---------- */

function buildConsensus() {
  if (!guard()) return
  clear(panelHost)
  const { perArticle, background } = options()
  const result = consensusSignature(current, { limit: 40, perArticle, background })
  if (!result.rows.length) {
    panelHost.append(el('div', { class: 'callout', style: 'margin-bottom:18px' }, [
      `No gene appears in two or more ${perArticle ? 'articles' : 'lists'} in this set, so there is no consensus to build.`,
    ]))
    return
  }

  const label = describeFilters()
  const unit = perArticle ? 'articles' : 'lists'
  const chartRows = result.rows.slice(0, 15).map((r) => ({
    label: r.gene,
    value: r.weight,
    fillValue: r.specificity,
    tooltip: [
      ['Appears in', `${fmt(r.support)} of ${fmt(result.voters)} ${unit} (${pct(r.fraction, 0)})`],
      ['Lists in this set', fmt(r.lists)],
      ['Best rank', `#${fmt(r.best)}`],
      ['In the background', `${fmt(r.everywhere)} of ${fmt(result.backgroundSize)}`],
      ['Specificity', `${r.specificity.toFixed(1)}x`],
    ],
  }))

  panelHost.append(el('div', { class: 'panel', style: 'margin-bottom:18px' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', { text: `Consensus signature: ${label}` }),
      el('p', {
        text: `${fmt(result.voterLists)} lists from ${fmt(result.voterArticles)} articles. `
          + (perArticle
            ? 'Each article votes once per gene, using its strongest placement, so a paper that published many lists cannot out-vote many papers. '
            : 'Each list votes separately, so papers contributing many lists carry more weight. ')
          + `Votes are discounted by how common the gene is in the chosen background (${fmt(result.backgroundSize)} ${unit}).`,
      }),
    ]),
    el('div', { class: 'panel-body' }, [
      barChart({
        rows: chartRows,
        valueLabel: 'Consensus vote',
        format: (v) => v.toFixed(1),
        labelWidth: 130,
        fillLegend: { low: 'common gene', high: 'specific to this set' },
        caption: `Top 15 of ${fmt(result.considered)} genes supported by two or more ${unit}.`,
      }),
    ]),
    consensusTable(result, label, unit),
  ]))
  panelHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function consensusTable(result, label, unit) {
  const rows = result.rows
  const head = ['Gene', unit === 'articles' ? 'Articles' : 'Lists', 'Share', 'Lists', 'Best rank',
    'In background', 'Specificity', 'Example experiments']
  const wrap = el('div', { class: 'table-wrap' })
  wrap.append(el('table', { class: 'data' }, [
    el('thead', {}, [el('tr', {}, head.map((h, i) => el('th', { class: i && i < 7 ? 'num' : '', text: h })))]),
    el('tbody', {}, rows.map((r) => el('tr', {}, [
      el('td', { class: 'gene' }, [el('button', {
        class: 'cell-link', type: 'button',
        onclick: () => { location.hash = `#/genes?q=${encodeURIComponent(r.gene)}&exact=1` },
      }, [r.gene])]),
      el('td', { class: 'num', text: fmt(r.support) }),
      el('td', { class: 'num', text: pct(r.fraction, 0) }),
      el('td', { class: 'num', text: fmt(r.lists) }),
      el('td', { class: 'num', text: `#${fmt(r.best)}` }),
      el('td', { class: 'num', text: fmt(r.everywhere) }),
      el('td', { class: 'num', text: `${r.specificity.toFixed(1)}x` }),
      el('td', { class: 'desc-cell' },
        r.in.slice(0, 2).map((s, i) => el('div', { style: i ? 'margin-top:4px' : '' }, [studyLinkButton(s)]))),
    ]))),
  ]))
  return el('div', {}, [
    el('div', { class: 'table-toolbar' }, [
      el('div', { class: 'grow hint' }, [`Ranked consensus across ${fmt(result.voters)} ${unit}.`]),
      el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: () => downloadCsv('neuromix_consensus',
          ['Gene', 'Supporting ' + unit, 'Share', 'Lists', 'Best rank', 'In background', 'Specificity', 'Vote', 'Filter'],
          rows.map((r) => [r.gene, r.support, (r.fraction * 100).toFixed(1), r.lists, r.best, r.everywhere,
            r.specificity.toFixed(2), r.weight.toFixed(3), label])),
      }, ['Export CSV']),
      methodsButton(() => methodsText('consensus', result, label)),
    ]),
    wrap,
  ])
}

/* ---------- convergence ---------- */

function buildConvergence() {
  if (!guard()) return
  clear(panelHost)
  const result = evidenceConvergence(current, { limit: 50 })
  if (!result.rows.length) {
    panelHost.append(el('div', { class: 'callout', style: 'margin-bottom:18px' }, [
      'No gene in this set is supported by two or more different assay types. Widen the filter, '
      + 'or check that the set contains more than one kind of experiment.',
    ]))
    return
  }

  const wrap = el('div', { class: 'table-wrap' })
  wrap.append(el('table', { class: 'data' }, [
    el('thead', {}, [el('tr', {}, ['Gene', 'Assay types', 'Articles', 'Lists', 'Lists overall', 'Evidence']
      .map((h, i) => el('th', { class: i > 0 && i < 5 ? 'num' : '', text: h })))]),
    el('tbody', {}, result.rows.map((r) => el('tr', {}, [
      el('td', { class: 'gene' }, [el('button', {
        class: 'cell-link', type: 'button',
        onclick: () => { location.hash = `#/genes?q=${encodeURIComponent(r.gene)}&exact=1` },
      }, [r.gene])]),
      el('td', { class: 'num', text: fmt(r.typeCount) }),
      el('td', { class: 'num', text: fmt(r.articles) }),
      el('td', { class: 'num', text: fmt(r.lists) }),
      el('td', { class: 'num', text: fmt(r.everywhere) }),
      el('td', {}, [el('div', { class: 'btn-row' },
        r.typeList.map((t) => el('span', { class: 'chip chip-plain', text: t })))]),
    ]))),
  ]))

  panelHost.append(el('div', { class: 'panel', style: 'margin-bottom:18px' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', { text: `Evidence convergence: ${describeFilters()}` }),
      el('p', {
        text: `This set spans ${result.typeCount} assay types (${result.types.join(', ')}). `
          + 'Genes are ranked by how many different kinds of experiment support them, because agreement '
          + 'across methods is much harder to produce by accident than repetition within one method.',
      }),
    ]),
    el('div', { class: 'table-toolbar' }, [
      el('div', { class: 'grow hint' }, [`${fmt(result.considered)} genes appear in two or more assay types.`]),
      el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: () => downloadCsv('neuromix_convergence',
          ['Gene', 'Assay types', 'Articles', 'Lists in set', 'Lists overall', 'Types'],
          result.rows.map((r) => [r.gene, r.typeCount, r.articles, r.lists, r.everywhere, r.typeList.join(' | ')])),
      }, ['Export CSV']),
    ]),
    wrap,
  ]))
  panelHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

/* ---------- set versus set ---------- */

function pinSet() {
  if (!current.length) {
    toast('Nothing to pin. Filter to at least one gene list first.', { error: true })
    return
  }
  pinned = current.slice()
  pinnedLabel = describeFilters()
  document.getElementById('compare-set').disabled = false
  document.getElementById('pin-set').textContent = `Set A pinned (${fmt(pinned.length)})`
  toast(`Pinned ${fmt(pinned.length)} lists as set A. Now change the filters and press Compare.`)
}

function compareToPinned() {
  if (!pinned) return
  const setB = current
  if (!setB.length) {
    toast('Set B is empty. Adjust the filters first.', { error: true })
    return
  }
  const perArticle = controls.perArticle.checked
  const result = compareSets(pinned, setB, { perArticle })
  const unit = perArticle ? 'articles' : 'lists'
  const labelB = describeFilters()

  clear(panelHost)
  const rows = result.rows.slice(0, 200)
  const wrap = el('div', { class: 'table-wrap' })
  wrap.append(el('table', { class: 'data' }, [
    el('thead', {}, [el('tr', {}, ['Gene', 'Favours', `In A (of ${fmt(result.sizeA)})`,
      `In B (of ${fmt(result.sizeB)})`, 'Enrichment', 'P value']
      .map((h, i) => el('th', { class: i > 1 ? 'num' : '', text: h })))]),
    el('tbody', {}, rows.map((r) => el('tr', {}, [
      el('td', { class: 'gene' }, [el('button', {
        class: 'cell-link', type: 'button',
        onclick: () => { location.hash = `#/genes?q=${encodeURIComponent(r.gene)}&exact=1` },
      }, [r.gene])]),
      el('td', {}, [el('span', {
        class: `chip ${r.favours === 'A' ? 'chip-up' : 'chip-down'}`,
        text: r.favours === 'A' ? 'set A' : 'set B',
      })]),
      el('td', { class: 'num', text: `${fmt(r.a)} (${pct(r.rateA, 0)})` }),
      el('td', { class: 'num', text: `${fmt(r.b)} (${pct(r.rateB, 0)})` }),
      el('td', { class: 'num', text: `${r.enrichment >= 1 ? r.enrichment.toFixed(1) : (1 / r.enrichment).toFixed(1)}x` }),
      el('td', { class: 'num' }, [
        sci(r.pValue),
        r.significant ? el('span', { class: 'chip chip-up', style: 'margin-left:6px', text: 'sig' }) : null,
      ]),
    ]))),
  ]))

  panelHost.append(el('div', { class: 'panel', style: 'margin-bottom:18px' }, [
    el('div', { class: 'panel-head' }, [
      el('h2', { text: 'Set A versus set B' }),
      el('p', {}, [
        el('strong', { text: 'Set A: ' }), `${pinnedLabel} (${fmt(result.sizeA)} ${unit}). `,
        el('strong', { text: 'Set B: ' }), `${labelB} (${fmt(result.sizeB)} ${unit}). `,
        `${fmt(result.significantCount)} of ${fmt(result.rows.length)} genes differ more than chance allows `
        + `(p below ${sci(result.threshold)}, Bonferroni corrected).`,
      ]),
    ]),
    el('div', { class: 'table-toolbar' }, [
      el('div', { class: 'grow hint' }, [`Showing the top ${fmt(rows.length)} of ${fmt(result.rows.length)} genes by p value.`]),
      el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: () => downloadCsv('neuromix_set_comparison',
          ['Gene', 'Favours', `In A (of ${result.sizeA})`, `In B (of ${result.sizeB})`, 'Enrichment', 'P value', 'Significant', 'Set A', 'Set B'],
          result.rows.map((r) => [r.gene, r.favours, r.a, r.b, r.enrichment.toFixed(3), r.pValue,
            r.significant ? 'yes' : 'no', pinnedLabel, labelB])),
      }, ['Export CSV']),
    ]),
    wrap,
  ]))
  panelHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

/* ---------- reproducibility ---------- */

function methodsButton(build) {
  return el('button', {
    class: 'btn btn-sm btn-ghost', type: 'button',
    title: 'Copy a methods paragraph describing exactly how this result was produced',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(build())
        toast('Methods paragraph copied')
      } catch {
        toast('Clipboard blocked by the browser', { error: true })
      }
    },
  }, ['Copy methods'])
}

function methodsText(kind, result, label) {
  const unit = result.perArticle ? 'article' : 'list'
  return `NeurOmix ${kind} analysis (${new Date().toISOString().slice(0, 10)}). `
    + `Source: NeurOmix database, ${fmt(store.stats.lists)} ranked gene lists from ${fmt(store.stats.articles)} articles. `
    + `Selection: ${label}, giving ${fmt(result.voterLists)} lists from ${fmt(result.voterArticles)} articles. `
    + `Each list scored its genes from 1 at the top of its ranking to 0 at the bottom. `
    + `Votes were aggregated per ${unit}`
    + (result.perArticle ? ', taking each article\'s strongest placement of a gene, ' : ', ')
    + `and discounted by the gene's frequency in the chosen background of ${fmt(result.backgroundSize)} ${unit}s. `
    + `Genes supported by fewer than two ${unit}s were dropped, leaving ${fmt(result.considered)} genes.`
}

/* ---------- helpers ---------- */

function describeFilters() {
  const parts = []
  for (const key of ['topic', 'assay', 'species', 'method', 'journal', 'year']) {
    if (controls[key].value) parts.push(controls[key].value)
  }
  if (controls.direction.value) parts.push(controls.direction.value === 'up' ? 'upregulated' : 'downregulated')
  if (controls.search.value.trim()) parts.push(`"${controls.search.value.trim()}"`)
  return parts.length ? parts.join(', ') : 'all gene lists'
}

const statTile = (label, value, sub) => el('div', { class: 'stat' }, [
  el('div', { class: 'label', text: label }),
  el('div', { class: 'value', text: value }),
  sub && el('div', { class: 'sub', text: sub }),
])
