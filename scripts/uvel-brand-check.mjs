import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse, compileStyle } from "@vue/compiler-sfc";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");
const assets = {
  "src/static/img/brand/header-logo-dark.png": "5f438d45f8cbb9cc9d93a3f43b1dde2894120ff4bc33d78e687cc553c0499cd8",
  "src/static/img/brand/header-logo-light.png": "228e45f0eb9afd51e160c685f85f7f967a94ea26d1986d5ad43ee8aa15f896a6",
  "src/static/img/brand/app-icon-dark.png": "af094b551aa23b8067033e5c40cb8d925e4e8a5f65f78f2fbd071acdf06d774b",
  "src/static/img/brand/app-icon-light.png": "db4b06d8bf6e50e38ddf12d0ccd902dfc15d34b45f2a421c69c01a95ab4c59c7",
  "src/static/logo.png": "af094b551aa23b8067033e5c40cb8d925e4e8a5f65f78f2fbd071acdf06d774b",
};
for (const [path, hash] of Object.entries(assets)) {
  assert.equal(createHash("sha256").update(readFileSync(root + path)).digest("hex"), hash, path);
}
assert.match(read("src/components/brand-lockup.vue"), /aria-label="UVEL"/);
assert.match(read("src/components/brand-lockup.vue"), /html\[data-theme="light"\]/);
const style = parse(read("src/components/brand-lockup.vue")).descriptor.styles[0];
const css = compileStyle({ source: style.content, filename: "brand-lockup.vue", id: "data-v-brand-check", scoped: style.scoped }).code;
assert.match(css, /html\[data-theme="light"\] \.uvel-brand__dark\s*\{\s*display: none/);
assert.match(css, /html\[data-theme="light"\] \.uvel-brand__light\s*\{\s*display: block/);
console.log("UVEL assets: 5 exact source hashes and accessible themed component");
if (!process.argv.includes("--assets")) {
  // Reviewed replacement pixels: text scanning alone cannot detect baked-in branding.
  for (const [path, hash] of Object.entries({
    "src/static/img/products/nexgridbox-pro-v2.png": "b3dee1a008c768a808c332b283a65e0403e65f25b77740e8f0afce54fded05fb",
    "src/static/img/products/nexgridrack-p1-v2.png": "97428289de1f601ce46a3f0490cec72b1dc405002336581db9d1e719f7a8bf3a",
  })) assert.equal(createHash("sha256").update(readFileSync(root + path)).digest("hex"), hash, path);
  const legacyCopy = /(?<![\w-])NexGrid(?![-_])|(?<![\w-])NEXGRID(?![\w-])/g;
  const legacyContact = /(?:[\w.+-]+@)?(?:[\w-]+\.)*nexgrid\.(?:ai|io)|@nexgrid_official|discord\.gg\/nexgrid/i;
  // Keys, comments, paths, domains, referral codes and protocol headers retain their contracts.
  const visibleLine = (line) => line
    .replace(/^\s*(?:\/\/|\*|<!--).*$/, "")
    .replace(/\b\w*NexGrid\w*(?=\s*:)/g, "")
    .replace(/(?:https?:\/\/|[\w.+-]+@)[^\s"'<>\x60]+/g, "")
    .replace(/\/?static\/[^\s"'<>\x60]+/g, "")
    .replace(/X-NexGrid-Signature/g, "");
  assert.equal(legacyCopy.test(visibleLine('title: "NexGrid"')), true, "old copy must fail");
  legacyCopy.lastIndex = 0;
  assert.equal(legacyCopy.test(visibleLine('title: "UVEL"; coin: "NEX"')), false);
  legacyCopy.lastIndex = 0;
  assert.equal(legacyCopy.test(visibleLine('referralCode: "NEXGRID-A1B2", title: "NexGrid"')), true, "valid identifier cannot exempt neighboring old copy");
  const failures = [];
  for (const entry of readdirSync(root + "src", { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(vue|ts|json)$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) continue;
    const path = (entry.parentPath + "/" + entry.name).replaceAll("\\", "/");
    if (path.endsWith("/lib/brand.ts")) continue; // Exact legacy display adapter, covered by its positive/negative unit test.
    const lines = readFileSync(path, "utf8").replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).split(/\r?\n/);
    lines.forEach((line, n) => {
      if (path.endsWith("/store/deposits-core.ts")) line = line.replace(/accountName: "CTY TNHH NEXGRID VIETNAM"/g, 'accountName: ""'); // Preserve only the exact registered payee token.
      legacyCopy.lastIndex = 0;
      if (legacyCopy.test(visibleLine(line))) failures.push(path.slice(root.length) + ":" + (n + 1));
      if (path.endsWith(".vue")) {
        const contactLine = path.endsWith("/pages/register/register.vue")
          ? line.replace(/@demo\.nexgrid\.ai/g, "") // Mock account key, never a contact address.
          : line;
        if (legacyContact.test(contactLine.replace(/^\s*\/\/.*$/, ""))) failures.push(path.slice(root.length) + ":" + (n + 1) + " contact");
      }
    });
  }
  assert.deepEqual(failures, [], "old display brand or contact remains");
  for (const locale of ["en", "zh", "vi"]) {
    assert.doesNotMatch(read(`src/i18n/messages/${locale}.ts`), /nexgrid\.(?:ai|io)|@nexgrid_official|discord\.gg\/nexgrid/i, `${locale} old contact details`);
  }
  assert.doesNotMatch(read("src/pages/developer/developer.vue"), /Host:\s*api\.nexgrid\.ai/i, "old API host in displayed example");
  assert.doesNotMatch(read("src/lib/share.ts"), /return\s+`https:\/\/nexgrid\.(?:ai|io)/i, "old native share fallback");
  assert.match(read("index.html"), /<title>UVEL<\/title>/);
  const icons = read("index.html").match(/<link\b[^>]*rel="icon"[^>]*>/g) || [];
  assert.equal(icons.length, 1, "one unambiguous favicon");
  assert.match(icons[0], /href="\/static\/logo\.png"/);
  assert.match(read("src/manifest.json"), /"name"\s*:\s*"UVEL"/);
  for (const file of ["src/components/team/share-poster-sheet.vue", "src/pages/me/proof.vue"]) {
    assert.match(read(file), /ctx\.drawImage\(/, file + " must paint the supplied logo");
    assert.doesNotMatch(read(file), /fillText\(["']N(?:exGrid)?["']/);
  }
  console.log("UVEL copy/metadata/poster contracts: pass (negative case exercised)");
}
