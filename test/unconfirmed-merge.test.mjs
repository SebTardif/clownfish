import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { verifiedMergeProof } from "../scripts/lib.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sha = "ab".repeat(20);

function loadAutomerge() {
  const source = fs.readFileSync(path.join(root, "scripts", "comment-router.mjs"), "utf8");
  const body = source.match(/^function executeAutomerge\([^]*?^\}/m)?.[0];
  assert.ok(body, "executeAutomerge missing");
  const views = [];
  const context = {
    views,
    fetchPullRequestView: () => views.shift(),
    validateAutomergeReadiness: () => "",
    automergeGateBlockReason: () => "",
    buildAutomergeMergeArgs: () => ["pr", "merge", "1"],
    spawnSyncWithTimeout: () => ({ status: 0, stdout: "", stderr: "" }),
    stripAnsi: (value) => String(value ?? ""),
    process: { env: {} },
    repoRoot: () => root,
    ghEnv: () => ({}),
    verifiedMergeProof,
  };
  return {
    views,
    executeAutomerge: vm.runInNewContext(`${body}\nexecuteAutomerge`, context),
  };
}

test("automerge waits when gh merge exits 0 without merge proof", () => {
  const { views, executeAutomerge } = loadAutomerge();
  views.push({ labels: [] }, { mergedAt: null, mergeCommit: null });
  const result = executeAutomerge({ issue_number: 1, repo: "example/repo", target: {} });
  assert.equal(result.status, "waiting");
  assert.equal(result.reason, "merge command returned without a verified merged pull request");
  assert.equal(result.merged_at, undefined);
});

test("automerge records the live merge timestamp", () => {
  const { views, executeAutomerge } = loadAutomerge();
  views.push({ labels: [] }, { mergedAt: "2026-09-26T00:00:00Z", mergeCommit: { oid: sha } });
  const result = executeAutomerge({ issue_number: 1, repo: "example/repo", target: {} });
  assert.equal(result.status, "executed");
  assert.equal(result.merged_at, "2026-09-26T00:00:00Z");
  assert.equal(result.merge_commit_sha, sha);
});

test("post-flight blocks closeout when merge proof is missing", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "post-flight.mjs"), "utf8");
  assert.match(source, /const proof = verifiedMergeProof\(merged\)/);
  assert.match(source, /if \(!proof\)/);
  assert.match(source, /status: "blocked"/);
  assert.doesNotMatch(source, /merged_at: merged\.merged_at \?\? null/);
  const closeoutGuard = source.slice(source.indexOf("if (finalized.status === \"executed\")"), source.indexOf("if (finalized.status === \"executed\")") + 180);
  assert.match(closeoutGuard, /finalizePostMergeCloseouts/);
});
