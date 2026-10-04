import { describe, expect, it } from 'vitest';
import source from './orders.vue?raw';
import { remoteCommerceRequestCurrent } from '@/lib/remote-commerce-refresh';

const implementation = source.match(/async function loadMoreOrders\(\) \{[\s\S]*?\n\}/)?.[0];
if (!implementation) throw new Error('Actual order pagination handler missing');
const compile = new Function('orders', 'app', 'remoteCommerceRequestCurrent',
  'commerceOrdersUnavailable', 'remoteOrderAvailability',
  `let ordersPageActive = true; let refreshEpoch = 0; ${implementation};
   return { run: loadMoreOrders, refresh: () => { refreshEpoch++; }, hide: () => { ordersPageActive = false; } };`);

function scenario() {
  let reject!: (reason: Error) => void;
  const response = new Promise<void>((_, no) => { reject = no; });
  const app = { accountKey: 'account-a', accountBindingEpoch: 1 };
  const unavailable = { value: false };
  const availability = { value: 'ready' };
  const page = compile({ loadingMore: false, nextCursor: 'page-two', loadMoreRemote: () => response },
    app, remoteCommerceRequestCurrent, unavailable, availability);
  return { app, unavailable, availability, page, reject };
}

describe('actual orders pagination error scope', () => {
  for (const change of ['account', 'binding', 'refresh', 'hidden'] as const) {
    it(`ignores an old rejection after ${change} changes`, async () => {
      const result = scenario();
      const pending = result.page.run();
      if (change === 'account') result.app.accountKey = 'account-b';
      if (change === 'binding') result.app.accountBindingEpoch++;
      if (change === 'refresh') result.page.refresh();
      if (change === 'hidden') result.page.hide();
      result.reject(new Error('old page failed'));
      await pending;
      expect(result.unavailable.value).toBe(false);
      expect(result.availability.value).toBe('ready');
    });
  }
  it('preserves a current failure as a retryable partial source', async () => {
    const result = scenario();
    const pending = result.page.run();
    result.reject(new Error('current page failed'));
    await pending;
    expect(result.unavailable.value).toBe(true);
    expect(result.availability.value).toBe('partial');
  });
});
