import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  activeProjects,
  repositoryRoot,
  type ProjectData,
} from "./data.ts";
import { reviewStopAfterConsecutiveWithoutInclusion } from "./policy.ts";

export const discoveryTopics = [
  "rank-tracking",
  "keyword-tracker",
  "rank-tracker",
] as const;

export const discoveryQueries = [
  {
    key: "rank-tracking-phrases",
    query: '"rank tracker" OR "rank tracking" in:name,description',
  },
  {
    key: "search-position-phrases",
    query: '"keyword position" OR "SERP position" in:name,description',
  },
  {
    key: "seo-tools-rank-tracker-readme",
    query: 'topic:seo-tools "rank tracker" in:readme',
  },
  {
    key: "seo-tools-rank-tracking-readme",
    query: 'topic:seo-tools "rank tracking" in:readme',
  },
  {
    key: "self-hosted-seo-rank-tracker-readme",
    query: '"self-hosted SEO" "rank tracker" in:readme',
  },
  {
    key: "keyword-position-checker-readme",
    query: '"Keyword Position Checker" in:readme',
  },
] as const;

export const discoverySeeds = [
  {
    repository: "seopanel/Seo-Panel",
    name: "SEO Panel",
    reason: "GitHub Search does not return the canonical repository",
  },
] as const;

export const knownPositiveRepositories = [
  "towfiqi/serpbear",
  "itsjwill/seoctopus",
  "bensblueprints/serpdeck-mvp",
  "testedmedia/seo-command-center",
  "seopanel/Seo-Panel",
  "Decodo/rank-tracker",
  "serpapi/serptrail",
  "every-app/open-seo",
] as const;

export const candidateStatuses = [
  "filtered",
  "pending-review",
  "pending-verification",
  "included",
  "table-ready",
  "excluded",
  "legacy",
] as const;

export const humanReviewStatuses = [
  "pending-verification",
  "included",
  "table-ready",
  "excluded",
  "legacy",
] as const;

export const inclusionStatuses = ["included", "table-ready"] as const;

export const reviewOrigins = [
  "pre-systematic-baseline",
  "systematic-review",
] as const;

export const exclusionReasons = [
  "duplicate-or-fork",
  "hosted-only",
  "library-or-api-only",
  "no-rank-history",
  "not-rank-tracking",
  "not-self-hostable",
  "single-shot-checks",
  "source-unavailable",
] as const;

export const mechanicalFilterReasons = [
  "legacy-unmaintained",
  "no-osi-license-detected",
] as const;

export const contentFilterReasons = [
  "excluded-ranking-domain",
  "gsc-only",
  "no-rank-tracking-signal",
  "unrelated-seo-tool",
] as const;

export type CandidateStatus = (typeof candidateStatuses)[number];
export type HumanReviewStatus = (typeof humanReviewStatuses)[number];
export type ReviewOrigin = (typeof reviewOrigins)[number];
export type ExclusionReason = (typeof exclusionReasons)[number];
export type MechanicalFilterReason = (typeof mechanicalFilterReasons)[number];
export type ContentFilterReason = (typeof contentFilterReasons)[number];
export type FilterReason = MechanicalFilterReason | ContentFilterReason;

export interface AutomatedFilter {
  result: "passed" | "filtered";
  failed_stage: "mechanical" | "content" | null;
  mechanical: {
    reasons: MechanicalFilterReason[];
    license_spdx: string | null;
    osi_approved: boolean;
    archived: boolean;
    pushed_at: string | null;
    stale_cutoff: string;
  };
  content: {
    evaluated: boolean;
    readme_url: string | null;
    readme_available: boolean;
    positive_signals: string[];
    excluded_domain_signals: string[];
    unrelated_seo_signals: string[];
    reasons: ContentFilterReason[];
  };
}

export interface ReviewCandidate {
  repository: string;
  url: string;
  description: string | null;
  source_topics: string[];
  source_queries: string[];
  source_seeds: string[];
  discovered_at: string;
  discovery_runs: string[];
  status: Exclude<CandidateStatus, "filtered">;
  decision_run?: string;
  reviewed_at?: string;
  review_order?: number;
  reviewed_stars?: number;
  review_origin?: ReviewOrigin;
  verification_question?: string;
  exclusion_reason?: ExclusionReason;
  notes?: string;
  discovery_snapshot: {
    stars: number;
    archived: boolean;
    fork: boolean;
    pushed_at: string | null;
    license_spdx: string | null;
  };
  automated_filter: AutomatedFilter;
}

export interface FilteredCandidate {
  repository: string;
  discovery_runs: string[];
  status: "filtered";
  reason: FilterReason;
}

export type Candidate = ReviewCandidate | FilteredCandidate;

export interface DiscoverySummary {
  discovered: number;
  passed_mechanical_filters: number;
  passed_content_filters: number;
  automatically_filtered: number;
  mechanically_filtered: number;
  no_osi_license_detected: number;
  known_positive_total: number;
  known_positive_search_recall: number;
  known_positive_filter_recall: number;
  source_counts: {
    topics: Record<string, number>;
    queries: Record<string, number>;
    seeds: Record<string, number>;
  };
  filtered_by_primary_reason: Partial<Record<FilterReason, number>>;
}

export interface CandidateData {
  version: number;
  discovery: {
    active_run: string;
    runs: DiscoveryRun[];
  };
  review: {
    order: "stars-descending";
  };
  candidates: Candidate[];
}

export interface DiscoveryRun {
  id: string;
  topics: string[];
  queries: Array<{
    key: string;
    query: string;
  }>;
  seeds: Array<{
    repository: string;
    name: string;
    reason: string;
  }>;
  filters_evaluated_at: string;
  summary: DiscoverySummary;
  final_stats?: CandidateStats;
}

export interface CandidateDiscovery {
  repository: string;
  url: string;
  description: string | null;
  source_topics: string[];
  source_queries: string[];
  source_seeds: string[];
  stars: number;
  archived: boolean;
  fork: boolean;
  pushed_at: string | null;
  license_spdx: string | null;
  automated_filter: AutomatedFilter;
}

export interface CandidateStats {
  discovered: number;
  passed_mechanical_filters: number;
  passed_content_filters: number;
  automatically_filtered: number;
  mechanically_filtered: number;
  no_osi_license_detected: number;
  pending_review: number;
  reviewed: number;
  pending_verification: number;
  included: number;
  table_ready: number;
  excluded: number;
  legacy: number;
  known_positive_recall: number;
  known_positive_total: number;
  known_positive_search_recall: number;
  known_positive_filter_recall: number;
  consecutive_reviewed_without_inclusion: number;
  review_stop_rule_reached: boolean;
  stopped_at_stars: number | null;
  pre_systematic_included: number;
  systematic_reviewed: number;
  systematic_resolved: number;
  systematic_pending_verification: number;
  systematic_included: number;
  systematic_excluded: number;
  systematic_legacy: number;
}

export const candidatesPath = path.join(repositoryRoot, "candidates.yml");

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T/;
const repositoryPattern = /^[^/]+\/[^/]+$/;
const humanReviewStatusSet = new Set<string>(humanReviewStatuses);
const candidateStatCountKeys = [
  "discovered",
  "passed_mechanical_filters",
  "passed_content_filters",
  "automatically_filtered",
  "mechanically_filtered",
  "no_osi_license_detected",
  "pending_review",
  "reviewed",
  "pending_verification",
  "included",
  "table_ready",
  "excluded",
  "legacy",
  "known_positive_recall",
  "known_positive_total",
  "known_positive_search_recall",
  "known_positive_filter_recall",
  "consecutive_reviewed_without_inclusion",
  "pre_systematic_included",
  "systematic_reviewed",
  "systematic_resolved",
  "systematic_pending_verification",
  "systematic_included",
  "systematic_excluded",
  "systematic_legacy",
] as const satisfies readonly (keyof CandidateStats)[];

export function normalizeCandidateDescription(description: string | null) {
  return description?.replace(/\s*\u2014\s*/g, " - ") ?? null;
}

export function isHumanReviewStatus(
  status: CandidateStatus,
): status is HumanReviewStatus {
  return humanReviewStatusSet.has(status);
}

export function isReviewCandidate(
  candidate: Candidate,
): candidate is ReviewCandidate {
  return candidate.status !== "filtered";
}

export function isIncludedStatus(status: CandidateStatus) {
  return inclusionStatuses.includes(
    status as (typeof inclusionStatuses)[number],
  );
}

export async function loadCandidateData(): Promise<CandidateData> {
  return YAML.parse(await readFile(candidatesPath, "utf8")) as CandidateData;
}

export function stringifyCandidateData(data: CandidateData) {
  const document = new YAML.Document(data);
  for (const [index] of data.candidates.entries()) {
    const runs = document.getIn(
      ["candidates", index, "discovery_runs"],
      true,
    );
    if (YAML.isSeq(runs)) runs.flow = true;
  }
  return document.toString({
    flowCollectionPadding: false,
    lineWidth: 0,
  });
}

function primaryFilterReason(discovery: CandidateDiscovery): FilterReason {
  const reason =
    discovery.automated_filter.mechanical.reasons[0] ??
    discovery.automated_filter.content.reasons[0];
  if (!reason) {
    throw new Error(
      `${discovery.repository} is filtered without a recorded filter reason`,
    );
  }
  return reason;
}

function countDiscoverySources(
  discoveries: CandidateDiscovery[],
  key: "source_topics" | "source_queries" | "source_seeds",
  configured: readonly string[],
) {
  return Object.fromEntries(
    configured.map((value) => [
      value,
      discoveries.filter((candidate) => candidate[key].includes(value)).length,
    ]),
  );
}

function discoverySummary(
  discoveries: CandidateDiscovery[],
): DiscoverySummary {
  const filtered = discoveries.filter(
    (candidate) => candidate.automated_filter.result === "filtered",
  );
  const primaryReasonCounts: Partial<Record<FilterReason, number>> = {};
  for (const candidate of filtered) {
    const reason = primaryFilterReason(candidate);
    primaryReasonCounts[reason] = (primaryReasonCounts[reason] ?? 0) + 1;
  }
  const searchedRepositories = new Set(
    discoveries
      .filter(
        (candidate) =>
          candidate.source_topics.length > 0 ||
          candidate.source_queries.length > 0,
      )
      .map((candidate) => candidate.repository.toLowerCase()),
  );

  return {
    discovered: discoveries.length,
    passed_mechanical_filters: discoveries.filter(
      (candidate) =>
        candidate.automated_filter.mechanical.reasons.length === 0,
    ).length,
    passed_content_filters: discoveries.filter(
      (candidate) => candidate.automated_filter.result === "passed",
    ).length,
    automatically_filtered: filtered.length,
    mechanically_filtered: discoveries.filter(
      (candidate) =>
        candidate.automated_filter.mechanical.reasons.length > 0,
    ).length,
    no_osi_license_detected: discoveries.filter((candidate) =>
      candidate.automated_filter.mechanical.reasons.includes(
        "no-osi-license-detected",
      ),
    ).length,
    known_positive_total: knownPositiveRepositories.length,
    known_positive_search_recall: knownPositiveRepositories.filter(
      (repository) => searchedRepositories.has(repository.toLowerCase()),
    ).length,
    known_positive_filter_recall: discoveries.filter(
      (candidate) =>
        knownPositiveRepositories.some(
          (repository) =>
            repository.toLowerCase() === candidate.repository.toLowerCase(),
        ) && candidate.automated_filter.result === "passed",
    ).length,
    source_counts: {
      topics: countDiscoverySources(
        discoveries,
        "source_topics",
        discoveryTopics,
      ),
      queries: countDiscoverySources(
        discoveries,
        "source_queries",
        discoveryQueries.map((query) => query.key),
      ),
      seeds: countDiscoverySources(
        discoveries,
        "source_seeds",
        discoverySeeds.map((seed) => seed.repository),
      ),
    },
    filtered_by_primary_reason: primaryReasonCounts,
  };
}

export function activeDiscoveryRun(data: CandidateData) {
  const run = data.discovery.runs.find(
    (candidate) => candidate.id === data.discovery.active_run,
  );
  if (!run) {
    throw new Error(
      `active discovery run ${data.discovery.active_run} does not exist`,
    );
  }
  return run;
}

export function candidateStats(
  data: CandidateData,
  runId = data.discovery.active_run,
): CandidateStats {
  const run = data.discovery.runs.find((candidate) => candidate.id === runId);
  if (!run) throw new Error(`discovery run ${runId} does not exist`);
  if (runId !== data.discovery.active_run && run.final_stats) {
    return structuredClone(run.final_stats);
  }

  const runCandidates = data.candidates.filter((candidate) =>
    candidate.discovery_runs.includes(runId),
  );
  const runDecisions = runCandidates.filter(
    (candidate): candidate is ReviewCandidate =>
      isReviewCandidate(candidate) &&
      isHumanReviewStatus(candidate.status) &&
      candidate.decision_run === runId,
  );
  const countDecision = (status: HumanReviewStatus) =>
    runDecisions.filter((candidate) => candidate.status === status).length;
  const systematicDecisions = runDecisions.filter(
    (candidate) => candidate.review_origin === "systematic-review",
  );
  const systematicCount = (status: HumanReviewStatus) =>
    systematicDecisions.filter((candidate) => candidate.status === status)
      .length;
  const repositoryNames = new Set(
    runCandidates.map((candidate) => candidate.repository.toLowerCase()),
  );
  const reviewedInOrder = systematicDecisions
    .filter((candidate) => candidate.status !== "pending-verification")
    .toSorted(
      (left, right) => (left.review_order ?? 0) - (right.review_order ?? 0),
    );
  let consecutiveWithoutInclusion = 0;
  for (const candidate of reviewedInOrder.toReversed()) {
    if (isIncludedStatus(candidate.status)) break;
    consecutiveWithoutInclusion += 1;
  }
  const stopRuleReached =
    consecutiveWithoutInclusion >=
    reviewStopAfterConsecutiveWithoutInclusion;

  return {
    discovered: run.summary.discovered,
    passed_mechanical_filters: run.summary.passed_mechanical_filters,
    passed_content_filters: run.summary.passed_content_filters,
    automatically_filtered: run.summary.automatically_filtered,
    mechanically_filtered: run.summary.mechanically_filtered,
    no_osi_license_detected: run.summary.no_osi_license_detected,
    pending_review: runCandidates.filter(
      (candidate): candidate is ReviewCandidate =>
        isReviewCandidate(candidate) &&
        candidate.automated_filter.result === "passed" &&
        candidate.decision_run !== runId,
    ).length,
    reviewed: runDecisions.length,
    pending_verification: countDecision("pending-verification"),
    included: countDecision("included") + countDecision("table-ready"),
    table_ready: countDecision("table-ready"),
    excluded: countDecision("excluded"),
    legacy: countDecision("legacy"),
    known_positive_recall: knownPositiveRepositories.filter((repository) =>
      repositoryNames.has(repository.toLowerCase()),
    ).length,
    known_positive_total: run.summary.known_positive_total,
    known_positive_search_recall: run.summary.known_positive_search_recall,
    known_positive_filter_recall: run.summary.known_positive_filter_recall,
    consecutive_reviewed_without_inclusion: consecutiveWithoutInclusion,
    review_stop_rule_reached: stopRuleReached,
    stopped_at_stars: stopRuleReached
      ? reviewedInOrder.at(-1)?.reviewed_stars ?? null
      : null,
    pre_systematic_included: runDecisions.filter(
      (candidate) =>
        isIncludedStatus(candidate.status) &&
        candidate.review_origin === "pre-systematic-baseline",
    ).length,
    systematic_reviewed: systematicDecisions.length,
    systematic_resolved: systematicDecisions.filter(
      (candidate) => candidate.status !== "pending-verification",
    ).length,
    systematic_pending_verification: systematicCount("pending-verification"),
    systematic_included:
      systematicCount("included") + systematicCount("table-ready"),
    systematic_excluded: systematicCount("excluded"),
    systematic_legacy: systematicCount("legacy"),
  };
}

export function candidateReviewQueue(data: CandidateData) {
  const runId = data.discovery.active_run;
  return data.candidates
    .filter(
      (candidate): candidate is ReviewCandidate =>
        isReviewCandidate(candidate) &&
        candidate.discovery_runs.includes(runId) &&
        candidate.automated_filter.result === "passed" &&
        candidate.decision_run !== runId,
    )
    .toSorted(
      (left, right) =>
        right.discovery_snapshot.stars - left.discovery_snapshot.stars ||
        left.repository.localeCompare(right.repository, "en", {
          sensitivity: "base",
        }),
    );
}

export function mergeCandidateDiscoveries(
  existing: CandidateData | null,
  discoveries: CandidateDiscovery[],
  discoveredAt: string,
): CandidateData {
  const existingByRepository = new Map(
    (existing?.candidates ?? []).map((candidate) => [
      candidate.repository.toLowerCase(),
      candidate,
    ]),
  );
  const byRepository = new Map<string, Candidate>();

  for (const discovery of discoveries) {
    const key = discovery.repository.toLowerCase();
    const previous = existingByRepository.get(key);
    const reviewed =
      previous &&
      isReviewCandidate(previous) &&
      isHumanReviewStatus(previous.status)
        ? previous
        : undefined;
    const discoveryRuns = [
      ...new Set([...(previous?.discovery_runs ?? []), discoveredAt]),
    ].toSorted();
    const status =
      reviewed?.status ??
      (discovery.automated_filter.result === "passed"
        ? "pending-review"
        : "filtered");

    if (status === "filtered") {
      byRepository.set(key, {
        repository: discovery.repository,
        discovery_runs: discoveryRuns,
        status,
        reason: primaryFilterReason(discovery),
      });
      continue;
    }

    byRepository.set(key, {
      repository: discovery.repository,
      url: discovery.url,
      description: normalizeCandidateDescription(discovery.description),
      source_topics: [...discovery.source_topics].toSorted(),
      source_queries: [...discovery.source_queries].toSorted(),
      source_seeds: [...discovery.source_seeds].toSorted(),
      discovered_at:
        previous && isReviewCandidate(previous)
          ? previous.discovered_at
          : discoveredAt,
      discovery_runs: discoveryRuns,
      status,
      ...(reviewed?.decision_run
        ? { decision_run: reviewed.decision_run }
        : {}),
      ...(reviewed?.reviewed_at ? { reviewed_at: reviewed.reviewed_at } : {}),
      ...(reviewed?.review_order ? { review_order: reviewed.review_order } : {}),
      ...(reviewed?.reviewed_stars !== undefined
        ? { reviewed_stars: reviewed.reviewed_stars }
        : {}),
      ...(reviewed?.review_origin
        ? { review_origin: reviewed.review_origin }
        : {}),
      ...(reviewed?.verification_question
        ? { verification_question: reviewed.verification_question }
        : {}),
      ...(reviewed?.exclusion_reason
        ? { exclusion_reason: reviewed.exclusion_reason }
        : {}),
      ...(reviewed?.notes ? { notes: reviewed.notes } : {}),
      discovery_snapshot: {
        stars: discovery.stars,
        archived: discovery.archived,
        fork: discovery.fork,
        pushed_at: discovery.pushed_at,
        license_spdx: discovery.license_spdx,
      },
      automated_filter: structuredClone(discovery.automated_filter),
    });
  }

  for (const [key, previous] of existingByRepository) {
    if (!byRepository.has(key)) {
      byRepository.set(key, structuredClone(previous));
    }
  }

  const previousRuns = structuredClone(existing?.discovery.runs ?? []);
  if (existing && existing.discovery.active_run !== discoveredAt) {
    const previousActive = previousRuns.find(
      (run) => run.id === existing.discovery.active_run,
    );
    if (previousActive && !previousActive.final_stats) {
      previousActive.final_stats = candidateStats(
        existing,
        existing.discovery.active_run,
      );
    }
  }
  const currentRun: DiscoveryRun = {
    id: discoveredAt,
    topics: [...discoveryTopics],
    queries: discoveryQueries.map((entry) => ({ ...entry })),
    seeds: discoverySeeds.map((entry) => ({ ...entry })),
    filters_evaluated_at: discoveredAt,
    summary: discoverySummary(discoveries),
  };
  const runs = previousRuns.filter((run) => run.id !== discoveredAt);
  runs.push(currentRun);

  return {
    version: 5,
    discovery: {
      active_run: discoveredAt,
      runs,
    },
    review: {
      order: "stars-descending",
    },
    candidates: [...byRepository.values()].toSorted((left, right) =>
      left.repository.localeCompare(right.repository, "en", {
        sensitivity: "base",
      }),
    ),
  };
}

function validateSortedConfiguredValues(
  values: unknown,
  configured: readonly string[],
  path: string,
  errors: string[],
  allowEmpty = true,
) {
  if (
    !Array.isArray(values) ||
    (!allowEmpty && values.length === 0) ||
    values.some((value) => typeof value !== "string" || !configured.includes(value))
  ) {
    errors.push(`${path} must contain configured values`);
  } else if (
    JSON.stringify(values) !== JSON.stringify([...new Set(values)].toSorted())
  ) {
    errors.push(`${path} must be unique and sorted`);
  }
}

function validateFrozenStats(
  stats: CandidateStats | undefined,
  run: DiscoveryRun,
  prefix: string,
  errors: string[],
) {
  if (!stats) return;

  for (const key of candidateStatCountKeys) {
    if (!Number.isInteger(stats[key]) || stats[key] < 0) {
      errors.push(`${prefix}.${key} must be a non-negative integer`);
    }
  }
  if (typeof stats.review_stop_rule_reached !== "boolean") {
    errors.push(`${prefix}.review_stop_rule_reached must be boolean`);
  }
  if (
    stats.stopped_at_stars !== null &&
    (!Number.isInteger(stats.stopped_at_stars) ||
      stats.stopped_at_stars < 0)
  ) {
    errors.push(
      `${prefix}.stopped_at_stars must be a non-negative integer or null`,
    );
  }
  for (const key of [
    "discovered",
    "passed_mechanical_filters",
    "passed_content_filters",
    "automatically_filtered",
    "mechanically_filtered",
    "no_osi_license_detected",
    "known_positive_total",
    "known_positive_search_recall",
    "known_positive_filter_recall",
  ] as const) {
    if (stats[key] !== run.summary[key]) {
      errors.push(`${prefix}.${key} must match the discovery-run summary`);
    }
  }
}

export function validateCandidateData(data: CandidateData) {
  const errors: string[] = [];
  if (data?.version !== 5) errors.push("candidates.version must be 5");
  if (!datePattern.test(data?.discovery?.active_run ?? "")) {
    errors.push("candidates.discovery.active_run must use YYYY-MM-DD");
  }
  if (
    !Array.isArray(data?.discovery?.runs) ||
    data.discovery.runs.length === 0
  ) {
    errors.push("candidates.discovery.runs must be a non-empty array");
  }
  const runs = data?.discovery?.runs ?? [];
  const runIds = new Set<string>();
  let previousRunId = "";
  for (const [index, run] of runs.entries()) {
    const prefix = `candidates.discovery.runs.${index}`;
    if (!datePattern.test(run?.id ?? "")) {
      errors.push(`${prefix}.id must use YYYY-MM-DD`);
    }
    if (runIds.has(run?.id)) errors.push(`${prefix}.id must be unique`);
    runIds.add(run?.id);
    if (previousRunId && previousRunId > run.id) {
      errors.push("candidates.discovery.runs must be sorted by id");
    }
    previousRunId = run?.id ?? "";
    if (!datePattern.test(run?.filters_evaluated_at ?? "")) {
      errors.push(`${prefix}.filters_evaluated_at must use YYYY-MM-DD`);
    }
    const queryKeys = run?.queries?.map((entry) => entry.key) ?? [];
    const seedRepositories =
      run?.seeds?.map((entry) => entry.repository) ?? [];
    for (const [key, configured] of [
      ["topics", run?.topics ?? []],
      ["queries", queryKeys],
      ["seeds", seedRepositories],
    ] as const) {
      const counts = run?.summary?.source_counts?.[key];
      if (
        !counts ||
        JSON.stringify(Object.keys(counts)) !==
          JSON.stringify([...configured])
      ) {
        errors.push(`${prefix}.summary.source_counts.${key} must match the run`);
      } else if (
        Object.values(counts).some(
          (count) => !Number.isInteger(count) || count < 0,
        )
      ) {
        errors.push(
          `${prefix}.summary.source_counts.${key} must contain non-negative integers`,
        );
      }
    }
    for (const key of [
      "discovered",
      "passed_mechanical_filters",
      "passed_content_filters",
      "automatically_filtered",
      "mechanically_filtered",
      "no_osi_license_detected",
      "known_positive_total",
      "known_positive_search_recall",
      "known_positive_filter_recall",
    ] as const) {
      if (
        !Number.isInteger(run?.summary?.[key]) ||
        (run?.summary?.[key] ?? -1) < 0
      ) {
        errors.push(`${prefix}.summary.${key} must be a non-negative integer`);
      }
    }
    const reasonCounts = run?.summary?.filtered_by_primary_reason;
    if (
      !reasonCounts ||
      Object.entries(reasonCounts).some(
        ([reason, count]) =>
          ![...mechanicalFilterReasons, ...contentFilterReasons].includes(
            reason as FilterReason,
          ) ||
          !Number.isInteger(count) ||
          count < 1,
      )
    ) {
      errors.push(
        `${prefix}.summary.filtered_by_primary_reason must use filter reasons with positive counts`,
      );
    }
    if (
      run.id === data.discovery.active_run &&
      run.final_stats !== undefined
    ) {
      errors.push(`${prefix}.final_stats is not allowed on the active run`);
    }
    if (
      run.id !== data.discovery.active_run &&
      run.final_stats === undefined
    ) {
      errors.push(`${prefix}.final_stats is required on a closed run`);
    }
    validateFrozenStats(
      run.final_stats,
      run,
      `${prefix}.final_stats`,
      errors,
    );
  }
  if (!runIds.has(data?.discovery?.active_run)) {
    errors.push("candidates.discovery.active_run must reference a stored run");
  }
  const activeRun = runs.find(
    (run) => run.id === data?.discovery?.active_run,
  );
  if (
    activeRun &&
    JSON.stringify(activeRun.topics) !== JSON.stringify([...discoveryTopics])
  ) {
    errors.push("active discovery run topics must match configured topics");
  }
  if (
    activeRun &&
    JSON.stringify(activeRun.queries) !==
      JSON.stringify(discoveryQueries.map((entry) => ({ ...entry })))
  ) {
    errors.push("active discovery run queries must match configured queries");
  }
  if (
    activeRun &&
    JSON.stringify(activeRun.seeds) !==
      JSON.stringify(discoverySeeds.map((entry) => ({ ...entry })))
  ) {
    errors.push("active discovery run seeds must match configured seeds");
  }
  if (data?.review?.order !== "stars-descending") {
    errors.push("candidates.review.order must be stars-descending");
  }
  if (!Array.isArray(data?.candidates)) {
    errors.push("candidates.candidates must be an array");
    return errors;
  }

  const configuredTopics = [
    ...new Set(runs.flatMap((run) => run.topics)),
  ].toSorted();
  const configuredQueryKeys = [
    ...new Set(runs.flatMap((run) => run.queries.map((entry) => entry.key))),
  ].toSorted();
  const configuredSeeds = [
    ...new Set(
      runs.flatMap((run) => run.seeds.map((entry) => entry.repository)),
    ),
  ].toSorted();
  const repositories = new Set<string>();
  const reviewOrders = new Map<string, Set<number>>();
  const reviewedCandidates = new Map<string, ReviewCandidate[]>();
  let previousRepository = "";

  for (const [index, candidate] of data.candidates.entries()) {
    const prefix = `candidates.${index}`;
    const repositoryKey = candidate?.repository?.toLowerCase() ?? "";

    if (!repositoryPattern.test(candidate?.repository ?? "")) {
      errors.push(`${prefix}.repository must be an owner/repository pair`);
    }
    if (repositories.has(repositoryKey)) {
      errors.push(`${prefix}.repository must be unique case-insensitively`);
    }
    repositories.add(repositoryKey);
    if (
      previousRepository &&
      previousRepository.localeCompare(candidate?.repository ?? "", "en", {
        sensitivity: "base",
      }) > 0
    ) {
      errors.push("candidates must be sorted by repository");
    }
    previousRepository = candidate?.repository ?? "";

    if (!candidateStatuses.includes(candidate?.status)) {
      errors.push(`${prefix}.status is invalid`);
    }
    if (
      !Array.isArray(candidate?.discovery_runs) ||
      candidate.discovery_runs.length === 0 ||
      candidate.discovery_runs.some((run) => !runIds.has(run)) ||
      JSON.stringify(candidate.discovery_runs) !==
        JSON.stringify([...new Set(candidate.discovery_runs)].toSorted())
    ) {
      errors.push(
        `${prefix}.discovery_runs must contain unique sorted stored run ids`,
      );
    }
    if (candidate.status === "filtered") {
      if (
        ![...mechanicalFilterReasons, ...contentFilterReasons].includes(
          candidate.reason,
        )
      ) {
        errors.push(`${prefix}.reason must use the closed filter vocabulary`);
      }
      if (
        JSON.stringify(Object.keys(candidate).toSorted()) !==
        JSON.stringify(["discovery_runs", "reason", "repository", "status"])
      ) {
        errors.push(
          `${prefix} filtered records must contain only repository, discovery_runs, status, and reason`,
        );
      }
      continue;
    }

    if (candidate?.url !== `https://github.com/${candidate?.repository}`) {
      errors.push(`${prefix}.url must match repository`);
    }
    if (!datePattern.test(candidate?.discovered_at ?? "")) {
      errors.push(`${prefix}.discovered_at must use YYYY-MM-DD`);
    }
    validateSortedConfiguredValues(
      candidate?.source_topics,
      configuredTopics,
      `${prefix}.source_topics`,
      errors,
    );
    validateSortedConfiguredValues(
      candidate?.source_queries,
      configuredQueryKeys,
      `${prefix}.source_queries`,
      errors,
    );
    validateSortedConfiguredValues(
      candidate?.source_seeds,
      configuredSeeds,
      `${prefix}.source_seeds`,
      errors,
    );
    if (
      (candidate?.source_topics?.length ?? 0) +
        (candidate?.source_queries?.length ?? 0) +
        (candidate?.source_seeds?.length ?? 0) ===
      0
    ) {
      errors.push(`${prefix} must have at least one discovery source`);
    }

    if (candidate.status === "pending-review") {
      if (candidate.decision_run !== undefined) {
        errors.push(`${prefix}.decision_run is not allowed before human review`);
      }
      if (candidate.reviewed_at) {
        errors.push(`${prefix}.reviewed_at is not allowed before human review`);
      }
      if (candidate.exclusion_reason) {
        errors.push(`${prefix}.exclusion_reason is not allowed before human review`);
      }
      if (candidate.review_order) {
        errors.push(`${prefix}.review_order is not allowed before human review`);
      }
      if (candidate.reviewed_stars !== undefined) {
        errors.push(`${prefix}.reviewed_stars is not allowed before human review`);
      }
      if (candidate.review_origin !== undefined) {
        errors.push(`${prefix}.review_origin is not allowed before human review`);
      }
      if (candidate.verification_question !== undefined) {
        errors.push(
          `${prefix}.verification_question is not allowed before human review`,
        );
      }
    } else if (!datePattern.test(candidate?.reviewed_at ?? "")) {
      errors.push(`${prefix}.reviewed_at is required after human review`);
    } else {
      if (
        !runIds.has(candidate?.decision_run ?? "") ||
        !candidate.discovery_runs.includes(candidate?.decision_run ?? "")
      ) {
        errors.push(
          `${prefix}.decision_run must reference one of the candidate discovery runs`,
        );
      }
      const validReviewOrder =
        Number.isInteger(candidate.review_order) &&
        (candidate.review_order ?? 0) >= 1;
      const validReviewOrigin = reviewOrigins.includes(
        candidate.review_origin as ReviewOrigin,
      );
      if (!validReviewOrder) {
        errors.push(`${prefix}.review_order must be a positive integer after human review`);
      }
      if (
        !Number.isInteger(candidate.reviewed_stars) ||
        (candidate.reviewed_stars ?? -1) < 0
      ) {
        errors.push(
          `${prefix}.reviewed_stars must be a non-negative integer after human review`,
        );
      }
      if (!validReviewOrigin) {
        errors.push(
          `${prefix}.review_origin is required and must use the closed vocabulary`,
        );
      }
      if (
        candidate.verification_question !== undefined &&
        (typeof candidate.verification_question !== "string" ||
          candidate.verification_question.trim().length === 0)
      ) {
        errors.push(`${prefix}.verification_question must be a non-empty string`);
      }
      if (
        candidate.status === "pending-verification" &&
        !candidate.verification_question
      ) {
        errors.push(
          `${prefix}.verification_question is required for pending-verification`,
        );
      }
      if (validReviewOrder && validReviewOrigin) {
        const origin = candidate.review_origin!;
        const reviewKey = `${candidate.decision_run}:${origin}`;
        const orders = reviewOrders.get(reviewKey) ?? new Set<number>();
        reviewOrders.set(reviewKey, orders);
        if (orders.has(candidate.review_order!)) {
          errors.push(
            `${prefix}.review_order must be unique within decision_run and review_origin`,
          );
        } else {
          orders.add(candidate.review_order!);
          const reviewed = reviewedCandidates.get(reviewKey) ?? [];
          reviewed.push(candidate);
          reviewedCandidates.set(reviewKey, reviewed);
        }
      }
    }

    if (candidate.status === "excluded") {
      if (!exclusionReasons.includes(candidate?.exclusion_reason as ExclusionReason)) {
        errors.push(`${prefix}.exclusion_reason is required and must use the closed vocabulary`);
      }
    } else if (candidate.exclusion_reason) {
      errors.push(`${prefix}.exclusion_reason is only allowed for excluded candidates`);
    }

    const snapshot = candidate?.discovery_snapshot;
    if (!Number.isInteger(snapshot?.stars) || snapshot.stars < 0) {
      errors.push(`${prefix}.discovery_snapshot.stars must be a non-negative integer`);
    }
    if (typeof snapshot?.archived !== "boolean") {
      errors.push(`${prefix}.discovery_snapshot.archived must be boolean`);
    }
    if (typeof snapshot?.fork !== "boolean") {
      errors.push(`${prefix}.discovery_snapshot.fork must be boolean`);
    }
    if (
      snapshot?.pushed_at !== null &&
      !timestampPattern.test(snapshot?.pushed_at ?? "")
    ) {
      errors.push(`${prefix}.discovery_snapshot.pushed_at must be an ISO timestamp or null`);
    }
    if (
      snapshot?.license_spdx !== null &&
      typeof snapshot?.license_spdx !== "string"
    ) {
      errors.push(`${prefix}.discovery_snapshot.license_spdx must be a string or null`);
    }

    const filter = candidate?.automated_filter;
    if (!["passed", "filtered"].includes(filter?.result)) {
      errors.push(`${prefix}.automated_filter.result is invalid`);
    }
    if (![null, "mechanical", "content"].includes(filter?.failed_stage)) {
      errors.push(`${prefix}.automated_filter.failed_stage is invalid`);
    }
    validateSortedConfiguredValues(
      filter?.mechanical?.reasons,
      mechanicalFilterReasons,
      `${prefix}.automated_filter.mechanical.reasons`,
      errors,
    );
    validateSortedConfiguredValues(
      filter?.content?.reasons,
      contentFilterReasons,
      `${prefix}.automated_filter.content.reasons`,
      errors,
    );
    for (const [field, values] of [
      ["positive_signals", filter?.content?.positive_signals],
      ["excluded_domain_signals", filter?.content?.excluded_domain_signals],
      ["unrelated_seo_signals", filter?.content?.unrelated_seo_signals],
    ] as const) {
      if (
        !Array.isArray(values) ||
        values.some((value) => typeof value !== "string") ||
        JSON.stringify(values) !== JSON.stringify([...new Set(values)].toSorted())
      ) {
        errors.push(`${prefix}.automated_filter.content.${field} must be unique and sorted`);
      }
    }
    if (!datePattern.test(filter?.mechanical?.stale_cutoff ?? "")) {
      errors.push(`${prefix}.automated_filter.mechanical.stale_cutoff must use YYYY-MM-DD`);
    }
    if (typeof filter?.mechanical?.osi_approved !== "boolean") {
      errors.push(`${prefix}.automated_filter.mechanical.osi_approved must be boolean`);
    }
    if (typeof filter?.content?.evaluated !== "boolean") {
      errors.push(`${prefix}.automated_filter.content.evaluated must be boolean`);
    }
    if (typeof filter?.content?.readme_available !== "boolean") {
      errors.push(`${prefix}.automated_filter.content.readme_available must be boolean`);
    }
    if (
      filter?.content?.readme_url !== null &&
      typeof filter?.content?.readme_url !== "string"
    ) {
      errors.push(`${prefix}.automated_filter.content.readme_url must be a string or null`);
    }

    const mechanicalFailed = (filter?.mechanical?.reasons?.length ?? 0) > 0;
    const contentFailed = (filter?.content?.reasons?.length ?? 0) > 0;
    if (
      (mechanicalFailed && filter?.failed_stage !== "mechanical") ||
      (!mechanicalFailed && contentFailed && filter?.failed_stage !== "content") ||
      (!mechanicalFailed && !contentFailed && filter?.failed_stage !== null)
    ) {
      errors.push(`${prefix}.automated_filter.failed_stage must match its reasons`);
    }
    const expectedResult = mechanicalFailed || contentFailed ? "filtered" : "passed";
    if (filter?.result !== expectedResult) {
      errors.push(`${prefix}.automated_filter.result must match its reasons`);
    }
    if (candidate.status === "pending-review" && filter?.result !== "passed") {
      errors.push(`${prefix}.status pending-review requires passed automated filters`);
    }
  }

  const summary = activeRun?.summary;
  const activeCandidates = data.candidates.filter((candidate) =>
    candidate.discovery_runs.includes(data.discovery.active_run),
  );
  const activeFilteredCount = activeCandidates.filter(
    (candidate) =>
      candidate.status === "filtered" ||
      candidate.automated_filter.result === "filtered",
  ).length;
  const activePassedCount = activeCandidates.filter(
    (candidate) =>
      isReviewCandidate(candidate) &&
      candidate.automated_filter.result === "passed",
  ).length;
  const primaryReasonTotal = Object.values(
    summary?.filtered_by_primary_reason ?? {},
  ).reduce((total, count) => total + count, 0);
  if (summary?.discovered !== activeCandidates.length) {
    errors.push(
      "active discovery summary must match candidate membership in the active run",
    );
  }
  if (
    (summary?.passed_mechanical_filters ?? 0) +
      (summary?.mechanically_filtered ?? 0) !==
    summary?.discovered
  ) {
    errors.push(
      "active discovery summary mechanical counts must total discovered",
    );
  }
  if (
    (summary?.passed_content_filters ?? 0) +
      (summary?.automatically_filtered ?? 0) !==
    summary?.discovered
  ) {
    errors.push(
      "active discovery summary content counts must total discovered",
    );
  }
  if (summary?.automatically_filtered !== activeFilteredCount) {
    errors.push(
      "active discovery automatically_filtered must match active candidate filters",
    );
  }
  if (summary?.passed_content_filters !== activePassedCount) {
    errors.push(
      "active discovery passed_content_filters must match active passed candidates",
    );
  }
  if (primaryReasonTotal !== activeFilteredCount) {
    errors.push(
      "active discovery primary filter reasons must total filtered candidates",
    );
  }
  if (summary?.known_positive_total !== knownPositiveRepositories.length) {
    errors.push(
      "active discovery known_positive_total must match the configured control set",
    );
  }
  if (
    (summary?.known_positive_search_recall ?? 0) >
      (summary?.known_positive_total ?? 0) ||
    (summary?.known_positive_filter_recall ?? 0) >
      (summary?.known_positive_total ?? 0)
  ) {
    errors.push(
      "active discovery known-positive recall cannot exceed its control set",
    );
  }

  for (const [reviewKey, candidates] of reviewedCandidates) {
    const reviewedByOrder = candidates
      .toSorted((left, right) => left.review_order! - right.review_order!);
    for (const [index, candidate] of reviewedByOrder.entries()) {
      if (candidate.review_order !== index + 1) {
        errors.push(
          `${reviewKey} review_order values must be contiguous from 1`,
        );
        break;
      }
      const previous = reviewedByOrder[index - 1];
      if (previous && previous.reviewed_stars! < candidate.reviewed_stars!) {
        errors.push(`${reviewKey} review order must follow stars descending`);
        break;
      }
    }
  }

  return errors;
}

export function validateProjectCandidateAlignment(
  projects: ProjectData,
  candidates: CandidateData,
) {
  const activeRepositories = new Set(
    activeProjects(projects).map((project) => project.repository.toLowerCase()),
  );
  const tableReadyRepositories = new Set(
    candidates.candidates
      .filter(
        (candidate): candidate is ReviewCandidate =>
          candidate.status === "table-ready",
      )
      .map((candidate) => candidate.repository.toLowerCase()),
  );
  const errors: string[] = [];

  for (const repository of activeRepositories) {
    if (!tableReadyRepositories.has(repository)) {
      errors.push(
        `active project ${repository} must have a table-ready candidate record`,
      );
    }
  }
  for (const repository of tableReadyRepositories) {
    if (!activeRepositories.has(repository)) {
      errors.push(
        `table-ready candidate ${repository} must have an active project row`,
      );
    }
  }
  return errors;
}
