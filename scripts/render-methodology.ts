import {
  candidateStats,
  type FilterReason,
  type CandidateData,
  type CandidateStats,
  type DiscoveryRun,
} from "./candidate-data.ts";
import type { ProjectData } from "./data.ts";
import {
  candidateStaleAfterMonths,
  githubSearchResultLimit,
  reviewStopAfterConsecutiveWithoutInclusion,
} from "./policy.ts";

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function runTable(
  candidates: CandidateData,
  rows: Array<{
    label: string;
    value: (run: DiscoveryRun, stats: CandidateStats) => string;
  }>,
) {
  const runs = candidates.discovery.runs;
  const headers = runs.map((run) =>
    run.id === candidates.discovery.active_run ? `${run.id} (active)` : run.id,
  );
  const stats = new Map(
    runs.map((run) => [run.id, candidateStats(candidates, run.id)]),
  );
  return `| Metric | ${headers.join(" | ")} |
| --- | ${runs.map(() => "---:").join(" | ")} |
${rows
  .map(
    (row) =>
      `| ${row.label} | ${runs
        .map((run) => row.value(run, stats.get(run.id)!))
        .join(" | ")} |`,
  )
  .join("\n")}`;
}

function sourceRows(candidates: CandidateData) {
  const labels = [
    ...new Set(
      candidates.discovery.runs.flatMap((run) => [
        ...run.topics.map((topic) => `topic:${topic}`),
        ...run.queries.map((query) => `query:${query.key}`),
        ...run.seeds.map((seed) => `seed:${seed.repository}`),
      ]),
    ),
  ];
  return labels.map((label) => ({
    label: `\`${label}\``,
    value: (run: DiscoveryRun) => {
      const [kind, ...rest] = label.split(":");
      const key = rest.join(":");
      if (kind === "topic") {
        return formatCount(run.summary.source_counts.topics[key] ?? 0);
      }
      if (kind === "query") {
        return formatCount(run.summary.source_counts.queries[key] ?? 0);
      }
      return formatCount(run.summary.source_counts.seeds[key] ?? 0);
    },
  }));
}

function filterReasonRows(candidates: CandidateData) {
  const reasons = [
    ...new Set(
      candidates.discovery.runs.flatMap((run) =>
        Object.keys(run.summary.filtered_by_primary_reason),
      ),
    ),
  ].toSorted();
  return reasons.map((reason) => ({
    label: `\`${reason}\``,
    value: (run: DiscoveryRun) =>
      formatCount(
        run.summary.filtered_by_primary_reason[reason as FilterReason] ?? 0,
      ),
  }));
}

export function renderMethodology(
  data: ProjectData,
  candidates: CandidateData,
) {
  const funnelRows = [
    {
      label: "Filters evaluated",
      value: (run: DiscoveryRun) => run.filters_evaluated_at,
    },
    {
      label: "GitHub topics",
      value: (run: DiscoveryRun) => formatCount(run.topics.length),
    },
    {
      label: "Full-text queries",
      value: (run: DiscoveryRun) => formatCount(run.queries.length),
    },
    {
      label: "Repositories discovered",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.discovered),
    },
    {
      label: "Passed mechanical filters",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.passed_mechanical_filters),
    },
    {
      label: "Passed content filters",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.passed_content_filters),
    },
    {
      label: "Pending review",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.pending_review),
    },
    {
      label: "Human decisions",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.reviewed),
    },
    {
      label: "Pending verification",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.pending_verification),
    },
    {
      label: "Included",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.included),
    },
    {
      label: "Table-ready",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.table_ready),
    },
    {
      label: "Excluded",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.excluded),
    },
    {
      label: "Legacy",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.legacy),
    },
    {
      label: "Known-positive search recall",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        `${formatCount(stats.known_positive_search_recall)} / ${formatCount(stats.known_positive_total)}`,
    },
    {
      label: "Known-positive filter recall",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        `${formatCount(stats.known_positive_filter_recall)} / ${formatCount(stats.known_positive_total)}`,
    },
  ];
  const automatedRows = [
    {
      label: "Automatically filtered",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.automatically_filtered),
    },
    {
      label: "Stopped at mechanical stage",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.mechanically_filtered),
    },
    {
      label: "No OSI license detected",
      value: (_run: DiscoveryRun, stats: CandidateStats) =>
        formatCount(stats.no_osi_license_detected),
    },
    ...filterReasonRows(candidates),
  ];

  return `<!-- Generated by scripts/generate-readme.ts from projects.yml and candidates.yml. Do not edit by hand. -->

# Methodology for ${data.comparison.title}

This document describes how projects are discovered, reviewed, compared, and
kept current. [Back to the comparison](README.md).

## Evidence protocol

Every comparison cell uses a public evidence set declared before evaluation;
private sources and maintainer-only knowledge are excluded.

Maturity is calculated mechanically, in this order:

1. archived repositories are \`Legacy\`;
2. repositories with no releases or less than three months of history are
   \`Experimental\`;
3. repositories older than twelve months, with at least one release and a
   commit in the last six months, are \`Mature\`; and
4. all others are \`Active\`.

\`Preview\` is intentionally not used because it has no objective equivalent in
the stored GitHub data.

A weekly workflow refreshes project metrics and checks source links. Metric
dates change only when a stored value or its source changes. CI rejects
generated files that do not match their data sources.

## Versioned discovery runs

Each column is one discovery corpus. Starting another run adds a column instead
of rewriting the earlier funnel. Candidate membership is recorded per run, and
each human decision identifies the run against which it was made.

${runTable(candidates, funnelRows)}

Human review proceeds by stars descending. The configured stop rule activates
after ${reviewStopAfterConsecutiveWithoutInclusion} consecutive resolved decisions without an inclusion;
pending verification neither advances nor resets that counter.

Archived repositories are removed from the automatic review queue. A legacy
classification therefore requires an explicit manual review or seed.

## Discovery sources

Counts overlap because one repository may match several discovery sources.

${runTable(candidates, sourceRows(candidates))}

Explicit seeds are stored with their reason in each discovery-run snapshot and
are excluded from search recall.

## Automated filters

${runTable(candidates, automatedRows)}

Mechanical filters use GitHub's archived status, detected license, and last
push date. A repository is stale after ${candidateStaleAfterMonths} months without a push. \`No OSI
license detected\` means GitHub did not identify an OSI-approved license; it
does not prove that no license exists.

Content filters use explicit, versioned patterns over repository descriptions
and READMEs. Repository searches are date-partitioned when GitHub reports more
than [${formatCount(githubSearchResultLimit.value)} results](${githubSearchResultLimit.source}).
`;
}
