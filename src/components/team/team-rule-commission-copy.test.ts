import { describe, expect, it } from 'vitest';
import { commissionPublishedBlocks } from './team-rule-commission-copy';
import { COMMISSIONS_HOW_SLOTS, buildCommissionsHowContent, type CommissionsHowSnapshot } from '@/lib/commissions-how-content';

const snapshot = (): CommissionsHowSnapshot => ({
  document: { contentKey: 'team-commissions-how', version: 'published', versionSource: 'ENTRY', status: 'PUBLISHED',
    source: 'server', sourceEnvironment: 'PRODUCTION', runId: '', locale: 'en',
    blocks: COMMISSIONS_HOW_SLOTS.map(id => ({ id, kind: 'text', title: `Published ${id}`,
      body: id === 'network' ? '{directPurchaseRules} / {directDeviceRules} / {directScope} / {directPrice}'
        : id === 'binary' ? 'Original binary conditions: {binaryRules}'
          : id === 'peer' ? 'Original L4 rule: 0.375%. {peerStatus}' : `Original ${id} paragraph.`,
      items: ['USDT and UVT settle separately.', 'The original refund condition.'] })) },
  directPolicy: { configured: true, policyVersion: 2, effectiveAt: '2026-10-01T00:00:00Z', nexUsdtPrice: .01,
    purchase: { enabled: true, totalRatePct: 12.3456, usdtSharePct: 60, coolingDays: 7 },
    deviceEarning: { enabled: true, totalRatePct: 5, usdtSharePct: 70, coolingDays: 0 } },
  guide: { source: 'server', serverCanonical: true, sourceEnvironment: 'PRODUCTION', runId: null, coolingDays: 17,
    network: { depthGateLayer: null, depthGateRank: null, exitCapRate: null }, binary: { threshold: 321, matchRate: .1375, dailyCap: 6789, settlePeriod: 'weekly', residualPolicy: 'carryForward', paused: false },
    leadership: null, capabilities: { peer: false, genesis: false } }, ranks: [],
});

describe('complete commission publication', () => {
  it.each(['zh', 'en', 'vi'])('preserves wording, order, all items and unknown future blocks in %s', locale => {
    const source = snapshot();
    source.document.blocks.push({ id: 'future-published-condition', title: 'An additional condition', body: 'Original future condition.', kind: 'text' });
    const before = JSON.stringify(source);
    const resolved = commissionPublishedBlocks(source, locale)!;
    expect(resolved.map(block => block.id)).toEqual(source.document.blocks.map(block => block.id));
    for (let i = 0; i < resolved.length; i++) {
      expect(resolved[i].title).toBe(source.document.blocks[i].title);
      expect(resolved[i].items).toEqual(source.document.blocks[i].items);
      if (!source.document.blocks[i].body.includes('{')) expect(resolved[i].body).toBe(source.document.blocks[i].body);
    }
    expect(resolved.find(block => block.id === 'binary')!.body).toContain('Original binary conditions:');
    expect(resolved.find(block => block.id === 'peer')!.body).toContain('Original L4 rule: 0.375%.');
    expect(resolved.find(block => block.id === 'network')!.body).toBe(buildCommissionsHowContent(source, locale).section('network').body);
    expect(JSON.stringify(source)).toBe(before);
  });
  it('refuses unresolved slots in titles, bodies and list items instead of inventing a value', () => {
    for (const key of ['title', 'body', 'items'] as const) {
      const source = snapshot();
      if (key === 'items') source.document.blocks[0].items = ['Unresolved {futureRate}'];
      else source.document.blocks[0][key] = 'Unresolved {futureRate}';
      expect(commissionPublishedBlocks(source, 'en')).toBeNull();
    }
  });
  it.each([true, false])('uses the accepted purchase split contract (enabled=%s)', enabled => {
    const source = snapshot();
    Object.assign(source.directPolicy, { schemaVersion: 2, settlementMode: 'SEVEN_V2', purchaseSplit: { enabled, usdtSharePct: 62.5 },
      sevenLayerReference: { revision: 3, baseRatePct: 9.75, coolingDays: 13, legacyNexPerUsd: 2 } });
    source.document.schemaVersion = 2; source.document.templateId = 'commissions-v2';
    source.document.blocks.find(block => block.id === 'network')!.body = '{directPurchaseRules} / {networkPurchaseRules} / {directDeviceRules}';
    const result = commissionPublishedBlocks(source, 'en')!;
    expect(result.find(block => block.id === 'network')!.body).toBe(buildCommissionsHowContent(source, 'en').section('network').body);
  });
});
