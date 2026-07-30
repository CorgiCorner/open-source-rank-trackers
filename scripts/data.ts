import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import YAML from "yaml";

export type CellValue = boolean | number | string | null;

export interface VerifiedCell<T extends CellValue = CellValue> {
  value: T;
  source: string;
  verified_at: string;
  note?: string;
}

export interface EvidenceSource {
  kind: "readme" | "documentation";
  label: string;
  source: string;
  scope: string;
  verified_at: string;
}

export interface FeatureColumn {
  key: string;
  label: string;
  navigation_label: string;
}

export type ProjectMaturity =
  | "Experimental"
  | "Active"
  | "Mature"
  | "Legacy";

export interface Project {
  name: string;
  repository: string;
  website: string;
  evidence_set: EvidenceSource[];
  status: VerifiedCell<"active" | "legacy">;
  maturity: VerifiedCell<ProjectMaturity>;
  license: {
    server: VerifiedCell<string>;
    clients: VerifiedCell<string>;
  };
  data_source: VerifiedCell<string>;
  features: Record<string, VerifiedCell<boolean | "unknown">>;
  metrics: {
    stars: VerifiedCell<number>;
    last_commit: VerifiedCell<string | null>;
    archived: VerifiedCell<boolean>;
    created_at: VerifiedCell<string>;
    latest_release: VerifiedCell<string | null>;
  };
}

export interface ProjectData {
  version: number;
  comparison: {
    title: string;
    verified_at: string;
    maintained_by: string;
    disclosure: string;
    feature_columns: FeatureColumn[];
    related_lists: Array<{
      name: string;
      fact: VerifiedCell<string>;
    }>;
  };
  projects: Project[];
}

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const projectsPath = path.join(repositoryRoot, "projects.yml");

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const repositoryPattern = /^[^/]+\/[^/]+$/;

export function isPublicSource(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !value.includes(".agent-private") &&
      !value.includes("-private/")
    );
  } catch {
    return false;
  }
}

function projectUrl(project: Project) {
  return `https://github.com/${project.repository}`;
}

export async function loadData(): Promise<ProjectData> {
  return YAML.parse(await readFile(projectsPath, "utf8")) as ProjectData;
}

export function activeProjects(data: ProjectData) {
  return data.projects
    .filter((project) => project.status.value === "active")
    .toSorted(
      (left, right) =>
        right.metrics.stars.value - left.metrics.stars.value ||
        left.name.localeCompare(right.name),
    );
}

export function legacyProjects(data: ProjectData) {
  return data.projects
    .filter((project) => project.status.value === "legacy")
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export function projectCells(project: Project): VerifiedCell[] {
  return [
    project.status,
    project.maturity,
    project.license.server,
    project.license.clients,
    project.data_source,
    ...Object.values(project.features),
    project.metrics.stars,
    project.metrics.last_commit,
    project.metrics.archived,
    project.metrics.created_at,
    project.metrics.latest_release,
  ];
}

export function collectSourceUrls(data: ProjectData) {
  const urls = new Set<string>();

  for (const project of data.projects ?? []) {
    urls.add(projectUrl(project));
    urls.add(project.website);
    for (const source of project.evidence_set ?? []) urls.add(source.source);
    for (const cell of projectCells(project)) urls.add(cell.source);
  }
  for (const related of data.comparison.related_lists ?? []) {
    urls.add(related.fact.source);
  }

  return [...urls].filter(Boolean).toSorted();
}

function validateCell(cell: unknown, prefix: string, errors: string[]) {
  if (!cell || typeof cell !== "object") {
    errors.push(`${prefix} must be an object with value, source, and verified_at`);
    return;
  }

  const candidate = cell as Partial<VerifiedCell>;
  if (candidate.value === undefined || candidate.value === "") {
    errors.push(`${prefix}.value is required`);
  }
  if (!isPublicSource(candidate.source)) {
    errors.push(`${prefix}.source must be a public HTTPS URL`);
  }
  if (!datePattern.test(candidate.verified_at ?? "")) {
    errors.push(`${prefix}.verified_at must use YYYY-MM-DD`);
  }
  if (candidate.value === "unknown" && !candidate.note) {
    errors.push(`${prefix}.note is required when value is unknown`);
  }
}

function validateEvidenceSource(source: unknown, prefix: string, errors: string[]) {
  if (!source || typeof source !== "object") {
    errors.push(`${prefix} must be an evidence source object`);
    return;
  }

  const candidate = source as Partial<EvidenceSource>;
  if (!["readme", "documentation"].includes(candidate.kind ?? "")) {
    errors.push(`${prefix}.kind must be readme or documentation`);
  }
  if (!candidate.label) {
    errors.push(`${prefix}.label is required`);
  }
  if (!isPublicSource(candidate.source)) {
    errors.push(`${prefix}.source must be a public HTTPS URL`);
  }
  if (!candidate.scope) {
    errors.push(`${prefix}.scope is required`);
  }
  if (!datePattern.test(candidate.verified_at ?? "")) {
    errors.push(`${prefix}.verified_at must use YYYY-MM-DD`);
  }
}

export function validateData(data: ProjectData) {
  const errors: string[] = [];

  if (data?.version !== 2) errors.push("version must be 2");
  if (!datePattern.test(data?.comparison?.verified_at ?? "")) {
    errors.push("comparison.verified_at must use YYYY-MM-DD");
  }
  if (
    !Array.isArray(data?.comparison?.feature_columns) ||
    data.comparison.feature_columns.length === 0
  ) {
    errors.push("comparison.feature_columns must be a non-empty array");
  }
  if (
    !Array.isArray(data?.comparison?.related_lists) ||
    data.comparison.related_lists.length === 0
  ) {
    errors.push("comparison.related_lists must be a non-empty array");
  } else {
    const names = new Set<string>();
    data.comparison.related_lists.forEach((related, index) => {
      const prefix = `comparison.related_lists.${index}`;
      if (!related?.name) errors.push(`${prefix}.name is required`);
      if (names.has(related?.name)) errors.push(`${prefix}.name must be unique`);
      names.add(related?.name);
      validateCell(related?.fact, `${prefix}.fact`, errors);
    });
  }
  if (!Array.isArray(data?.projects) || data.projects.length === 0) {
    errors.push("projects must be a non-empty array");
    return errors;
  }

  const repositories = new Set<string>();
  const configuredFeatureKeys = new Set<string>();
  for (const [index, column] of (data.comparison.feature_columns ?? []).entries()) {
    const prefix = `comparison.feature_columns.${index}`;
    if (!column?.key || !/^[a-z][a-z0-9_]*$/.test(column.key)) {
      errors.push(`${prefix}.key must use snake_case`);
    }
    if (!column?.label) {
      errors.push(`${prefix}.label is required`);
    }
    if (!column?.navigation_label) {
      errors.push(`${prefix}.navigation_label is required`);
    }
    if (configuredFeatureKeys.has(column?.key)) {
      errors.push(`${prefix}.key must be unique`);
    }
    configuredFeatureKeys.add(column?.key);
  }

  for (const project of data.projects) {
    const prefix = project?.repository
      ? `projects.${project.repository}`
      : "projects.<missing-repository>";

    if (!project?.name) errors.push(`${prefix}.name is required`);
    if (!repositoryPattern.test(project?.repository ?? "")) {
      errors.push(`${prefix}.repository must be an owner/repository pair`);
    }
    if (repositories.has(project?.repository)) {
      errors.push(`${prefix}.repository must be unique`);
    }
    repositories.add(project?.repository);
    if (!isPublicSource(project?.website)) {
      errors.push(`${prefix}.website must be a public HTTPS URL`);
    }
    if (!Array.isArray(project?.evidence_set) || project.evidence_set.length < 2) {
      errors.push(`${prefix}.evidence_set must contain README and documentation sources`);
    } else {
      const evidenceKinds = new Set<string>();
      const evidenceLabels = new Set<string>();
      project.evidence_set.forEach((source, index) => {
        validateEvidenceSource(source, `${prefix}.evidence_set.${index}`, errors);
        evidenceKinds.add(source?.kind);
        if (evidenceLabels.has(source?.label)) {
          errors.push(`${prefix}.evidence_set labels must be unique`);
        }
        evidenceLabels.add(source?.label);
      });
      if (!evidenceKinds.has("readme")) {
        errors.push(`${prefix}.evidence_set must include the repository README`);
      }
      if (!evidenceKinds.has("documentation")) {
        errors.push(`${prefix}.evidence_set must include official documentation`);
      }
    }

    validateCell(project?.status, `${prefix}.status`, errors);
    validateCell(project?.maturity, `${prefix}.maturity`, errors);
    if (
      !["Experimental", "Active", "Mature", "Legacy"].includes(
        project?.maturity?.value ?? "",
      )
    ) {
      errors.push(
        `${prefix}.maturity.value must be Experimental, Active, Mature, or Legacy`,
      );
    }
    validateCell(project?.license?.server, `${prefix}.license.server`, errors);
    validateCell(project?.license?.clients, `${prefix}.license.clients`, errors);
    validateCell(project?.data_source, `${prefix}.data_source`, errors);
    const projectFeatureKeys = new Set(Object.keys(project?.features ?? {}));
    for (const key of configuredFeatureKeys) {
      validateCell(project?.features?.[key], `${prefix}.features.${key}`, errors);
    }
    for (const key of projectFeatureKeys) {
      if (!configuredFeatureKeys.has(key)) {
        errors.push(`${prefix}.features.${key} has no configured column`);
      }
    }
    validateCell(project?.metrics?.stars, `${prefix}.metrics.stars`, errors);
    validateCell(project?.metrics?.last_commit, `${prefix}.metrics.last_commit`, errors);
    validateCell(project?.metrics?.archived, `${prefix}.metrics.archived`, errors);
    validateCell(project?.metrics?.created_at, `${prefix}.metrics.created_at`, errors);
    validateCell(
      project?.metrics?.latest_release,
      `${prefix}.metrics.latest_release`,
      errors,
    );

    if (!["active", "legacy"].includes(project?.status?.value)) {
      errors.push(`${prefix}.status.value must be active or legacy`);
    }
    if (!Number.isInteger(project?.metrics?.stars?.value) || project.metrics.stars.value < 0) {
      errors.push(`${prefix}.metrics.stars.value must be a non-negative integer`);
    }
    if (
      project?.metrics?.last_commit?.value !== null &&
      Number.isNaN(Date.parse(project?.metrics?.last_commit?.value))
    ) {
      errors.push(`${prefix}.metrics.last_commit.value must be an ISO timestamp or null`);
    }
    if (typeof project?.metrics?.archived?.value !== "boolean") {
      errors.push(`${prefix}.metrics.archived.value must be boolean`);
    }
    if (Number.isNaN(Date.parse(project?.metrics?.created_at?.value ?? ""))) {
      errors.push(`${prefix}.metrics.created_at.value must be an ISO timestamp`);
    }
    if (
      project?.metrics?.latest_release?.value !== null &&
      Number.isNaN(Date.parse(project?.metrics?.latest_release?.value ?? ""))
    ) {
      errors.push(
        `${prefix}.metrics.latest_release.value must be an ISO timestamp or null`,
      );
    }
    if (
      project?.metrics?.archived?.value === true &&
      project?.maturity?.value !== "Legacy"
    ) {
      errors.push(`${prefix}.maturity.value must be Legacy when archived`);
    }
    if (
      project?.metrics?.archived?.value === false &&
      project?.maturity?.value === "Legacy"
    ) {
      errors.push(`${prefix}.maturity.value cannot be Legacy when not archived`);
    }
  }

  return errors;
}
