import { teamLogicCopy } from '@/i18n/team-logic-copy';
import { teamEventDate } from '@/lib/team-event-date';
import { expect, test, vi } from 'vitest';
import { networkReauditCopy } from '@/i18n/network-reaudit';
import { directPage, dictionaries, flush, text, click, all, policyFixture, snapshotFixture, eventFixture } from './direct-referral.test-support';

test.each(['zh', 'en', 'vi'] as const)('R11 keeps amounts/status visible and expands original references/rules in %s', async locale => {
  const event = { ...eventFixture('ledger-784'), status: 'recovery_pending', recoveryPendingUSDT: 2.125, recoveryPendingNEX: 3.25 };
  const page = await directPage({ locale, api: { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockResolvedValue(snapshotFixture([event])) } });
  await flush();
  const copy = networkReauditCopy(locale), legacy = dictionaries[locale].directReferral;
  expect(text(page.root)).toContain('$60.00'); expect(text(page.root)).toContain('4000.00 UVT');
  expect(text(page.root)).toContain('$2.13 + 3.25 UVT');
  expect(text(page.root)).toContain(legacy.recoveryPending);
  expect(text(page.root)).toContain(teamLogicCopy(locale).eventAt + ': ' + teamEventDate(event.ts, locale));
  expect(text(page.root)).not.toContain('REF-ledger-784');
  expect(text(page.root)).not.toContain(legacy.netHint);
  await click(page.root, copy.recordDetails);
  expect(text(page.root)).toContain('REF-ledger-784');
  expect(text(page.root)).toContain(legacy.settlement + ': ledger-784');
  expect(text(page.root)).toContain(teamLogicCopy(locale).settledAt + ': ' + teamLogicCopy(locale).dateUnavailable);
  await click(page.root, copy.hideDetails);
  expect(text(page.root)).not.toContain('REF-ledger-784');
  const toggle = all(page.root).find(n => n.props.role === 'button' && text(n).startsWith(copy.settlementDetails))!;
  toggle.props.onClick(); await flush();
  expect(text(page.root)).toContain(legacy.netHint);
  expect(text(page.root)).toContain('60%'); expect(text(page.root)).toContain('40%');
  page.app.accountBindingEpoch++; await flush();
  expect(text(page.root)).not.toContain(legacy.netHint);
});

test('R11 policy failure leaves historic rewards readable and retry available on expansion', async () => {
  const page = await directPage({ api: { policy: vi.fn().mockRejectedValue(new Error('offline')), snapshot: vi.fn().mockResolvedValue(snapshotFixture()) } });
  await flush(); expect(text(page.root)).toContain('$60.00');
  all(page.root).find(n => n.props.role === 'button' && text(n).startsWith(networkReauditCopy('en').settlementDetails))!.props.onClick(); await flush();
  expect(text(page.root)).toContain(dictionaries.en.directReferral.policyError);
  expect(all(page.root).some(n => n.props.role === 'button' && text(n) === dictionaries.en.network.retry)).toBe(true);
});


test.each(['zh', 'en', 'vi'] as const)('TI-F10 never substitutes snapshot/clock time for missing event or settlement dates in %s', async locale => {
  const event = { ...eventFixture('unknown-date'), ts: 0, status: 'cooling', unlockAt: 1791417600000 };
  const page = await directPage({ locale, api: { policy: vi.fn().mockResolvedValue(policyFixture()), snapshot: vi.fn().mockResolvedValue(snapshotFixture([event])) } });
  await flush();
  const copy = teamLogicCopy(locale);
  expect(text(page.root)).toContain(copy.eventAt + ': ' + copy.dateUnavailable);
  await click(page.root, networkReauditCopy(locale).recordDetails);
  expect(text(page.root)).toContain(copy.settledAt + ': ' + copy.dateUnavailable);
  expect(text(page.root)).toContain(copy.expectedUnlockAt + ': ' + teamEventDate(event.unlockAt, locale));
  expect(text(page.root)).not.toContain(teamEventDate(Date.parse('2026-10-05T00:00:00Z'), locale));
});
