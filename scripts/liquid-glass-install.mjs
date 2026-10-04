import { readFileSync, writeFileSync } from 'node:fs';

// The pinned core starts a worker on import, even with backend:"ts". Its
// relative worker URL breaks in both Vite prebundling and App renderjs esbuild.
// Disable only that unused warmup, before either bundler sees the dependency.
const base=new URL('../node_modules/@lollipopkit/liquid-glass/',import.meta.url);
const {version}=JSON.parse(readFileSync(new URL('package.json',base),'utf8'));
if(version!=='0.2.1') throw new Error('Review liquid-glass compatibility before upgrading core');
const entry=new URL('dist/index.js',base),code=readFileSync(entry,'utf8');
const marker='/* UVEL: automatic worker warmup disabled; explicit backend:ts. */';
const warmup=/typeof window < "u" && A\(\) && F\(\)\.catch\(\(\) => \{\s*\}\);/;
if(!code.includes(marker)) {
  if(code.match(new RegExp(warmup.source,'g'))?.length!==1) throw new Error('Unexpected liquid-glass core source; compatibility patch not applied');
  writeFileSync(entry,code.replace(warmup,marker));
}
if(warmup.test(readFileSync(entry,'utf8'))) throw new Error('Liquid-glass worker warmup remains enabled');
