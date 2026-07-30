# Repository guidance

- `projects.yml` is the comparison source of truth and `candidates.yml` is the
  discovery-funnel source of truth. `README.md`, `EVIDENCE.md`, and
  `METHODOLOGY.md` are generated from them and must not be edited by hand.
- Every comparison cell must link to a publicly accessible source. Private
  documentation and maintainer-only knowledge are not valid evidence.
- Every comparison cell must contain `value`, `source`, and `verified_at`.
- Every project must declare an `evidence_set` before its cells are evaluated.
  It must include the complete repository README and the complete official
  documentation corpus available for that project.
- Adding a project must require only a new `projects.yml` entry.
- Feature columns are declared in `comparison.feature_columns`. Adding a feature
  must require only that configuration entry and one sourced value per project.
- `scripts/discover-candidates.ts` is the only writer for discovery metadata and
  automated filter results in `candidates.yml`. It searches public repositories
  across every configured topic and full-text query, partitions searches at the
  sourced API cap in `scripts/policy.ts`, and fails on incomplete results.
- Store topic, full-text, and explicit-seed provenance separately as
  `source_topics`, `source_queries`, and `source_seeds`. Never count a seed as
  search recall. Keep candidates sorted by `repository`.
- Automated filters may set only `filtered` or `pending-review`. They must
  preserve human decisions and never increment `reviewed`. Store `filtered`
  records only with repository, run membership, status, and primary reason.
  Discovery aggregates belong to their versioned discovery run.
- `reviewed` is derived only from human review statuses:
  `pending-verification`, `included`, `table-ready`, `excluded`, and `legacy`.
  Never hand-edit funnel counters or discovery aggregates.
- Review `pending-review` candidates by stars descending. Record the contiguous
  `review_order`, freeze the current value as `reviewed_stars`, and attach the
  decision to `discovery.active_run`. The stop threshold is defined in
  `scripts/policy.ts`.
- Use `unknown` when the reviewed public sources do not document a capability.
  Do not infer a negative claim from missing documentation.
- Keep active projects sorted by GitHub stars in generated output. The project
  name is the deterministic tie-breaker.
- Contributions and corrections from listed project maintainers are welcome.
- Pin every GitHub Action to a full commit SHA.
- Use the Node version in `.nvmrc` and the npm version in `package.json`.
- Factual data and the generated comparison use CC BY 4.0. Programs in `scripts/`
  use Apache-2.0.
- Do not use the Unicode em dash character. Use a plain hyphen instead.
