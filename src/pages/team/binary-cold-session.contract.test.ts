// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./binary.vue", import.meta.url), "utf8");
const team = readFileSync(new URL("./team.vue", import.meta.url), "utf8");

describe("binary cold session orchestration", () => {
  it("waits for the restored, app-bound account before issuing protected reads", () => {
    expect(page).toMatch(/binarySessionReady\(/);
    expect(page).toMatch(/watch\(remoteSessionReady/);
    expect(page).toMatch(/if \(!remoteSessionReady\.value\) return;/);
    expect(page).toContain("createScopedReadCoalescer");
    expect(page).toContain("accountBindingEpoch: app.accountBindingEpoch");
    expect(page).toContain("runtime: captureRuntimeRevision()");
  });

  it("renders no binary amount on the team tab after the shared snapshot is cleared", () => {
    expect(team).toContain("if (!snapshot) return null;");
    expect(team).toContain('binary.value === null ? "—"');
  });
});
