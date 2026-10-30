import { afterEach, expect, test, vi } from 'vitest';
import { createPinia } from 'pinia';
import { useDataVisibility } from '@/store/data-visibility';
import { all, click, directPage, dictionaries, eventFixture, flush, policyFixture, snapshotFixture, text } from './direct-referral.test-support';
import { networkReauditCopy } from '@/i18n/network-reaudit';
import { teamRuleGuideCopy } from '@/components/team/team-rule-guide-copy';
import source from './unilevel.vue?raw';

afterEach(() => vi.unstubAllGlobals());

test.each(['zh', 'en', 'vi'] as const)('B08 %s global privacy updates expanded records while leaving settlement rules and source values intact', async locale => {
  vi.stubGlobal('uni', { getStorageSync: () => false, setStorageSync: vi.fn() });
  const visibility = useDataVisibility(createPinia());
  const records = [
    { ...eventFixture('recovery'), amountUSDT: -123.45, amountNEX: 678.91, status: 'recovery_pending', recoveryPendingUSDT: 33.67, recoveryPendingNEX: 44.89 },
    { ...eventFixture('currency-status'), amountUSDT: 56.78, amountNEX: 91.23, statusUSDT: 'frozen', statusNEX: 'reversed' },
  ];
  const snapshot = { ...snapshotFixture(records), split: { purchase: { amountUSDT: 345.67, amountNEX: 890.12, count: 23 },
    deviceEarning: { amountUSDT: 0, amountNEX: 0, count: 0 } } };
  const before = structuredClone(snapshot), rules = policyFixture();
  const api = { snapshot: vi.fn().mockResolvedValue(snapshot), policy: vi.fn().mockResolvedValue(rules) };
  const page = await directPage({ locale, visibility, api }); await flush();
  for (const item of all(page.root).filter(item => item.props['aria-controls'])) item.props.onClick();
  await flush(); await click(page.root, networkReauditCopy(locale).settlementDetails + '+');
  const publicOutput = () => [text(page.root), ...all(page.root).flatMap(item => Object.entries(item.props)
    .filter(([key]) => key.startsWith('aria-') || key === 'title').map(([, value]) => String(value)))].join('\n');
  const shown = publicOutput(), readCount = api.snapshot.mock.calls.length;
  const amounts = ['345.67', '890.12', '-123.45', '678.91', '33.67', '44.89', '56.78', '91.23'];
  for (const amount of amounts) expect(shown).toContain(amount);
  expect(shown).toContain(`23 ${dictionaries[locale].directReferral.settlementGroups}`);
  const details = () => all(page.root).find(item => item.props.class === 'nx-unilevel-details')!;
  const ruleText = text(details());
  expect(ruleText).toMatch(/12[.,]3456%/); expect(ruleText).toContain('60%'); expect(ruleText).toContain('40%'); expect(ruleText).toContain('7');

  visibility.toggle(); await flush();
  for (const amount of amounts) expect(publicOutput()).not.toContain(amount);
  expect(text(page.root)).toContain(`•••• ${dictionaries[locale].directReferral.settlementGroups}`);
  expect(text(page.root)).not.toContain(`23 ${dictionaries[locale].directReferral.settlementGroups}`);
  expect(text(page.root)).toContain(`USDT ${dictionaries[locale].commissions.frozenTag} · UVT ${dictionaries[locale].commissions.reversedTag}`);
  expect(text(page.root)).toContain(dictionaries[locale].directReferral.recoveryPending);
  expect(text(details())).toBe(ruleText);
  for (const record of records) expect(text(page.root)).toContain(record.sourceRef);
  expect(all(page.root).filter(item => item.props['aria-controls']).map(item => item.props['aria-expanded'])).toEqual([true, true]);
  visibility.toggle(); await flush();
  expect(publicOutput()).toBe(shown);
  expect(snapshot).toEqual(before); expect(rules).toEqual(policyFixture());
  expect(api.snapshot).toHaveBeenCalledTimes(readCount);
  expect(api.policy).toHaveBeenCalledTimes(1);
});

test('B08 entering with privacy enabled masks zero-valued records and restores them without a read', async () => {
  vi.stubGlobal('uni', { getStorageSync: () => true, setStorageSync: vi.fn() });
  const visibility = useDataVisibility(createPinia());
  const snapshot = snapshotFixture([{ ...eventFixture('zero'), amountUSDT: 0, amountNEX: 0 }]);
  snapshot.split.purchase = { amountUSDT: 0, amountNEX: 0, count: 1 };
  const api = { snapshot: vi.fn().mockResolvedValue(snapshot), policy: vi.fn().mockResolvedValue(policyFixture()) };
  const page = await directPage({ visibility, api }); await flush();
  expect(text(page.root)).not.toContain('0.00');
  expect(text(page.root)).toContain('$••••USDT•••• UVT');
  visibility.toggle(); await flush();
  expect(text(page.root)).toContain('$0.00USDT0.00 UVT');
  expect(text(page.root)).toContain(`1 ${dictionaries.en.directReferral.settlementGroups}`);
  expect(api.snapshot).toHaveBeenCalledTimes(1);
});

test.each(['zh', 'en', 'vi'] as const)('019 source text buttons preserve query and keyboard behavior in %s', async locale => {
  const read = vi.fn().mockResolvedValue(snapshotFixture());
  const page = await directPage({ locale, api: { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: read } }); await flush();
  const buttons = all(page.root).filter(node => String(node.props.class).includes('nx-unilevel-source '));
  expect(buttons).toHaveLength(3);
  expect(buttons.map(node => node.props['aria-pressed'])).toEqual([true, false, false]);
  buttons[2].props.onKeydown.forEach((handler: (event: object) => void) => handler({ key: 'Enter', preventDefault() {} })); await flush();
  expect(read.mock.calls.at(-1)?.[4]).toBe('device_earning');
  expect(buttons[2].props['aria-pressed']).toBe(true);
  await click(page.root, dictionaries[locale].directReferral.networkPurchase);
  await click(page.root, networkReauditCopy(locale).settlementDetails + '+');
  expect(text(page.root)).toContain(teamRuleGuideCopy(locale).networkRule);
});

test('020 long names, signed amounts and separate currency statuses survive record expansion', async () => {
  const entry = { ...eventFixture('full-reference'), sourceUserName: 'A very long member name Nguyễn Thị Minh Anh', amountUSDT: -123456789.125,
    amountNEX: 987654321.5, status: 'unlocked', statusUSDT: 'frozen', statusNEX: 'reversed' };
  const page = await directPage({ api: { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockResolvedValue(snapshotFixture([entry])) } }); await flush();
  expect(text(page.root)).toContain(entry.sourceUserName);
  expect(text(page.root)).toContain('$-123456789.13'); expect(text(page.root)).toContain('987654321.50 UVT');
  expect(text(page.root)).toContain(`USDT ${dictionaries.en.commissions.frozenTag} · UVT ${dictionaries.en.commissions.reversedTag}`);
  expect(text(page.root)).not.toContain(entry.sourceRef);
  const toggle = all(page.root).find(node => node.props['aria-controls'] === 'unilevel-record-0')!;
  toggle.props.onClick(); await flush();
  expect(all(page.root).some(node => node.props.id === toggle.props['aria-controls'])).toBe(true);
  expect(text(page.root)).toContain(entry.sourceRef);
});

test('019 has one explicit glass track and a separate 44px source chip row', () => {
  expect(source.match(/<GlassSegments\b/g)).toHaveLength(1);
  expect(source).toContain('layout="equal" surface="glass" selection="flat"');
  expect(source).toMatch(/\.nx-unilevel-source--selected \{[^}]*background:/);
  expect(source).toMatch(/\.nx-unilevel-source \{ min-height: 44px/);
});
