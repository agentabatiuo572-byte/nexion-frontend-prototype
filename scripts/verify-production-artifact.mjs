import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist", "build", "h5");
assert.equal(fs.existsSync(output), true,
  "production H5 artifact is missing; run npm run build:h5 -- --mode production first");

const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(?:js|css|html|json)$/i.test(entry.name)) files.push(absolute);
  }
};
walk(output);
assert.ok(files.length > 0, "production H5 artifact contains no inspectable files");

const forbidden = [
  /127\.0\.0\.1:8110/,
  /localhost:8110/i,
  /VITE_NEXGRID_DEV_OTP_CODE["']?\s*:\s*["']\d{6}/,
  /VITE_NEXGRID_API_MODE/,
];
for (const artifact of files) {
  const source = fs.readFileSync(artifact, "utf8");
  for (const pattern of forbidden) {
    assert.doesNotMatch(source, pattern,
      `${path.relative(root, artifact)} leaked development-only runtime configuration`);
  }
  assert.doesNotMatch(source, /目标已保存\s*·\s*\$\{days\}/,
    `${path.relative(root, artifact)} renders the goal deadline as a currency amount`);
}

console.log(`Production artifact boundary: PASS (${files.length} files scanned)`);
