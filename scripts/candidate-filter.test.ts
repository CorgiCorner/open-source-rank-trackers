import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCandidateDescription,
  evaluateCandidate,
} from "./candidate-filter.ts";
import { candidateStaleAfterMonths } from "./policy.ts";

const activeCandidate = {
  repository: "example/rank-tracker",
  description: "Self-hosted SEO rank tracker with daily position history",
  archived: false,
  pushed_at: "2026-07-30T12:00:00Z",
  license_spdx: "MIT",
};

test("mechanical filtering records every failed rule without reading a README", () => {
  const result = evaluateCandidate(
    {
      ...activeCandidate,
      archived: true,
      license_spdx: null,
    },
    null,
    "2026-07-30",
  );

  assert.equal(result.result, "filtered");
  assert.equal(result.failed_stage, "mechanical");
  assert.deepEqual(result.mechanical.reasons, [
    "legacy-unmaintained",
    "no-osi-license-detected",
  ]);
  assert.equal(result.content.evaluated, false);
});

test(`the ${candidateStaleAfterMonths}-month activity cutoff is calendar-based and inclusive`, () => {
  const active = evaluateCandidate(
    { ...activeCandidate, pushed_at: "2024-07-30T00:00:00Z" },
    null,
    "2026-07-30",
  );
  const stale = evaluateCandidate(
    { ...activeCandidate, pushed_at: "2024-07-29T23:59:59Z" },
    null,
    "2026-07-30",
  );

  assert.deepEqual(active.mechanical.reasons, []);
  assert.deepEqual(stale.mechanical.reasons, ["legacy-unmaintained"]);
});

test("rank-tracking content passes the automatic shortlist", () => {
  const result = evaluateCandidate(
    activeCandidate,
    {
      content: "Track keyword positions every day and inspect ranking history.",
      url: "https://github.com/example/rank-tracker#readme",
    },
    "2026-07-30",
  );

  assert.equal(result.result, "passed");
  assert.equal(result.failed_stage, null);
  assert.ok(result.content.positive_signals.includes("rank-tracker"));
});

test("keyword position checker wording is a rank-tracking signal", () => {
  const result = evaluateCandidate(
    {
      ...activeCandidate,
      repository: "example/seo-panel",
      description: "SEO control panel for multiple websites",
    },
    {
      content: "Keyword Position Checker with scheduled reports.",
      url: "https://github.com/example/seo-panel#readme",
    },
    "2026-07-30",
  );

  assert.equal(result.result, "passed");
  assert.ok(result.content.positive_signals.includes("keyword-position-checker"));
});

test("description-first classification avoids unnecessary README requests", () => {
  assert.equal(classifyCandidateDescription(activeCandidate), "passed");
  assert.equal(
    classifyCandidateDescription({
      ...activeCandidate,
      repository: "example/wordpress-seo",
      description: "WordPress plugin for XML sitemaps and meta tags",
    }),
    "filtered",
  );
  assert.equal(
    classifyCandidateDescription({
      ...activeCandidate,
      repository: "example/open-seo",
      description: "Open source alternative to a commercial SEO platform",
    }),
    "ambiguous",
  );
});

test("other meanings of ranking are explicitly filtered", () => {
  const result = evaluateCandidate(
    {
      ...activeCandidate,
      repository: "example/ml-ranking",
      description: "Machine learning ranking model and re-ranking toolkit",
    },
    {
      content: "A learning-to-rank implementation.",
      url: "https://github.com/example/ml-ranking#readme",
    },
    "2026-07-30",
  );

  assert.equal(result.result, "filtered");
  assert.equal(result.failed_stage, "content");
  assert.ok(result.content.reasons.includes("excluded-ranking-domain"));
  assert.ok(
    result.content.excluded_domain_signals.includes("machine-learning-ranking"),
  );
});

test("a GSC-only position monitor is filtered without a SERP collection path", () => {
  const result = evaluateCandidate(
    {
      ...activeCandidate,
      description: "Track keyword positions from Google Search Console",
    },
    {
      content: "Historical rank tracking powered only by GSC data.",
      url: "https://github.com/example/rank-tracker#readme",
    },
    "2026-07-30",
  );

  assert.equal(result.result, "filtered");
  assert.ok(result.content.reasons.includes("gsc-only"));
});
