import { fileURLToPath } from "node:url";
import path from "node:path";
import { collectSourceUrls, loadData, validateData } from "./data.ts";
import { policySourceUrls } from "./policy.ts";

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface CheckSourceUrlsOptions {
  concurrency?: number;
  fetchImpl?: FetchImpl;
  retryDelayMs?: number;
  timeoutMs?: number;
}

interface LinkCheckResult {
  failures: string[];
  warnings: string[];
}

const defaultConcurrency = 8;
const defaultRetryDelayMs = 500;
const defaultTimeoutMs = 20_000;
const maximumAttempts = 2;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isTransientStatus(status: number) {
  return status === 429 || status >= 500;
}

async function checkUrl(
  url: string,
  options: Required<CheckSourceUrlsOptions>,
): Promise<{ kind: "failure" | "warning"; message: string } | null> {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await options.fetchImpl(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          Range: "bytes=0-1023",
          "User-Agent": "CorgiCorner-open-source-rank-trackers-link-check",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      if (attempt < maximumAttempts) {
        await wait(options.retryDelayMs);
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        kind: "warning",
        message: `${url} (${message} after ${maximumAttempts} attempts)`,
      };
    }

    if (response.ok || response.status === 416) return null;

    if (isTransientStatus(response.status)) {
      if (attempt < maximumAttempts) {
        await wait(options.retryDelayMs);
        continue;
      }
      return {
        kind: "warning",
        message: `${url} (HTTP ${response.status} after ${maximumAttempts} attempts)`,
      };
    }

    return {
      kind: "failure",
      message: `${url} (HTTP ${response.status})`,
    };
  }

  throw new Error(`unreachable retry state for ${url}`);
}

export async function checkSourceUrls(
  urls: string[],
  options: CheckSourceUrlsOptions = {},
): Promise<LinkCheckResult> {
  const resolvedOptions: Required<CheckSourceUrlsOptions> = {
    concurrency: Math.max(
      1,
      Math.floor(options.concurrency ?? defaultConcurrency),
    ),
    fetchImpl: options.fetchImpl ?? fetch,
    retryDelayMs: options.retryDelayMs ?? defaultRetryDelayMs,
    timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
  };
  const results = new Array<
    { kind: "failure" | "warning"; message: string } | null
  >(urls.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < urls.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await checkUrl(urls[index]!, resolvedOptions);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(resolvedOptions.concurrency, urls.length) },
      () => worker(),
    ),
  );

  return {
    failures: results
      .filter((result) => result?.kind === "failure")
      .map((result) => result!.message),
    warnings: results
      .filter((result) => result?.kind === "warning")
      .map((result) => result!.message),
  };
}

export async function main() {
  const data = await loadData();
  const validationErrors = validateData(data);

  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join("\n"));
  }

  const urls = [...new Set([...collectSourceUrls(data), ...policySourceUrls()])]
    .toSorted();
  const result = await checkSourceUrls(urls);

  if (result.warnings.length > 0) {
    console.warn(
      `Transient source warnings:\n${result.warnings
        .map((warning) => `- ${warning}`)
        .join("\n")}`,
    );
  }

  if (result.failures.length > 0) {
    console.error(
      `Broken sources:\n${result.failures
        .map((failure) => `- ${failure}`)
        .join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }

  const warningSuffix =
    result.warnings.length === 0
      ? ""
      : ` (${result.warnings.length} transient warning${
          result.warnings.length === 1 ? "" : "s"
        })`;
  console.log(`${urls.length} public source links checked${warningSuffix}`);
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) await main();
