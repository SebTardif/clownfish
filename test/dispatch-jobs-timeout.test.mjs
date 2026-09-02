import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const job = "jobs/openclaw/inbox/cluster-example.md";

test("dispatch-jobs bounds runCommand and publish-backlog children", () => {
  const source = fs.readFileSync(path.join(repoRoot, "scripts", "dispatch-jobs.mjs"), "utf8");

  assert.match(source, /CLOWNFISH_DISPATCH_CHILD_TIMEOUT_MS/);
  assert.match(source, /CLOWNFISH_PUBLISH_BACKLOG_CHILD_TIMEOUT_MS/);
  assert.match(source, /function runCommand\(/);
  assert.match(source, /child\.kill\("SIGKILL"\)/);
  assert.match(source, /function readPublishBacklog\(/);
  assert.match(source, /timeout:\s*timeoutMs/);
  assert.match(source, /killSignal:\s*"SIGKILL"/);
});

test("hung publish-backlog cannot stall past the backlog-wait deadline", (t) => {
  const fixture = makeHangFixture(t);
  const result = runDispatch(t, fixture, {
    args: [
      "--wait-for-capacity",
      "--batch-size",
      "1",
      "--batch-delay-ms",
      "1",
      "--publish-backlog-threshold",
      "0",
      "--publish-backlog-wait-ms",
      "200",
      "--publish-backlog-poll-ms",
      "1",
      "--publish-backlog-child-timeout-ms",
      "80",
    ],
    hangOn: "run",
  });

  assert.equal(result.error, undefined, `dispatch exceeded the outer deadline: ${result.stderr}`);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /waiting up to 200ms for publisher reconciliation/);
  assert.match(`${result.stdout}\n${result.stderr}`, /timed out after/);
  assert.ok(result.elapsedMs < 2000, `hung for ${result.elapsedMs}ms`);
});

test("hung dispatch child is killed and fails the job", (t) => {
  const fixture = makeHangFixture(t);
  const result = runDispatch(t, fixture, {
    args: ["--skip-publish-backlog-check", "--dispatch-child-timeout-ms", "80", "--max-live-workers", "1"],
    hangOn: "workflow",
  });

  assert.equal(result.error, undefined, `dispatch exceeded the outer deadline: ${result.stderr}`);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /timed out after 80ms/);
  assert.ok(result.elapsedMs < 2000, `hung for ${result.elapsedMs}ms`);
});

function makeHangFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clownfish-dispatch-timeout-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, gh: path.join(root, "fake-ghx.mjs") };
}

function runDispatch(t, fixture, { args, hangOn }) {
  writeFakeGhx(fixture.gh);
  const startedAt = Date.now();
  const result = spawnSync(
    process.execPath,
    [
      "scripts/dispatch-jobs.mjs",
      job,
      "--mode",
      "plan",
      "--gh-bin",
      fixture.gh,
      "--skip-token-secret-check",
      "--no-dispatch-ledger",
      ...args,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      detached: process.platform !== "win32",
      timeout: 5000,
      killSignal: "SIGKILL",
      env: {
        ...process.env,
        FAKE_GHX_HANG: hangOn,
      },
    },
  );
  if (process.platform !== "win32" && result.pid) {
    try {
      process.kill(-result.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  t.after(() => {
    if (process.platform === "win32" || !result.pid) return;
    try {
      process.kill(-result.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  });
  result.elapsedMs = Date.now() - startedAt;
  return result;
}

function writeFakeGhx(filePath) {
  fs.writeFileSync(
    filePath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const hangOn = process.env.FAKE_GHX_HANG;

if (args[0] === "--version" || args.includes("--version")) {
  console.log("fake-ghx 1.0");
  process.exit(0);
}

if (args[0] === "run" && args[1] === "list") {
  if (hangOn === "run") hang();
  else {
    console.log("[]");
    process.exit(0);
  }
} else if (args[0] === "workflow" && args[1] === "run") {
  if (hangOn === "workflow") hang();
  else process.exit(0);
} else if (args[0] === "api") {
  console.log(JSON.stringify([{ workflow_runs: [] }]));
  process.exit(0);
} else {
  console.error("unexpected fake ghx args: " + args.join(" "));
  process.exit(1);
}

function hang() {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1000);
}
`,
    { mode: 0o755 },
  );
}
