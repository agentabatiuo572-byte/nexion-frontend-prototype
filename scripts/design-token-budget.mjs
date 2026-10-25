// Ratchet: existing literal styles may be migrated, but their total cannot grow.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const baselineFile = path.join(root, 'scripts/design-token-budget.json');
const patterns = {
  fontSize: /(?:font-size\s*:\s*|fontSize\s*:\s*["'])\d+(?:\.\d+)?px/g,
  radius: /(?:border-radius\s*:\s*|borderRadius\s*:\s*["'])\d+(?:\.\d+)?px/g,
  spacing: /(?:gap|padding|margin(?:-(?:top|bottom|left|right))?)\s*:\s*["']?\d+(?:\.\d+)?px/g,
};
function count(source) { return Object.fromEntries(Object.entries(patterns).map(([key, pattern]) => [key, [...source.matchAll(pattern)].length])); }
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir,entry.name)) : [path.join(dir,entry.name)]); }
const sources = files(path.join(root,'src')).filter(file => /\.(vue|css|ts)$/.test(file) && !/\.(test|spec)\./.test(file));
assert.ok(sources.length > 100, 'A partial source tree cannot pass the style budget');
const measured = count(sources.map(file => fs.readFileSync(file,'utf8')).join('\n'));
if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(baselineFile,JSON.stringify({ explanation:'Maximum existing literal declarations; lower these counts as tokens replace legacy styles.', ...measured },null,2)+'\n');
} else {
  const baseline = JSON.parse(fs.readFileSync(baselineFile,'utf8'));
  for (const [key, value] of Object.entries(measured)) assert.ok(value <= baseline[key], `${key}: ${value} exceeds ${baseline[key]}; reuse design tokens`);
}
assert.deepEqual(count('font-size: 13px; borderRadius: "22px"; gap: 12px; font-size: var(--ui-text-body);'), { fontSize:1,radius:1,spacing:1 });
console.log('PASS design token budget', measured);
