import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const postFlightSourcePath = path.join(repoRoot, "scripts", "post-flight.mjs");

test("post-flight bounds hung ghWithRetry", () => {
  const source = fs.readFileSync(postFlightSourcePath, "utf8");

  assert.match(source, /CLOWNFISH_POST_FLIGHT_GH_TIMEOUT_MS/);
  assert.match(source, /DEFAULT_GH_TIMEOUT_MS/);
  assert.match(source, /2 \* 60 \* 1000/);
  assert.match(source, /function resolveGhTimeoutMs\(/);
  assert.match(source, /function ghWithRetry\(/);
  assert.match(source, /timeout:\s*ghTimeoutMs/);
  assert.match(source, /killSignal:\s*"SIGKILL"/);
  assert.match(source, /error\?\.code === "ETIMEDOUT"/);
  assert.ok(
    (source.match(/timeout:\s*ghTimeoutMs/g) ?? []).length >= 1,
    "ghWithRetry must pass timeout to execFileSync",
  );
});
