// Fails if a change removes gene lists from the database.
//
// Every branch carries a whole copy of "NeurOmics Database.csv", so a branch cut before
// a merge holds a shorter CSV. Merging it looks like an ordinary edit and silently
// deletes columns. That has nearly happened twice: a docs branch and an audit branch,
// both months-old bases, each would have reverted the database by thousands of rows.
//
// Deliberate removals are real (a withdrawn paper, a duplicated column), so this does not
// forbid them. It forbids them passing unnoticed: set ALLOW_LIST_LOSS=1 on the run to
// override, which forces someone to say out loud that the loss is intended.
//
// Usage: node check-no-loss.mjs <base.csv> <head.csv>

import { readFileSync } from 'node:fs'

// Count the fields in row 1 only. Abstracts hold commas and newlines, so a naive split
// is wrong; track quoting and stop at the first unquoted line break.
function columnsInHeaderRow(text) {
  let cols = 1
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') i++
      else quoted = !quoted
    } else if (!quoted && c === ',') cols++
    else if (!quoted && c === '\n') break
  }
  return cols
}

const [basePath, headPath] = process.argv.slice(2)
if (!basePath || !headPath) {
  console.error('usage: node check-no-loss.mjs <base.csv> <head.csv>')
  process.exit(2)
}

const base = columnsInHeaderRow(readFileSync(basePath, 'utf8'))
const head = columnsInHeaderRow(readFileSync(headPath, 'utf8'))
const lost = base - head

// One label column, the rest are lists.
console.log(`base: ${base - 1} lists`)
console.log(`head: ${head - 1} lists`)

if (lost <= 0) {
  console.log(lost === 0 ? 'No change in list count.' : `Adds ${-lost} list(s).`)
  process.exit(0)
}

if (process.env.ALLOW_LIST_LOSS === '1') {
  console.log(`Removes ${lost} list(s). ALLOW_LIST_LOSS is set, so this is allowed.`)
  process.exit(0)
}

console.error('')
console.error(`This change removes ${lost} gene list(s) from the database.`)
console.error('')
console.error('The usual cause is a branch cut before an earlier merge: it carries an older')
console.error('copy of the CSV, and merging it reverts the lists added since. Rebase onto the')
console.error('current default branch, or re-apply the work to a fresh branch.')
console.error('')
console.error('If the removal is deliberate, re-run this job with ALLOW_LIST_LOSS=1 and say')
console.error('in the pull request which lists are going and why.')
process.exit(1)
