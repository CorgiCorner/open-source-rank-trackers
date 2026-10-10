import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  activeProjects,
  collectSourceUrls,
  loadData,
  projectCells,
  repositoryRoot,
  validateData,
} from "./data.ts";
import {
  candidateStats,
  isReviewCandidate,
  loadCandidateData,
  validateProjectCandidateAlignment,
} from "./candidate-data.ts";
import { renderReadme } from "./render-readme.ts";
import { renderEvidence } from "./render-evidence.ts";
import { renderMethodology } from "./render-methodology.ts";
import {
  githubSearchResultLimit,
  policySourceUrls,
} from "./policy.ts";

test("data passes the source and schema rules", async () => {
  assert.deepEqual(validateData(await loadData()), []);
});

test("external policy facts are sourced and dated", () => {
  assert.equal(githubSearchResultLimit.value, 1_000);
  assert.match(githubSearchResultLimit.source, /^https:\/\//);
  assert.match(
    githubSearchResultLimit.verified_at,
    /^\d{4}-\d{2}-\d{2}$/,
  );
  assert.deepEqual(policySourceUrls(), [githubSearchResultLimit.source]);
});

test("active projects are sorted by stars descending", async () => {
  const data = structuredClone(await loadData());
  const active = data.projects.filter(
    (project) => project.status.value === "active",
  );
  assert.ok(active.length >= 3);
  const [fewest, tiedA, tiedB, ...rest] = active;
  fewest!.metrics.stars.value = 1;
  tiedA!.metrics.stars.value = 10;
  tiedB!.metrics.stars.value = 10;
  for (const project of rest) project.metrics.stars.value = 0;

  const tiedByName = [tiedA!.name, tiedB!.name].toSorted((left, right) =>
    left.localeCompare(right),
  );
  assert.deepEqual(
    activeProjects(data)
      .slice(0, 3)
      .map((project) => project.name),
    [...tiedByName, fewest!.name],
  );
});

test("the committed active projects follow the star order", async () => {
  const projects = activeProjects(await loadData());
  for (const [index, project] of projects.slice(1).entries()) {
    const previous = projects[index]!;
    assert.ok(
      previous.metrics.stars.value >= project.metrics.stars.value,
      `${previous.name} should not have fewer stars than ${project.name}`,
    );
  }
});

test("active table rows and table-ready candidates stay aligned", async () => {
  const [projects, candidates] = await Promise.all([
    loadData(),
    loadCandidateData(),
  ]);
  assert.deepEqual(
    validateProjectCandidateAlignment(projects, candidates),
    [],
  );
});

test("an active row may be added editorially without a discovery candidate", async () => {
  const [projects, candidates] = await Promise.all([
    loadData(),
    loadCandidateData(),
  ]);
  const changed = structuredClone(candidates);
  const candidate = changed.candidates.find(
    (entry) => entry.repository === "CorgiCorner/bisibility",
  )!;
  candidate.status = "pending-review";

  assert.deepEqual(validateProjectCandidateAlignment(projects, changed), []);
});

test("included candidates may wait for table evidence without an active row", async () => {
  const [projects, candidates] = await Promise.all([
    loadData(),
    loadCandidateData(),
  ]);
  const included = candidates.candidates.find(
    (candidate) => candidate.repository === "seopanel/Seo-Panel",
  )!;

  assert.equal(included.status, "included");
  assert.ok(
    !activeProjects(projects).some(
      (project) => project.repository === included.repository,
    ),
  );
  assert.deepEqual(
    validateProjectCandidateAlignment(projects, candidates),
    [],
  );
});

test("table-ready candidates require an active project row", async () => {
  const [projects, candidates] = await Promise.all([
    loadData(),
    loadCandidateData(),
  ]);
  const changed = structuredClone(candidates);
  const candidate = changed.candidates.find(
    (entry) => entry.repository === "seopanel/Seo-Panel",
  )!;
  candidate.status = "table-ready";

  assert.ok(
    validateProjectCandidateAlignment(projects, changed).some((error) =>
      error.includes("seopanel/seo-panel"),
    ),
  );
});

test("a table-ready fifth project requires data changes only", async () => {
  const data = structuredClone(await loadData());
  const candidates = structuredClone(await loadCandidateData());
  const project = structuredClone(
    data.projects.find((candidate) => candidate.name === "Bisibility")!,
  );
  project.name = "Example Tracker";
  project.repository = "seopanel/Seo-Panel";
  project.website = "https://example.com";
  project.metrics.stars.value = 1;
  data.projects.push(project);
  const candidate = candidates.candidates.find(
    (candidate) => candidate.repository === project.repository,
  )!;
  assert.ok(isReviewCandidate(candidate));
  candidate.status = "table-ready";

  assert.deepEqual(validateData(data), []);
  assert.deepEqual(
    validateProjectCandidateAlignment(data, candidates),
    [],
  );
  assert.match(
    renderReadme(data, candidates),
    /\[Example Tracker\]\(https:\/\/example\.com\)/,
  );
});

test("a configured feature column renders without renderer changes", async () => {
  const data = structuredClone(await loadData());
  const candidates = await loadCandidateData();
  data.comparison.feature_columns.push({
    key: "docker",
    label: "Docker",
    navigation_label: "Provides Docker deployment",
  });
  for (const project of data.projects) {
    project.features.docker = {
      value: "unknown",
      source: project.evidence_set.find((source) => source.kind === "documentation")!.source,
      verified_at: "2026-07-30",
      note: "Docker support was not documented in the reviewed evidence set.",
    };
  }

  assert.deepEqual(validateData(data), []);
  assert.match(
    renderReadme(data, candidates),
    /\| Data source \| Dashboard \| REST API \| MCP \| CLI \| Docker \| Last commit \|/,
  );
});

test("facts date appears only when project dates diverge", async () => {
  const data = structuredClone(await loadData());
  const candidates = await loadCandidateData();

  for (const project of data.projects) {
    for (const cell of [
      project.status,
      project.maturity,
      project.license.server,
      project.license.clients,
      project.data_source,
      ...Object.values(project.features),
    ]) {
      cell.verified_at = "2026-08-28";
    }
  }
  assert.doesNotMatch(renderReadme(data, candidates), /\| Facts verified \|/);

  data.projects[0]!.license.server.verified_at = "2026-07-29";
  assert.match(renderReadme(data, candidates), /\| Facts verified \|/);
});

test("repository links render in their own column", async () => {
  const [data, candidates] = await Promise.all([
    loadData(),
    loadCandidateData(),
  ]);
  const readme = renderReadme(data, candidates);

  assert.match(readme, /\| Project \| Repository \| Stars \| Data source \|/);
  for (const project of activeProjects(data)) {
    const repositoryCell = `[${project.repository}](https://github.com/${project.repository})`;
    const starsCell = `[${project.metrics.stars.value}](${project.metrics.stars.source})`;
    assert.ok(
      readme.includes(` | ${repositoryCell} | ${starsCell} | `),
      `${project.name} renders its repository link before its stars`,
    );
  }
  assert.doesNotMatch(readme, /\]\([^)]*\) \(\[GitHub\]/);
});

test("interface navigation is derived from feature cells", async () => {
  const [data, candidates] = await Promise.all([
    loadData(),
    loadCandidateData(),
  ]);
  const readme = renderReadme(data, candidates);

  assert.match(
    readme,
    /\| Stars \| Data source \| Dashboard \| REST API \| MCP \| CLI \| Last commit \|/,
  );
  const active = activeProjects(data);
  const lines = readme.split("\n");
  for (const column of data.comparison.feature_columns) {
    const prefix = `- **${column.navigation_label}:** `;
    const line = lines.find((entry) => entry.startsWith(prefix));
    assert.ok(line, `navigation line for ${column.navigation_label}`);
    const listed = active.filter(
      (project) => project.features[column.key]?.value === true,
    );
    if (listed.length === 0) {
      assert.equal(line, `${prefix}None in the current table`);
      continue;
    }
    let position = prefix.length;
    for (const project of listed) {
      const found = line.indexOf(project.name, position);
      assert.ok(found >= 0, `${project.name} listed in star order under ${column.navigation_label}`);
      position = found + project.name.length;
    }
    for (const project of active) {
      if (listed.includes(project)) continue;
      assert.ok(
        !line.includes(project.name),
        `${project.name} is not listed under ${column.navigation_label}`,
      );
    }
  }
});

test("every comparison cell has value, source, and verified_at", async () => {
  const data = await loadData();
  for (const project of data.projects) {
    for (const cell of projectCells(project)) {
      assert.notEqual(cell.value, undefined);
      assert.match(cell.source, /^https:\/\//);
      assert.match(cell.verified_at, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test("every project declares README and documentation evidence", async () => {
  const data = await loadData();
  for (const project of data.projects) {
    assert.ok(project.evidence_set.length >= 2);
    assert.ok(project.evidence_set.some((source) => source.kind === "readme"));
    assert.ok(project.evidence_set.some((source) => source.kind === "documentation"));
    for (const source of project.evidence_set) {
      assert.match(source.source, /^https:\/\//);
      assert.ok(source.scope.length > 0);
      assert.match(source.verified_at, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test("validation rejects an incomplete evidence set", async () => {
  const data = structuredClone(await loadData());
  data.projects[0]!.evidence_set = data.projects[0]!.evidence_set.filter(
    (source) => source.kind !== "documentation",
  );
  assert.ok(
    validateData(data).some((error) =>
      error.includes("evidence_set must contain README and documentation sources"),
    ),
  );
});

test("single-repository MIT projects do not report an unknown client license", async () => {
  const active = activeProjects(await loadData());
  for (const name of ["OpenSEO", "SerpBear", "SerpTrail"]) {
    const project = active.find((candidate) => candidate.name === name);
    assert.equal(project?.license.clients.value, "MIT (same repository)");
  }
});

test("legacy unknowns are excluded from active-project evidence notes", async () => {
  const evidence = renderEvidence(await loadData());
  assert.doesNotMatch(evidence, /Serposcope/);
});

test("evidence review dates appear once per project heading", async () => {
  const evidence = renderEvidence(await loadData());
  assert.equal(
    evidence.match(/evidence reviewed 2026-07-30/g)?.length,
    4,
  );
  assert.doesNotMatch(evidence, /\(reviewed \d{4}-\d{2}-\d{2}\)/);
});

test("every collected source is public HTTPS", async () => {
  const urls = collectSourceUrls(await loadData());
  assert.ok(urls.length > 0);
  assert.ok(urls.every((url) => url.startsWith("https://")));
  assert.ok(urls.every((url) => !url.includes("-private/")));
});

test("README is exactly the generated artifact", async () => {
  const [data, candidates] = await Promise.all([
    loadData(),
    loadCandidateData(),
  ]);
  const readme = await readFile(path.join(repositoryRoot, "README.md"), "utf8");
  assert.equal(readme, renderReadme(data, candidates));
});

test("EVIDENCE is exactly the generated artifact", async () => {
  const data = await loadData();
  const evidence = await readFile(
    path.join(repositoryRoot, "EVIDENCE.md"),
    "utf8",
  );
  assert.equal(evidence, renderEvidence(data));
});

test("METHODOLOGY is exactly the generated artifact", async () => {
  const [data, candidates] = await Promise.all([
    loadData(),
    loadCandidateData(),
  ]);
  const methodology = await readFile(
    path.join(repositoryRoot, "METHODOLOGY.md"),
    "utf8",
  );
  assert.equal(methodology, renderMethodology(data, candidates));
});

test("discovery statistics render as run-scoped table values", async () => {
  const [data, candidates] = await Promise.all([
    loadData(),
    loadCandidateData(),
  ]);
  const methodology = renderMethodology(data, candidates);
  const stats = candidateStats(candidates);
  assert.ok(
    methodology.includes(
      `| Pending review | ${stats.pending_review.toLocaleString("en-US")} |`,
    ),
  );
  assert.ok(
    methodology.includes(
      `| Included | ${stats.included.toLocaleString("en-US")} |`,
    ),
  );
  assert.doesNotMatch(methodology, /\bMost mechanical exclusions\b/);
});
