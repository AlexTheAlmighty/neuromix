// Horizontal bar chart, single series. Thin square-cornered marks anchored to the
// baseline, hairline gridlines, value at the tip, hover tooltip.
// An optional second value drives a sequential one-hue fill (light to dark).
import { el } from './ui.js'

const NS = 'http://www.w3.org/2000/svg'

// Blue ramp, low to high magnitude, stepped for each surface so the lightest
// step still clears contrast against it.
const RAMP = {
  light: ['#8fb4dd', '#5f92c7', '#356fae', '#22548b', '#153a63'],
  dark: ['#1d4f86', '#2d6ab0', '#4585cd', '#78a7dd', '#b9d1ec'],
}

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, v)
  return node
}

const theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

function niceTicks(max, count = 4) {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) * mag
  const ticks = []
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(t)
  return ticks
}

const barPath = (x, y, w, h) => `M${x},${y} H${x + w} V${y + h} H${x} Z`

// Redraw on a theme change and whenever the figure's own width changes. The width check
// also covers a view mounted while hidden, which only gets a real width once it is shown.
function keepDrawn(figure, draw) {
  let width = figure.clientWidth
  new ResizeObserver(() => {
    if (figure.clientWidth && figure.clientWidth !== width) {
      width = figure.clientWidth
      draw()
    }
  }).observe(figure)
  window.addEventListener('themechange', draw)
}

function attachTip(target, figure, tip, build) {
  target.addEventListener('mousemove', (e) => {
    const box = figure.getBoundingClientRect()
    tip.style.left = `${e.clientX - box.left}px`
    tip.style.top = `${e.clientY - box.top - 8}px`
    tip.dataset.show = '1'
    tip.replaceChildren(...build())
  })
  target.addEventListener('mouseleave', () => { tip.dataset.show = '0' })
}

const tipLines = (title, lines) => [
  el('strong', { text: title }),
  ...lines.map(([k, v]) => el('div', { text: `${k}: ${v}` })),
]

/**
 * rows: [{ label, value, fillValue?, tooltip?: [[k, v], ...] }]
 * axis: false drops the gridlines and tick labels for small panels, where the value at
 * the tip already says everything. maxValue lets charts placed side by side share a scale.
 */
export function barChart({
  rows,
  valueLabel = 'Value',
  format = (v) => v.toLocaleString('en-US'),
  labelWidth = 168,
  rowHeight = 30,
  axis = true,
  maxValue = null,
  onSelect = null,
  fillLegend = null,
  caption = null,
}) {
  const figure = el('figure', { class: 'chart-figure', style: 'margin:0' })
  const tip = el('div', { class: 'chart-tip' })

  const draw = () => {
    figure.querySelector('svg')?.remove()
    const mode = theme()
    const ramp = RAMP[mode]
    const rowH = rowHeight
    const barH = Math.min(24, rowH - 10)
    const padTop = axis ? 22 : 6
    const padBottom = axis ? 26 : 2
    const padRight = axis ? 74 : 46
    const width = Math.max(axis ? 420 : 240, figure.clientWidth || 640)
    const plotLeft = labelWidth
    const plotWidth = Math.max(80, width - plotLeft - padRight)
    const height = padTop + rows.length * rowH + padBottom

    const svg = svgEl('svg', {
      class: 'chart',
      viewBox: `0 0 ${width} ${height}`,
      height,
      role: 'img',
      'aria-label': `${valueLabel} for ${rows.length} items`,
    })

    const max = maxValue ?? Math.max(...rows.map((r) => r.value), 0)
    const ticks = axis ? niceTicks(max) : [max]
    const scale = (v) => (max ? (v / ticks[ticks.length - 1]) * plotWidth : 0)

    if (axis) {
      for (const t of ticks) {
        const x = plotLeft + scale(t)
        svg.append(svgEl('line', { class: 'grid-line', x1: x, x2: x, y1: padTop - 6, y2: height - padBottom + 2 }))
        const label = svgEl('text', { class: 'axis-label', x, y: height - padBottom + 16, 'text-anchor': 'middle' })
        label.textContent = format(t)
        svg.append(label)
      }
    }
    svg.append(svgEl('line', {
      class: 'baseline', x1: plotLeft, x2: plotLeft, y1: padTop - 6, y2: height - padBottom + 2,
    }))

    const fillValues = rows.map((r) => (r.fillValue ?? null)).filter((v) => v !== null)
    const fillMin = fillValues.length ? Math.min(...fillValues) : 0
    const fillMax = fillValues.length ? Math.max(...fillValues) : 1

    rows.forEach((row, i) => {
      const y = padTop + i * rowH
      const barY = y + (rowH - barH) / 2
      const w = Math.max(2, scale(row.value))

      let fill = 'var(--accent)'
      if (row.fillValue !== undefined && row.fillValue !== null) {
        const t = fillMax === fillMin ? 1 : (row.fillValue - fillMin) / (fillMax - fillMin)
        fill = ramp[Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1)))]
      }

      const label = svgEl('text', { x: plotLeft - 10, y: barY + barH / 2 + 4, 'text-anchor': 'end' })
      label.textContent = row.label.length > 26 ? `${row.label.slice(0, 25)}…` : row.label
      const labelTitle = svgEl('title')
      labelTitle.textContent = row.label
      label.append(labelTitle)
      svg.append(label)

      svg.append(svgEl('path', { class: 'bar', d: barPath(plotLeft, barY, w, barH), fill }))

      const value = svgEl('text', { x: plotLeft + w + 8, y: barY + barH / 2 + 4 })
      value.textContent = format(row.value)
      svg.append(value)

      // Full-row hit target so small bars stay hoverable.
      const hit = svgEl('rect', {
        class: 'bar-hit',
        x: onSelect ? 0 : plotLeft,
        y,
        width: onSelect ? width : plotWidth + padRight - 10,
        height: rowH,
        style: onSelect ? null : 'cursor: default',
      })
      attachTip(hit, figure, tip, () => tipLines(row.label, row.tooltip ?? [[valueLabel, format(row.value)]]))
      if (onSelect) hit.addEventListener('click', () => onSelect(row))
      svg.append(hit)
    })

    figure.prepend(svg)
  }

  figure.append(tip)
  if (fillLegend) {
    const mode = theme()
    figure.append(el('div', { class: 'ramp-legend' }, [
      el('span', { text: fillLegend.low }),
      el('span', {
        class: 'ramp',
        style: `background: linear-gradient(to right, ${RAMP[mode].join(',')})`,
      }),
      el('span', { text: fillLegend.high }),
    ]))
  }
  if (caption) figure.append(el('figcaption', { text: caption }))

  draw()
  keepDrawn(figure, draw)
  return figure
}

/**
 * Vertical columns for a series over time. Only the tallest and the latest column carry
 * a value; the rest are read from the hover tooltip or the table.
 * rows: [{ label, value, tooltip?: [[k, v], ...] }]
 */
export function columnChart({
  rows,
  valueLabel = 'Value',
  format = (v) => v.toLocaleString('en-US'),
  height = 190,
}) {
  const figure = el('figure', { class: 'chart-figure', style: 'margin:0' })
  const tip = el('div', { class: 'chart-tip' })

  const draw = () => {
    figure.querySelector('svg')?.remove()
    const padTop = 18
    const padBottom = 22
    const width = Math.max(240, figure.clientWidth || 640)
    const base = height - padBottom
    const plotHeight = base - padTop
    const slot = width / rows.length
    const barW = Math.min(36, Math.max(5, slot - 8))
    const max = Math.max(...rows.map((r) => r.value), 1)
    // Thin the labels on narrow screens, counting back from the latest so it is always shown.
    const labelStep = Math.ceil(36 / slot)

    const svg = svgEl('svg', {
      class: 'chart',
      viewBox: `0 0 ${width} ${height}`,
      height,
      role: 'img',
      'aria-label': `${valueLabel} for ${rows.length} periods`,
    })
    svg.append(svgEl('line', { class: 'baseline', x1: 0, x2: width, y1: base, y2: base }))

    rows.forEach((row, i) => {
      const barH = Math.max(2, (row.value / max) * plotHeight)
      const center = slot * i + slot / 2
      // On a narrow screen the last label would otherwise hang past the plot edge.
      const labelX = Math.min(center, width - 15)
      svg.append(svgEl('path', {
        class: 'bar', d: barPath(center - barW / 2, base - barH, barW, barH), fill: 'var(--accent)',
      }))

      if (row.value === max || i === rows.length - 1) {
        const value = svgEl('text', { x: labelX, y: base - barH - 5, 'text-anchor': 'middle' })
        value.textContent = format(row.value)
        svg.append(value)
      }
      if ((rows.length - 1 - i) % labelStep === 0) {
        const label = svgEl('text', { class: 'axis-label', x: labelX, y: height - 6, 'text-anchor': 'middle' })
        label.textContent = row.label
        svg.append(label)
      }

      const hit = svgEl('rect', {
        class: 'bar-hit', x: slot * i, y: 0, width: slot, height, style: 'cursor: default',
      })
      attachTip(hit, figure, tip, () => tipLines(row.label, row.tooltip ?? [[valueLabel, format(row.value)]]))
      svg.append(hit)
    })

    figure.prepend(svg)
  }

  figure.append(tip)
  draw()
  keepDrawn(figure, draw)
  return figure
}
