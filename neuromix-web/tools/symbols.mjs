// Checks gene symbols against HGNC and repairs the ones that can be repaired safely.
//
// The rules are deliberately conservative. Getting a symbol wrong moves data from one
// gene to another, which is worse than leaving a stale name in place, so anything that
// cannot be resolved with confidence is reported for a human instead of guessed at.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Spreadsheet artefacts and R's missing value marker. Left alone these become genes:
// "NA" is a retired symbol for XK, so a column of missing values would silently turn
// into 48 observations of a Kell blood group gene.
const NOT_A_GENE = new Set([
  'NA', 'N/A', 'NAN', 'NULL', 'NONE', 'NIL', '#N/A', '#VALUE!', '#REF!', '#NAME?', '#DIV/0!',
  'TRUE', 'FALSE', 'INF', '-INF', 'ERROR', 'UNKNOWN', 'UNASSIGNED', 'BLANK', '-', '.', '?',
])

// Excel silently turns SEPT2, MARCH1 and DEC1 into dates. The damage is one way, but a
// serial number can be decoded back to the day it represents and matched to the gene.
const EXCEL_MONTHS = { JAN: 'JAN', FEB: 'FEB', MAR: 'MARCH', APR: 'APR', MAY: 'MAY', JUN: 'JUN',
  JUL: 'JUL', AUG: 'AUG', SEP: 'SEPT', OCT: 'OCT', NOV: 'NOV', DEC: 'DEC' }
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function fromExcelSerial(symbol) {
  if (!/^\d{4,6}$/.test(symbol)) return null
  const serial = Number(symbol)
  // Excel's epoch, allowing for its deliberate 1900 leap year bug.
  if (serial < 20000 || serial > 60000) return null
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
  const month = MONTH_NAMES[date.getUTCMonth()]
  const day = date.getUTCDate()
  const family = EXCEL_MONTHS[month]
  if (!family) return null
  return { candidate: `${family}${day}`, date: date.toISOString().slice(0, 10), day, month }
}

const SHAPES = [
  ['mouse or rat symbol', /^(GM\d{3,}|\d{4,}[A-Z]\d{2}RIK|[A-Z0-9]+-PS\d*|RIKEN)/],
  ['clone or contig identifier', /^(RP\d+-|AC\d{6}|AL\d{6}|AP\d{6}|AF\d{6}|BX\d{6}|CTA-|CTB-|CTC-|CTD-|CH\d+-|Z\d{5})/],
  ['UniProt accession', /^([A-NR-Z]\d[A-Z0-9]{3}\d|[OPQ]\d[A-Z0-9]{3}\d|[A-Z]\d[A-Z]{2}\d{2})$/],
  ['versioned identifier', /\.\d+$/],
  ['Ensembl identifier', /^ENS[GT]\d+/],
  ['probe or array identifier', /^(ILMN_|A_\d+_|\d+_AT$)/],
]

const classifyShape = (symbol) => SHAPES.find(([, re]) => re.test(symbol))?.[0] ?? 'unrecognised'

/** UniProt accession, as used in "SYMBOL|ACCESSION" cells. */
export const isAccession = (symbol) =>
  /^([A-NR-Z]\d[A-Z0-9]{3}\d|[OPQ]\d[A-Z0-9]{3}\d)(-\d+)?$/.test(String(symbol).trim().toUpperCase())

export function loadHgnc(path = resolve(here, 'hgnc.json')) {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    data.approvedSet = new Set(data.approved)
    return data
  } catch {
    return null
  }
}

/**
 * Resolve one raw symbol.
 * Returns { symbol, status, from?, note? } where status is one of:
 *   approved   already an HGNC approved symbol, unchanged
 *   renamed    an unambiguous previous symbol, safely rewritten
 *   recovered  an Excel date that decodes to a real gene, rewritten
 *   dropped    not a gene at all (missing value markers and spreadsheet errors)
 *   review     needs a human: ambiguous, an alias, or unrecognised. Left unchanged.
 */
export function resolveSymbol(raw, hgnc) {
  const symbol = String(raw ?? '').trim().toUpperCase()
  if (!symbol) return { symbol: '', status: 'dropped', note: 'empty' }
  if (NOT_A_GENE.has(symbol)) return { symbol, status: 'dropped', note: 'missing value or spreadsheet error' }
  if (!hgnc) return { symbol, status: 'approved' }

  if (hgnc.approvedSet.has(symbol)) return { symbol, status: 'approved' }

  const excel = fromExcelSerial(symbol)
  if (excel) {
    if (hgnc.approvedSet.has(excel.candidate)) {
      return { symbol: excel.candidate, status: 'recovered', from: symbol,
        note: `Excel date ${excel.date}, read as ${excel.candidate}` }
    }
    const renamed = hgnc.previous[excel.candidate]
    if (renamed) {
      return { symbol: renamed, status: 'recovered', from: symbol,
        note: `Excel date ${excel.date}, read as ${excel.candidate}, now ${renamed}` }
    }
    return { symbol, status: 'review', note: `looks like the Excel date ${excel.date}, no matching gene`,
      shape: 'Excel date corruption' }
  }

  const renamed = hgnc.previous[symbol]
  if (renamed) return { symbol: renamed, status: 'renamed', from: symbol, note: `HGNC renamed ${symbol} to ${renamed}` }

  const ambiguous = hgnc.previousAmbiguous[symbol]
  if (ambiguous) {
    return { symbol, status: 'review', shape: 'ambiguous previous symbol',
      note: `previously used by ${ambiguous.join(', ')}` }
  }

  // Aliases are reported but never applied. HGNC lists HBA as an alias of the keratin
  // pseudogene KRT90P, so auto-applying aliases would rewrite haemoglobin as a keratin.
  const aliasOf = hgnc.alias[symbol]
  if (aliasOf) {
    return { symbol, status: 'review', shape: 'alias', suggestion: aliasOf,
      note: `an alias of ${aliasOf}, needs confirmation` }
  }
  const aliasMany = hgnc.aliasAmbiguous[symbol]
  if (aliasMany) {
    return { symbol, status: 'review', shape: 'ambiguous alias',
      note: `an alias of ${aliasMany.slice(0, 6).join(', ')}` }
  }

  return { symbol, status: 'review', shape: classifyShape(symbol), note: 'not found in HGNC' }
}
