import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadData, repositoryRoot, validateData } from "./data.ts";
import {
  loadCandidateData,
  validateCandidateData,
  validateProjectCandidateAlignment,
} from "./candidate-data.ts";
import { renderReadme } from "./render-readme.ts";
import { renderEvidence } from "./render-evidence.ts";
import { renderMethodology } from "./render-methodology.ts";

const checkOnly = process.argv.includes("--check");
const readmePath = path.join(repositoryRoot, "README.md");
const evidencePath = path.join(repositoryRoot, "EVIDENCE.md");
const methodologyPath = path.join(repositoryRoot, "METHODOLOGY.md");
const [data, candidates] = await Promise.all([loadData(), loadCandidateData()]);
const errors = [
  ...validateData(data),
  ...validateCandidateData(candidates),
  ...validateProjectCandidateAlignment(data, candidates),
];

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

const expectedReadme = renderReadme(data, candidates);
const expectedEvidence = renderEvidence(data);
const expectedMethodology = renderMethodology(data, candidates);

if (checkOnly) {
  const [actualReadme, actualEvidence, actualMethodology] = await Promise.all([
    readFile(readmePath, "utf8").catch(() => ""),
    readFile(evidencePath, "utf8").catch(() => ""),
    readFile(methodologyPath, "utf8").catch(() => ""),
  ]);
  if (
    actualReadme !== expectedReadme ||
    actualEvidence !== expectedEvidence ||
    actualMethodology !== expectedMethodology
  ) {
    console.error(
      "README.md, EVIDENCE.md, or METHODOLOGY.md is stale. Run npm run generate.",
    );
    process.exit(1);
  }
  console.log(
    "README.md, EVIDENCE.md, and METHODOLOGY.md match projects.yml and candidates.yml",
  );
} else {
  await Promise.all([
    writeFile(readmePath, expectedReadme),
    writeFile(evidencePath, expectedEvidence),
    writeFile(methodologyPath, expectedMethodology),
  ]);
  console.log("README.md, EVIDENCE.md, and METHODOLOGY.md generated");
}
