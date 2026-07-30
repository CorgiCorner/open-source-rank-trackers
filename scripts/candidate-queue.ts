import {
  candidateReviewQueue,
  loadCandidateData,
  validateCandidateData,
} from "./candidate-data.ts";

const data = await loadCandidateData();
const errors = validateCandidateData(data);
if (errors.length > 0) throw new Error(errors.join("\n"));

const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = limitArgument ? Number(limitArgument.slice("--limit=".length)) : undefined;
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
  throw new Error("--limit must be a positive integer");
}

for (const [index, candidate] of candidateReviewQueue(data).entries()) {
  if (limit !== undefined && index >= limit) break;
  console.log(
    [
      String(index + 1).padStart(3),
      String(candidate.discovery_snapshot.stars).padStart(6),
      candidate.repository,
    ].join("  "),
  );
}
