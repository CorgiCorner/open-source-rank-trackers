import spdxLicenseList from "spdx-license-list";
import {
  type AutomatedFilter,
  type ContentFilterReason,
  type MechanicalFilterReason,
} from "./candidate-data.ts";
import { candidateStaleAfterMonths } from "./policy.ts";

interface FilterInput {
  repository: string;
  description: string | null;
  archived: boolean;
  pushed_at: string | null;
  license_spdx: string | null;
}

const positivePatterns = [
  ["rank-tracker", /\brank[\s-]+track(?:er|ers|ing)\b/i],
  ["serp-tracker", /\bserp[\s-]+(?:track|monitor)(?:er|ers|ing)?\b/i],
  [
    "keyword-rank-monitoring",
    /\b(?:track|monitor|check)(?:ing|s|ed)?\b.{0,80}\bkeywords?\b.{0,80}\b(?:ranks?|rankings?|positions?)\b/is,
  ],
  [
    "keyword-position-monitoring",
    /\bkeywords?\b.{0,80}\b(?:ranks?|rankings?|positions?)\b.{0,80}\b(?:track|monitor|history|historical|daily|scheduled)/is,
  ],
  [
    "keyword-position-checker",
    /\bkeywords?[\s-]+positions?[\s-]+check(?:er|ers|ing)?\b/i,
  ],
  ["position-history", /\b(?:ranking|position)[\s-]+history\b/i],
] as const;

const excludedDomainPatterns = [
  [
    "app-store-ranking",
    /\b(?:app[\s-]+store|google[\s-]+play|appstore|aso)[\s-]+(?:rank|ranking|position)/i,
  ],
  [
    "leaderboard-ranking",
    /\b(?:leaderboard|game[\s-]+ranking|player[\s-]+ranking|sports?[\s-]+ranking)\b/i,
  ],
  [
    "machine-learning-ranking",
    /\b(?:learning[\s-]+to[\s-]+rank|ranking[\s-]+model|model[\s-]+ranking|rank[\s-]+aggregation|re-?ranking)\b/i,
  ],
  [
    "marketplace-ranking",
    /\b(?:amazon|etsy|ebay)[\s-]+(?:product[\s-]+)?(?:rank|ranking|position)\b/i,
  ],
  [
    "social-ranking",
    /\b(?:social[\s-]+listening|social[\s-]+media|instagram|tiktok|youtube)[\s-]+(?:rank|ranking|position)\b/i,
  ],
] as const;

const unrelatedSeoPatterns = [
  ["backlink-tool", /\bbacklinks?\b/i],
  ["keyword-research", /\bkeyword[\s-]+research\b/i],
  ["meta-tag-tool", /\bmeta[\s-]+(?:tag|description|generator)/i],
  ["schema-markup-tool", /\b(?:schema[\s-]+markup|structured[\s-]+data)\b/i],
  ["seo-audit", /\b(?:seo|site|website|technical)[\s-]+audit(?:or|ing)?\b/i],
  ["seo-crawler", /\b(?:seo|site|web)[\s-]+crawler\b/i],
  ["serp-api", /\bserp[\s-]+(?:api|scrap(?:e|er|ing))\b/i],
  ["sitemap-tool", /\bsitemap(?:s|[\s-]+generator)?\b/i],
  ["wordpress-tool", /\bwordpress[\s-]+(?:plugin|theme|seo)\b/i],
] as const;

const serpCollectionPattern =
  /\b(?:serpapi|dataforseo|serper|searchapi|serp[\s-]+api|scrap(?:e|er|ing)|proxy|google[\s-]+results?)\b/i;
const gscPattern = /\b(?:google[\s-]+search[\s-]+console|gsc)\b/i;

function subtractMonths(date: string, months: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString().slice(0, 10);
}

function matchingSignals(
  text: string,
  patterns: ReadonlyArray<readonly [string, RegExp]>,
) {
  return patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name)
    .toSorted();
}

export function evaluateCandidate(
  input: FilterInput,
  readme: { content: string; url: string } | null,
  evaluatedAt: string,
): AutomatedFilter {
  const staleCutoff = subtractMonths(evaluatedAt, candidateStaleAfterMonths);
  const license = input.license_spdx ? spdxLicenseList[input.license_spdx] : undefined;
  const mechanicalReasons: MechanicalFilterReason[] = [];

  if (
    input.archived ||
    input.pushed_at === null ||
    input.pushed_at.slice(0, 10) < staleCutoff
  ) {
    mechanicalReasons.push("legacy-unmaintained");
  }
  if (!license?.osiApproved) {
    mechanicalReasons.push("no-osi-license-detected");
  }
  mechanicalReasons.sort();

  const base = {
    mechanical: {
      reasons: mechanicalReasons,
      license_spdx: input.license_spdx,
      osi_approved: license?.osiApproved ?? false,
      archived: input.archived,
      pushed_at: input.pushed_at,
      stale_cutoff: staleCutoff,
    },
  };

  if (mechanicalReasons.length > 0) {
    return {
      ...base,
      result: "filtered",
      failed_stage: "mechanical",
      content: {
        evaluated: false,
        readme_url: null,
        readme_available: false,
        positive_signals: [],
        excluded_domain_signals: [],
        unrelated_seo_signals: [],
        reasons: [],
      },
    };
  }

  const identityText = `${input.repository}\n${input.description ?? ""}`;
  const fullText = `${identityText}\n${readme?.content ?? ""}`;
  const positiveSignals = matchingSignals(fullText, positivePatterns);
  const excludedDomainSignals = matchingSignals(identityText, excludedDomainPatterns);
  const unrelatedSeoSignals = matchingSignals(identityText, unrelatedSeoPatterns);
  const contentReasons: ContentFilterReason[] = [];

  if (positiveSignals.length === 0) {
    contentReasons.push("no-rank-tracking-signal");
  }
  if (excludedDomainSignals.length > 0) {
    contentReasons.push("excluded-ranking-domain");
  }
  if (positiveSignals.length === 0 && unrelatedSeoSignals.length > 0) {
    contentReasons.push("unrelated-seo-tool");
  }
  if (gscPattern.test(fullText) && !serpCollectionPattern.test(fullText)) {
    contentReasons.push("gsc-only");
  }
  contentReasons.sort();

  return {
    ...base,
    result: contentReasons.length === 0 ? "passed" : "filtered",
    failed_stage: contentReasons.length === 0 ? null : "content",
    content: {
      evaluated: true,
      readme_url: readme?.url ?? null,
      readme_available: readme !== null,
      positive_signals: positiveSignals,
      excluded_domain_signals: excludedDomainSignals,
      unrelated_seo_signals: unrelatedSeoSignals,
      reasons: contentReasons,
    },
  };
}

export function classifyCandidateDescription(input: FilterInput) {
  const identityText = `${input.repository}\n${input.description ?? ""}`;
  const positiveSignals = matchingSignals(identityText, positivePatterns);
  const excludedDomainSignals = matchingSignals(identityText, excludedDomainPatterns);
  const unrelatedSeoSignals = matchingSignals(identityText, unrelatedSeoPatterns);

  if (excludedDomainSignals.length > 0) {
    return "filtered" as const;
  }
  if (positiveSignals.length > 0) {
    return "passed" as const;
  }
  if (unrelatedSeoSignals.length > 0) {
    return "filtered" as const;
  }
  return "ambiguous" as const;
}
