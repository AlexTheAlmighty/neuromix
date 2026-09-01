# Curation lessons

Living guidance distilled from curator feedback, maintained by the weekly curation
task itself during its retrospective step. Triage and drafting read this file every
cycle. Keep it under roughly 120 lines: merge related lessons, drop superseded
ones, and keep only what changes a future decision. Every lesson cites its
evidence (a PR, a PMID, or a curator comment) so it can be re-examined.

## Triage: what the curator wants

- (seed) Neuroscience relevance is a tiebreaker, not a gate; interactomes and
  screens outrank another differential-expression comparison of a well-covered
  condition (curator's founding instruction and strategy discussion, 2026-08-29).
- Non-CNS material needs an anchor: a neuro gene at the centre or screen-scale
  generality, not just a well-made list. The first cycle cut every kidney, bone,
  pancreas and eye column but kept a FUS knockout transcriptome and a genome-scale
  Perturb-seq (PR #2).
- Do not expect a paper's headline screen or interactome to be deposited as a
  *ranked* output. The AMBRA1 screen (42548798) deposited 24 knockout DEGs and the
  FUS screen (42647599) a rank summary for hand-picked genes; both fell back to
  ordinary DE tables.

## Triage: what the curator rejects

- Interactions must be measured, not inferred. Built identically (collapse a
  pairwise table to each partner's best score, rank descending), the AP-MS network
  of autism risk proteins (42658940) was kept and the protein-coabundance atlas
  (40316700) cut, the only backlog cut. Computational association and co-expression
  networks are out of scope however large. Watch an alternative reading: it was
  also the only column with no significance filter (PR #3).
- Non-neuro disease systems are cut on relevance whatever the list quality:
  lupus nephritis kidney (42616839), an osteosarcoma surfaceome (42647168),
  pancreatic cancer master regulators (42649389), and a retinitis pigmentosa
  retina screen (41962540). That last one was genome-wide and in vivo and was
  still cut, so "screens outrank DE comparisons" orders candidates within scope
  rather than widening it (PR #2).
- Saturation, not quality, drives the small cuts. Round two lost both ADGRG1
  microglial columns (40713954) and one of two near-twin ciliary columns (42105234,
  ventral cut). Measured: the cut lists are not noisier. What survives is a
  redundancy reading: 88 microglial lists already, eleven added this cycle, and
  one region of a two-region comparison usually suffices. Prefer one column per
  finding. Unconfirmed: ask before drafting the second half of a symmetric pair.
- The one CNS paper cut was hippocampal neurogenesis in major depression (42629468),
  also the one place a nominal p was substituted for a mostly-failing adjusted p.
  Tentative: the pancreatic columns were unfiltered and cut, the macaque ones
  unfiltered and kept.

## Extraction: mistakes not to repeat

- Read the comparison direction off the raw counts, not the column name. A sheet
  named "control vs KO" makes a positive fold change mean *lower* in the knockout
  (evidence: PMID 42548798, sheet "UNT tom vs Ambra1", 2026-w36).
- The decisive direction check is the perturbed gene itself: Tbk1 at rank 3 of its
  own down list (40858618), Adgrg1 at -0.74 (40713954), the bait topping its own
  pulldown (Dync1h1 26598648, PLD3 40065072, UBQLN2 41912662, DCPS 41943580).
  Without such an anchor, nominate rather than infer the sign: a direction error
  inverts the biology, the worst failure this pipeline can ship. Hence 39088390 and
  41087751 left undrafted despite clean tables (backlog round 2).
- A sheet named for a comparison does not guarantee the rows are genes. Two
  TREM2 sheets named `stats_high_disease_vs_low_disease` held lipids and
  metabolites (PMID 41580393). Read the first data rows before trusting a name.
- Do not re-filter an already-curated candidate list. The region-specific ciliary
  candidates (PMID 42105234) are the authors' filtered finding; applying p<=0.05
  again cut 67 proteins to 8.
- Inspect the ranking statistic's distribution first. Count survivors under a
  nominal p versus an FDR (retina screen 41962540: 1,088 against 5), and count ties
  at a permutation floor or fold-change ceiling, which make the top of a column an
  arbitrary slice (163 and 371 tied, 41491239, dropped; 54 of 100 at a ceiling,
  36931259, dropped; 159 of 227 tied, 41120751, trimmed to the 68 truly ranked).
- Aging DE tables from single-cell data are often topped by mitochondrial genes
  and ribosomal pseudogenes. Prefer a cell-state contrast from the same paper
  when one exists (evidence: PMID 42664052, dropped for the DAM and IRM states).
- Rank by the paper's own summary statistic, not by one replicate. The DCPS
  screen (41943580) carries `casTLE Score 1`, `casTLE Score 2`, a combined score
  and a p value; the first draft ranked on replicate 1 with no filter. Look for a
  combined column and an accompanying p value before configuring an extraction
  (evidence: 2026-08-31 audit).
- A workbook of unlabelled per-cell-type sheets does not establish a contrast.
  Supplementary table 3 of 40087396 is ten DESeq2 dumps named only for the cell
  type, in a paper spanning Alzheimer's, ALS, FTD and a TDP-43 knockdown, with a
  raw p value and no adjusted one. Two columns were drafted from it and withdrawn
  in audit. Require a legend that names the comparison (evidence: 2026-08-31).
- Stable identifiers may be mapped to HGNC symbols during extraction; "symbols as
  published" no longer blocks an Ensembl-only or UniProt-only table (curator,
  2026-08-31). Two papers rejected on this ground are re-openable: 42620705,
  37906643.

## Process

- Supplement routes that work from a plain HTTP client (2026-w36 and the backlog
  run). NCBI PMC gates downloads behind a proof-of-work and reCAPTCHA, and only
  5 of 25 papers in a 14-day window had a PMC record at all, so it is the wrong
  first stop for the weekly cycle.
  - Elsevier and Cell Press: `ars.els-cdn.com/content/image/1-s2.0-<PII>-mmc<N>.xlsx`,
    `<PII>` being the Crossref `alternative-id` for the DOI.
  - Nature family and Springer-hosted (including The EMBO Journal):
    `media.springernature.com/original/springer-static/esm/art%3A<DOI>/MediaObjects/<journal>_<year>_<article>_MOESM<N>_ESM.xlsx`.
    A 3,038-byte response is the "not found" placeholder, not a file.
  - Anything already in PMC: `ebi.ac.uk/europepmc/webservices/rest/<PMCID>/supplementaryFiles`
    returns every supplement as one zip, ungated, and `/fullTextXML` gives the
    legends. Retry on 500. Open access only, and months behind.
  - Science family: the article page permits a same-origin `fetch` of
    `/doi/suppl/<DOI>/suppl_file/<slug>_tables_s1_to_sN.zip` from a browser pane,
    so those columns stay re-derivable. PNAS still needs manual browser work.
- Store each column's extraction config beside its list. In the 2026-08-31 audit
  every column with a config re-derived byte-identically, and the one supplement
  saved from a gated site turned out to be a reCAPTCHA page, not a spreadsheet.
  Check a download's first bytes before parsing it.
- Undraftable shapes, to triage nomination-only rather than chase: PDF-only
  supplements (42640795, 42425084, 42611703, 19955087); per-figure source data with
  no tables (42649291, 42608571, 41224995, 41430470) or only cluster-level stats
  (42457956); raw per-sample intensities with no summary statistic (42629502,
  42616903, 40053453); annotation matrices and pairwise crosslink lists (41005307,
  41315310); nested multi-row instrument headers (40738907); and hundred-megabyte
  tables (41285799, 40593524), which also stall a bulk download.
- A 14-day sweep returns ~2,500 candidates, not the ~1,000 the runbook assumes;
  PLOS ONE and iScience are 45% of the volume and almost none of the yield, so
  title-pass triage is the expensive step (evidence: 2026-w36, 54 journals).

### Proposed tool changes awaiting curator approval

- Teach the sweep or a small helper to resolve supplement URLs from the two CDN
  patterns above and download them, so drafting does not depend on ad-hoc
  browser work each week. Proposed in the 2026-w36 PR body; the curator has said
  they are unsure, so it stays open.
