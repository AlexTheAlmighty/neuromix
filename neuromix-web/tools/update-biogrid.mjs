// Refreshes tools/biogrid.json, the committed snapshot of human BioGRID that the
// interaction panel is built from. Mirrors the HGNC arrangement: the snapshot is
// committed so a deploy never depends on thebiogrid.org being reachable, and an
// interaction lookup is reproducible months later.
//
//   node tools/update-biogrid.mjs             downloads the latest release
//   node tools/update-biogrid.mjs <zip path>  reuses an already-downloaded zip
//
// The download is large (about 190 MB), which is why reusing a local copy is
// supported. BioGRID data is distributed under the MIT license.
import { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync, writeFileSync, mkdtempSync } from 'node:fs'
import { createInflateRaw } from 'node:zlib'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, 'biogrid.json')
const URL_ = 'https://downloads.thebiogrid.org/Download/BioGRID/Latest-Release/BIOGRID-ORGANISM-LATEST.tab3.zip'

/* ---------- minimal ZIP reader: just enough to stream one deflated entry ---------- */

function readBytes(fd, position, length) {
  const buf = Buffer.alloc(length)
  readSync(fd, buf, 0, length, position)
  return buf
}

/** Locate an entry by name substring and return { start, compressedSize, method, name }. */
function findZipEntry(path, nameContains) {
  const size = statSync(path).size
  const fd = openSync(path, 'r')
  try {
    // End-of-central-directory record: scan the last 70KB for its signature.
    const tailLen = Math.min(size, 70 * 1024)
    const tail = readBytes(fd, size - tailLen, tailLen)
    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
    }
    if (eocd < 0) throw new Error('Not a ZIP file (no end-of-central-directory record)')
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)

    const cd = readBytes(fd, cdOffset, cdSize)
    let p = 0
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      const method = cd.readUInt16LE(p + 10)
      const compressedSize = cd.readUInt32LE(p + 20)
      const nameLen = cd.readUInt16LE(p + 28)
      const extraLen = cd.readUInt16LE(p + 30)
      const commentLen = cd.readUInt16LE(p + 32)
      const localOffset = cd.readUInt32LE(p + 42)
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen)
      if (name.includes(nameContains)) {
        // The local header repeats the name and extra fields with its own lengths.
        const local = readBytes(fd, localOffset, 30)
        if (local.readUInt32LE(0) !== 0x04034b50) throw new Error('Corrupt local file header')
        const start = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
        return { start, compressedSize, method, name }
      }
      p += 46 + nameLen + extraLen + commentLen
    }
    throw new Error(`No entry containing "${nameContains}" in ${path}`)
  } finally {
    closeSync(fd)
  }
}

/* ---------- download ---------- */

async function download(url) {
  console.log(`downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`)
  const path = join(mkdtempSync(join(tmpdir(), 'biogrid-')), 'biogrid.zip')
  await pipeline(Readable.fromWeb(res.body), createWriteStream(path))
  console.log(`saved ${(statSync(path).size / 1024 / 1024).toFixed(0)} MB to ${path}`)
  return path
}

/* ---------- aggregate ---------- */

const zipPath = process.argv[2] ?? await download(URL_)
const entry = findZipEntry(zipPath, 'Homo_sapiens')
if (entry.method !== 8) throw new Error(`Unexpected compression method ${entry.method}`)
const release = entry.name.match(/-(\d+\.\d+\.\d+)\./)?.[1] ?? 'unknown'
console.log(`reading ${entry.name}`)

const lines = createInterface({
  input: createReadStream(zipPath, { start: entry.start, end: entry.start + entry.compressedSize - 1 })
    .pipe(createInflateRaw()),
  crlfDelay: Infinity,
})

let header = null
let col = {}
let rows = 0
let kept = 0
// Unordered pair key -> { phys, gen, pubs: Set }
const pairs = new Map()

for await (const line of lines) {
  if (!header) {
    header = line.replace(/^#/, '').split('\t')
    col = Object.fromEntries(header.map((name, i) => [name, i]))
    for (const need of ['Official Symbol Interactor A', 'Official Symbol Interactor B',
      'Experimental System Type', 'Publication Source', 'Organism ID Interactor A', 'Organism ID Interactor B']) {
      if (!(need in col)) throw new Error(`Column "${need}" missing from ${entry.name}`)
    }
    continue
  }
  rows++
  const f = line.split('\t')
  // The organism file still holds interspecies rows (human protein vs viral bait),
  // so both interactors have to be human.
  if (f[col['Organism ID Interactor A']] !== '9606' || f[col['Organism ID Interactor B']] !== '9606') continue
  const a = f[col['Official Symbol Interactor A']].toUpperCase()
  const b = f[col['Official Symbol Interactor B']].toUpperCase()
  if (!a || !b || a === '-' || b === '-' || a === b) continue
  kept++
  const key = a < b ? `${a}\t${b}` : `${b}\t${a}`
  let entry_ = pairs.get(key)
  if (!entry_) { entry_ = { phys: 0, gen: 0, pubs: new Set() }; pairs.set(key, entry_) }
  if (f[col['Experimental System Type']] === 'genetic') entry_.gen++
  else entry_.phys++
  const pub = f[col['Publication Source']]
  if (pub && pub !== '-') entry_.pubs.add(pub)
}

console.log(`${rows} evidence rows, ${kept} human-human non-self, ${pairs.size} unique pairs`)

// Compact payload: a symbol table plus [aIndex, bIndex, physical, genetic, publications].
const symbolIndex = new Map()
const symbols = []
const indexOf = (s) => {
  let i = symbolIndex.get(s)
  if (i === undefined) { i = symbols.length; symbols.push(s); symbolIndex.set(s, i) }
  return i
}
const packed = []
for (const [key, v] of pairs) {
  const [a, b] = key.split('\t')
  packed.push([indexOf(a), indexOf(b), v.phys, v.gen, v.pubs.size])
}
packed.sort((x, y) => x[0] - y[0] || x[1] - y[1])

writeFileSync(OUT, JSON.stringify({
  release,
  retrieved: new Date().toISOString().slice(0, 10),
  source: URL_,
  license: 'BioGRID data are distributed under the MIT license',
  genes: symbols.length,
  symbols,
  pairs: packed,
}))
console.log(`wrote ${OUT} (${(statSync(OUT).size / 1024 / 1024).toFixed(1)} MB, release ${release}, ${symbols.length} genes)`)
