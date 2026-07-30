import assert from "node:assert/strict";
import test from "node:test";
import { checkSourceUrls } from "./check-links.ts";

function response(status: number) {
  return new Response("", { status });
}

test("link checks run with bounded concurrency", async () => {
  let active = 0;
  let maximumActive = 0;
  const urls = Array.from(
    { length: 24 },
    (_, index) => `https://example.com/${index}`,
  );

  const result = await checkSourceUrls(urls, {
    concurrency: 8,
    retryDelayMs: 0,
    fetchImpl: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return response(200);
    },
  });

  assert.deepEqual(result, { failures: [], warnings: [] });
  assert.equal(maximumActive, 8);
});

test("network errors are retried once", async () => {
  let calls = 0;
  const result = await checkSourceUrls(["https://example.com/retry"], {
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error("socket reset");
      return response(200);
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(result, { failures: [], warnings: [] });
});

test("persistent server errors become warnings after one retry", async () => {
  let calls = 0;
  const result = await checkSourceUrls(["https://example.com/transient"], {
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return response(502);
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.warnings, [
    "https://example.com/transient (HTTP 502 after 2 attempts)",
  ]);
});

test("hard 404 responses fail without retry", async () => {
  let calls = 0;
  const result = await checkSourceUrls(["https://example.com/missing"], {
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return response(404);
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.failures, [
    "https://example.com/missing (HTTP 404)",
  ]);
});

test("range-not-satisfiable responses remain successful", async () => {
  const result = await checkSourceUrls(["https://example.com/empty"], {
    retryDelayMs: 0,
    fetchImpl: async () => response(416),
  });

  assert.deepEqual(result, { failures: [], warnings: [] });
});
