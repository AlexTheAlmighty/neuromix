// Pieces reused by more than one view: the study detail drawer and its chips.
import { el, clear, fmt, truncate, openDrawer, closeDrawer, downloadCsv, copyText } from '../ui.js'
import { emit } from '../bus.js'

export function directionChip(study) {
  if (study.direction === 'up') return el('span', { class: 'chip chip-up', text: 'Upregulated' })
  if (study.direction === 'down') return el('span', { class: 'chip chip-down', text: 'Downregulated' })
  return el('span', { class: 'chip', text: 'Not directional' })
}

export function studyLinkButton(study, { onOpen } = {}) {
  return el('button', {
    class: 'cell-link',
    type: 'button',
    title: 'Open the experiment details',
    onclick: () => (onOpen ? onOpen(study) : openStudy(study)),
  }, [study.description])
}

export function articleLink(study) {
  return study.url
    ? el('a', { href: study.url, target: '_blank', rel: 'noopener noreferrer', text: study.title })
    : el('span', { text: study.title })
}

const GENE_PAGE = 300

export function openStudy(study, { highlight = new Set() } = {}) {
  openDrawer(study.title, (body) => {
    body.append(el('div', { class: 'btn-row', style: 'margin-bottom:14px' }, [
      directionChip(study),
      study.journal && el('span', { class: 'chip chip-plain', text: study.journal }),
      study.methodGroup && el('span', { class: 'chip chip-plain', title: study.methodGroup, text: truncate(study.methodGroup, 40) }),
      el('span', { class: 'chip chip-plain', text: `${fmt(study.size)} ranked genes` }),
    ]))

    body.append(el('p', { text: study.description }))

    body.append(el('div', { class: 'meta-grid' }, [
      metaCell('Tissue source', study.tissue),
      metaCell('Experiment method', study.method),
      metaCell('Data source', study.dataSource),
      metaCell('Journal', study.journal),
    ]))

    body.append(el('div', { class: 'btn-row', style: 'margin-bottom:16px' }, [
      study.url && el('a', { class: 'btn btn-primary', href: study.url, target: '_blank', rel: 'noopener noreferrer' }, ['Open article']),
      el('button', {
        class: 'btn', type: 'button',
        onclick: () => downloadCsv(
          `${slug(study.description)}_gene_list`,
          ['Rank', 'Gene'],
          study.genes.map((g, i) => [i + 1, g]),
        ),
      }, ['Download gene list']),
      el('button', {
        class: 'btn', type: 'button',
        onclick: () => copyText(study.genes.join(', '), `${study.size} genes copied`),
      }, ['Copy genes']),
      el('button', {
        class: 'btn', type: 'button',
        onclick: () => { closeDrawer(); emit('analyse-list', { study }) },
      }, ['Analyse this list']),
    ]))

    if (study.abstract) {
      body.append(el('h3', { text: 'Abstract', style: 'margin-bottom:6px' }))
      body.append(el('div', { class: 'abstract', style: 'margin-bottom:18px' }, [study.abstract]))
    }

    body.append(el('h3', { text: 'Ranked gene list', style: 'margin-bottom:8px' }))
    const filter = el('input', { type: 'search', placeholder: 'Filter genes in this list', 'aria-label': 'Filter genes in this list', style: 'margin-bottom:10px' })
    const pills = el('div', { class: 'gene-pills' })
    const more = el('div', { style: 'margin-top:10px' })
    body.append(filter, pills, more)

    let limit = GENE_PAGE
    const paint = () => {
      const q = filter.value.trim().toUpperCase()
      const matches = study.genes
        .map((gene, i) => ({ gene, rank: i + 1 }))
        .filter(({ gene }) => !q || gene.includes(q))
      clear(pills)
      clear(more)
      for (const { gene, rank } of matches.slice(0, limit)) {
        pills.append(el('button', {
          class: `gene-pill${highlight.has(gene) ? ' hit' : ''}`,
          type: 'button',
          title: `Search NeurOmix for ${gene}`,
          onclick: () => { closeDrawer(); emit('search-gene', { genes: [gene] }) },
        }, [el('span', { class: 'rank', text: rank }), gene]))
      }
      if (matches.length > limit) {
        more.append(el('button', {
          class: 'btn btn-sm', type: 'button',
          onclick: () => { limit += 500; paint() },
        }, [`Show more (${fmt(matches.length - limit)} remaining)`]))
      } else if (!matches.length) {
        more.append(el('p', { class: 'hint', text: 'No genes in this list match that filter.' }))
      }
    }
    filter.addEventListener('input', () => { limit = GENE_PAGE; paint() })
    paint()
  })
}

function metaCell(key, value) {
  return el('div', {}, [
    el('div', { class: 'k', text: key }),
    el('div', { class: 'v', text: value || 'Not recorded' }),
  ])
}

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'neuromix'
