import { loadData, type VerifiedCell } from "./data.ts";

const projectName = process.argv.slice(2).join(" ");
if (!projectName) {
  console.error("Usage: npm run outreach -- <project-name>");
  process.exit(1);
}

const data = await loadData();
const project = data.projects.find(
  (candidate) => candidate.name.toLowerCase() === projectName.toLowerCase(),
);

if (!project) {
  console.error(`Unknown project: ${projectName}`);
  process.exit(1);
}

const display = (value: boolean | number | string | null) => {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === "unknown") return "Unknown";
  return String(value);
};

const lines: Array<[string, VerifiedCell]> = [
  ["Server license", project.license.server],
  ["Client license", project.license.clients],
  ["Data source", project.data_source],
  ...data.comparison.feature_columns.map(
    (column): [string, VerifiedCell] => [column.label, project.features[column.key]!],
  ),
];

console.log(`We are preparing a source-backed comparison of open-source rank trackers.
Before publishing it, we would appreciate a factual review of your project's row.
There is no private-repository link to open. The complete proposed row is below.

Project: ${project.name}
Repository: https://github.com/${project.repository}
Website: ${project.website}
Stars: ${project.metrics.stars.value}
Last commit: ${project.metrics.last_commit.value?.slice(0, 10) ?? "Unknown"}
Archived: ${display(project.metrics.archived.value)}

Public evidence set reviewed for every cell:
${project.evidence_set
  .map(
    (entry) =>
      `- ${entry.label}: ${entry.source}\n  Scope: ${entry.scope}\n  Reviewed: ${entry.verified_at}`,
  )
  .join("\n")}

${lines
  .map(
    ([label, entry]) =>
      `${label}: ${display(entry.value)}\nSource: ${entry.source}\nVerified: ${entry.verified_at}${
        entry.note ? `\nNote: ${entry.note}` : ""
      }`,
  )
  .join("\n\n")}

Where a value remains Unknown, we did not find the capability anywhere in the
complete evidence set above. Unknown does not mean the capability is absent.

Please reply with any correction and a public source. We will apply confirmed
corrections ourselves before the comparison becomes public.`);
