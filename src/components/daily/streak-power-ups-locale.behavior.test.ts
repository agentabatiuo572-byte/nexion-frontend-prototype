import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import source from './streak-power-ups.vue?raw';
import { zh } from '@/i18n/messages/zh';
import { en } from '@/i18n/messages/en';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { fmt } from '@/i18n/format';
import * as copy from '@/lib/power-up-copy';
import { canonicalPowerUpTarget } from '@/lib/remote-powerup-target';
import { questActionDomain } from '@/lib/quest-business-availability';
import type { CanonicalDailyPowerUp } from '@/api/points-api';

const descriptor = parse(source).descriptor;
const code = ts.transpileModule(compileScript(descriptor, { id: 'streak-locale' }).content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const render = new Function('Vue', compile(descriptor.template!.content, { mode: 'function', prefixIdentifiers: true,
  isCustomElement: tag => ['view', 'text'].includes(tag) }).code)(Vue);
const dictionaries = { zh, en, vi: vietnamese };
const expected = {
  zh: ['团队成长徽章', '连续签到徽章', '质押活动入口', 'Genesis 资格入口'],
  en: ['Team growth badge', 'Check-in streak badge', 'Staking activity entry', 'Genesis eligibility entry'],
  vi: ['Huy hiệu phát triển đội nhóm', 'Huy hiệu điểm danh liên tiếp', 'Lối vào hoạt động staking', 'Lối vào điều kiện tham gia Genesis'],
};
// The four ROUTE_BADGE publications in the owning backend migration; not the
// prototype's commission/APY boosts. Keep their codes, notes and paths intact.
const rows = (): CanonicalDailyPowerUp[] => [
  ['ROYALTY_BOOST', '团队成长徽章', '/team', 7, '连续签到 7 天可查看团队成长权益'],
  ['STREAK_BADGE', '连续签到徽章', '/me/rewards', 14, '连续签到 14 天解锁专属徽章'],
  ['STAKING_APY', '质押活动入口', '/wallet/staking', 30, '连续签到 30 天解锁质押活动入口'],
  ['GENESIS_ALLOWLIST', 'Genesis 资格入口', '/market/genesis', 60, '连续签到 60 天解锁 Genesis 资格入口'],
].map(([powerUpCode, name, targetPath, days, note], index) => ({ powerUpId: index + 1, powerUpCode: String(powerUpCode),
  name: String(name), targetPath: String(targetPath), unlockStreakDays: Number(days), effectType: 'ROUTE_BADGE', effectValue: String(note), status: 'LOCKED', businessAvailable: true }));
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(stop => stop()));
function mount(language: keyof typeof dictionaries = 'vi', remote = true) {
  const locale = Vue.reactive({ code: language }), faucet = Vue.reactive({ remotePowerUps: rows(), signInStreak: 2, refreshRemote: vi.fn(async () => {}) });
  const navTo = vi.fn(), success = vi.fn(), error = vi.fn();
  const powerUp = { hasClaimed: () => false, claim: vi.fn(() => ({ ok: false })), claimRemote: vi.fn(async (id: string) => {
    const row = faucet.remotePowerUps.find(item => item.powerUpCode.toLowerCase() === id)!; row.status = 'ACTIVATED'; return true;
  }) };
  const modules: Record<string, unknown> = {
    vue: Vue, '@/lib/route': { navTo }, '@/i18n/use-t': { useT: () => Vue.computed(() => dictionaries[locale.code]) }, '@/i18n/format': { fmt },
    '@/store/nex-faucet': { useNexFaucet: () => faucet }, '@/store/config': { useConfig: () => ({ isEnabled: () => true }) },
    '@/store/daily-powerup': { useDailyPowerUp: () => powerUp }, '@/store/ui': { toast: { success, error } }, '@/api/runtime': { remoteApiEnabled: remote },
    '@/lib/remote-powerup-target': { canonicalPowerUpTarget }, '@/lib/quest-business-availability': { questActionDomain },
    '@/composables/use-quest-target-availability': { useQuestTargetAvailability: () => Vue.ref({ stakingClosed: false }) },
    '@/composables/use-genesis-sale-gate': { useGenesisSaleGate: () => ({ block: Vue.ref(null), secondaryBlock: Vue.ref(null) }) },
    '@/store/genesis-config': { genesisBlockIsKnownUnavailable: () => false }, '@/store/locale': { useLocaleStore: () => locale }, '@/lib/power-up-copy': copy,
  };
  const exports: Record<string, any> = {};
  new Function('require', 'exports', code)((id: string) => { if (!(id in modules)) throw new Error(id); return modules[id]; }, exports);
  const scope = Vue.effectScope(), view = scope.run(() => exports.default.setup({}, { expose() {} }))!; cleanups.push(() => scope.stop());
  return { view, faucet, locale, powerUp, navTo, success, error,
    html: () => renderToString(Vue.createSSRApp({ render: () => render(Vue.proxyRefs(view), []) })) };
}

it.each(['zh', 'en', 'vi'] as const)('actual remote power-up rows and next footer use the %s badge/entry meanings', async language => {
  const screen = mount(language), before = JSON.stringify(screen.faucet.remotePowerUps);
  expect(screen.view.powerUps.value.map((row: any) => row.labelText)).toEqual(expected[language]);
  const html = await screen.html(); for (const name of expected[language]) expect(html).toContain(name);
  expect(screen.view.footerNextText.value).toContain(expected[language][0]);
  expect(html).not.toMatch(/\+5%|\+2% APY|CHECKIN_MULTIPLIER|ROUTE_BADGE/);
  expect(JSON.stringify(screen.faucet.remotePowerUps)).toBe(before);
  expect(screen.powerUp.claimRemote).not.toHaveBeenCalled(); expect(screen.navTo).not.toHaveBeenCalled();
});

it('switching locale recomputes row and ready footer names without changing canonical facts', async () => {
  const screen = mount('zh'); screen.faucet.remotePowerUps[0].status = 'AVAILABLE'; const before = JSON.stringify(screen.faucet.remotePowerUps);
  for (const language of ['vi', 'en', 'zh'] as const) {
    screen.locale.code = language;
    expect(screen.view.powerUps.value.map((row: any) => row.labelText)).toEqual(expected[language]);
    expect(screen.view.footerReadyText.value).toContain(expected[language][0]); await screen.html();
  }
  expect(JSON.stringify(screen.faucet.remotePowerUps)).toBe(before);
});

it.each(['unknown-code', 'renamed', 'different-effect'] as const)('unrecognized publication %s keeps its own name without invented benefits', async scenario => {
  const screen = mount('vi'), row = screen.faucet.remotePowerUps[0];
  if (scenario === 'unknown-code') row.powerUpCode = 'NEW_CAMPAIGN';
  if (scenario === 'renamed') row.name = 'Admin-published badge';
  if (scenario === 'different-effect') row.effectType = 'CUSTOM_EFFECT';
  expect(screen.view.powerUps.value[0].labelText).toBe(row.name); expect(screen.view.footerNextText.value).toContain(row.name);
  expect(screen.view.powerUps.value[0].descText).toBe(''); expect((await screen.html())).not.toContain('+5%');
});

it.each([false, null] as const)('paused/unknown managed destinations remain unclaimable, available=%s', async businessAvailable => {
  const screen = mount(), row = screen.faucet.remotePowerUps[2]; row.status = 'AVAILABLE'; row.businessAvailable = businessAvailable;
  const entry = screen.view.powerUps.value[2]; expect(entry.labelText).toBe(expected.vi[2]);
  expect(screen.view.isBusinessReady(entry)).toBe(false); await screen.view.handleClaim(entry);
  expect(screen.powerUp.claimRemote).not.toHaveBeenCalled(); expect(screen.navTo).not.toHaveBeenCalled();
  expect(await screen.html()).toContain(businessAvailable === false ? vietnamese.daily.powerUps.suspended : vietnamese.daily.powerUps.pending);
});

it('confirmed activation keeps the original id, canonical path and localized toast without extra writes', async () => {
  const screen = mount('vi'); screen.faucet.remotePowerUps[0].status = 'AVAILABLE';
  const row = screen.view.powerUps.value[0]; await screen.view.handleClaim(row);
  expect(screen.powerUp.claimRemote).toHaveBeenCalledExactlyOnceWith('royalty_boost'); expect(screen.faucet.refreshRemote).toHaveBeenCalledOnce();
  expect(screen.success.mock.calls[0][0]).toBe(fmt(vietnamese.daily.powerUps.toastTitle, { name: expected.vi[0] }));
  expect(screen.navTo).toHaveBeenCalledExactlyOnceWith(canonicalPowerUpTarget('/team'));
  expect(screen.faucet.remotePowerUps[0]).toMatchObject({ powerUpCode: 'ROYALTY_BOOST', effectType: 'ROUTE_BADGE', effectValue: '连续签到 7 天可查看团队成长权益', unlockStreakDays: 7, targetPath: '/team' });
});

it.each(['claim', 'refresh'] as const)('pending %s locale switch resolves the toast name from the current same-id projection', async stage => {
  const screen = mount('vi'); screen.faucet.remotePowerUps[0].status = 'AVAILABLE';
  let finish!: () => void; const held = new Promise<void>(resolve => { finish = resolve; });
  if (stage === 'claim') screen.powerUp.claimRemote.mockImplementation(async () => { await held; screen.faucet.remotePowerUps[0].status = 'ACTIVATED'; return true; });
  else screen.faucet.refreshRemote.mockImplementation(() => held);
  const pending = screen.view.handleClaim(screen.view.powerUps.value[0]); await Vue.nextTick();
  screen.locale.code = 'en'; finish(); await pending;
  expect(screen.success.mock.calls[0][0]).toBe(fmt(en.daily.powerUps.toastTitle, { name: expected.en[0] }));
  expect(screen.success.mock.calls[0][0]).not.toContain(expected.vi[0]);
  expect(screen.powerUp.claimRemote).toHaveBeenCalledExactlyOnceWith('royalty_boost');
  expect(screen.navTo).toHaveBeenCalledExactlyOnceWith(canonicalPowerUpTarget('/team'));
});

it('mock display retains its existing separate boost labels', () => {
  const screen = mount('vi', false); expect(screen.view.powerUps.value[0].labelText).toBeUndefined();
  expect(screen.view.w.value.royalty_boost_label).toBe(vietnamese.daily.powerUps.royalty_boost_label);
});
