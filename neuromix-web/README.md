# NeurOmix web

A modern web front end for the NeurOmix database of ranked gene lists. It replaces the
R/Shiny app in `Neuromix code.txt` while keeping the same analyses.

The whole database (1,037 ranked gene lists, 351 articles, 91,639 gene entries,
22,009 unique symbols) is compiled into a single 1.4 MB JSON file that the browser
loads once. Every lookup after that is instant and runs locally: no per-query round
trip, no R session, no `data.table` scan per column.

## Running it

Build the data file first, since it is generated from the CSV and not committed:

```bash
node tools/build-data.mjs
```

By default it reads `../NeurOmics Database.csv` and writes `public/data/neuromix.json`.
Both paths can be passed as arguments. Then:

```bash
node server.js
```

Then open http://localhost:4173. Node 18 or newer, no dependencies to install.

`server.js` is only for local development. It serves `public/` the way GitHub Pages
does and nothing else, so dev and production run the same code path.

## Gene symbols are checked against HGNC on every build

`tools/hgnc.json` is a compact lookup built from the HGNC complete set. It is committed,
so a deploy never depends on genenames.org being reachable and a symbol check is
reproducible months later. Refresh it when you want current nomenclature:

```bash
node tools/update-hgnc.mjs
```

Every build then resolves each symbol and prints a summary, with the detail written to
`public/data/symbol-report.json` (published, so it is readable at
`/data/symbol-report.json`). The rules are deliberately conservative, because renaming a
gene wrongly moves data from one gene to another, which is worse than leaving a stale
name in place:

| Outcome | What happens |
| --- | --- |
| Approved | Already current, left alone |
| Renamed | An unambiguous previous HGNC symbol, rewritten. The old name still finds it in the app |
| Recovered | An Excel date serial that decodes to a real gene, for example `45541` to `SEPTIN6` |
| Dropped | Not a gene: `NA`, `None`, `#N/A` and similar. `NA` is a retired symbol for XK, so missing values would otherwise become real observations |
| Review | Ambiguous, an alias, or unrecognised. Left unchanged and listed in the report |

Aliases are reported as suggestions but never applied: HGNC lists `HBA` as an alias of
the keratin pseudogene `KRT90P`, so applying aliases blindly would rewrite haemoglobin as
a keratin. Mouse and rat symbols are flagged rather than converted, since an ortholog is
a different gene, not a different name for the same one.

A pipe is treated as a member separator alongside a semicolon and comma. Some studies
file genes as `SYMBOL|ACCESSION`, and since the pipe is also this project's own storage
separator, leaving it in place split one gene into two and shifted every rank below it.

## Protein interactions come from a bundled BioGRID snapshot

`tools/biogrid.json` is a compact aggregation of every human interaction in BioGRID
(whose data files are MIT licensed): for each gene pair, the number of physical and
genetic experiments and the number of distinct publications supporting it. It is
committed for the same reason `tools/hgnc.json` is: a deploy never depends on
thebiogrid.org being reachable, and a lookup is reproducible months later. Refresh it
when you want a newer release (the download is about 190 MB, so an already-downloaded
zip can be passed as an argument):

```bash
node tools/update-biogrid.mjs
```

Every deploy then runs `tools/build-biogrid.mjs`, which shards the snapshot into
`public/data/biogrid/` (128 files of around 250 KB, generated, not committed) so the
interaction panel fetches only the shard holding the queried gene. The panel shows
every experimentally observed partner. BioGRID curates only direct experimental
evidence, so there are no predicted or text-mined interactions and no arbitrary
confidence cut off to choose; a live STRING lookup sits next to it for the wider,
prediction-inclusive view.

## Updating the database

`NeurOmics Database.csv` is the single source of truth. Commit a new copy of it (you
can drag the file onto the repo in the GitHub web UI) and the Deploy workflow rebuilds
`neuromix.json` and republishes the site. The build script prints list, article and
gene counts to the Actions log, which is the quickest way to spot a CSV that has
quietly stopped parsing.

## Hosting

Static bundle on GitHub Pages at https://neuromix.org, published by
`.github/workflows/deploy.yml` from `neuromix-web/public`. There is no server and no
runtime secret.

The custom domain lives in the repository's Pages settings, not in `public/CNAME`.
When Pages builds from Actions rather than from a branch, the CNAME file in the
artifact is ignored. It is kept only so a branch-based deploy would still work.

Enrichr, STRING and NCBI are called straight from the browser, since all three send
permissive CORS headers. BioGRID's webservice sends no CORS headers and needs an
access key, so it cannot be called from a browser at all; BioGRID interactions come
from a bundled snapshot instead (see below).

## What is where

| Path | Purpose |
| --- | --- |
| `server.js` | Local dev server. Serves `public/` and nothing else |
| `tools/build-data.mjs` | Converts the wide CSV into the JSON payload |
| `public/js/api.js` | Live calls to Enrichr and NCBI, plus the local BioGRID shard lookup |
| `tools/update-biogrid.mjs` | Downloads a BioGRID release and writes the committed snapshot `tools/biogrid.json` |
| `tools/build-biogrid.mjs` | Shards the snapshot into `public/data/biogrid/`, generated on every deploy |
| `public/js/store.js` | Loads the data, builds the gene index, and implements every lookup |
| `public/js/views/` | One module per tab |
| `public/js/charts.js` | Hand-rolled SVG bar charts, no chart library |
| `public/fonts/` | TeX Gyre Schola (text) and Pagella (headings), GUST Font License, self-hosted so the site stays dependency free |
| `public/js/ui.js` | Element helper, sortable and paged table, drawer, CSV export |

## How the CSV is read

The source CSV is transposed: each column is one gene list and the first eight rows are
metadata.

| Row | Meaning |
| --- | --- |
| 1 | Experiment description (this was the column name in the R app) |
| 2 | Article title |
| 3 | Article abstract |
| 4 | Tissue source |
| 5 | Experiment method |
| 6 | Data source |
| 7 | Journal |
| 8 | Article link |
| 9 and below | Ranked gene symbols, best rank first |

The build step uppercases symbols, drops blanks and duplicates within a list,
deduplicates abstracts by article, collapses method spelling variants
(`scRNA-seq` / `scRNA Seq` / `scRNA seq`) into one facet value, and tags each list as
upregulated, downregulated or not directional from its description, which is how the R
app decided the row colour.

## Feature mapping from the R app

| R app | Here |
| --- | --- |
| `Search NeurOmix Database` | Gene analysis tab, hits sorted by rank with article link, experiment, gene, rank |
| `Search Co-Occurring Genes` | Co-occurring genes button, genes appearing in 2 or more of the lists containing the query |
| Exact match checkbox | Same, off means substring matching as before |
| Experiment summary modal | Study drawer: abstract, tissue, method, data source, full ranked list, CSV download |
| `Compare to NeurOmix Database` | Gene list analysis, ranked by shared genes plus coverage of your list |
| Gene frequency plot | Most widely shared genes bar chart |
| 24 Enrichr buttons | All of them plus 34 more, in 10 collapsible groups. Library ids and the sizes quoted in the tooltips are checked against Enrichr's `datasetStatistics` endpoint |
| BioGRID and STRING button | Both, side by side: BioGRID from a bundled snapshot (experimental evidence counts, works offline), STRING queried live (likelihood scores, includes predictions) |
| `Download Database` | About tab: study metadata CSV, long format CSV, raw JSON |

Not carried over: the `interactome_data.csv` co-interactor analysis, which was already
commented out in the R app and depends on a file that is not in this folder.

## Analyses that go beyond the R app

**Overlap significance.** Two long lists share genes by chance. Every comparison now
carries a hypergeometric p value against a 20,000 gene background, with a Bonferroni
threshold over the comparisons actually made and a "significant only" toggle. Comparing
the largest list in the database returns 504 matches, of which 80 survive correction.

**Specificity for co-occurrence.** A raw co-occurrence count partly measures how often a
gene appears anywhere. Each partner now shows how many lists it appears in database wide,
a specificity multiple, and a p value, which is the default sort. Searching HTT now
returns F8A1 first (5 of its only 5 lists are shared with HTT) instead of burying it under
heat shock proteins.

**Gene profile card.** A single gene search leads with a summary: how many lists and
articles, the up versus down split across studies, best and typical rank, how ubiquitous
the gene is, and its topic mix. Genes reported in both directions by three or more studies
each are flagged as context dependent.

**Consensus signatures.** Filter the study browser to any set of lists and press Build
consensus signature. Each list scores its genes from 1 at the top to 0 at the bottom, and
the total is discounted by the gene's frequency in the chosen background so ubiquitous
genes cannot win by turning up everywhere. Filtering to Huntington plus downregulated
returns SCN4B, ADCY5, PENK, ADORA2A and RGS9, the striatal identity module.

**58 enrichment libraries, described accurately.** The R app offered 24. Pathway analysis
was missing entirely and is now its own group (KEGG, Reactome, WikiPathways, MSigDB
hallmarks, BioPlanet), alongside new groups for cell type and tissue, transcription
factors, and expanded disease, kinase, protein complex, ageing, drug and microRNA
coverage. Groups collapse so the panel stays navigable. Every library id and every term
and gene count quoted in a tooltip is verified against Enrichr's own `datasetStatistics`
endpoint rather than copied from a paper, and the GO, MGI, Kinase Library and TargetScan
buttons were moved to their current releases. Tooltips say what a library is, when to
reach for it, its known weakness, and how many gene sets and genes it holds.

**Gene function summaries.** Searching a single gene leads with its official name, the
curated NCBI description of what it does, its locus and its aliases. This restores the
`get_gene_details` function that was written but commented out in the R app. The lookup
queries NCBI Entrez from the browser and falls back to MyGene.info when NCBI is
unreachable or rate limiting, so a summary still appears either way. Results are held for
the session, so returning to a gene is instant. Symbols NCBI does not recognise, such as
clone identifiers, get a plain explanation rather than an error.

**One vote per article.** A single paper contributing 15 of 55 lists was casting 27
percent of the votes in a consensus. Every set analysis now counts articles as well as
lists, and defaults to giving each article one vote per gene, using its strongest
placement. This changes answers: the Huntington downregulated consensus now surfaces
ADORA2A, CNR1 and PRKCB, the canonical medium spiny neuron markers, which per-list
weighting was hiding. Co-occurrence gained an article count and a second p value computed
at article resolution, so a partner supported by five lists from one paper no longer looks
like five independent observations.

**Matched backgrounds.** Specificity can now be measured against all lists, against lists
using the same assay type, against the same species, or against the current filter.
Comparing interactome results against other interactome studies rather than against the
whole database is what separates a real partner from a protein that sticks to every bead.

**Set A versus set B.** Pin any filtered set, change the filters, and compare. Reports
per-gene rates in each set with an enrichment ratio and a corrected p value, which is the
shape of most real questions: mouse model versus human tissue, early versus late.

**Evidence convergence.** Ranks the genes in a filtered set by how many distinct assay
types support them. Agreement across methods is much harder to produce by accident than
repetition within one method.

**Methods paragraph export.** Any consensus result can copy a methods paragraph stating
the source, the selection, the weighting, the background and the counts, so an analysis
can be described accurately in a manuscript.

**New facets.** Topic, publication year, first author and ranking statistic are parsed out
of the experiment descriptions at build time (year for 1,034 of 1,037 lists, topic for
905). Assay type is classified for 954 lists and species inferred for 875, both of which
the study browser filters on. Lists whose length looks like a published top-N cut off are
flagged (702 of them), because a gene missing from such a list may simply have ranked
below the cut off.

**Better coverage.** The direction lexicon now understands enriched, depleted, increased,
reduced and correlated, taking direction coverage from 465 to 734 lists. Protein group
cells such as `H3-3A; H3-3B` are split so all members are searchable, recovering 317
symbols, and group members keep the rank of the cell they came from.

## Notes

- Searches are shareable: `#/genes?q=HTT&exact=1`.
- Enrichment, STRING and gene summary lookups are the only features that need internet
  access. BioGRID interaction lookups run against the bundled snapshot, so they work offline.
- Colour is never the only signal. Direction is always spelled out on a labelled chip
  next to the coloured edge, and every chart has a table underneath it.
