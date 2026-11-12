// Boot, theme and hash routing.
import { loadDatabase, databaseChanged } from './store.js'
import { el, clear, initDrawer, toast } from './ui.js'
import * as genes from './views/genes.js'
import * as lists from './views/lists.js'
import * as about from './views/about.js'

const VIEWS = { genes, lists, about }
const ROUTES = Object.keys(VIEWS)

/* ---------- theme ---------- */
setTheme(localStorage.getItem('neuromix-theme') ?? 'light')

function setTheme(theme) {
  document.documentElement.dataset.theme = theme
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }))
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  localStorage.setItem('neuromix-theme', next)
  setTheme(next)
})

/* ---------- routing ---------- */
const routeName = () => {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0]
  return ROUTES.includes(name) ? name : 'genes'
}

function show(name) {
  for (const route of ROUTES) {
    const section = document.getElementById(`view-${route}`)
    section.hidden = route !== name
  }
  for (const link of document.querySelectorAll('#tabs a')) {
    if (link.dataset.route === name) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  }
  VIEWS[name].onShow?.()
  document.title = `NeurOmix ${{ genes: 'gene analysis', lists: 'gene list analysis', about: 'about' }[name]}`
}

window.addEventListener('hashchange', () => show(routeName()))

/* ---------- database updates ---------- */
// A tab left open keeps the data it loaded, so its counts fall behind after a deploy.
// When the tab comes back into view (at most every five minutes), ask the server whether
// the data file changed and offer a reload. The search lives in the URL, so it survives.
const UPDATE_CHECK_MS = 5 * 60 * 1000

function watchForUpdates() {
  let lastCheck = Date.now()
  let offered = false
  const check = async () => {
    if (offered || document.hidden || Date.now() - lastCheck < UPDATE_CHECK_MS) return
    lastCheck = Date.now()
    if (!(await databaseChanged())) return
    offered = true
    document.getElementById('main').prepend(el('div', { class: 'update-banner', role: 'status' }, [
      el('span', { text: 'The database has been updated since this page was opened.' }),
      el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Reload', onclick: () => location.reload() }),
    ]))
  }
  document.addEventListener('visibilitychange', check)
  setInterval(check, UPDATE_CHECK_MS)
}

/* ---------- boot ---------- */
initDrawer()

loadDatabase()
  .then(() => {
    document.getElementById('boot').remove()
    if (!location.hash) location.hash = '#/genes'
    // Mount every view up front so cross-view actions (analyse this list, search
    // this gene) reach a live listener even before that tab has been opened.
    for (const route of ROUTES) VIEWS[route].mount(document.getElementById(`view-${route}`))
    show(routeName())
    watchForUpdates()
  })
  .catch((err) => {
    const boot = document.getElementById('boot')
    clear(boot)
    boot.append(el('div', { class: 'empty' }, [
      el('h3', { text: 'The database could not be loaded' }),
      el('p', { text: err.message }),
      el('p', { class: 'hint', text: 'Run "npm run build:data" to regenerate public/data/neuromix.json, then reload.' }),
    ]))
    toast(err.message, { error: true })
  })
