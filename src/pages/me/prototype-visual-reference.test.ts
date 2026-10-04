// @ts-expect-error These tests run in Node.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
// @ts-expect-error These tests run in Node.
import { tmpdir } from "node:os";
// @ts-expect-error These tests run in Node.
import { join } from "node:path";
// @ts-expect-error These tests run in Node.
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePrototypeVisualReference } from "./prototype-visual-reference";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = String(mkdtempSync(join(tmpdir(), "me-reference-test-")));
  roots.push(root);
  const git = (...args: string[]): string => String(execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim();
  git("init", "-q");
  git("config", "user.name", "fakerli998877-ship-it");
  git("config", "user.email", "325914866+fakerli998877-ship-it@users.noreply.github.com");
  git("remote", "add", "origin", "https://github.com/agentabatiuo572-byte/nexion-frontend-prototype.git");
  mkdirSync(join(root, "src/pages/me"), { recursive: true });
  const page = join(root, "src/pages/me/me.vue");
  writeFileSync(page, "<template>approved</template>\n<style>.grid{display:grid}</style>\n");
  git("add", "src");
  git("-c", "core.hooksPath=", "commit", "-qm", "approved reference fixture");
  return { root, git, page, commit: git("rev-parse", "HEAD") };
}
describe("prototype visual reference identity", () => {
  it("reads approved immutable Git blobs even when checkout files have changed", () => {
    const f = fixture();
    const expected = String(readFileSync(f.page, "utf8")).replace(/\r\n/g, "\n");
    writeFileSync(f.page, "<template>unapproved WIP</template>\n");
    const reference = resolvePrototypeVisualReference({ repositoryRoot: f.root, configuredRoot: f.root, commit: f.commit });
    expect(reference?.read("src/pages/me/me.vue")).toBe(expected);
    expect(reference?.files("src/pages/me")).toEqual(["src/pages/me/me.vue"]);
  });
  it("rejects a partial directory whose git lookup silently inherits its parent's repository", () => {
    const f = fixture();
    const impostor = join(f.root, "NX1.0-Prototype");
    mkdirSync(join(impostor, "src/pages/me"), { recursive: true });
    writeFileSync(join(impostor, "src/pages/me/me.vue"), "<template>junk</template>");
    expect(resolvePrototypeVisualReference({ repositoryRoot: f.root, candidates: [impostor], commit: f.commit })).toBeNull();
    expect(() => resolvePrototypeVisualReference({ repositoryRoot: f.root, configuredRoot: impostor, commit: f.commit })).toThrow(/not its own Git checkout/);
  });
  it("continues to an authentic candidate instead of using an existing junk directory", () => {
    const f = fixture();
    const junk = join(f.root, "NX1.0-Prototype"); mkdirSync(junk);
    expect(resolvePrototypeVisualReference({ repositoryRoot: f.root, candidates: [junk, f.root], commit: f.commit })?.commit).toBe(f.commit);
  });
  it("an explicitly configured checkout with the wrong origin fails", () => {
    const f = fixture(); f.git("remote", "set-url", "origin", "https://github.com/jasonukkd/plan-harness.git");
    expect(() => resolvePrototypeVisualReference({ repositoryRoot: f.root, configuredRoot: f.root, commit: f.commit })).toThrow(/wrong origin/);
  });
  it("requires the exact approved commit and rejects ambiguous branch aliases", () => {
    const f = fixture();
    for (const commit of ["0".repeat(40), "HEAD"]) expect(() => resolvePrototypeVisualReference({ repositoryRoot: f.root, configuredRoot: f.root, commit })).toThrow();
  });
  it("does not let reference reads escape the source subtree", () => {
    const f = fixture();
    const reference = resolvePrototypeVisualReference({ repositoryRoot: f.root, configuredRoot: f.root, commit: f.commit });
    expect(() => reference?.read("src/../private")).toThrow(/Invalid reference path/);
  });
});
