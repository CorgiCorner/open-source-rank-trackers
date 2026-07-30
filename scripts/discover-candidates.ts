import { readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";
import {
  candidatesPath,
  candidateStats,
  discoveryQueries,
  discoverySeeds,
  discoveryTopics,
  knownPositiveRepositories,
  mergeCandidateDiscoveries,
  stringifyCandidateData,
  validateCandidateData,
  type CandidateData,
  type CandidateDiscovery,
} from "./candidate-data.ts";
import {
  classifyCandidateDescription,
  evaluateCandidate,
} from "./candidate-filter.ts";
import { githubSearchResultLimit } from "./policy.ts";

interface GitHubRepository {
  archived: boolean;
  description: string | null;
  fork: boolean;
  full_name: string;
  html_url: string;
  license: {
    spdx_id: string;
  } | null;
  private: boolean;
  pushed_at: string | null;
  stargazers_count: number;
}

interface GitHubSearchResponse {
  incomplete_results: boolean;
  items: GitHubRepository[];
  total_count: number;
}

interface DiscoveryHit {
  repository: string;
  url: string;
  description: string | null;
  source_topic: string | null;
  source_query: string | null;
  source_seed: string | null;
  stars: number;
  archived: boolean;
  fork: boolean;
  pushed_at: string | null;
  license_spdx: string | null;
}

interface RawCandidate {
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
}

const token = process.env.GITHUB_TOKEN;
if (!token) {
  throw new Error(
    "GITHUB_TOKEN is required because complete discovery exceeds the unauthenticated search rate limit",
  );
}

const apiVersion = "2022-11-28";
const jsonHeaders = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "User-Agent": "CorgiCorner-open-source-rank-trackers-candidate-discovery",
  "X-GitHub-Api-Version": apiVersion,
};
const searchMinimumIntervalMs = 2_100;
const earliestGitHubDate = "2007-01-01";
const discoveredAt = new Date().toISOString().slice(0, 10);
let nextSearchAt = 0;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function searchRepositories(query: string, page: number) {
  const delay = Math.max(0, nextSearchAt - Date.now());
  if (delay > 0) await wait(delay);
  nextSearchAt = Date.now() + searchMinimumIntervalMs;

  const parameters = new URLSearchParams({
    q: query,
    per_page: "100",
    page: String(page),
    sort: "stars",
    order: "desc",
  });
  const response = await fetch(
    `https://api.github.com/search/repositories?${parameters}`,
    {
      headers: jsonHeaders,
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub repository search page ${page} returned ${response.status} for ${query}`,
    );
  }

  const result = (await response.json()) as GitHubSearchResponse;
  if (result.incomplete_results) {
    throw new Error(`GitHub reported incomplete results for ${query}`);
  }
  if (result.items.some((repository) => repository.private)) {
    throw new Error(`GitHub returned a private repository despite is:public for ${query}`);
  }
  return result;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function midpointDate(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  return new Date(Math.floor((startTime + endTime) / 2))
    .toISOString()
    .slice(0, 10);
}

function toHits(
  repositories: GitHubRepository[],
  sourceTopic: string | null,
  sourceQuery: string | null,
  sourceSeed: string | null,
): DiscoveryHit[] {
  return repositories.map((repository) => ({
    repository: repository.full_name,
    url: repository.html_url,
    description: repository.description,
    source_topic: sourceTopic,
    source_query: sourceQuery,
    source_seed: sourceSeed,
    stars: repository.stargazers_count,
    archived: repository.archived,
    fork: repository.fork,
    pushed_at: repository.pushed_at,
    license_spdx:
      repository.license?.spdx_id &&
      !["NOASSERTION", "Other"].includes(repository.license.spdx_id)
        ? repository.license.spdx_id
        : null,
  }));
}

async function searchDatePartition(
  baseQuery: string,
  sourceTopic: string | null,
  sourceQuery: string | null,
  start: string,
  end: string,
): Promise<DiscoveryHit[]> {
  const query = `${baseQuery} is:public created:${start}..${end}`;
  const firstPage = await searchRepositories(query, 1);

  if (firstPage.total_count > githubSearchResultLimit.value) {
    if (start === end) {
      throw new Error(
        `${query} has ${firstPage.total_count} results and cannot be partitioned further`,
      );
    }
    const midpoint = midpointDate(start, end);
    return [
      ...(await searchDatePartition(
        baseQuery,
        sourceTopic,
        sourceQuery,
        start,
        midpoint,
      )),
      ...(await searchDatePartition(
        baseQuery,
        sourceTopic,
        sourceQuery,
        addDays(midpoint, 1),
        end,
      )),
    ];
  }

  const pageCount = Math.ceil(firstPage.total_count / 100);
  const pages = [firstPage];
  for (let page = 2; page <= pageCount; page += 1) {
    pages.push(await searchRepositories(query, page));
  }
  const hits = toHits(
    pages.flatMap((page) => page.items),
    sourceTopic,
    sourceQuery,
    null,
  );
  const uniqueRepositories = new Set(
    hits.map((discovery) => discovery.repository.toLowerCase()),
  );
  if (hits.length !== firstPage.total_count) {
    throw new Error(
      `${query} returned ${hits.length} repositories, expected ${firstPage.total_count}`,
    );
  }
  if (uniqueRepositories.size !== firstPage.total_count) {
    throw new Error(
      `${query} returned ${uniqueRepositories.size} unique repositories, expected ${firstPage.total_count}`,
    );
  }
  return hits;
}

async function searchAxis(
  label: string,
  baseQuery: string,
  sourceTopic: string | null,
  sourceQuery: string | null,
) {
  const hits = await searchDatePartition(
    baseQuery,
    sourceTopic,
    sourceQuery,
    earliestGitHubDate,
    discoveredAt,
  );
  console.log(`${label}: ${hits.length}`);
  return hits;
}

function mergeHits(hits: DiscoveryHit[]): RawCandidate[] {
  const candidates = new Map<string, RawCandidate>();

  for (const hit of hits) {
    const key = hit.repository.toLowerCase();
    const existing = candidates.get(key);
    if (existing) {
      if (hit.source_topic) existing.source_topics.push(hit.source_topic);
      if (hit.source_query) existing.source_queries.push(hit.source_query);
      if (hit.source_seed) existing.source_seeds.push(hit.source_seed);
      continue;
    }

    candidates.set(key, {
      repository: hit.repository,
      url: hit.url,
      description: hit.description,
      source_topics: hit.source_topic ? [hit.source_topic] : [],
      source_queries: hit.source_query ? [hit.source_query] : [],
      source_seeds: hit.source_seed ? [hit.source_seed] : [],
      stars: hit.stars,
      archived: hit.archived,
      fork: hit.fork,
      pushed_at: hit.pushed_at,
      license_spdx: hit.license_spdx,
    });
  }

  return [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      source_topics: [...new Set(candidate.source_topics)].toSorted(),
      source_queries: [...new Set(candidate.source_queries)].toSorted(),
      source_seeds: [...new Set(candidate.source_seeds)].toSorted(),
    }))
    .toSorted((left, right) =>
      left.repository.localeCompare(right.repository, "en", { sensitivity: "base" }),
    );
}

async function fetchRepositorySeed(repository: string) {
  const response = await fetch(`https://api.github.com/repos/${repository}`, {
    headers: jsonHeaders,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub repository request for ${repository} returned ${response.status}`);
  }
  const result = (await response.json()) as GitHubRepository;
  if (result.private) {
    throw new Error(`Configured discovery seed ${repository} is private`);
  }
  return toHits([result], null, null, repository)[0]!;
}

async function fetchReadme(repository: string) {
  const response = await fetch(
    `https://api.github.com/repos/${repository
      .split("/")
      .map(encodeURIComponent)
      .join("/")}/readme`,
    {
      headers: {
        ...jsonHeaders,
        Accept: "application/vnd.github.raw+json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub README request for ${repository} returned ${response.status}`);
  }
  return {
    content: await response.text(),
    url: `https://github.com/${repository}#readme`,
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

async function evaluateCandidates(candidates: RawCandidate[]) {
  let readmesFetched = 0;
  let descriptionsPassed = 0;
  let descriptionsFiltered = 0;
  let descriptionsAmbiguous = 0;
  const evaluated = await mapWithConcurrency(candidates, 8, async (candidate) => {
    const mechanical = evaluateCandidate(candidate, null, discoveredAt);
    let automatedFilter = mechanical;

    if (mechanical.mechanical.reasons.length === 0) {
      const descriptionResult = classifyCandidateDescription(candidate);
      if (descriptionResult === "ambiguous") {
        descriptionsAmbiguous += 1;
        const readme = await fetchReadme(candidate.repository);
        if (readme) readmesFetched += 1;
        automatedFilter = evaluateCandidate(candidate, readme, discoveredAt);
      } else {
        if (descriptionResult === "passed") descriptionsPassed += 1;
        else descriptionsFiltered += 1;
        automatedFilter = evaluateCandidate(candidate, null, discoveredAt);
      }
    }

    return {
      ...candidate,
      automated_filter: automatedFilter,
    } satisfies CandidateDiscovery;
  });
  console.log(`descriptions passed without README: ${descriptionsPassed}`);
  console.log(`descriptions filtered without README: ${descriptionsFiltered}`);
  console.log(`descriptions requiring README: ${descriptionsAmbiguous}`);
  console.log(`README files fetched: ${readmesFetched}`);
  return evaluated;
}

let existing: CandidateData | null = null;
try {
  existing = YAML.parse(await readFile(candidatesPath, "utf8")) as CandidateData;
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}

const hits: DiscoveryHit[] = [];
for (const topic of discoveryTopics) {
  hits.push(
    ...(await searchAxis(`topic:${topic}`, `topic:${topic}`, topic, null)),
  );
}
for (const query of discoveryQueries) {
  hits.push(
    ...(await searchAxis(
      `query:${query.key}`,
      query.query,
      null,
      query.key,
    )),
  );
}
for (const seed of discoverySeeds) {
  hits.push(await fetchRepositorySeed(seed.repository));
  console.log(`seed:${seed.repository}: 1`);
}

const rawCandidates = mergeHits(hits);
console.log(`unique repositories before filtering: ${rawCandidates.length}`);
const searchedRepositories = new Set(
  rawCandidates
    .filter(
      (candidate) =>
        candidate.source_topics.length > 0 || candidate.source_queries.length > 0,
    )
    .map((candidate) => candidate.repository.toLowerCase()),
);
const missingFromSearch = knownPositiveRepositories.filter(
  (repository) => !searchedRepositories.has(repository.toLowerCase()),
);
console.log(
  `known-positive search recall: ${knownPositiveRepositories.length - missingFromSearch.length}/${knownPositiveRepositories.length}`,
);
if (missingFromSearch.length > 0) {
  console.log(`known positives supplied by explicit seeds: ${missingFromSearch.join(", ")}`);
}
const discoveredRepositories = new Set(
  rawCandidates.map((candidate) => candidate.repository.toLowerCase()),
);
const missingKnownPositives = knownPositiveRepositories.filter(
  (repository) => !discoveredRepositories.has(repository.toLowerCase()),
);
if (missingKnownPositives.length > 0) {
  throw new Error(
    `known-positive recall failed for: ${missingKnownPositives.join(", ")}`,
  );
}
console.log(
  `known-positive coverage: ${knownPositiveRepositories.length}/${knownPositiveRepositories.length}`,
);
const discoveries = await evaluateCandidates(rawCandidates);
const filteredKnownPositives = knownPositiveRepositories.filter((repository) => {
  const candidate = discoveries.find(
    (entry) => entry.repository.toLowerCase() === repository.toLowerCase(),
  );
  return candidate?.automated_filter.result !== "passed";
});
if (filteredKnownPositives.length > 0) {
  throw new Error(
    `known-positive filter recall failed for: ${filteredKnownPositives.join(", ")}`,
  );
}
console.log(
  `known-positive filter recall: ${knownPositiveRepositories.length}/${knownPositiveRepositories.length}`,
);
const merged = mergeCandidateDiscoveries(existing, discoveries, discoveredAt);
const errors = validateCandidateData(merged);

if (errors.length > 0) {
  throw new Error(errors.join("\n"));
}

const rendered = stringifyCandidateData(merged);
const previous = existing ? await readFile(candidatesPath, "utf8") : null;

if (rendered === previous) {
  console.log("candidates.yml already contains the current discovery snapshot");
} else {
  await writeFile(candidatesPath, rendered);
  console.log(`candidates.yml updated for ${discoveredAt}`);
}

console.log(JSON.stringify(candidateStats(merged), null, 2));
