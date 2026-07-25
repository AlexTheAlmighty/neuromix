// Horizontal bar chart, single series. Thin marks, 4px rounded data-end anchored
// to the baseline, hairline gridlines, value at the tip, hover tooltip.
// An optional second value drives a sequential one-hue fill (light to dark).
import { el } from './ui.js'

const NS = 'http://www.w3.org/2000/svg'

// Blue ramp, low to high magnitude, stepped for each surface so the lightest
// step still clears contrast against it.
const RAMP = {
  light: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'],
  dark: ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'],
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

// Square at the baseline, 4px rounded at the data end.
function barPath(x, y, w, h, r = 4) {
  const radius = Math.max(0, Math.min(r, w, h / 2))
  return `M${x},${y} H${x + w - radius} A${radius},${radius} 0 0 1 ${x + w},${y + radius} `
    + `V${y + h - radius} A${radius},${radius} 0 0 1 ${x + w - radius},${y + h} H${x} Z`
}

/**
 * rows: [{ label, value, fillValue?, tooltip?: [[k, v], ...] }]
 */
export function barChart({
  rows,
  valueLabel = 'Value',
  format = (v) => v.toLocaleString('en-US'),
  labelWidth = 168,
  fillLegend = null,
  caption = null,
}) {
  const figure = el('figure', { class: 'chart-figure', style: 'margin:0' })
  const tip = el('div', { class: 'chart-tip' })

  const draw = () => {
    figure.querySelector('svg')?.remove()
    const mode = theme()
    const ramp = RAMP[mode]
    const rowH = 30
    const barH = Math.min(24, rowH - 10)
    const padTop = 22
    const padBottom = 26
    const padRight = 74
    const width = Math.max(420, figure.clientWidth || 640)
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

    const max = Math.max(...rows.map((r) => r.value), 0)
    const ticks = niceTicks(max)
    const scale = (v) => (max ? (v / ticks[ticks.length - 1]) * plotWidth : 0)

    for (const t of ticks) {
      const x = plotLeft + scale(t)
      svg.append(svgEl('line', { class: 'grid-line', x1: x, x2: x, y1: padTop - 6, y2: height - padBottom + 2 }))
      const label = svgEl('text', { class: 'axis-label', x, y: height - padBottom + 16, 'text-anchor': 'middle' })
      label.textContent = format(t)
      svg.append(label)
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
        class: 'bar-hit', x: plotLeft, y, width: plotWidth + padRight - 10, height: rowH,
      })
      hit.addEventListener('mousemove', (e) => {
        const box = figure.getBoundingClientRect()
        tip.style.left = `${e.clientX - box.left}px`
        tip.style.top = `${e.clientY - box.top - 8}px`
        tip.dataset.show = '1'
        tip.replaceChildren(
          el('strong', { text: row.label }),
          ...(row.tooltip ?? [[valueLabel, format(row.value)]]).map(([k, v]) =>
            el('div', { text: `${k}: ${v}` })),
        )
      })
      hit.addEventListener('mouseleave', () => { tip.dataset.show = '0' })
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
  const redraw = () => draw()
  window.addEventListener('resize', redraw)
  window.addEventListener('themechange', redraw)
  // Rebuild once the element has real width after being attached.
  requestAnimationFrame(redraw)
  return figure
}
