import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import YAML, { isMap, isScalar, type Document } from "yaml";
import {
  projectsPath,
  validateData,
  type ProjectMaturity,
  type ProjectData,
  type VerifiedCell,
} from "./data.ts";

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface GitHubRepository {
  archived: boolean;
  created_at: string;
  default_branch: string | null;
  full_name: string;
  stargazers_count: number;
}

interface GitHubRelease {
  created_at: string;
  draft: boolean;
  html_url: string;
  published_at: string | null;
}

interface GitHubCommit {
  commit: {
    committer: {
      date: string;
    };
  };
  sha: string;
}

interface RefreshMetricsOptions {
  fetchImpl?: FetchImpl;
  token?: string;
  verifiedAt?: string;
}

interface RefreshMetricsResult {
  errors: string[];
  warnings: string[];
  yaml: string;
}

export function requireGitHubToken(
  environment: Record<string, string | undefined> = process.env,
) {
  const token = environment.GITHUB_TOKEN;
  if (!token && environment.CI) {
    throw new Error("GITHUB_TOKEN is required in CI");
  }
  return token;
}

function githubHeaders(token: string | undefined) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CorgiCorner-open-source-rank-trackers",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubJson<T>(
  apiPath: string,
  fetchImpl: FetchImpl,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetchImpl(`https://api.github.com${apiPath}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${apiPath} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

export function mergeMetric<
  T extends boolean | number | string | null,
>(
  previous: VerifiedCell<T>,
  value: T,
  source: string,
  verifiedAt: string,
): VerifiedCell<T> {
  if (Object.is(previous.value, value) && previous.source === source) {
    return previous;
  }
  return { value, source, verified_at: verifiedAt };
}

function updateScalar(
  document: Document,
  pathSegments: (string | number)[],
  value: boolean | number | string | null,
) {
  const node = document.getIn(pathSegments, true);
  if (isScalar(node)) {
    node.value = value;
    return;
  }
  document.setIn(pathSegments, value);
}

function updateVerifiedCellNode(
  document: Document,
  cellPath: (string | number)[],
  metric: VerifiedCell,
) {
  const node = document.getIn(cellPath, true);
  if (!isMap(node)) {
    document.setIn(cellPath, metric);
    return;
  }
  updateScalar(document, [...cellPath, "value"], metric.value);
  updateScalar(document, [...cellPath, "source"], metric.source);
  updateScalar(document, [...cellPath, "verified_at"], metric.verified_at);
}

function monthsBefore(referenceDate: string, months: number) {
  const date = new Date(referenceDate);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return date;
}

export function calculateMaturity(
  {
    archived,
    createdAt,
    lastCommitAt,
    latestReleaseAt,
  }: {
    archived: boolean;
    createdAt: string;
    lastCommitAt: string | null;
    latestReleaseAt: string | null;
  },
  referenceDate: string,
): ProjectMaturity {
  if (archived) return "Legacy";
  if (latestReleaseAt === null) return "Experimental";

  const created = new Date(createdAt);
  if (created > monthsBefore(referenceDate, 3)) return "Experimental";

  const lastCommit = lastCommitAt === null ? null : new Date(lastCommitAt);
  if (
    lastCommit !== null &&
    lastCommit > monthsBefore(referenceDate, 6) &&
    created < monthsBefore(referenceDate, 12)
  ) {
    return "Mature";
  }
  return "Active";
}

export async function refreshMetricsYaml(
  source: string,
  options: RefreshMetricsOptions = {},
): Promise<RefreshMetricsResult> {
  const document = YAML.parseDocument(source);
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("\n"));
  }
  const data = document.toJS() as ProjectData;
  const inputErrors = validateData(data);
  if (inputErrors.length > 0) {
    throw new Error(inputErrors.join("\n"));
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = githubHeaders(options.token);
  const verifiedAt =
    options.verifiedAt ?? new Date().toISOString().slice(0, 10);
  const errors: string[] = [];
  const warnings: string[] = [];
  let changed = false;

  for (const [projectIndex, project] of data.projects.entries()) {
    try {
      const repository = await githubJson<GitHubRepository>(
        `/repos/${project.repository}`,
        fetchImpl,
        headers,
      );
      const repositoryUrl = `https://github.com/${project.repository}`;

      if (repository.full_name !== project.repository) {
        warnings.push(
          `${project.repository} was renamed or transferred to ${repository.full_name}`,
        );
      }

      let lastCommit = mergeMetric(
        project.metrics.last_commit,
        null,
        repositoryUrl,
        verifiedAt,
      );
      if (repository.default_branch) {
        const commit = await githubJson<GitHubCommit>(
          `/repos/${project.repository}/commits/${encodeURIComponent(
            repository.default_branch,
          )}`,
          fetchImpl,
          headers,
        );
        lastCommit = mergeMetric(
          project.metrics.last_commit,
          commit.commit.committer.date,
          `${repositoryUrl}/commit/${commit.sha}`,
          verifiedAt,
        );
      }

      const releases = await githubJson<GitHubRelease[]>(
        `/repos/${project.repository}/releases?per_page=100`,
        fetchImpl,
        headers,
      );
      const latestRelease = releases.find((release) => !release.draft);
      const latestReleaseAt =
        latestRelease?.published_at ?? latestRelease?.created_at ?? null;
      const createdAt = mergeMetric(
        project.metrics.created_at,
        repository.created_at,
        repositoryUrl,
        verifiedAt,
      );
      const latestReleaseMetric = mergeMetric(
        project.metrics.latest_release,
        latestReleaseAt,
        latestRelease?.html_url ?? `${repositoryUrl}/releases`,
        verifiedAt,
      );
      const nextMetrics = {
        stars: mergeMetric(
          project.metrics.stars,
          repository.stargazers_count,
          repositoryUrl,
          verifiedAt,
        ),
        last_commit: lastCommit,
        archived: mergeMetric(
          project.metrics.archived,
          repository.archived,
          repositoryUrl,
          verifiedAt,
        ),
        created_at: createdAt,
        latest_release: latestReleaseMetric,
      };
      const maturity = mergeMetric(
        project.maturity,
        calculateMaturity(
          {
            archived: repository.archived,
            createdAt: repository.created_at,
            lastCommitAt: lastCommit.value,
            latestReleaseAt,
          },
          `${verifiedAt}T00:00:00Z`,
        ),
        repository.archived
          ? repositoryUrl
          : latestRelease?.html_url ?? `${repositoryUrl}/releases`,
        verifiedAt,
      );

      for (const key of [
        "stars",
        "last_commit",
        "archived",
        "created_at",
        "latest_release",
      ] as const) {
        if (nextMetrics[key] !== project.metrics[key]) {
          updateVerifiedCellNode(
            document,
            ["projects", projectIndex, "metrics", key],
            nextMetrics[key],
          );
          changed = true;
        }
      }
      if (maturity !== project.maturity) {
        updateVerifiedCellNode(
          document,
          ["projects", projectIndex, "maturity"],
          maturity,
        );
        changed = true;
      }
      project.metrics = nextMetrics;
      project.maturity = maturity;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${project.repository}: ${message}`);
    }
  }

  const outputErrors = validateData(data);
  if (outputErrors.length > 0) {
    throw new Error(outputErrors.join("\n"));
  }

  return {
    errors,
    warnings,
    yaml: changed ? document.toString({ lineWidth: 0 }) : source,
  };
}

export async function main() {
  const source = await readFile(projectsPath, "utf8");
  const verifiedAt = new Date().toISOString().slice(0, 10);
  const result = await refreshMetricsYaml(source, {
    token: requireGitHubToken(),
    verifiedAt,
  });

  if (result.yaml !== source) {
    await writeFile(projectsPath, result.yaml);
  }
  if (result.warnings.length > 0) {
    console.warn(
      `Project metric warnings:\n${result.warnings
        .map((warning) => `- ${warning}`)
        .join("\n")}`,
    );
  }
  if (result.errors.length > 0) {
    console.error(
      `Project metric failures:\n${result.errors
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }

  const status = result.yaml === source ? "unchanged" : "updated";
  console.log(`Project metrics ${status} for ${verifiedAt}`);
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) await main();
