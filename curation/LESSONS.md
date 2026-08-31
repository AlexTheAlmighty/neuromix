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
- Before nominating a paper for its headline screen or interactome, expect the
  *ranked* output to be deposited, not just downstream follow-up analyses. In
  2026-w36 the AMBRA1 genome-wide CRISPR screen (PMID 42548798) deposited only
  24 DEGs from a knockout line, and the FUS screen (PMID 42647599) deposited only
  a rank summary for hand-picked tumour suppressors; both had to fall back to
  ordinary DE tables (evidence: 2026-w36 cycle).

## Triage: what the curator rejects

(nothing recorded yet: no previous cycle had been reviewed when this file was
written, so nothing here is curator-derived yet)

## Extraction: mistakes not to repeat

- Read the comparison direction off the raw counts, not the column name. A sheet
  named "control vs KO" makes a positive fold change mean *lower* in the knockout
  (evidence: PMID 42548798, sheet "UNT tom vs Ambra1", 2026-w36).
- When a table carries both a nominal p value and an FDR, check how many genes
  survive each before choosing. The retina CRISPR screen (PMID 41962540) had 5
  genes at FDR 0.05 and 1,088 at p 0.05; the FDR cut would have produced a
  five-gene column (evidence: 2026-w36 cycle).
- Aging DE tables from single-cell data are often topped by mitochondrial genes
  and ribosomal pseudogenes. Prefer a cell-state contrast from the same paper
  when one exists (evidence: PMID 42664052 cerebellum aging list, dropped in
  favour of the DAM and IRM state signatures, 2026-w36).

## Process

- Supplement access, learned by trial in 2026-w36. PubMed Central almost never
  has papers from a 14-day window (5 of 25 had a PMC record; PMC also gates file
  downloads behind a proof-of-work and reCAPTCHA that only a real browser
  clears). The two routes that work from a plain HTTP client are:
  - Elsevier and Cell Press: `https://ars.els-cdn.com/content/image/1-s2.0-<PII>-mmc<N>.xlsx`,
    where `<PII>` is the Crossref `alternative-id` for the DOI.
  - Nature family and Springer-hosted journals (including The EMBO Journal):
    `https://media.springernature.com/original/springer-static/esm/art%3A<DOI>/MediaObjects/<journal>_<year>_<article>_MOESM<N>_ESM.xlsx`.
    A 3,038-byte response is the "not found" placeholder, not a file.
  Science family (science.org), PNAS and PMC block scripted requests; their
  supplements have to be fetched through a browser session.
- Some papers cannot be drafted no matter how good the science, and should be
  triaged as nomination-only rather than chased:
  - the only tabular supplement is a PDF (PNAS publishes Dataset S1 as PDF;
    PMID 42640795, 42425084, 42611703 in 2026-w36);
  - the journal publishes per-figure "Source Data" but no supplementary tables,
    so no ranked list exists (PMID 42649291, 42608571);
  - the deposited table gives only raw per-sample intensities with no summary
    statistic (PMID 42629502, 42616903);
  - the gene column holds Ensembl IDs rather than symbols (PMID 42620705).
- A 14-day sweep of the current allowlist returns ~2,500 candidates, not the
  ~1,000 the runbook assumes. PLOS ONE and iScience alone are 45% of the volume
  and almost none of the yield. Title-pass triage is therefore the expensive
  step; budget for it (evidence: 2026-w36 sweep, 2,523 candidates, 54 journals).

### Proposed tool changes awaiting curator approval

- Teach the sweep or a small helper to resolve supplement URLs from the two CDN
  patterns above and download them, so drafting does not depend on ad-hoc
  browser work each week. Proposed in the 2026-w36 PR body.
- Decide whether mapping Ensembl gene IDs to HGNC symbols during extraction is
  allowed. The standing rule is "record symbols as published", which currently
  makes any Ensembl-only table undraftable. Proposed in the 2026-w36 PR body.
