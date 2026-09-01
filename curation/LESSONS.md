# Curation lessons

Living guidance distilled from curator feedback, maintained by the weekly curation
task itself during its retrospective step. Triage and drafting read this file every
cycle. Keep it under roughly 120 lines: merge related lessons, drop superseded
ones, and keep only what changes a future decision. Every lesson cites its
evidence (a PR, a PMID, or a curator comment) so it can be re-examined.

## Triage: what the curator wants

- (seed) Neuroscience relevance is a tiebreaker, not a gate. A ranked list from an
  unrelated field belongs here if the list itself could matter to anyone
  (evidence: curator's founding instruction, 2026-08-29).
- (seed) Interactomes and screens outrank yet another differential-expression
  comparison of a well-covered condition (evidence: curator strategy discussion,
  2026-08-29).
- Non-CNS material needs an anchor. In the first reviewed cycle the curator cut
  every column from disease systems with no neuro connection (kidney, bone,
  pancreas, eye) but kept both non-CNS papers that had one: a FUS knockout
  transcriptome, where a neurodegeneration gene is the subject, and a
  genome-scale Perturb-seq, where the coverage is every expressed gene. Read the
  seed rule that way — for non-CNS work look for a neuro gene at the centre or
  screen-scale generality, not just a well-made list (evidence: PR #2, 2026-w36).
- Before nominating a paper for its headline screen or interactome, expect the
  *ranked* output to be deposited, not just downstream follow-up analyses. In
  2026-w36 the AMBRA1 genome-wide CRISPR screen (PMID 42548798) deposited only
  24 DEGs from a knockout line, and the FUS screen (PMID 42647599) deposited only
  a rank summary for hand-picked tumour suppressors; both had to fall back to
  ordinary DE tables (evidence: 2026-w36 cycle).

## Triage: what the curator rejects

- Interactions must be measured, not inferred. Two interactome columns were built
  the same way — collapse a pairwise table to each partner's best score, rank
  descending. The AP-MS network of autism risk proteins (42658940) was kept; the
  protein-coabundance association atlas (40316700) was cut, and was the only
  backlog column cut. Treat computational association and co-expression networks
  as out of scope however large. One data point, so watch an alternative reading:
  the atlas was also the only column with no significance filter (PR #3).
- Non-neuro disease systems are cut on relevance whatever the list quality:
  lupus nephritis kidney (42616839), an osteosarcoma surfaceome (42647168),
  pancreatic cancer master regulators (42649389), and a retinitis pigmentosa
  retina screen (41962540). That last one was genome-wide and in vivo and was
  still cut, so "screens outrank DE comparisons" orders candidates within scope
  rather than widening it (PR #2).
- The one CNS paper cut was hippocampal neurogenesis in major depression
  (42629468) — also the one place a nominal p value was substituted for a
  mostly-failing adjusted p. Tentative: the pancreatic columns had no
  significance filter and were cut, the macaque columns had none and were kept.

## Extraction: mistakes not to repeat

- Read the comparison direction off the raw counts, not the column name. A sheet
  named "control vs KO" makes a positive fold change mean *lower* in the knockout
  (evidence: PMID 42548798, sheet "UNT tom vs Ambra1", 2026-w36).
- The decisive direction check is the perturbed gene itself. In a knockout or
  knockdown table, find the target: Tbk1 sits at rank 3 of the down list
  (PMID 40858618), Adgrg1 at -0.74 (40713954), and the bait tops its own pulldown
  (Dync1h1 in 26598648, PLD3 in 40065072, UBQLN2 in 41912662). Where no such
  anchor exists, nominate rather than infer the sign — a direction error inverts
  the biology, which is the worst failure this pipeline can ship. That is why the
  LRRK2 cilia paper (39088390) and the C9orf72 microglia paper (41087751) were
  left undrafted despite clean tables (evidence: backlog round 2).
- A sheet named for a comparison does not guarantee the rows are genes. Two
  TREM2 sheets named `stats_high_disease_vs_low_disease` held lipids and
  metabolites (PMID 41580393). Read the first data rows before trusting a name.
- Do not re-filter an already-curated candidate list. The region-specific ciliary
  candidates (PMID 42105234) are the authors' filtered finding; applying p<=0.05
  again cut 67 proteins to 8.
- When a table carries both a nominal p value and an FDR, check how many genes
  survive each before choosing. The retina CRISPR screen (PMID 41962540) had 5
  genes at FDR 0.05 and 1,088 at p 0.05; the FDR cut would have produced a
  five-gene column (evidence: 2026-w36 cycle).
- Check for ties before ranking by a permutation p value. Screens that report only
  p and FDR often bottom out at the permutation floor, so a "top 100" is an
  arbitrary alphabetical slice of a much larger tied block. The neuronal
  differentiation screens (PMID 41491239) had 163 and 371 genes tied at the
  minimum p, with no effect size deposited; both columns were dropped
  (evidence: backlog run, 2026-w36).
- Aging DE tables from single-cell data are often topped by mitochondrial genes
  and ribosomal pseudogenes. Prefer a cell-state contrast from the same paper
  when one exists (evidence: PMID 42664052 cerebellum aging list, dropped in
  favour of the DAM and IRM state signatures, 2026-w36).

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
  Science family and PNAS block scripted requests; use a browser session.
- Undraftable shapes, to be triaged nomination-only rather than chased: PDF-only
  supplements (42640795, 42425084, 42611703, 19955087); per-figure source data
  with no supplementary tables (42649291, 42608571, 41224995, 41430470) or only
  cluster-level statistics (42457956); raw per-sample intensities with no summary
  statistic (42629502, 42616903, 40053453); identifier-only gene columns, Ensembl
  (42620705) or UniProt (37906643); annotation matrices and pairwise crosslink or
  interaction lists rather than a ranked list (41005307, 41315310); nested
  multi-row instrument-export headers (40738907); and anything whose tables run to
  hundreds of megabytes (41285799, 40593524), which is also what stalls a bulk
  download.
- A 14-day sweep returns ~2,500 candidates, not the ~1,000 the runbook assumes;
  PLOS ONE and iScience are 45% of the volume and almost none of the yield, so
  title-pass triage is the expensive step (evidence: 2026-w36, 54 journals).

### Proposed tool changes awaiting curator approval

- Teach the sweep or a small helper to resolve supplement URLs from the two CDN
  patterns above and download them, so drafting does not depend on ad-hoc
  browser work each week. Proposed in the 2026-w36 PR body.
- Decide whether mapping stable identifiers to HGNC symbols during extraction is
  allowed. "Record symbols as published" currently makes any Ensembl-only or
  UniProt-only table undraftable; that has now cost two papers (PMID 42620705,
  37906643). Proposed in the 2026-w36 and backlog PR bodies.
