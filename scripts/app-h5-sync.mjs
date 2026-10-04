#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SOURCE_REMOTE = "https://github.com/agentabatiuo572-byte/nexion-frontend-uniapp.git";
export const TARGET_REMOTE = "https://github.com/agentabatiuo572-byte/nexion-frontend-prototype.git";
export const PROVENANCE = "docs/app-h5-source.json";
const DIRECTORIES = ["src", "scripts", "checks", "PRD", "docs", ".githooks"];
const ROOT_FILES = ["package.json", "package-lock.json", "vite.config.ts", "uno.config.ts", "vitest.config.ts", "tsconfig.json", "shims-uni.d.ts", "index.html", ".gitattributes", ".gitignore", ".env.development", ".env.production", ".env.example"];
const HEX = /^[a-f0-9]{40}$/;
const SHA = /^[a-f0-9]{64}$/;
const normalizedRemote = (url) => String(url).trim().replace(/\.git$/, "").replace(/\/$/, "").toLowerCase();
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => { throw new Error(message); };

function git(root, args, input) {
  const r = spawnSync("git", ["-C", root, ...args], { input, maxBuffer: 256 * 1024 * 1024 });
  if (r.error || r.status !== 0) fail(`git ${args[0]} failed: ${r.error?.message || r.stderr.toString().trim()}`);
  return r.stdout;
}
function textGit(root, args, input) { return git(root, args, input).toString().trim(); }
function repository(root, remote) {
  if (fs.lstatSync(path.resolve(root)).isSymbolicLink()) fail(`Repository root cannot be a symlink/junction: ${root}`);
  const full = fs.realpathSync(path.resolve(root));
  const actual = textGit(full, ["rev-parse", "--show-toplevel"]);
  if (path.resolve(actual).toLowerCase() !== full.toLowerCase()) fail(`Expected repository root: ${full}`);
  if (normalizedRemote(textGit(full, ["remote", "get-url", "origin"])) !== normalizedRemote(remote)) fail(`Wrong origin for ${full}; expected ${remote}`);
  return full;
}
export function controlled(relative) {
  if (relative === PROVENANCE) return false;
  if (!relative || /[\\\r\n\0]/.test(relative) || relative.startsWith("/") || relative.split("/").some((p) => !p || p === "." || p === ".." || p.includes(":"))) return false;
  const parts = relative.split("/");
  if (parts.some((p) => [".git", ".claude", ".codex", "node_modules", "dist", ".trash"].includes(p))) return false;
  if (/\.(?:pem|key|p12|pfx)$/i.test(relative) || /(?:^|\/)(?:\.env(?:\..*)?|credentials(?:\..*)?|secrets?(?:\..*)?)$/i.test(relative)) return ROOT_FILES.includes(relative);
  return ROOT_FILES.includes(relative) || DIRECTORIES.some((d) => relative.startsWith(`${d}/`));
}
function safePath(root, relative) {
  if (!controlled(relative) && relative !== PROVENANCE && !relative.startsWith(".trash/app-h5-sync-")) fail(`Forbidden path: ${relative}`);
  if (relative.includes("\\") || relative.split("/").some((p) => !p || p === "." || p === ".." || p.includes(":"))) fail(`Unsafe path: ${relative}`);
  const resolved = path.resolve(root, ...relative.split("/"));
  if (!resolved.startsWith(`${root}${path.sep}`)) fail(`Path escapes target: ${relative}`);
  let cursor = root;
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (stat?.isSymbolicLink()) fail(`Symlink/junction is forbidden: ${cursor}`);
  }
  return resolved;
}
function inventory(root) {
  return [...new Set(git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).toString().split("\0").filter(controlled))].sort();
}
function objectHash(root, bytes) { return textGit(root, ["hash-object", "--stdin"], bytes); }
function workingHashes(root, relatives) {
  const present = [];
  const result = {};
  for (const relative of relatives) {
    const location = safePath(root, relative);
    if (!fs.existsSync(location)) { result[relative] = null; continue; }
    if (!fs.lstatSync(location).isFile()) fail(`Expected a regular file: ${relative}`);
    present.push(relative);
  }
  if (present.length) {
    const hashes = textGit(root, ["hash-object", "--stdin-paths"], `${present.map((relative) => JSON.stringify(relative)).join("\n")}\n`).split(/\r?\n/);
    if (hashes.length !== present.length || hashes.some((hash) => !HEX.test(hash))) fail("Working file hash count is incomplete");
    present.forEach((relative, i) => { result[relative] = hashes[i]; });
  }
  return result;
}
function readBlobs(root, oids) {
  const output = git(root, ["cat-file", "--batch"], `${oids.join("\n")}\n`);
  let cursor = 0;
  return oids.map((oid) => {
    const end = output.indexOf(10, cursor);
    const [actual, type, size] = output.subarray(cursor, end).toString().split(" ");
    if (actual !== oid || type !== "blob" || !/^\d+$/.test(size)) fail(`Cannot read source blob ${oid}`);
    cursor = end + 1;
    const bytes = output.subarray(cursor, cursor + Number(size));
    cursor += Number(size) + 1;
    return bytes;
  });
}
function entries(root, tree) {
  const rows = git(root, ["ls-tree", "-r", "-z", "--full-tree", tree]).toString().split("\0").filter(Boolean);
  const result = {};
  for (const row of rows) {
    const tab = row.indexOf("\t");
    const [mode, type, oid] = row.slice(0, tab).split(" ");
    const relative = row.slice(tab + 1);
    if (!controlled(relative)) continue;
    if (type !== "blob" || !["100644", "100755"].includes(mode)) fail(`Snapshot contains symlink/submodule: ${relative}`);
    result[relative] = { oid, mode };
  }
  if (!result["src/main.ts"] || !result["package.json"]) fail("Source snapshot has no App entry/package");
  return result;
}
function indexEntries(root) {
  const result = {};
  for (const row of git(root, ["ls-files", "--stage", "-z"]).toString().split("\0").filter(Boolean)) {
    const tab = row.indexOf("\t");
    const [mode, oid, stage] = row.slice(0, tab).split(" ");
    const relative = row.slice(tab + 1);
    if (!controlled(relative)) continue;
    if (stage !== "0" || !["100644", "100755"].includes(mode)) fail(`Invalid/conflicted source index: ${relative}`);
    result[relative] = { oid, mode };
  }
  return result;
}
function webBytes(relative, bytes) {
  if (relative === ".githooks/config.json") {
    const config = JSON.parse(bytes.toString());
    config.mainline = "H5";
    return Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  }
  if (relative === "vite.config.ts") {
    const original = bytes.toString();
    const matches = [...original.matchAll(/\bport:\s*5173\b/g)];
    if (matches.length !== 1) fail("Web port overlay requires exactly one port: 5173 in vite.config.ts");
    return Buffer.from(original.replace(/\bport:\s*5173\b/, "port: 5175"));
  }
  return bytes;
}
function snapshot(source, ref) {
  if (!HEX.test(ref || "")) fail("--ref must be a complete 40-character commit/tree SHA; branch names and HEAD are not immutable pins");
  const kind = textGit(source, ["cat-file", "-t", ref]);
  if (!["commit", "tree"].includes(kind)) fail("Source ref must identify a commit or a staged tree");
  const tree = textGit(source, ["rev-parse", `${ref}^{tree}`]);
  const files = {};
  const rows = Object.entries(entries(source, tree));
  const blobs = readBlobs(source, rows.map(([, entry]) => entry.oid));
  for (const [i, [relative, { oid, mode }]] of rows.entries()) {
    const bytes = blobs[i];
    if (relative.startsWith(".env")) {
      const sensitive = bytes.toString().split(/\r?\n/).filter((line) => /(?:SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|ACCESS_TOKEN)\s*=\s*[^\s#]/i.test(line) && !/^\s*#/.test(line));
      if (sensitive.length) fail(`Nonempty secret-like setting cannot be mirrored: ${relative}`);
    }
    const output = webBytes(relative, bytes);
    files[relative] = { sourceBlob: oid, sourceSha256: digest(bytes), targetBlob: bytes === output ? oid : objectHash(source, output), targetSha256: digest(output), mode };
  }
  return { sourceRemote: SOURCE_REMOTE, sourceBranch: "test", sourceHead: textGit(source, ["rev-parse", "HEAD"]), sourceRef: ref, sourceRefKind: kind, sourceTree: tree, files };
}
function clean(root) {
  if (textGit(root, ["status", "--porcelain", "--untracked-files=all"])) fail(`Target must be clean before apply: ${root}`);
}
export function buildPlan({ source, target, ref }) {
  source = repository(source, SOURCE_REMOTE);
  target = repository(target, TARGET_REMOTE);
  if (source.toLowerCase() === target.toLowerCase()) fail("Source and target must be different repositories");
  const state = snapshot(source, ref);
  const present = inventory(target);
  const hashes = workingHashes(target, Object.keys(state.files));
  const writes = Object.keys(state.files).filter((relative) => hashes[relative] !== state.files[relative].targetBlob);
  const deletes = present.filter((relative) => !state.files[relative] && fs.existsSync(safePath(target, relative)));
  for (const relative of Object.keys(state.files)) safePath(target, relative);
  return { schemaVersion: 1, source, target, targetHead: textGit(target, ["rev-parse", "HEAD"]), ...state, writes, deletes };
}
function validateRecord(record) {
  if (record?.schemaVersion !== 1 || normalizedRemote(record.sourceRemote) !== normalizedRemote(SOURCE_REMOTE) || record.sourceBranch !== "test" || !HEX.test(record.sourceRef || "") || !HEX.test(record.sourceTree || "") || !HEX.test(record.sourceHead || "") || !["commit", "tree"].includes(record.sourceRefKind)) fail("Invalid App/H5 provenance");
  if (!record.files || !record.files["src/main.ts"] || !record.files["package.json"]) fail("Provenance has no App entry/package");
  for (const [relative, file] of Object.entries(record.files)) {
    if (!controlled(relative) || !HEX.test(file.sourceBlob || "") || !HEX.test(file.targetBlob || "") || !SHA.test(file.sourceSha256 || "") || !SHA.test(file.targetSha256 || "") || !["100644", "100755"].includes(file.mode)) fail(`Invalid provenance entry: ${relative}`);
  }
}
export function applyPlan(plan) {
  validateRecord(plan);
  const target = repository(plan.target, TARGET_REMOTE);
  clean(target);
  if (textGit(target, ["rev-parse", "HEAD"]) !== plan.targetHead) fail("Target HEAD changed since plan; regenerate plan");
  const fresh = buildPlan({ source: plan.source, target, ref: plan.sourceRef });
  for (const key of ["sourceTree", "sourceRefKind", "files", "writes", "deletes"]) {
    if (JSON.stringify(fresh[key]) !== JSON.stringify(plan[key])) fail(`Plan changed or was tampered with: ${key}`);
  }
  const trashBase = `.trash/app-h5-sync-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
  // Read and validate every blob/path before the first mutation.
  const blobs = readBlobs(fresh.source, plan.writes.map((relative) => fresh.files[relative].sourceBlob));
  const outputs = new Map(plan.writes.map((relative, i) => {
    const bytes = webBytes(relative, blobs[i]);
    if (digest(bytes) !== fresh.files[relative].targetSha256) fail(`Blob mismatch: ${relative}`);
    return [relative, bytes];
  }));
  for (const relative of [...plan.writes, ...plan.deletes]) {
    safePath(target, relative);
    safePath(target, `${trashBase}/${relative}`);
  }
  safePath(target, PROVENANCE);
  for (const relative of [...plan.writes, ...plan.deletes]) {
    const location = safePath(target, relative);
    if (fs.existsSync(location)) {
      const backup = safePath(target, `${trashBase}/${relative}`);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.renameSync(location, backup);
    }
    if (outputs.has(relative)) {
      fs.mkdirSync(path.dirname(location), { recursive: true });
      fs.writeFileSync(location, outputs.get(relative));
      if (process.platform !== "win32") fs.chmodSync(location, fresh.files[relative].mode === "100755" ? 0o755 : 0o644);
    }
  }
  const record = { schemaVersion: 1, sourcePath: fresh.source, sourceRemote: fresh.sourceRemote, sourceBranch: fresh.sourceBranch, sourceHead: fresh.sourceHead, sourceRef: fresh.sourceRef, sourceRefKind: fresh.sourceRefKind, sourceTree: fresh.sourceTree, overlays: ["vite.config.ts: web dev port 5175", ".githooks/config.json: mainline H5"], files: fresh.files };
  const recordPath = safePath(target, PROVENANCE);
  if (fs.existsSync(recordPath)) {
    const backup = safePath(target, `${trashBase}/${PROVENANCE}`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.renameSync(recordPath, backup);
  }
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  checkParity({ source: fresh.source, target, compareSource: false });
  return { writes: plan.writes.length, deletes: plan.deletes.length, trash: path.join(target, trashBase), sourceTree: fresh.sourceTree };
}
function compareInventory(root, files, side) {
  const expected = Object.keys(files).sort();
  const actual = inventory(root);
  const extras = actual.filter((relative) => !files[relative] && fs.existsSync(safePath(root, relative)));
  const hashes = workingHashes(root, expected);
  const missing = expected.filter((relative) => hashes[relative] === null);
  const drift = expected.filter((relative) => hashes[relative] !== null && hashes[relative] !== files[relative][side === "source" ? "sourceBlob" : "targetBlob"]);
  if (extras.length || missing.length || drift.length) fail(`${side} parity failed: extra=[${extras.join(", ")}] missing=[${missing.join(", ")}] changed=[${drift.join(", ")}]`);
}
export function checkParity({ source, target, compareSource = true, offline = false, latest = false }) {
  if (offline && latest) fail("--offline cannot be combined with --latest");
  target = repository(target, TARGET_REMOTE);
  const record = JSON.parse(fs.readFileSync(safePath(target, PROVENANCE), "utf8"));
  validateRecord(record);
  compareInventory(target, record.files, "target");
  if (compareSource && !offline) {
    source = source || record.sourcePath;
    if (source && fs.existsSync(source)) {
      source = repository(source, SOURCE_REMOTE);
      const pinned = snapshot(source, record.sourceRef);
      if (JSON.stringify(pinned.files) !== JSON.stringify(record.files) || pinned.sourceTree !== record.sourceTree) fail("Provenance does not match pinned Git snapshot");
      compareInventory(source, record.files, "source");
      const index = indexEntries(source);
      for (const [relative, entry] of Object.entries(index)) {
        if (!record.files[relative] || entry.oid !== record.files[relative].sourceBlob || entry.mode !== record.files[relative].mode) fail(`Source index differs from synchronized content: ${relative}`);
      }
      if (Object.keys(record.files).some((relative) => !index[relative])) fail("Source index is missing synchronized files");
    } else fail("SOURCE_UNAVAILABLE: supply a source checkout for authentic snapshot verification; --latest also requires source objects. Explicit --offline proves cached provenance only");
  }
  if (latest) {
    if (record.sourceRefKind !== "commit") fail("A staged tree is not a published commit; repin after App commit before --latest");
    const r = spawnSync("git", ["ls-remote", SOURCE_REMOTE, "refs/heads/test"], { encoding: "utf8", timeout: 60_000 });
    if (r.error || r.status !== 0) fail(`Remote freshness could not be verified: ${r.error?.message || r.stderr}`);
    const remoteHead = r.stdout.split(/\s+/)[0];
    if (!HEX.test(remoteHead) || remoteHead !== record.sourceRef) fail(`H5 is behind source test: synchronized ${record.sourceRef}, remote ${remoteHead || "unknown"}`);
  }
  return { verdict: "pass", files: Object.keys(record.files).length, sourceRef: record.sourceRef, sourceTree: record.sourceTree, scope: offline ? "cached-provenance-only; source worktree/index and remote freshness NOT checked" : latest ? "authentic-source-snapshot + source-working/index + target-content + remote-test-freshness" : compareSource ? "source-snapshot + source-working/index + target-content" : "target-content" };
}
export function repin({ source, target, ref }) {
  source = repository(source, SOURCE_REMOTE);
  target = repository(target, TARGET_REMOTE);
  checkParity({ source, target });
  const file = safePath(target, PROVENANCE);
  const previous = JSON.parse(fs.readFileSync(file, "utf8"));
  const next = snapshot(source, ref);
  if (next.sourceRefKind !== "commit") fail("repin requires a complete committed source SHA");
  if (JSON.stringify(previous.files) !== JSON.stringify(next.files)) fail("repin refuses source content changes; regenerate and apply a plan instead");
  const backup = safePath(target, `.trash/app-h5-sync-repin-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}/${PROVENANCE}`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.renameSync(file, backup);
  fs.writeFileSync(file, `${JSON.stringify({ ...previous, ...next, sourcePath: source }, null, 2)}\n`);
  checkParity({ source, target });
  return { sourceRef: next.sourceRef, sourceTree: next.sourceTree, files: Object.keys(next.files).length };
}
function discover(start, name) {
  for (let cursor = start; ; cursor = path.dirname(cursor)) {
    const candidate = path.join(cursor, name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.dirname(cursor) === cursor) return null;
  }
}
export function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  const value = (flag) => { const i = argv.indexOf(flag); if (i < 0) return undefined; if (!argv[i + 1] || argv[i + 1].startsWith("--")) fail(`Missing value for ${flag}`); return argv[i + 1]; };
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const isTarget = normalizedRemote(textGit(root, ["remote", "get-url", "origin"])) === normalizedRemote(TARGET_REMOTE);
  const source = value("--source") || (isTarget ? process.env.APP_H5_SYNC_SOURCE : root);
  const target = value("--target") || (isTarget ? root : process.env.APP_H5_SYNC_TARGET || discover(root, "Nexion-H5"));
  if (command === "plan") {
    if (!source || !target) fail("plan needs --source and --target");
    const plan = buildPlan({ source, target, ref: value("--ref") });
    const output = value("--out");
    if (output) { fs.writeFileSync(path.resolve(output), `${JSON.stringify(plan, null, 2)}\n`); return { plan: path.resolve(output), sourceRef: plan.sourceRef, sourceTree: plan.sourceTree, writes: plan.writes.length, deletes: plan.deletes.length }; }
    return plan;
  }
  if (command === "apply") {
    const planPath = value("--plan");
    if (!planPath) fail("apply needs --plan");
    return applyPlan(JSON.parse(fs.readFileSync(path.resolve(planPath), "utf8")));
  }
  if (command === "check") {
    if (!target) fail("H5 target unavailable; supply --target");
    return checkParity({ source, target, offline: argv.includes("--offline"), latest: argv.includes("--latest") });
  }
  if (command === "repin") {
    if (!source || !target) fail("repin needs --source and --target");
    return repin({ source, target, ref: value("--ref") });
  }
  fail("Usage: app-h5-sync.mjs plan --source ROOT --target ROOT --ref SHA [--out FILE] | apply --plan FILE | repin --source ROOT --target ROOT --ref COMMIT | check [--source ROOT --target ROOT] [--offline|--latest]");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main(), null, 2)); } catch (error) { console.error(`APP_H5_SYNC_FAILED: ${error.message}`); process.exitCode = 1; }
}
