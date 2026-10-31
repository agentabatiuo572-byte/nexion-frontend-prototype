import { nextTick, reactive } from 'vue';
import { vi } from 'vitest';
import ts from 'typescript';
import source from './selected-purchase-payment.ts?raw';
import type { PaymentPasswordAuthorization } from '@/api/payment-password-api';
import type { PaymentPasswordContext } from '@/store/payment-password';
import type { PurchaseChoice, PurchasePaymentContext } from '@/store/purchase-payment';

const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

/** Runs the production selector with a controllable user-choice port; PIN remains a separate adapter. */
export function selectedPurchasePaymentFixture(pin: (context: PaymentPasswordContext, wallet: (authorization: PaymentPasswordAuthorization) => Promise<unknown>, current: () => boolean) => Promise<unknown>) {
  const state = reactive({ open: false });
  let resolveChoice: ((choice: PurchaseChoice | null) => void) | null = null;
  let execution: Promise<unknown> = Promise.resolve();
  const request = vi.fn((context: PurchasePaymentContext) => {
    if (state.open) throw new Error('Fixture received overlapping method selection');
    state.open = true;
    return new Promise<PurchaseChoice | null>(resolve => { resolveChoice = resolve; });
  });
  const acknowledge = vi.fn();
  const modules: Record<string, unknown> = {
    './authorized-payment': { executePaymentWithPassword: pin },
    '@/store/purchase-payment': { requestPurchasePayment: request, acknowledgePurchasePayment: acknowledge },
    '@/api/runtime': { remoteApiEnabled: true },
  };
  const exports: { executeSelectedPurchase?: (...args: any[]) => Promise<unknown> } = {};
  new Function('require', 'exports', code)((id: string) => {
    if (!(id in modules)) throw new Error('Unexpected selected-payment dependency ' + id);
    return modules[id];
  }, exports);
  const execute = vi.fn((...args: any[]) => { execution = exports.executeSelectedPurchase!(...args); return execution; });
  async function finished() {
    try { await execution; }
    finally { for (let turn = 0; turn < 8; turn++) { await Promise.resolve(); await nextTick(); } }
  }
  function decide(choice: PurchaseChoice | null) {
    const resolve = resolveChoice;
    if (!resolve) return false;
    resolveChoice = null; state.open = false; resolve?.(choice);
    return true;
  }
  async function choose(choice: PurchaseChoice | null) {
    if (!decide(choice)) return;
    await finished();
  }
  return { execute, request, acknowledge, state, decide, finished, wallet: () => choose({ method: 'WALLET' }),
    external: (receipt: unknown) => choose({ method: 'EXTERNAL', receipt, commandKey: 'fixture-external-key', accountKey: 'fixture-account' }), cancel: () => choose(null) };
}

/** Legacy wallet scenarios explicitly choose wallet through the production selector. */
export function walletSelectedPurchaseFixture(pin: Parameters<typeof selectedPurchasePaymentFixture>[0]) {
  const selection=selectedPurchasePaymentFixture(pin);
  return (...args: Parameters<typeof selection.execute>)=>{const pending=selection.execute(...args);selection.decide({method:'WALLET'});return pending;};
}
