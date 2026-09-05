import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const commentRouterSourcePath = path.join(repoRoot, "scripts", "comment-router.mjs");

test("comment-router bounds hung ghText and dispatch spawnSync", () => {
  const source = fs.readFileSync(commentRouterSourcePath, "utf8");
  assert.match(source, /CLOWNFISH_COMMENT_ROUTER_GH_TIMEOUT_MS/);
  assert.match(source, /DEFAULT_GH_TIMEOUT_MS/);
  assert.match(source, /2 \* 60 \* 1000/);
  assert.match(source, /function resolveGhTimeoutMs\(/);
  assert.match(source, /function ghText\(/);
  assert.match(source, /function dispatchClawSweeperReview\(/);
  assert.match(source, /function dispatchRepair\(/);
  assert.match(source, /timeout:\s*ghTimeoutMs/);
  assert.match(source, /killSignal:\s*"SIGKILL"/);
  assert.match(source, /error\?\.code === "ETIMEDOUT"/);
  assert.equal((source.match(/timeout:\s*ghTimeoutMs/g) ?? []).length, 5);
  assert.equal((source.match(/killSignal:\s*"SIGKILL"/g) ?? []).length, 5);
  assert.equal((source.match(/spawnSync\(\s*\n\s*"gh"/g) ?? []).length, 4);
  assert.equal((source.match(/execFileSync\("gh"/g) ?? []).length, 1);
});

test("comment-router fails closed when ghText hangs", (t) => {
  const result = runHungCommentRouter(t);
  assert.equal(result.error, undefined, `comment-router hung instead of timing out gh: ${result.stderr}`);
  assert.notEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(`${result.stderr}\n${result.stdout}`, /timed out after \d+ms/);
  assert.ok(result.elapsedMs < 8000, `expected a bounded timeout, waited ${result.elapsedMs}ms`);
});

function runHungCommentRouter(t) {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const fakeGh = writeHungGh(fixture.bin);
  const started = Date.now();
  const result = spawnSync(process.execPath, ["scripts/comment-router.mjs", "--repo", "openclaw/openclaw"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 15_000,
    killSignal: "SIGKILL",
    env: {
      ...process.env,
      ...fakeGh.env,
      PATH: `${fixture.bin}${path.delimiter}${process.env.PATH}`,
      CLOWNFISH_COMMENT_ROUTER_GH_TIMEOUT_MS: String(ghTimeoutMs()),
      CLOWNFISH_REPO: "openclaw/clownfish",
    },
  });
  return { ...result, elapsedMs: Date.now() - started };
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clownfish-comment-router-gh-"));
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin, { recursive: true });
  return { root, bin };
}

function ghTimeoutMs() {
  return process.platform === "win32" ? 1500 : 400;
}

function writeHungGh(binDir) {
  const preloadPath = path.join(binDir, "preload.cjs");
  fs.writeFileSync(
    preloadPath,
    `if (process.argv.some((arg) => String(arg).includes("comment-router.mjs"))) return;
const args = process.argv.slice(1);
if (args.includes("--version")) {
  console.log("gh fake");
  process.exit(0);
}
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
`,
  );
  if (process.platform === "win32") {
    const exePath = path.join(binDir, "gh.exe");
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
  const scriptPath = path.join(binDir, "gh");
  fs.writeFileSync(
    scriptPath,
    `#!/usr/bin/env node
process.on("SIGTERM", () => {});
setInterval(() => {}, 1000);
`,
    { mode: 0o755 },
  );
  return { bin: scriptPath, env: {} };
}
