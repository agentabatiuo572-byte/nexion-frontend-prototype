import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('retired Janus producers cannot enter the application bundle', () => {
  for (const path of ['src/api/janus-api.ts', 'src/api/compute-share-api.ts', 'src/services/janus-c2.ts', 'src/services/janus-runtime.ts', 'src/components/earn/compute-share-entry.vue']) {
    assert.equal(existsSync(new URL('../' + path, import.meta.url)), false, path);
  }
  assert.doesNotMatch(read('src/api/runtime.ts'), /janusApi|computeShareApi/);
  assert.doesNotMatch(read('src/store/app.ts'), /connectComputeShareDevice/);
  assert.match(read('src/store/app.ts'), /computeShareEnabled = computed\(\(\) => false\)/);
});
test('legacy pairing bookmark returns to normal devices without calling a pairing API', () => {
  const page = read('src/pages/compute-share/download.vue');
  assert.match(page, /navReplace\("\/pages\/me\/devices"\)/);
  assert.doesNotMatch(page, /Api|fetch\(|setInterval|enrollment|connectDemo/);
  for (const path of ['src/pages/earn/earn.vue','src/pages/me/devices.vue']) assert.doesNotMatch(read(path), /ComputeShareEntry/);
});
