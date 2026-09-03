# NeurOmix

**Read [README.md](README.md) before starting work.** It holds the repository map, the
criteria and house style for gene lists, the manuscript-versus-code divergences, and the
mistakes that are expensive here. Read it in full whenever the task touches the database,
the site, or curation. Before adding gene lists, also read
[curation/RUNBOOK.md](curation/RUNBOOK.md) and [curation/LESSONS.md](curation/LESSONS.md)
in full; LESSONS.md overrides general guidance wherever they conflict.

These few rules apply to every session, whatever the task:

- **Confirm you are current before trusting anything:**
  `git fetch origin && git log --oneline HEAD..origin/main`. Worktrees are often branched
  from a stale commit, so the CSV can be short of lists and files may exist that `main`
  has deleted.
- **`NeurOmics Database.csv` is the single source of truth.** Everything under
  `neuromix-web/public/data/` is generated and gitignored. Never hand-edit it: fix the CSV
  or the build script, then rerun `node neuromix-web/tools/build-data.mjs`.
- **Never push to `main`.** A push to `main` on `origin` (AlexTheAlmighty/neuromix)
  publishes the live site. Push branches to `fork` (Number1q/neuromix).
- **Take counts from the build output, never from prose,** including prose in README.md,
  in `neuromix-web/README.md`, and in the manuscript. All of them are expired snapshots.
- **Nothing enters the database without a human merge.** Open the pull request and stop.
- **The database is broader than neuroscience.** Roughly 136 lists come from generic cell
  lines with no neuro content. Do not reject or delete material for being off-topic
  without reading the criteria in README.md first.
- **No em dashes in any writing.**
