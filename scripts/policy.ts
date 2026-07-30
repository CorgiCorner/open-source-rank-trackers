export const reviewStopAfterConsecutiveWithoutInclusion = 50;
export const candidateStaleAfterMonths = 24;

export const githubSearchResultLimit = {
  value: 1_000,
  source: "https://docs.github.com/en/rest/search/search#about-search",
  verified_at: "2026-07-30",
} as const;

export function policySourceUrls() {
  return [githubSearchResultLimit.source];
}
