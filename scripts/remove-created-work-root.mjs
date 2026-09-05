import fs from "node:fs";

export function removeCreatedWorkRoot(workRoot, createdWorkRoot, rmSync = fs.rmSync) {
  if (!createdWorkRoot || !workRoot) return;
  rmSync(workRoot, { recursive: true, force: true });
}
