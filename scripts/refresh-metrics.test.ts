import assert from "node:assert/strict";
import test from "node:test";
import YAML from "yaml";
import {
  calculateMaturity,
  mergeMetric,
  refreshMetricsYaml,
  requireGitHubToken,
} from "./refresh-metrics.ts";
import type { Project, ProjectData, VerifiedCell } from "./data.ts";

const verifiedAt = "2026-08-06";

function cell<T extends boolean | number | string | null>(
  value: T,
  source: string,
  date = "2026-07-30",
): VerifiedCell<T> {
  return { value, source, verified_at: date };
}

function project(repository: string, stars = 1): Project {
  const repositoryUrl = `https://github.com/${repository}`;
  return {
    name: repository,
    repository,
    website: repositoryUrl,
    evidence_set: [
      {
        kind: "readme",
        label: "README",
        source: `${repositoryUrl}#readme`,
        scope: "Complete README",
        verified_at: "2026-07-30",
      },
      {
        kind: "documentation",
        label: "Documentation",
        source: `${repositoryUrl}/tree/main/docs`,
        scope: "Complete docs directory",
        verified_at: "2026-07-30",
      },
    ],
    status: cell("active", repositoryUrl),
    maturity: cell("Experimental", `${repositoryUrl}/releases`),
    license: {
      server: cell("MIT", `${repositoryUrl}/blob/main/LICENSE`),
      clients: cell("MIT", `${repositoryUrl}/blob/main/LICENSE`),
    },
    data_source: cell("SERP provider", `${repositoryUrl}#data-source`),
    features: {
      rest_api: cell(false, `${repositoryUrl}#readme`),
    },
    metrics: {
      stars: cell(stars, repositoryUrl),
      last_commit: cell(
        "2026-07-30T12:00:00Z",
        `${repositoryUrl}/commit/abc123`,
      ),
      archived: cell(false, repositoryUrl),
      created_at: cell("2025-01-01T00:00:00Z", repositoryUrl),
      latest_release: cell(null, `${repositoryUrl}/releases`),
    },
  };
}

function data(projects: Project[]): ProjectData {
  return {
    version: 2,
    comparison: {
      title: "Test",
      verified_at: "2026-07-30",
      maintained_by: "Test",
      disclosure: "Test",
      feature_columns: [
        {
          key: "rest_api",
          label: "REST API",
          navigation_label: "Exposes a REST API",
        },
      ],
      related_lists: [
        {
          name: "example/list",
          fact: cell(
            "Example fact",
            "https://github.com/example/list",
          ),
        },
      ],
    },
    projects,
  };
}

function githubFetch(
  repositories: Record<
    string,
    {
      archived?: boolean;
      created_at?: string;
      default_branch?: string;
      full_name?: string;
      release?: {
        created_at?: string;
        draft?: boolean;
        html_url?: string;
        published_at?: string | null;
      };
      stars?: number;
      status?: number;
    }
  >,
) {
  return async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const match = url.pathname.match(
      /^\/repos\/([^/]+\/[^/]+)(?:\/(commits\/.+|releases))?$/,
    );
    assert.ok(match, `unexpected GitHub URL ${url}`);
    const repository = decodeURIComponent(match[1]!);
    const configured = repositories[repository]!;
    if (configured.status) return new Response("", { status: configured.status });
    if (match[2]?.startsWith("commits/")) {
      return Response.json({
        commit: { committer: { date: "2026-07-30T12:00:00Z" } },
        sha: "abc123",
      });
    }
    if (match[2] === "releases") {
      if (!configured.release) return Response.json([]);
      return Response.json([
        {
          created_at: configured.release.created_at ?? "2026-01-01T00:00:00Z",
          draft: configured.release.draft ?? false,
          html_url:
            configured.release.html_url ??
            `https://github.com/${repository}/releases/tag/v1.0.0`,
          published_at:
            configured.release.published_at ?? "2026-01-01T00:00:00Z",
        },
      ]);
    }
    return Response.json({
      archived: configured.archived ?? false,
      created_at: configured.created_at ?? "2025-01-01T00:00:00Z",
      default_branch: configured.default_branch ?? "main",
      full_name: configured.full_name ?? repository,
      stargazers_count: configured.stars ?? 1,
    });
  };
}

test("unchanged metrics retain their previous verification date", () => {
  const previous = cell(1, "https://example.com/source");
  assert.equal(
    mergeMetric(previous, 1, "https://example.com/source", verifiedAt),
    previous,
  );
  assert.deepEqual(
    mergeMetric(previous, 2, "https://example.com/source", verifiedAt),
    {
      value: 2,
      source: "https://example.com/source",
      verified_at: verifiedAt,
    },
  );
});

test("GITHUB_TOKEN is required in CI", () => {
  assert.throws(
    () => requireGitHubToken({ CI: "true" }),
    /GITHUB_TOKEN is required in CI/,
  );
  assert.equal(requireGitHubToken({ CI: "true", GITHUB_TOKEN: "token" }), "token");
  assert.equal(requireGitHubToken({}), undefined);
});

test("maturity follows the deterministic GitHub-derived precedence", () => {
  const referenceDate = "2026-07-30T00:00:00Z";
  assert.equal(
    calculateMaturity(
      {
        archived: true,
        createdAt: "2020-01-01T00:00:00Z",
        lastCommitAt: "2026-07-29T00:00:00Z",
        latestReleaseAt: "2026-07-01T00:00:00Z",
      },
      referenceDate,
    ),
    "Legacy",
  );
  assert.equal(
    calculateMaturity(
      {
        archived: false,
        createdAt: "2020-01-01T00:00:00Z",
        lastCommitAt: "2026-07-29T00:00:00Z",
        latestReleaseAt: null,
      },
      referenceDate,
    ),
    "Experimental",
  );
  assert.equal(
    calculateMaturity(
      {
        archived: false,
        createdAt: "2026-06-01T00:00:00Z",
        lastCommitAt: "2026-07-29T00:00:00Z",
        latestReleaseAt: "2026-07-01T00:00:00Z",
      },
      referenceDate,
    ),
    "Experimental",
  );
  assert.equal(
    calculateMaturity(
      {
        archived: false,
        createdAt: "2020-01-01T00:00:00Z",
        lastCommitAt: "2026-07-29T00:00:00Z",
        latestReleaseAt: "2026-07-01T00:00:00Z",
      },
      referenceDate,
    ),
    "Mature",
  );
  assert.equal(
    calculateMaturity(
      {
        archived: false,
        createdAt: "2026-01-01T00:00:00Z",
        lastCommitAt: "2026-07-29T00:00:00Z",
        latestReleaseAt: "2026-07-01T00:00:00Z",
      },
      referenceDate,
    ),
    "Active",
  );
});

test("maturity thresholds are strict at three, six, and twelve months", () => {
  const referenceDate = "2026-07-30T00:00:00Z";
  assert.equal(
    calculateMaturity(
      {
        archived: false,
        createdAt: "2026-04-30T00:00:00Z",
        lastCommitAt: "2026-07-29T00:00:00Z",
        latestReleaseAt: "2026-07-01T00:00:00Z",
      },
      referenceDate,
    ),
    "Active",
  );
  assert.equal(
    calculateMaturity(
      {
        archived: false,
        createdAt: "2025-07-29T23:59:59Z",
        lastCommitAt: "2026-01-30T00:00:00Z",
        latestReleaseAt: "2026-01-01T00:00:00Z",
      },
      referenceDate,
    ),
    "Active",
  );
  assert.equal(
    calculateMaturity(
      {
        archived: false,
        createdAt: "2025-07-30T00:00:00Z",
        lastCommitAt: "2026-07-29T00:00:00Z",
        latestReleaseAt: "2026-01-01T00:00:00Z",
      },
      referenceDate,
    ),
    "Active",
  );
});

test("a later no-change refresh is byte-identical", async () => {
  const source = YAML.stringify(data([project("owner/tracker")]), {
    lineWidth: 0,
  });
  const result = await refreshMetricsYaml(source, {
    fetchImpl: githubFetch({ "owner/tracker": {} }),
    token: "token",
    verifiedAt,
  });

  assert.equal(result.yaml, source);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("metric changes preserve YAML comments and report repository renames", async () => {
  const source = `${YAML.stringify(data([project("owner/tracker")]), {
    lineWidth: 0,
  }).replace("value: 1", "value: 1 # keep this metric note")}\n# keep this file note\n`;
  const result = await refreshMetricsYaml(source, {
    fetchImpl: githubFetch({
      "owner/tracker": {
        full_name: "owner/renamed-tracker",
        stars: 2,
      },
    }),
    token: "token",
    verifiedAt,
  });

  assert.match(result.yaml, /value: 2 # keep this metric note/);
  assert.match(result.yaml, /# keep this file note/);
  assert.deepEqual(result.warnings, [
    "owner/tracker was renamed or transferred to owner/renamed-tracker",
  ]);
});

test("an empty default branch uses the repository URL for a null commit", async () => {
  const source = YAML.stringify(data([project("owner/empty")]), {
    lineWidth: 0,
  });
  const result = await refreshMetricsYaml(source, {
    fetchImpl: githubFetch({
      "owner/empty": { default_branch: "" },
    }),
    token: "token",
    verifiedAt,
  });
  const updated = YAML.parse(result.yaml) as ProjectData;

  assert.deepEqual(updated.projects[0]!.metrics.last_commit, {
    value: null,
    source: "https://github.com/owner/empty",
    verified_at: verifiedAt,
  });
});

test("one repository failure does not block updates for other projects", async () => {
  const source = YAML.stringify(
    data([project("owner/missing"), project("owner/healthy")]),
    { lineWidth: 0 },
  );
  const result = await refreshMetricsYaml(source, {
    fetchImpl: githubFetch({
      "owner/missing": { status: 404 },
      "owner/healthy": { stars: 3 },
    }),
    token: "token",
    verifiedAt,
  });
  const updated = YAML.parse(result.yaml) as ProjectData;

  assert.equal(updated.projects[0]!.metrics.stars.value, 1);
  assert.equal(updated.projects[1]!.metrics.stars.value, 3);
  assert.deepEqual(result.errors, [
    "owner/missing: GitHub API /repos/owner/missing returned 404",
  ]);
});
