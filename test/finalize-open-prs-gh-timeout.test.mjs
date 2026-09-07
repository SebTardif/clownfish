import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const finalizeSourcePath = path.join(repoRoot, "scripts", "finalize-open-prs.mjs");

test("finalize-open-prs bounds hung dispatchRepair and ghJson", () => {
  const source = fs.readFileSync(finalizeSourcePath, "utf8");

  assert.match(source, /CLOWNFISH_FINALIZE_GH_TIMEOUT_MS/);
  assert.match(source, /DEFAULT_GH_TIMEOUT_MS/);
  assert.match(source, /2 \* 60 \* 1000/);
  assert.match(source, /function resolveGhTimeoutMs\(/);
  assert.match(source, /function dispatchRepair\(/);
  assert.match(source, /function ghJson\(/);
  assert.match(source, /timeout:\s*ghTimeoutMs/);
  assert.match(source, /killSignal:\s*"SIGKILL"/);
  assert.match(source, /error\?\.code === "ETIMEDOUT"/);
  assert.equal((source.match(/timeout:\s*ghTimeoutMs/g) ?? []).length, 2);
  assert.equal((source.match(/killSignal:\s*"SIGKILL"/g) ?? []).length, 2);
  assert.equal((source.match(/execFileSync\(\s*\n\s*"gh"/g) ?? []).length + (source.match(/execFileSync\("gh"/g) ?? []).length, 2);
});
