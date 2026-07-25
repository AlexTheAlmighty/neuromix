// Small DOM toolkit: element helper, sortable/paged table, drawer, toasts, exports.

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue
    if (key === 'class') node.className = value
    else if (key === 'html') node.innerHTML = value
    else if (key === 'text') node.textContent = value
    else if (key === 'dataset') Object.assign(node.dataset, value)
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value)
    else if (key in node && key !== 'list' && key !== 'size') node[key] = value
    else node.setAttribute(key, value === true ? '' : value)
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

export const clear = (node) => { while (node.firstChild) node.firstChild.remove() }
export const fmt = (n) => Number(n).toLocaleString('en-US')
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const truncate = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''))
export const pct = (n, digits = 1) => `${(n * 100).toFixed(digits)}%`

export function sci(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return ''
  if (n === 0) return '0'
  return Math.abs(n) < 0.001 || Math.abs(n) >= 1e5 ? Number(n).toExponential(2) : Number(n).toPrecision(3)
}

export function debounce(fn, wait = 180) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}

export function toast(message, { error = false, ms = 4200 } = {}) {
  const host = document.getElementById('toasts')
  const node = el('div', { class: `toast${error ? ' error' : ''}`, text: message })
  host.append(node)
  setTimeout(() => node.remove(), ms)
}

/* ---------- drawer ---------- */

const drawer = () => document.getElementById('drawer')
const scrim = () => document.getElementById('drawer-scrim')

export function openDrawer(title, build) {
  const body = document.getElementById('drawer-body')
  document.getElementById('drawer-title').textContent = title
  clear(body)
  build(body)
  drawer().hidden = false
  scrim().hidden = false
  body.scrollTop = 0
  document.body.style.overflow = 'hidden'
  document.getElementById('drawer-close').focus()
}

export function closeDrawer() {
  drawer().hidden = true
  scrim().hidden = true
  document.body.style.overflow = ''
}

export function initDrawer() {
  document.getElementById('drawer-close').addEventListener('click', closeDrawer)
  scrim().addEventListener('click', closeDrawer)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer().hidden) closeDrawer()
  })
}

/* ---------- exports ---------- */

const csvCell = (value) => {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename, header, rows) {
  const blob = new Blob([`﻿${toCsv(header, rows)}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = el('a', { href: url, download: filename.endsWith('.csv') ? filename : `${filename}.csv` })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text, label = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text)
    toast(label)
  } catch {
    toast('Clipboard blocked by the browser', { error: true })
  }
}

/* ---------- data table ---------- */

export class DataTable {
  /**
   * columns: { key, label, className?, sortable?, align?, sortValue?(row), render?(row), csv?(row), width? }
   */
  constructor(options) {
    this.opts = {
      pageSize: 50,
      searchable: true,
      searchPlaceholder: 'Filter results',
      exportName: 'neuromix',
      emptyMessage: 'No rows to show.',
      ...options,
    }
    this.rows = options.rows ?? []
    this.filtered = this.rows
    this.page = 0
    this.sort = options.initialSort ?? null
    this.query = ''
    this.node = el('div', { class: 'panel' })
    this.render()
  }

  setRows(rows) {
    this.rows = rows
    this.page = 0
    this.applyFilter()
    this.render()
  }

  applyFilter() {
    const q = this.query.trim().toLowerCase()
    const search = this.opts.searchText
    this.filtered = !q || !search
      ? this.rows
      : this.rows.filter((row) => search(row).toLowerCase().includes(q))
    if (this.sort) {
      const col = this.opts.columns.find((c) => c.key === this.sort.key)
      if (col) {
        const value = col.sortValue ?? ((row) => row[col.key])
        const dir = this.sort.dir === 'asc' ? 1 : -1
        this.filtered = [...this.filtered].sort((a, b) => {
          const va = value(a)
          const vb = value(b)
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
          return String(va).localeCompare(String(vb)) * dir
        })
      }
    }
    const pages = Math.max(1, Math.ceil(this.filtered.length / this.opts.pageSize))
    if (this.page >= pages) this.page = pages - 1
  }

  exportRows() {
    const cols = this.opts.columns.filter((c) => c.csv !== false)
    return {
      header: cols.map((c) => c.label),
      rows: this.filtered.map((row) => cols.map((c) => (typeof c.csv === 'function' ? c.csv(row) : row[c.key] ?? ''))),
    }
  }

  render() {
    clear(this.node)
    const { columns, pageSize, searchable, searchPlaceholder, caption, toolbarExtra } = this.opts

    const toolbar = el('div', { class: 'table-toolbar' })
    if (caption) toolbar.append(el('div', { class: 'grow', html: caption }))
    if (toolbarExtra) toolbar.append(toolbarExtra)
    if (searchable) {
      toolbar.append(el('input', {
        type: 'search',
        placeholder: searchPlaceholder,
        value: this.query,
        'aria-label': searchPlaceholder,
        oninput: debounce((e) => {
          this.query = e.target.value
          this.page = 0
          this.applyFilter()
          this.render()
        }, 200),
      }))
    }
    toolbar.append(el('button', {
      class: 'btn btn-sm',
      type: 'button',
      title: 'Download the filtered rows as CSV',
      onclick: () => {
        const { header, rows } = this.exportRows()
        downloadCsv(this.opts.exportName, header, rows)
      },
    }, ['Export CSV']))
    this.node.append(toolbar)

    this.applyFilter()
    const start = this.page * pageSize
    const pageRows = this.filtered.slice(start, start + pageSize)

    if (!this.filtered.length) {
      this.node.append(el('div', { class: 'panel-body' }, [el('p', { class: 'hint', text: this.opts.emptyMessage })]))
      return
    }

    const head = el('tr', {}, columns.map((col) => {
      const sorted = this.sort?.key === col.key
      const th = el('th', {
        class: col.sortable === false ? '' : 'sortable',
        scope: 'col',
        style: col.width ? `width:${col.width}` : null,
      }, [col.label])
      if (sorted) th.setAttribute('aria-sort', this.sort.dir === 'asc' ? 'ascending' : 'descending')
      if (col.sortable !== false) {
        th.append(el('span', { class: 'arrow', text: sorted ? (this.sort.dir === 'asc' ? '↑' : '↓') : '↕' }))
        th.addEventListener('click', () => {
          const dir = sorted && this.sort.dir === 'asc' ? 'desc' : 'asc'
          this.sort = { key: col.key, dir }
          this.page = 0
          this.render()
        })
      }
      return th
    }))

    const body = el('tbody', {}, pageRows.map((row) => {
      const tr = el('tr', { class: this.opts.rowClass?.(row) ?? '' })
      for (const col of columns) {
        const td = el('td', { class: col.className ?? '' })
        const content = col.render ? col.render(row) : row[col.key]
        if (content instanceof Node) td.append(content)
        else td.textContent = content ?? ''
        tr.append(td)
      }
      return tr
    }))

    this.node.append(el('div', { class: 'table-wrap' }, [
      el('table', { class: 'data' }, [el('thead', {}, [head]), body]),
    ]))

    const pages = Math.ceil(this.filtered.length / pageSize)
    const foot = el('div', { class: 'table-foot' }, [
      el('span', {
        text: `${fmt(start + 1)} to ${fmt(Math.min(start + pageSize, this.filtered.length))} of ${fmt(this.filtered.length)}`
          + (this.filtered.length !== this.rows.length ? ` (filtered from ${fmt(this.rows.length)})` : ''),
      }),
    ])
    if (pages > 1) {
      const go = (p) => { this.page = p; this.render(); this.node.scrollIntoView({ block: 'nearest' }) }
      foot.append(el('div', { class: 'pager' }, [
        el('button', { class: 'btn btn-sm', type: 'button', disabled: this.page === 0, onclick: () => go(this.page - 1) }, ['Previous']),
        el('span', { text: `Page ${this.page + 1} of ${fmt(pages)}` }),
        el('button', { class: 'btn btn-sm', type: 'button', disabled: this.page >= pages - 1, onclick: () => go(this.page + 1) }, ['Next']),
      ]))
    }
    this.node.append(foot)
  }
}
