import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const applyResultSourcePath = path.join(repoRoot, "scripts", "apply-result.mjs");

test("apply-result bounds hung ghOnce and ghWithRetry", () => {
  const source = fs.readFileSync(applyResultSourcePath, "utf8");

  assert.match(source, /CLOWNFISH_APPLY_GH_TIMEOUT_MS/);
  assert.match(source, /DEFAULT_GH_TIMEOUT_MS/);
  assert.match(source, /2 \* 60 \* 1000/);
  assert.match(source, /function resolveGhTimeoutMs\(/);
  assert.match(source, /function ghOnce\(/);
  assert.match(source, /function ghWithRetry\(/);
  assert.match(source, /timeout:\s*ghTimeoutMs/);
  assert.match(source, /killSignal:\s*"SIGKILL"/);
  assert.match(source, /error\?\.code === "ETIMEDOUT"/);
  assert.match(source, /function ensureLabel\(/);
  assert.ok(
    (source.match(/timeout:\s*ghTimeoutMs/g) ?? []).length >= 1,
    "ghOnce must pass timeout to execFileSync",
  );
});
