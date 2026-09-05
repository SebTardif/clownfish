import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { removeCreatedWorkRoot } from "../scripts/remove-created-work-root.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("removeCreatedWorkRoot calls rmSync when this process created workRoot", () => {
  const calls = [];
  const rmSync = (target, options) => {
    calls.push({ target, options });
  };

  removeCreatedWorkRoot("/tmp/projectclownfish-fix-abc", true, rmSync);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, "/tmp/projectclownfish-fix-abc");
  assert.deepEqual(calls[0].options, { recursive: true, force: true });
});

test("removeCreatedWorkRoot does not call rmSync for an operator --work-dir", () => {
  const calls = [];
  const rmSync = (target, options) => {
    calls.push({ target, options });
  };

  removeCreatedWorkRoot("/opt/keep-this-work-dir", false, rmSync);

  assert.equal(calls.length, 0);
});

test("removeCreatedWorkRoot skips an empty workRoot even when created", () => {
  const calls = [];
  removeCreatedWorkRoot("", true, (target, options) => {
    calls.push({ target, options });
  });
  assert.equal(calls.length, 0);
});

test("execute-fix-artifact tracks createdWorkRoot and removes only that dir", () => {
  const source = fs.readFileSync(path.join(repoRoot, "scripts", "execute-fix-artifact.mjs"), "utf8");

  assert.match(source, /import \{ removeCreatedWorkRoot \} from "\.\/remove-created-work-root\.mjs"/);
  assert.match(source, /let createdWorkRoot = false;/);
  assert.match(source, /createdWorkRoot = typeof args\["work-dir"\] !== "string";/);
  assert.match(
    source,
    /} finally \{\s*removeCreatedWorkRoot\(workRoot, createdWorkRoot\);\s*\}/,
  );
  assert.equal(
    (source.match(/removeCreatedWorkRoot\(workRoot, createdWorkRoot\);\s*process\.exit\(0\);/g) ?? []).length,
    2,
  );
});
