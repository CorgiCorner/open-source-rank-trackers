import { candidateStats, loadCandidateData, validateCandidateData } from "./candidate-data.ts";

const data = await loadCandidateData();
const errors = validateCandidateData(data);

if (errors.length > 0) {
  throw new Error(errors.join("\n"));
}

console.log(JSON.stringify(candidateStats(data), null, 2));
