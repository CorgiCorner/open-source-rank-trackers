import { loadData, validateData } from "./data.ts";
import {
  loadCandidateData,
  validateCandidateData,
  validateProjectCandidateAlignment,
} from "./candidate-data.ts";

const [projects, candidates] = await Promise.all([loadData(), loadCandidateData()]);
const errors = [
  ...validateData(projects),
  ...validateCandidateData(candidates),
  ...validateProjectCandidateAlignment(projects, candidates),
];

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("projects.yml and candidates.yml are valid");
