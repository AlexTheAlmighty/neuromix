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
- The allowlist scopes the sweep, not the database. Two Life Science Alliance
  columns were accepted (41850723) from a journal contributing nothing before. A
  hand-nominated paper is judged on the list, not on where the sweep would have
  found it (curator, 2026-09-03).

## Triage: what the curator rejects

- Interactions must be measured, not inferred. Built identically, the AP-MS
  network of autism risk proteins (42658940) was kept and the protein-coabundance
  atlas (40316700) cut, the only backlog cut: computational association and
  co-expression networks are out however large. Alternative reading to watch: it
  was also the only column with no significance filter (PR #3).
- Non-neuro disease systems are cut on relevance whatever the list quality: lupus
  nephritis (42616839), osteosarcoma surfaceome (42647168), pancreatic cancer
  master regulators (42649389), retinitis pigmentosa retina screen (41962540).
  That last was genome-wide and in vivo and still cut, so "screens outrank DE"
  orders candidates within scope rather than widening it (PR #2).
- Saturation, not quality, drives the small cuts: both ADGRG1 microglial columns
  (40713954) and one of two near-twin ciliary columns (42105234, ventral). The cut
  lists are measurably no noisier; the reading is redundancy, with 88 microglial
  lists already and eleven added that cycle. Prefer one column per finding.
  Unconfirmed: ask before drafting the second half of a symmetric pair.
- The one CNS paper cut was hippocampal neurogenesis in major depression
  (42629468), also the one place a nominal p replaced a mostly-failing adjusted p.

## Extraction: mistakes not to repeat

- **Imperfect source data is not grounds to reject a list.** Messy symbols are the
  authors' doing, not ours: LOC identifiers, mixed-species protein groups and
  non-gene entries are recorded as published and the symbol report handles them.
  Ratovitski Table S1 (41850723) was set aside over cells like
  `LOC100605420; ...; rpl38; Rpl38; RPL38`; the curator overruled that (2026-09-03).
  Stable identifiers may also be *mapped* to HGNC during extraction, so an
  Ensembl-only or UniProt-only table is no longer a blocker either (curator,
  2026-08-31); 42620705 and 37906643 are re-openable on that ground. None of this
  licenses a broken *ranking*: the ties and direction lessons below are about the
  statistic, not the labels.
- Read the comparison direction off the raw counts, not the column name: a sheet
  named "control vs KO" makes a positive fold change mean *lower* in the knockout
  (42548798, sheet "UNT tom vs Ambra1").
- The decisive direction check is the perturbed gene itself: Tbk1 at rank 3 of its
  own down list (40858618), Adgrg1 at -0.74 (40713954), the bait topping its own
  pulldown (26598648, 40065072, 41912662, 41943580), MGRN1 at exactly the 2-fold
  its paper states (42678808). Without such an anchor, nominate rather than infer
  the sign: a direction error inverts the biology, the worst failure this pipeline
  can ship. Hence 39088390 and 41087751 left undrafted despite clean tables.
- A sheet named for a comparison does not guarantee the rows are genes: two TREM2
  sheets named `stats_high_disease_vs_low_disease` held lipids (41580393). Read
  the first data rows. Likewise a workbook of unlabelled per-cell-type sheets
  establishes no contrast: table 3 of 40087396 is ten DESeq2 dumps named only for
  the cell type, across four diseases, with no adjusted p. Two columns were drafted
  from it and withdrawn in audit. Require a legend naming the comparison.
- Do not re-filter an already-curated candidate list. The ciliary candidates
  (42105234) are the authors' filtered finding; re-applying p<=0.05 cut 67 to 8.
- Prefer a continuous intensity measure over a count when one table offers both.
  Ranking the tauopathy immunopeptidome by spectral count put 42 genes in a tie at
  the rank-100 cut and 19 keratin, haemoglobin and IgG entries in the top 100; the
  `Area brain_TG` peak-area column in the same sheet gave a 6-way tie and one
  contaminant, and the authors' own selection plus the finer statistic beat either
  alone (s41593-026-02427-5, curator asked whether Area was better, 2026-09-03).
- Inspect the ranking statistic's distribution first. Count survivors under a
  nominal p versus an FDR (41962540: 1,088 against 5), and count ties at a
  permutation floor or fold-change ceiling, which make the top of a column an
  arbitrary slice (163 and 371 tied, 41491239, dropped; 54 of 100 at a ceiling,
  36931259, dropped; 159 of 227 tied, 41120751, trimmed to the 68 truly ranked).
  A ceiling need not kill a column: where an evidence column exists, break the tie
  with it. Ratovitski Table S2 (41850723) pins 35 of 346 ratios at exactly 100.0,
  returned A to Z; Mascot score as secondary key restores a real order.
- Require both arms above the expression floor before ranking single-cell
  pseudobulk by fold change. In the Linville clozapine tables (42679819) many genes
  share one vehicle value, -2.7386, giving log2FC of 20 to 30 that mean only that
  one arm was zero; 46 genes reach FDR<0.05 and 21 survive the floor.
- Aging DE tables from single-cell data are often topped by mitochondrial genes
  and ribosomal pseudogenes. Prefer a cell-state contrast from the same paper when
  one exists (42664052, drafted for the DAM and IRM states; its parabiosis tables
  show the same tail, ~60 of 100 ribosomal).
- Rank by the paper's own summary statistic, not one replicate. The DCPS screen
  (41943580) carries two replicate scores, a combined score and a p value; the
  first draft used replicate 1 unfiltered. Look for a combined column and a p
  value before configuring an extraction (2026-08-31 audit).
- Adding a column to a paper already in the database: copy its Article Title and
  Article Link character for character. `build-data` keys articles on
  `title||url`, so one missing trailing period splits a paper into two article
  records and breaks one-vote-per-article weighting (42664052, caught in the build
  check, 2026-09-03).

## Process

- Supplement routes that work from a plain HTTP client. NCBI PMC gates downloads
  behind a proof-of-work and reCAPTCHA, and only 5 of 25 papers in a 14-day window
  had a PMC record, so it is the wrong first stop.
  - Elsevier and Cell Press: `ars.els-cdn.com/content/image/1-s2.0-<PII>-mmc<N>.xlsx`,
    `<PII>` being the Crossref `alternative-id`. Take it from Crossref, never by
    hand off the article URL: dropping the final check digit of
    `S2211-1247(26)01008-9` returns a 404 that reads exactly like "no supplement
    deposited" (2026-09-03). The route ignores the paywall, so a paywall alone is
    never grounds to file a Cell Press paper nomination-only: the Linville atlas
    (10.1016/j.cell.2026.08.006) has a gated full text and all fifteen supplements
    download anonymously.
  - Nature family and Springer-hosted (including The EMBO Journal):
    `media.springernature.com/original/springer-static/esm/art%3A<DOI>/MediaObjects/<journal>_<year>_<article>_MOESM<N>_ESM.xlsx`.
    A 3,038-byte response is the "not found" placeholder, not a file.
  - Anything in PMC: `ebi.ac.uk/europepmc/webservices/rest/<PMCID>/supplementaryFiles`
    returns every supplement as one zip, ungated, and `/fullTextXML` gives the
    legends. Retry on 500. Open access only, and months behind.
  - Science family: the article page permits a same-origin `fetch` of
    `/doi/suppl/<DOI>/suppl_file/<slug>_tables_s1_to_sN.zip` from a browser pane.
    PNAS still needs manual browser work.
- Store each column's extraction config beside its list. In the 2026-08-31 audit
  every column with a config re-derived byte-identically, and the one supplement
  saved from a gated site turned out to be a reCAPTCHA page. Check a download's
  first bytes before parsing it.
- Undraftable shapes, to triage nomination-only rather than chase: PDF-only
  supplements (42640795, 42425084, 42611703, 19955087); per-figure source data with
  no tables (42649291, 42608571, 41224995, 41430470) or only cluster-level stats
  (42457956); raw per-sample intensities with no summary statistic (42629502,
  42616903, 40053453); annotation matrices and crosslink lists (41005307, 41315310);
  nested instrument headers (40738907); hundred-megabyte tables (41285799, 40593524).
- A 14-day sweep returns ~2,500 candidates, not the ~1,000 the runbook assumes;
  PLOS ONE and iScience are 45% of the volume and almost none of the yield, so
  title-pass triage is the expensive step (2026-w36, 54 journals).

### Proposed tool changes awaiting curator approval

- Teach the sweep or a small helper to resolve supplement URLs from the CDN
  patterns above and download them, so drafting does not depend on ad-hoc browser
  work each week. Proposed in the 2026-w36 PR body; the curator is unsure, so it
  stays open.
