# Contributing

Found an incorrect value or source? The fastest path takes about 30 seconds:

[Open the project correction form](https://github.com/CorgiCorner/open-source-rank-trackers/issues/new?template=project-correction.yml)

You do not need to edit YAML or run the generator. Provide:

1. the project and cell to change;
2. the proposed value;
3. a public source that states or demonstrates the value; and
4. the date on which you verified the source.

Maintainers of listed projects are especially encouraged to review and correct
their rows. A correction is evaluated by the same source rules regardless of
who submits it.

## Submit a pull request

Corrections, new projects, stronger sources, and improvements to the generator
are also welcome as pull requests.

### Edit the data, not the generated files

Update `projects.yml`, then run:

```bash
npm ci
npm run generate
npm run check
```

CI rejects a pull request when `README.md`, `EVIDENCE.md`, or `METHODOLOGY.md`
does not exactly match the generator output.

Adding a project requires only a new entry in `projects.yml`. Feature columns
are declared in `comparison.feature_columns`; add the corresponding sourced
value under `features` for every project.

### Review a discovered candidate

`npm run candidates:discover` searches the configured GitHub topics and
full-text queries, records `source_topics` and `source_queries`, and applies the
mechanical and content filters. Only candidates that pass both automated stages
receive `pending-review`. Discovery never changes an existing human decision.
Explicit `source_seeds` are recorded separately and never counted as search
recall.

`filtered` is an automated outcome, not a human review. To keep the working file
readable, each filtered record stores only its repository, discovery-run
membership, status, and primary reason. Source and filter counts are frozen
inside the corresponding discovery-run snapshot. A missing detected OSI
license means GitHub did not identify one; it is not a claim that no license
exists.

After reviewing a candidate, change its status to `included`, `table-ready`,
`excluded`, `legacy`, or `pending-verification` and add `reviewed_at` plus the next
contiguous `review_order`. Copy the candidate's current stars to
`reviewed_stars`; this freezes the review-time ordering even when GitHub metrics
later change. Set `decision_run` to `discovery.active_run` and `review_origin`
to `systematic-review`. Review candidates by stars descending. An excluded
candidate also needs one of the closed-vocabulary `exclusion_reason` values
enforced by the validator.

Use `included` for the category decision. Promote it to `table-ready` only after
every comparison cell has public evidence; only table-ready candidates appear
in the active table. A `pending-verification` decision must record one concrete
`verification_question`, and unresolved candidates neither advance nor reset
the stop-rule counter.

Run `npm run candidates:queue` to display candidates in the enforced review
order: stars descending, then repository name. The command accepts an optional
`--limit` argument.

`npm run candidates:stats` derives human decision counts from the records and
reads discovery aggregates written by the discovery script. `reviewed` counts
only human statuses and never includes automatically filtered records. Do not
hand-edit counters.
The configured stopping rule is defined in `scripts/policy.ts` and records the
stars at the stopping point.

### Evidence rules

- Every comparison cell needs a publicly accessible source.
- Every comparison cell needs its own `value`, `source`, and `verified_at`.
- Every project needs a declared `evidence_set` containing its complete
  repository README and complete official documentation corpus.
- Search the full declared evidence set for every comparison cell, not only for
  cells expected to be present.
- Prefer official documentation and files in the project's own repository.
- Private documentation, private repositories, and maintainer-only knowledge
  are not valid sources.
- Use `unknown` only when the full declared evidence set does not document a
  capability.
- Do not turn missing documentation into a negative claim.
- Keep notes factual and short.

## Licensing

Contributions to programs in `scripts/` are accepted under Apache-2.0.
Contributions to `projects.yml`, `candidates.yml`, and the generated factual
comparison files are accepted under CC BY 4.0.
