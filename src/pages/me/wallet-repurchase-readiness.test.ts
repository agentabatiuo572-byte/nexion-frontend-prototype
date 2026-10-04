import { computed, reactive, ref, proxyRefs } from 'vue';
import ts from 'typescript';
import { expect, it } from 'vitest';
import source from './wallet-repurchase.vue?raw';

function page(loading: boolean, serverTime: number, error = '') {
  const repurchase = reactive({
    config: { enabled: true, minAmountUsdt: 10, apyPct: 35, lockDays: 90 },
    loading, serverTime, error, submitting: false, walletBalanceUsdt: 1000,
  });
  const declarations = source.slice(source.indexOf('const remoteReady ='), source.indexOf('const ctaLabel ='));
  const compiled = ts.transpileModule(declarations, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const state = new Function('computed', 'isRemote', 'repurchase', 'recovering', 'amount', 'confirming', 'user',
    `${compiled}; return { remoteReady, canSubmit };`)(computed, ref(true), repurchase, ref(false), ref(100), ref(false), ref({usdtBalance:1000}));
  return { state: proxyRefs(state), repurchase };
}

it('waits for both the first wallet snapshot and a refresh before permitting a repurchase', () => {
  expect(page(true, 0).state.remoteReady).toBe(false);
  expect(page(true, 1000).state.canSubmit).toBe(false);
  expect(page(false, 0).state.remoteReady).toBe(false);
  const ready = page(false, 1000);
  expect(ready.state.remoteReady).toBe(true);
  expect(ready.state.canSubmit).toBe(true);
  ready.repurchase.loading = true;
  expect(ready.state.remoteReady).toBe(false);
  expect(ready.state.canSubmit).toBe(false);
});

it('keeps failed reads closed after loading stops', () => {
  expect(page(false, 1000, 'READ_FAILED').state.remoteReady).toBe(false);
  expect(page(false, 1000, 'READ_FAILED').state.canSubmit).toBe(false);
});
