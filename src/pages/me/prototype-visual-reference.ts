// @ts-expect-error Test-only helper runs in Node; App compilation omits Node declarations.
import { existsSync, realpathSync } from "node:fs";
// @ts-expect-error Test-only helper runs in Node.
import { execFileSync } from "node:child_process";
// @ts-expect-error Test-only helper runs in Node.
import { dirname, join, resolve } from "node:path";

export const ME_VISUAL_REFERENCE_COMMIT = "710e9eecfeefee36014c779ca699ec8fcc66fd87";
const REFERENCE_REMOTE = "https://github.com/agentabatiuo572-byte/nexion-frontend-prototype.git";
const canonical = (location: string): string => String(realpathSync(location)).replace(/\\/g, "/").toLowerCase();
const normalizedRemote = (value: string): string => value.trim().replace(/\.git$/, "").replace(/\/$/, "").toLowerCase();

export interface PrototypeVisualReference {
  root: string;
  commit: string;
  read: (relative: string) => string;
  files: (prefix: string) => string[];
}

function referenceAt(candidate: string, commit: string): PrototypeVisualReference {
  if (!existsSync(candidate)) throw new Error("checkout is missing");
  const root = String(realpathSync(candidate));
  const git = (args: string[]): string => String(execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  if (canonical(git(["rev-parse", "--show-toplevel"]).trim()) !== canonical(root)) throw new Error("directory is not its own Git checkout");
  if (normalizedRemote(git(["remote", "get-url", "origin"])) !== normalizedRemote(REFERENCE_REMOTE)) throw new Error("checkout has the wrong origin");
  if (!/^[a-f0-9]{40}$/.test(commit) || git(["cat-file", "-t", commit]).trim() !== "commit") throw new Error("approved reference commit is missing");
  const read = (relative: string): string => {
    if (!relative.startsWith("src/") || /[\\\r\n\0:]/.test(relative) || relative.split("/").some((part) => part === "." || part === "..")) throw new Error("Invalid reference path");
    return git(["show", `${commit}:${relative}`]).replace(/\r\n/g, "\n");
  };
  read("src/pages/me/me.vue");
  return { root, commit, read, files: (prefix) => {
    if (!prefix.startsWith("src/") || /[\\\r\n\0:]/.test(prefix) || prefix.split("/").some((part) => part === "." || part === "..")) throw new Error("Invalid reference prefix");
    return git(["ls-tree", "-r", "-z", "--name-only", commit, "--", `${prefix.replace(/\/$/, "")}/`]).split("\0").filter(Boolean);
  } };
}

export function resolvePrototypeVisualReference(options: {
  repositoryRoot: string;
  configuredRoot?: string;
  candidates?: string[];
  commit?: string;
}): PrototypeVisualReference | null {
  const commit = options.commit || ME_VISUAL_REFERENCE_COMMIT;
  if (options.configuredRoot) {
    try { return referenceAt(resolve(options.configuredRoot), commit); }
    catch (error) { throw new Error(`Configured prototype reference is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const candidates = options.candidates ? [...options.candidates] : [resolve(options.repositoryRoot, "..", "NX1.0-Prototype")];
  if (!options.candidates) {
    for (let parent = dirname(options.repositoryRoot); ; parent = dirname(parent)) {
      candidates.push(join(parent, "Nexion-uniapp"));
      if (dirname(parent) === parent) break;
    }
  }
  for (const candidate of candidates) {
    try { return referenceAt(candidate, commit); } catch { /* optional automatic candidates require a complete, authentic Git identity */ }
  }
  return null;
}
