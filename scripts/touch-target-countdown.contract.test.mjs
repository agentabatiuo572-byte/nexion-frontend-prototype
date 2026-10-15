import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('src/pages/me/wallet-address-rebind.vue');

test('interactive containers own their 44px targets, independently of the icon', () => {
  assert.match(read('src/pages/register/register.vue'), /\.rg-eye \{[^}]*width: 44px; height: 44px; flex-shrink: 0/);
  assert.match(read('src/components/me/bank-account-binding.vue'), /\.field \{[^}]*height: 44px; min-height: 44px/);
  for (const [file, action] of [
    ['src/pages/store/bundle.vue', '@click.stop="remove(p.id)"'],
    ['src/pages/me/trial.vue', '@click="rulesOpen = false"'],
  ]) {
    const target = read(file).split('\n').find(line => line.includes(action) && line.includes('role="button"') && line.includes(':aria-label='));
    assert.match(target, /width: 44px; height: 44px/);
  }
  const fee = read('src/pages/me/wallet-withdraw.vue').split('\n').find(line => line.includes('@click="feeWhyOpen = true"'));
  assert.match(fee, /min-width: 44px; min-height: 44px; flex-shrink: 0/);
  assert.doesNotMatch(fee, /margin:/);
  for (const [file, action] of [
    ['src/components/earn/device-card-pc.vue', '@click="closeMenu"'],
    ['src/components/how/how-published-content.vue', '@click="load"'],
  ]) assert(read(file).split('\n').some(line => line.includes(action) && line.includes('min-height: 44px')));
});

test('resend uses a fixed number slot and preserves all translated word orders', () => {
  assert.match(source, /otpResendIn\.split\("\{s\}"\)/);
  assert.match(source, /width: `\$\{resendDigits\}ch`/);
  assert.match(source, /resendDigits\.value = Math\.max\(2, String\(Math\.ceil\(sec\)\)\.length\)/);
  assert.match(source, /\.nx-rebind-resend-seconds \{[^}]*flex-shrink: 0[^}]*font-family: monospace[^}]*font-variant-numeric: tabular-nums/);
  assert.match(source, /white-space: pre/);
  for (const lang of ['zh', 'en', 'vi']) {
    const messages = read(`src/i18n/messages/${lang}.ts`);
    const section = messages.slice(messages.indexOf('addrRebind:'));
    const label = section.match(/otpResendIn: "([^"]+)"/)[1];
    const parts = label.split('{s}');
    assert.equal(parts.length, 2);
    for (const seconds of [100, 99, 60, 10, 9, 1]) {
      assert.equal(parts[0] + seconds + parts[1], label.replace('{s}', String(seconds)));
    }
  }
  // The gate and timer still own resend availability, not presentation width.
  assert.match(source, /resendLeft\.value -= 1/);
  assert.match(source, /if \(resendLeft\.value > 0 \|\| otpSending\.value\) return/);
});
