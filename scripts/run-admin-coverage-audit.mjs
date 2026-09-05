import fs from "node:fs";
import path from "node:path";

const [auditScriptArg, adminRepoArg, uniappRepoArg] = process.argv.slice(2);

if (!auditScriptArg || !adminRepoArg || !uniappRepoArg) {
  throw new Error(
    "usage: node scripts/run-admin-coverage-audit.mjs <audit-script> <admin-repo> <uniapp-repo>",
  );
}

const auditScript = path.resolve(auditScriptArg);
const adminRepo = path.resolve(adminRepoArg);
const uniappRepo = path.resolve(uniappRepoArg);

function replaceExactlyOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  const last = source.lastIndexOf(needle);
  if (first < 0 || first !== last) {
    throw new Error(`admin coverage audit ${label} binding changed; expected exactly one known binding`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

let source = fs.readFileSync(auditScript, "utf8");
source = replaceExactlyOnce(
  source,
  'const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");',
  `const ROOT = ${JSON.stringify(adminRepo)};`,
  "ROOT",
);
source = replaceExactlyOnce(
  source,
  'const UNI_ROOT = path.join(PLAN_ROOT, "Nexion-uniapp");',
  `const UNI_ROOT = ${JSON.stringify(uniappRepo)};`,
  "UNI_ROOT",
);

const sourceUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
await import(sourceUrl);
