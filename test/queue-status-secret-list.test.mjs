import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const queueStatusSourcePath = path.join(repoRoot, "scripts", "queue-status.mjs");

test("queue-status bounds hung gh secret and variable list", () => {
  const source = fs.readFileSync(queueStatusSourcePath, "utf8");
  assert.match(source, /CLOWNFISH_QUEUE_STATUS_SECRET_LIST_TIMEOUT_MS/);
  assert.match(source, /DEFAULT_SECRET_LIST_TIMEOUT_MS/);
  assert.match(source, /function readSecretNames\(/);
  assert.match(source, /function readVariableNames\(/);
  assert.match(source, /timeout:\s*secretListTimeoutMs/);
  assert.match(source, /killSignal:\s*"SIGKILL"/);
  assert.equal((source.match(/timeout:\s*secretListTimeoutMs/g) ?? []).length, 2);
  assert.equal((source.match(/execFileSync\(ghCommand\(\), \["secret", "list"/g) ?? []).length, 1);
  assert.equal((source.match(/execFileSync\(ghCommand\(\), \["variable", "list"/g) ?? []).length, 1);
});

test("queue-status skips secret check when gh secret list hangs", (t) => {
  const result = runHungRepoListQueueStatus(t, "secret");
  assert.equal(result.error, undefined, `queue-status hung instead of timing out gh secret list: ${result.stderr}`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /could not inspect repo secrets/);
  assert.match(result.stderr, /skipping token-secret preflight/);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.auth.checked, false);
  assert.ok(payload.auth.blockers.includes("secret check skipped"));
  assert.ok(result.elapsedMs < 8000, `expected a bounded timeout, waited ${result.elapsedMs}ms`);
});

test("queue-status warns and continues when gh variable list hangs", (t) => {
  const result = runHungRepoListQueueStatus(t, "variable");
  assert.equal(result.error, undefined, `queue-status hung instead of timing out gh variable list: ${result.stderr}`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /could not inspect repo variables/);
  assert.match(result.stderr, /App-token preflight may be incomplete/);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.auth.checked, true);
  assert.ok(result.elapsedMs < 8000, `expected a bounded timeout, waited ${result.elapsedMs}ms`);
});

test("queue-status honors --skip-secret-check without calling gh list", (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const fakeGh = writeHungRepoListGh(fixture.bin, "secret");
  const result = spawnSync(
    process.execPath,
    [
      "scripts/queue-status.mjs",
      "--inbox",
      fixture.inbox,
      "--runs-dir",
      fixture.runs,
      "--dispatch-ledger",
      fixture.ledger,
      "--gh-bin",
      fakeGh.bin,
      "--skip-secret-check",
      "--json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 15_000,
      killSignal: "SIGKILL",
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.auth.checked, false);
  assert.ok(payload.auth.blockers.includes("secret check skipped"));
  assert.equal(result.stderr.includes("could not inspect repo secrets"), false);
});

function runHungRepoListQueueStatus(t, hangOn) {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const fakeGh = writeHungRepoListGh(fixture.bin, hangOn);
  const started = Date.now();
  const result = spawnSync(
    process.execPath,
    [
      "scripts/queue-status.mjs",
      "--inbox",
      fixture.inbox,
      "--runs-dir",
      fixture.runs,
      "--dispatch-ledger",
      fixture.ledger,
      "--repo",
      "openclaw/clownfish",
      "--gh-bin",
      fakeGh.bin,
      "--json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 15_000,
      killSignal: "SIGKILL",
      env: {
        ...process.env,
        ...fakeGh.env,
        CLOWNFISH_QUEUE_STATUS_SECRET_LIST_TIMEOUT_MS: String(secretListTimeoutMs()),
        CLOWNFISH_TEST_HANG_ON: hangOn,
      },
    },
  );
  return { ...result, elapsedMs: Date.now() - started };
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clownfish-queue-status-secret-"));
  const inbox = path.join(root, "inbox");
  const runs = path.join(root, "runs");
  const bin = path.join(root, "bin");
  const ledger = path.join(root, "dispatch-ledger.json");
  fs.mkdirSync(inbox, { recursive: true });
  fs.mkdirSync(runs, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(ledger, `${JSON.stringify({ attempts: [] })}\n`);
  return { root, inbox, runs, bin, ledger };
}

function secretListTimeoutMs() {
  return process.platform === "win32" ? 1500 : 400;
}

function writeHungRepoListGh(binDir, hangOn) {
  const preloadPath = path.join(binDir, "preload.cjs");
  fs.writeFileSync(
    preloadPath,
    `if (process.argv.some((arg) => String(arg).includes("queue-status.mjs"))) return;
const args = process.argv.slice(1);
const verb = String(args[0] ?? "").split(/[/\\\\]/).pop();
const hangOn = process.env.CLOWNFISH_TEST_HANG_ON || ${JSON.stringify(hangOn)};
if (args.includes("--version") || verb === "--version") {
  console.log("gh fake");
  process.exit(0);
}
if (verb === hangOn && args[1] === "list") {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}
if (verb === "secret" && args[1] === "list") {
  console.log(JSON.stringify([{ name: "CLOWNFISH_GH_TOKEN" }]));
  process.exit(0);
}
if (verb === "variable" && args[1] === "list") {
  console.log(JSON.stringify([{ name: "CLOWNFISH_APP_ID" }]));
  process.exit(0);
}
console.error("unexpected fake gh call", args.join(" "));
process.exit(1);
`,
  );
  if (process.platform === "win32") {
    const exePath = path.join(binDir, "ghx.exe");
    fs.copyFileSync(process.execPath, exePath);
    const requirePath = preloadPath.replaceAll("\\", "/");
    const env = { NODE_OPTIONS: `--require ${requirePath}` };
    spawnSync(exePath, ["--version"], {
      encoding: "utf8",
      timeout: 15_000,
      killSignal: "SIGKILL",
      env: { ...process.env, ...env },
    });
    return { bin: exePath, env };
  }
  const scriptPath = path.join(binDir, "ghx");
  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("gh fake");
  process.exit(0);
}
if (args[0] === ${JSON.stringify(hangOn)} && args[1] === "list") {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1000);
  return;
}
if (args[0] === "secret" && args[1] === "list") {
  console.log(JSON.stringify([{ name: "CLOWNFISH_GH_TOKEN" }]));
  process.exit(0);
}
if (args[0] === "variable" && args[1] === "list") {
  console.log(JSON.stringify([{ name: "CLOWNFISH_APP_ID" }]));
  process.exit(0);
}
console.error("unexpected fake gh call", args.join(" "));
process.exit(1);
`,
    { mode: 0o755 },
  );
  return { bin: scriptPath, env: {} };
}
