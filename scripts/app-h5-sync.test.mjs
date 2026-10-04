import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { applyPlan, buildPlan, checkParity, controlled, repin, SOURCE_REMOTE, TARGET_REMOTE, PROVENANCE } from "./app-h5-sync.mjs";
import { lint } from "./lib/verify-scope.mjs";

function git(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function put(root, name, value) {
  const file = path.join(root, ...name.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}
function commit(root) { git(root, "add", "-A"); git(root, "-c", "core.hooksPath=", "commit", "-qm", "fixture"); return git(root, "rev-parse", "HEAD"); }
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "app-h5-sync-test-"));
  t.after(() => {
    assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(base).startsWith("app-h5-sync-test-"));
    fs.rmSync(base, { recursive: true, force: true });
  });
  const source = path.join(base, "app");
  const target = path.join(base, "h5");
  for (const [root, remote] of [[source, SOURCE_REMOTE], [target, TARGET_REMOTE]]) {
    fs.mkdirSync(root);
    git(root, "init", "-q");
    git(root, "config", "user.name", "fakerli998877-ship-it");
    git(root, "config", "user.email", "325914866+fakerli998877-ship-it@users.noreply.github.com");
    git(root, "config", "core.autocrlf", "false");
    git(root, "remote", "add", "origin", remote);
    put(root, ".gitignore", ".trash/\nnode_modules/\n");
    put(root, ".gitattributes", "* text=auto\n");
    put(root, "src/main.ts", root === source ? "export const live = 1;\n" : "export const old = 0;\n");
    put(root, "package.json", '{"name":"fixture","type":"module"}\n');
    put(root, "vite.config.ts", "export default { server: { port: 5173 } };\n");
    put(root, ".githooks/config.json", '{"mainline":"main"}\n');
    if (root === target) { put(root, "src/removed.ts", "old\n"); put(root, "AGENTS.md", "H5 own rules\n"); }
    else put(root, ".env.local", "PASSWORD=must-not-copy\n");
    commit(root);
  }
  return { source, target, ref: git(source, "rev-parse", "HEAD") };
}
test("apply mirrors exact Git bytes, retires missing files to trash, preserves H5 rules, then reload check proves persistence", (t) => {
  const f = fixture(t);
  const plan = buildPlan(f);
  assert.ok(plan.deletes.includes("src/removed.ts"));
  const result = applyPlan(plan);
  assert.equal(fs.readFileSync(path.join(f.target, "src/main.ts"), "utf8"), "export const live = 1;\n");
  assert.equal(fs.existsSync(path.join(f.target, "src/removed.ts")), false);
  assert.equal(fs.readFileSync(path.join(result.trash, "src/removed.ts"), "utf8"), "old\n");
  assert.equal(fs.readFileSync(path.join(f.target, "AGENTS.md"), "utf8"), "H5 own rules\n");
  assert.equal(fs.existsSync(path.join(f.target, ".env.local")), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.target, ".githooks/config.json"))).mainline, "H5");
  assert.match(fs.readFileSync(path.join(f.target, "vite.config.ts"), "utf8"), /port: 5175/);
  assert.equal(checkParity(f).verdict, "pass");
  const persisted = JSON.parse(fs.readFileSync(path.join(f.target, PROVENANCE)));
  assert.equal(persisted.sourceRef, f.ref);
  assert.equal(checkParity(f).sourceTree, persisted.sourceTree);
});
test("source WIP is never copied and both worktree and index differences are rejected", (t) => {
  const f = fixture(t);
  put(f.source, "src/main.ts", "WIP\n");
  applyPlan(buildPlan(f));
  assert.match(fs.readFileSync(path.join(f.target, "src/main.ts"), "utf8"), /live = 1/);
  assert.throws(() => checkParity(f), /source parity failed/);
  git(f.source, "add", "src/main.ts");
  put(f.source, "src/main.ts", "export const live = 1;\n");
  assert.throws(() => checkParity(f), /Source index differs/);
});
test("explicit staged tree includes new controlled files without copying unrelated unstaged WIP", (t) => {
  const f = fixture(t);
  put(f.source, "src/new.ts", "new\n");
  git(f.source, "add", "src/new.ts");
  const tree = git(f.source, "write-tree");
  put(f.source, "src/main.ts", "unknown unstaged\n");
  const plan = buildPlan({ ...f, ref: tree });
  assert.equal(plan.sourceRefKind, "tree");
  applyPlan(plan);
  assert.equal(fs.readFileSync(path.join(f.target, "src/new.ts"), "utf8"), "new\n");
  assert.match(fs.readFileSync(path.join(f.target, "src/main.ts"), "utf8"), /live = 1/);
});
test("target drift, missing expected files and extra controlled files all fail", (t) => {
  const f = fixture(t);
  applyPlan(buildPlan(f));
  put(f.target, "src/main.ts", "wrong\n");
  assert.throws(() => checkParity(f), /target parity failed.*changed=\[src\/main.ts\]/);
  put(f.target, "src/main.ts", "export const live = 1;\n");
  fs.renameSync(path.join(f.target, "src/main.ts"), path.join(f.target, "gone.tmp"));
  assert.throws(() => checkParity(f), /missing=\[src\/main.ts\]/);
  fs.renameSync(path.join(f.target, "gone.tmp"), path.join(f.target, "src/main.ts"));
  put(f.target, "src/extra.ts", "new drift\n");
  assert.throws(() => checkParity(f), /extra=\[src\/extra.ts\]/);
});
test("dirty target, stale plan, nonimmutable ref, wrong identity and tampered plan are refused before any write", (t) => {
  const f = fixture(t);
  const plan = buildPlan(f);
  put(f.target, "AGENTS.md", "local WIP\n");
  assert.throws(() => applyPlan(plan), /Target must be clean/);
  git(f.target, "checkout", "--", "AGENTS.md");
  const tampered = structuredClone(plan); tampered.deletes = [];
  assert.throws(() => applyPlan(tampered), /tampered/);
  assert.throws(() => buildPlan({ ...f, ref: "HEAD" }), /complete 40-character/);
  put(f.target, "AGENTS.md", "changed baseline\n"); commit(f.target);
  assert.throws(() => applyPlan(plan), /Target HEAD changed/);
  git(f.source, "remote", "set-url", "origin", TARGET_REMOTE);
  assert.throws(() => buildPlan(f), /Wrong origin/);
});
test("Git CRLF conversion is canonicalized rather than incorrectly marked drift", (t) => {
  const f = fixture(t);
  applyPlan(buildPlan(f));
  put(f.source, "src/main.ts", "export const live = 1;\r\n");
  put(f.target, "src/main.ts", "export const live = 1;\r\n");
  assert.equal(checkParity(f).verdict, "pass");
});
test("source symlink blobs and target junction/symlink paths are rejected", (t) => {
  const f = fixture(t);
  const blob = git(f.source, "hash-object", "src/main.ts");
  git(f.source, "update-index", "--add", "--cacheinfo", `120000,${blob},src/link`);
  assert.throws(() => buildPlan({ ...f, ref: git(f.source, "write-tree") }), /symlink\/submodule/);
  const outside = path.join(path.dirname(f.target), "outside"); fs.mkdirSync(outside);
  fs.renameSync(path.join(f.target, "src"), path.join(f.target, "saved-src"));
  fs.symlinkSync(outside, path.join(f.target, "src"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => buildPlan(f), /Symlink\/junction/);
});
test("offline proof is explicit; absent source and malformed provenance never silently skip", (t) => {
  const f = fixture(t);
  applyPlan(buildPlan(f));
  const recordPath = path.join(f.target, PROVENANCE);
  const record = JSON.parse(fs.readFileSync(recordPath));
  record.sourcePath = path.join(f.target, "absent-source");
  fs.writeFileSync(recordPath, JSON.stringify(record));
  assert.throws(() => checkParity({ target: f.target }), /SOURCE_UNAVAILABLE/);
  assert.throws(() => checkParity({ target: f.target, latest: true }), /SOURCE_UNAVAILABLE/);
  assert.throws(() => checkParity({ target: f.target, offline: true, latest: true }), /cannot be combined/);
  assert.match(checkParity({ target: f.target, offline: true }).scope, /NOT checked/);
  record.files["src/../../escape"] = record.files["src/main.ts"];
  fs.writeFileSync(recordPath, JSON.stringify(record));
  assert.throws(() => checkParity({ target: f.target, offline: true }), /Invalid provenance entry/);
});
test("matching-looking source SHA cannot authenticate forged files/tree even when the cached H5 matches", (t) => {
  const f = fixture(t);
  applyPlan(buildPlan(f));
  const file = path.join(f.target, PROVENANCE);
  const record = JSON.parse(fs.readFileSync(file));
  record.sourceTree = "0".repeat(40);
  record.files["src/main.ts"].sourceSha256 = "0".repeat(64);
  fs.writeFileSync(file, JSON.stringify(record));
  assert.throws(() => checkParity({ ...f, latest: true }), /does not match pinned Git snapshot/);
});
test("dangling target junction is rejected before writing outside the target", (t) => {
  const f = fixture(t);
  fs.renameSync(path.join(f.target, "src"), path.join(f.target, "saved-src"));
  const absent = path.join(path.dirname(f.target), "does-not-exist");
  fs.symlinkSync(absent, path.join(f.target, "src"), process.platform === "win32" ? "junction" : "dir");
  assert.equal(fs.existsSync(path.join(f.target, "src")), false);
  assert.throws(() => buildPlan(f), /Symlink\/junction/);
  assert.equal(fs.existsSync(absent), false);
});
test("forbidden secret/tool/output paths cannot enter the managed set and nonempty env secrets fail", (t) => {
  for (const relative of ["src/../outside", "src/.git/config", "scripts/node_modules/x", "docs/secrets.json", ".env.local", ".git/config", ".claude/settings.json", "dist/index.html", "src/private.key"]) assert.equal(controlled(relative), false, relative);
  const f = fixture(t);
  put(f.source, ".env.production", "VITE_PASSWORD=hidden\n");
  assert.throws(() => buildPlan({ ...f, ref: commit(f.source) }), /secret-like setting/);
});
test("repin publishes a verified staged tree as a commit while preserving H5 pending work, and rejects changed content", (t) => {
  const f = fixture(t);
  put(f.source, "src/new.ts", "new\n"); git(f.source, "add", "src/new.ts");
  applyPlan(buildPlan({ ...f, ref: git(f.source, "write-tree") }));
  const committed = commit(f.source);
  put(f.target, "AGENTS.md", "pending H5 rules\n");
  assert.equal(repin({ ...f, ref: committed }).sourceRef, committed);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.target, PROVENANCE))).sourceRefKind, "commit");
  assert.equal(fs.readFileSync(path.join(f.target, "AGENTS.md"), "utf8"), "pending H5 rules\n");
  put(f.source, "src/new.ts", "changed\n");
  assert.throws(() => repin({ ...f, ref: commit(f.source) }), /source parity failed/);
});
test("scope lint reads Chinese tracked PRD paths as UTF8 instead of Git quoted octal", () => {
  assert.deepEqual(lint({ manifest: { globals: ["PRD/**"], gates: {}, steps: {}, h5Probes: {} }, verifySh: "" }), []);
  assert.ok(lint({ manifest: { globals: ["PRD/absent-directory/**"], gates: {}, steps: {}, h5Probes: {} }, verifySh: "" }).length > 0);
});
