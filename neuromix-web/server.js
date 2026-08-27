// Local dev server for the NeurOmix site. Production is a static bundle on GitHub
// Pages, so this only has to serve public/ the same way Pages does. Enrichr, STRING
// and NCBI are called straight from the browser (see public/js/api.js), which means
// dev and production hit the same code path.
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, 'public')
const PORT = Number(process.env.PORT ?? 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
}
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg)/

async function serveFile(req, res, path) {
  const type = TYPES[extname(path)] ?? 'application/octet-stream'
  const stat = statSync(path)
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': 'no-cache' })
    return res.end()
  }
  const headers = {
    'content-type': type,
    'cache-control': 'no-cache',
    etag,
    'last-modified': stat.mtime.toUTCString(),
  }
  const gzip = COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  if (gzip) headers['content-encoding'] = 'gzip'
  else headers['content-length'] = stat.size
  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  const stream = createReadStream(path)
  await pipeline(...(gzip ? [stream, createGzip(), res] : [stream, res])).catch(() => res.destroy())
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  try {
    let rel = decodeURIComponent(url.pathname)
    if (rel.endsWith('/')) rel += 'index.html'
    const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''))
    // Unknown paths fall back to the SPA shell.
    const target = path.startsWith(ROOT) && existsSync(path) && statSync(path).isFile()
      ? path
      : join(ROOT, 'index.html')
    await serveFile(req, res, target)
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('server error')
    } else res.destroy()
  }
})

server.listen(PORT, () => {
  console.log(`NeurOmix running at http://localhost:${PORT}`)
  if (!existsSync(join(ROOT, 'data', 'neuromix.json'))) {
    console.log('No data file yet. Run: npm run build:data')
  }
})
