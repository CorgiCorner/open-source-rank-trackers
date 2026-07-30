import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateReviewQueue,
  candidateStats,
  isReviewCandidate,
  mergeCandidateDiscoveries,
  normalizeCandidateDescription,
  stringifyCandidateData,
  validateCandidateData,
  type AutomatedFilter,
  type CandidateData,
  type CandidateDiscovery,
  type Candidate,
  type ReviewCandidate,
} from "./candidate-data.ts";

const passedFilter = (): AutomatedFilter => ({
  result: "passed",
  failed_stage: null,
  mechanical: {
    reasons: [],
    license_spdx: "MIT",
    osi_approved: true,
    archived: false,
    pushed_at: "2026-07-30T12:00:00Z",
    stale_cutoff: "2024-07-30",
  },
  content: {
    evaluated: true,
    readme_url: "https://github.com/example/rank-tracker#readme",
    readme_available: true,
    positive_signals: ["rank-tracker"],
    excluded_domain_signals: [],
    unrelated_seo_signals: [],
    reasons: [],
  },
});

function reviewCandidate(candidate: Candidate | undefined): ReviewCandidate {
  assert.ok(candidate && isReviewCandidate(candidate));
  return candidate;
}

const discovery = (
  repository = "example/rank-tracker",
  sources: {
    topics?: string[];
    queries?: string[];
  } = { topics: ["rank-tracker"] },
): CandidateDiscovery => ({
  repository,
  url: `https://github.com/${repository}`,
  description: "Example rank tracker",
  source_topics: sources.topics ?? [],
  source_queries: sources.queries ?? [],
  source_seeds: [],
  stars: 10,
  archived: false,
  fork: false,
  pushed_at: "2026-07-30T12:00:00Z",
  license_spdx: "MIT",
  automated_filter: passedFilter(),
});

test("discovery creates a pending candidate with auditable sources", () => {
  const data = mergeCandidateDiscoveries(
    null,
    [
      discovery("example/rank-tracker", {
        topics: ["rank-tracker"],
        queries: ["rank-tracking-phrases"],
      }),
    ],
    "2026-07-30",
  );

  assert.deepEqual(validateCandidateData(data), []);
  assert.equal(data.candidates.length, 1);
  assert.equal(data.discovery.active_run, "2026-07-30");
  assert.equal(
    data.discovery.runs[0]!.filters_evaluated_at,
    "2026-07-30",
  );
  const candidate = reviewCandidate(data.candidates[0]);
  assert.deepEqual(candidate.source_topics, ["rank-tracker"]);
  assert.deepEqual(candidate.source_queries, [
    "rank-tracking-phrases",
  ]);
  assert.equal(data.candidates[0]!.status, "pending-review");
  assert.match(
    stringifyCandidateData(data),
    /discovery_runs: \[2026-07-30\]/,
  );
  assert.deepEqual(candidateStats(data), {
    discovered: 1,
    passed_mechanical_filters: 1,
    passed_content_filters: 1,
    automatically_filtered: 0,
    mechanically_filtered: 0,
    no_osi_license_detected: 0,
    pending_review: 1,
    reviewed: 0,
    pending_verification: 0,
    included: 0,
    table_ready: 0,
    excluded: 0,
    legacy: 0,
    known_positive_recall: 0,
    known_positive_total: 8,
    known_positive_search_recall: 0,
    known_positive_filter_recall: 0,
    consecutive_reviewed_without_inclusion: 0,
    review_stop_rule_reached: false,
    stopped_at_stars: null,
    pre_systematic_included: 0,
    systematic_reviewed: 0,
    systematic_resolved: 0,
    systematic_pending_verification: 0,
    systematic_included: 0,
    systematic_excluded: 0,
    systematic_legacy: 0,
  });
});

test("rediscovery preserves only a human review decision", () => {
  const existing = mergeCandidateDiscoveries(
    null,
    [discovery()],
    "2026-07-29",
  );
  const existingCandidate = reviewCandidate(existing.candidates[0]);
  existingCandidate.status = "excluded";
  existingCandidate.decision_run = "2026-07-30";
  existingCandidate.reviewed_at = "2026-07-30";
  existingCandidate.review_order = 1;
  existingCandidate.reviewed_stars = 10;
  existingCandidate.review_origin = "systematic-review";
  existingCandidate.verification_question =
    "Does the application retain rank history?";
  existingCandidate.exclusion_reason = "single-shot-checks";

  const updated = discovery("example/rank-tracker", {
    queries: ["rank-tracking-phrases"],
  });
  updated.stars = 11;
  const merged = mergeCandidateDiscoveries(existing, [updated], "2026-07-30");
  const mergedCandidate = reviewCandidate(merged.candidates[0]);

  assert.deepEqual(validateCandidateData(merged), []);
  assert.equal(mergedCandidate.status, "excluded");
  assert.equal(mergedCandidate.reviewed_at, "2026-07-30");
  assert.equal(mergedCandidate.review_origin, "systematic-review");
  assert.equal(
    mergedCandidate.verification_question,
    "Does the application retain rank history?",
  );
  assert.equal(mergedCandidate.exclusion_reason, "single-shot-checks");
  assert.equal(mergedCandidate.discovery_snapshot.stars, 11);
  assert.equal(mergedCandidate.discovered_at, "2026-07-29");
  assert.equal(merged.discovery.active_run, "2026-07-30");
  assert.deepEqual(candidateStats(merged), {
    discovered: 1,
    passed_mechanical_filters: 1,
    passed_content_filters: 1,
    automatically_filtered: 0,
    mechanically_filtered: 0,
    no_osi_license_detected: 0,
    pending_review: 0,
    reviewed: 1,
    pending_verification: 0,
    included: 0,
    table_ready: 0,
    excluded: 1,
    legacy: 0,
    known_positive_recall: 0,
    known_positive_total: 8,
    known_positive_search_recall: 0,
    known_positive_filter_recall: 0,
    consecutive_reviewed_without_inclusion: 1,
    review_stop_rule_reached: false,
    stopped_at_stars: null,
    pre_systematic_included: 0,
    systematic_reviewed: 1,
    systematic_resolved: 1,
    systematic_pending_verification: 0,
    systematic_included: 0,
    systematic_excluded: 1,
    systematic_legacy: 0,
  });
});

test("an automatic filter does not increment reviewed", () => {
  const filtered = discovery();
  filtered.automated_filter = {
    ...passedFilter(),
    result: "filtered",
    failed_stage: "mechanical",
    mechanical: {
      ...passedFilter().mechanical,
      reasons: ["no-osi-license-detected"],
      license_spdx: null,
      osi_approved: false,
    },
    content: {
      evaluated: false,
      readme_url: null,
      readme_available: false,
      positive_signals: [],
      excluded_domain_signals: [],
      unrelated_seo_signals: [],
      reasons: [],
    },
  };
  const data = mergeCandidateDiscoveries(null, [filtered], "2026-07-30");

  assert.deepEqual(validateCandidateData(data), []);
  assert.deepEqual(data.candidates[0], {
    repository: "example/rank-tracker",
    discovery_runs: ["2026-07-30"],
    status: "filtered",
    reason: "no-osi-license-detected",
  });
  assert.deepEqual(data.discovery.runs[0]!.summary.filtered_by_primary_reason, {
    "no-osi-license-detected": 1,
  });
  assert.equal(candidateStats(data).automatically_filtered, 1);
  assert.equal(candidateStats(data).reviewed, 0);
});

test("the manual stop point is derived from review order and inclusion yield", () => {
  const discoveries = Array.from({ length: 50 }, (_, index) => {
    const candidate = discovery(`example/tracker-${String(index).padStart(2, "0")}`);
    candidate.stars = 50 - index;
    return candidate;
  });
  const data = mergeCandidateDiscoveries(null, discoveries, "2026-07-30");
  const byStars = data.candidates.filter(isReviewCandidate).toSorted(
    (left, right) =>
      right.discovery_snapshot.stars - left.discovery_snapshot.stars,
  );
  for (const [index, candidate] of byStars.entries()) {
    candidate.status = "excluded";
    candidate.decision_run = "2026-07-30";
    candidate.reviewed_at = "2026-07-30";
    candidate.review_order = index + 1;
    candidate.reviewed_stars = candidate.discovery_snapshot.stars;
    candidate.review_origin = "systematic-review";
    candidate.exclusion_reason = "not-rank-tracking";
  }

  assert.deepEqual(validateCandidateData(data), []);
  assert.equal(candidateStats(data).review_stop_rule_reached, true);
  assert.equal(candidateStats(data).stopped_at_stars, 1);
});

test("baseline and systematic reviews have independent order and stop counts", () => {
  const baseline = discovery("example/baseline");
  baseline.stars = 0;
  const systematic = discovery("example/systematic");
  systematic.stars = 10;
  const data = mergeCandidateDiscoveries(
    null,
    [baseline, systematic],
    "2026-07-30",
  );

  const baselineCandidate = reviewCandidate(
    data.candidates.find(
      (candidate) => candidate.repository === "example/baseline",
    ),
  );
  baselineCandidate.status = "table-ready";
  baselineCandidate.decision_run = "2026-07-30";
  baselineCandidate.reviewed_at = "2026-07-30";
  baselineCandidate.review_order = 1;
  baselineCandidate.reviewed_stars = 0;
  baselineCandidate.review_origin = "pre-systematic-baseline";

  const systematicCandidate = reviewCandidate(
    data.candidates.find(
      (candidate) => candidate.repository === "example/systematic",
    ),
  );
  systematicCandidate.status = "excluded";
  systematicCandidate.decision_run = "2026-07-30";
  systematicCandidate.reviewed_at = "2026-07-30";
  systematicCandidate.review_order = 1;
  systematicCandidate.reviewed_stars = 10;
  systematicCandidate.review_origin = "systematic-review";
  systematicCandidate.exclusion_reason = "not-rank-tracking";

  assert.deepEqual(validateCandidateData(data), []);
  assert.equal(candidateStats(data).consecutive_reviewed_without_inclusion, 1);
});

test("pending verification does not advance or reset the stop counter", () => {
  const included = discovery("example/included");
  included.stars = 30;
  const pending = discovery("example/pending");
  pending.stars = 20;
  const excluded = discovery("example/excluded");
  excluded.stars = 10;
  const data = mergeCandidateDiscoveries(
    null,
    [included, pending, excluded],
    "2026-07-30",
  );
  const byRepository = new Map(
    data.candidates.map((candidate) => [candidate.repository, candidate]),
  );

  Object.assign(byRepository.get("example/included")!, {
    status: "included",
    decision_run: "2026-07-30",
    reviewed_at: "2026-07-30",
    review_order: 1,
    reviewed_stars: 30,
    review_origin: "systematic-review",
  });
  Object.assign(byRepository.get("example/pending")!, {
    status: "pending-verification",
    decision_run: "2026-07-30",
    reviewed_at: "2026-07-30",
    review_order: 2,
    reviewed_stars: 20,
    review_origin: "systematic-review",
    verification_question: "Does the application retain rank history?",
  });
  Object.assign(byRepository.get("example/excluded")!, {
    status: "excluded",
    decision_run: "2026-07-30",
    reviewed_at: "2026-07-30",
    review_order: 3,
    reviewed_stars: 10,
    review_origin: "systematic-review",
    exclusion_reason: "no-rank-history",
  });

  assert.deepEqual(validateCandidateData(data), []);
  assert.equal(candidateStats(data).consecutive_reviewed_without_inclusion, 1);
  assert.equal(candidateStats(data).systematic_resolved, 2);
});

test("pending verification requires a concrete question", () => {
  const data = mergeCandidateDiscoveries(
    null,
    [discovery()],
    "2026-07-30",
  );
  Object.assign(data.candidates[0]!, {
    status: "pending-verification",
    decision_run: "2026-07-30",
    reviewed_at: "2026-07-30",
    review_order: 1,
    reviewed_stars: 10,
    review_origin: "systematic-review",
  });

  assert.ok(
    validateCandidateData(data).some((error) =>
      error.includes("verification_question is required"),
    ),
  );
});

test("a new discovery run freezes the old funnel and requeues current members", () => {
  const first = mergeCandidateDiscoveries(
    null,
    [discovery("example/included"), discovery("example/old-only")],
    "2026-07-30",
  );
  Object.assign(
    first.candidates.find(
      (candidate) => candidate.repository === "example/included",
    )!,
    {
      status: "included",
      decision_run: "2026-07-30",
      reviewed_at: "2026-07-30",
      review_order: 1,
      reviewed_stars: 10,
      review_origin: "systematic-review",
    },
  );
  Object.assign(
    first.candidates.find(
      (candidate) => candidate.repository === "example/old-only",
    )!,
    {
      status: "excluded",
      decision_run: "2026-07-30",
      reviewed_at: "2026-07-30",
      review_order: 2,
      reviewed_stars: 10,
      review_origin: "systematic-review",
      exclusion_reason: "not-rank-tracking",
    },
  );
  const firstStats = candidateStats(first);

  const second = mergeCandidateDiscoveries(
    first,
    [discovery("example/included"), discovery("example/new")],
    "2026-07-31",
  );

  assert.deepEqual(validateCandidateData(second), []);
  assert.deepEqual(candidateStats(second, "2026-07-30"), firstStats);
  assert.equal(second.discovery.active_run, "2026-07-31");
  assert.deepEqual(
    second.discovery.runs.find((run) => run.id === "2026-07-30")?.final_stats,
    firstStats,
  );
  const secondStats = candidateStats(second);
  assert.equal(secondStats.discovered, 2);
  assert.equal(secondStats.pending_review, 2);
  assert.equal(secondStats.reviewed, 0);
  assert.equal(secondStats.included, 0);
  assert.equal(secondStats.excluded, 0);
  const included = reviewCandidate(
    second.candidates.find(
      (candidate) => candidate.repository === "example/included",
    ),
  );
  assert.deepEqual(included.discovery_runs, ["2026-07-30", "2026-07-31"]);
  assert.equal(included.decision_run, "2026-07-30");
  assert.deepEqual(
    candidateReviewQueue(second).map((candidate) => candidate.repository),
    ["example/included", "example/new"],
  );

  const corrupted = structuredClone(second);
  corrupted.discovery.runs[0]!.final_stats!.discovered = 99;
  assert.ok(
    validateCandidateData(corrupted).some((error) =>
      error.includes(
        "final_stats.discovered must match the discovery-run summary",
      ),
    ),
  );
});

test("the review queue is sorted by stars with a deterministic tie-breaker", () => {
  const low = discovery("example/low");
  low.stars = 1;
  const beta = discovery("example/beta");
  beta.stars = 10;
  const alpha = discovery("example/alpha");
  alpha.stars = 10;
  const data = mergeCandidateDiscoveries(
    null,
    [low, beta, alpha],
    "2026-07-30",
  );

  assert.deepEqual(
    candidateReviewQueue(data).map((candidate) => candidate.repository),
    ["example/alpha", "example/beta", "example/low"],
  );
});

test("excluded candidates require a closed-vocabulary human reason", () => {
  const data = mergeCandidateDiscoveries(
    null,
    [discovery()],
    "2026-07-30",
  ) as CandidateData;
  const candidate = reviewCandidate(data.candidates[0]);
  candidate.status = "excluded";
  candidate.decision_run = "2026-07-30";
  candidate.reviewed_at = "2026-07-30";
  candidate.review_order = 1;
  candidate.reviewed_stars = 10;
  candidate.review_origin = "systematic-review";

  assert.ok(
    validateCandidateData(data).some((error) =>
      error.includes("exclusion_reason is required"),
    ),
  );
});

test("GitHub descriptions are normalized to repository typography", () => {
  assert.equal(
    normalizeCandidateDescription("Rank tracking \u2014 with history"),
    "Rank tracking - with history",
  );
});
