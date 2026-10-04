import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = '5.3.0';
const hashes = {
  'webgl.esm.js': 'd65ba487742de12dc3f55fcf1ef16d19a2ce9c5003bd18d8a8c21473bfdef52a',
  'webgl.cjs': '2a8e6164de8d8dc7684b76de90bb7da7af05e565d637225a56068231c9913ab8',
};
const original = 'async function F(e,t,n){return n||!t.filter||t.filter(e)?';
const marker = '/* UVEL: yield DOM clone work every 5ms; simple-liquid-glass@5.3.0. */';
// html-to-image recursively chains promises. Those microtasks otherwise clone
// every computed style before WebKit can paint or handle another pointer event.
// One clock per bundle covers all recursive and concurrent clones; each clone
// still awaits its original children and produces the same ordered result.
const replacement = `${marker}let nxCloneYieldAt=0;async function F(e,t,n){if(performance.now()-nxCloneYieldAt>5){await new Promise(resolve=>setTimeout(resolve,0));nxCloneYieldAt=performance.now();}return n||!t.filter||t.filter(e)?`;
// A source with a live ticker can become dirty faster than it can be cloned.
// Finish the current refresh promise after one snapshot so its callers can
// restore a successful frame. Later changes form another coalesced batch.
const transforms = [
  [original, replacement],
  [
    'for(await this.capture.prefetchFontEmbedCSS();this.queued&&!this.disposed;){this.queued=!1;',
    '/* UVEL: settle one snapshot per refresh. */await this.capture.prefetchFontEmbedCSS();if(this.queued&&!this.disposed){this.queued=!1;',
  ],
  [
    '}).finally(()=>{this.pending=void 0})),this.pending))',
    '}).finally(()=>{this.pending=void 0,this.queued&&!this.disposed&&this.schedule()})),this.pending))',
  ],
];
const digest = code => createHash('sha256').update(code).digest('hex');

export function patchLiquidGlassBundle(code, entry) {
  if (!hashes[entry]) throw new Error(`Unsupported liquid-glass entry: ${entry}`);
  // Accept pristine bytes, the previous clone-only patch, or this complete
  // patch. Reversing every recognized change must recover the exact release.
  const unpatched = transforms.reduce((source, [before, after]) => source.replace(after, before), code);
  if (digest(unpatched) !== hashes[entry] || transforms.some(([before]) => unpatched.split(before).length !== 2)) {
    throw new Error(`Unexpected simple-liquid-glass@${version} ${entry}; cooperative capture patch not applied`);
  }
  return transforms.reduce((source, [before, after]) => source.replace(before, after), unpatched);
}

export function patchLiquidGlass(packageRoot = new URL('../node_modules/simple-liquid-glass/', import.meta.url)) {
  const installed = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8'));
  if (installed.version !== version) throw new Error('Review liquid-glass cooperative capture before upgrading simple-liquid-glass');
  // Validate both formats before writing either one, including on repeat installs.
  const entries = Object.keys(hashes).map(entry => {
    const path = new URL(`dist/${entry}`, packageRoot);
    const before = readFileSync(path, 'utf8');
    return { path, before, after: patchLiquidGlassBundle(before, entry) };
  });
  for (const { path, before, after } of entries) {
    if (before !== after) writeFileSync(path, after);
    if (readFileSync(path, 'utf8') !== after) throw new Error(`Liquid-glass capture patch readback failed: ${path}`);
  }
  console.log(`simple-liquid-glass@${version}: cooperative clone and bounded refresh verified (ESM + CJS)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) patchLiquidGlass();
