import test from 'node:test';
import assert from 'node:assert/strict';
import { demoFixture, demoDefaults } from './lib/prototype-demo-data.mjs';
import { createPointsApi } from '../src/api/points-api.ts';
import { parseTrialAuthorityState } from '../src/api/trial-api.ts';
import { parseWalletBillsSnapshot, parseWalletBillsSummary } from '../src/api/wallet-bills-api.ts';
import { createVRankApi } from '../src/api/v-rank-api.ts';
import { createExchangeApi } from '../src/api/exchange-api.ts';
import { parseNexMarketSnapshot } from '../src/api/market-api.ts';
import { createGenesisApi } from '../src/api/genesis-api.ts';
import { parseGenesisRaffleState } from '../src/api/genesis-raffle-api.ts';
import { createPromotionApi } from '../src/api/promotion-api.ts';
import { createDeviceE3Api } from '../src/api/device-e3-api.ts';

for (const locale of ['zh', 'en', 'vi']) {
  test(`preview fixtures satisfy current production contracts (${locale})`, async () => {
    const state = structuredClone(demoDefaults);
    const raw = path => demoFixture(new URL(path, 'http://127.0.0.1:59999'), locale, state,
      { method: () => 'GET', headers: () => ({}), postDataJSON: () => ({}) });
    const client = { request: async ({ path }) => raw(path) };
    await createPointsApi(client).state();
    assert.equal(parseTrialAuthorityState(raw('/api/trial/state')).paymentRail, 'UVEL_USDT_WALLET');
    parseWalletBillsSnapshot(raw('/api/app/wallet/bills'));
    parseWalletBillsSummary(raw('/api/app/wallet/bills/summary'));
    await createVRankApi(client).ladder();
    await createExchangeApi(client).fetchCaps();
    await createExchangeApi(client).fetchState();
    parseNexMarketSnapshot(raw('/api/config/market/nex'));
    await createGenesisApi(client).eligibility();
    parseGenesisRaffleState(raw('/api/events/genesis-raffle'));
    await createPromotionApi(client).list();
    await createDeviceE3Api(client).fleet();

    assert.ok(raw('/api/events').events.every(event => event.rewardType === 'UVT'));
    const assets = raw('/api/earnings/release-status').assets;
    assert.ok(assets.UVT);
    assert.equal(assets.NEX, undefined);
    const bills = raw('/api/app/wallet/bills?asset=UVT').bills;
    assert.equal(bills.length, 3);
    assert.ok(bills.every(bill => bill.asset === 'UVT'));
    for (const rank of raw('/api/config/v-ranks').ranks) {
      assert.equal(rank.cultivationBonus, rank.rewards.filter(reward => reward.type === 'UVT').reduce((sum, reward) => sum + reward.amount, 0));
    }
  });
}
