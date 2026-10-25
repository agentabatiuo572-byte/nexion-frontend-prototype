import ts from 'typescript';
import * as vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import snapshotSource from './network-snapshot.vue?raw';
import pulseSource from './network-pulse-card.vue?raw';
import * as stats from '@/lib/platform-stats';
import { zh } from '@/i18n/messages/zh';

const scopes: vue.EffectScope[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.useRealTimers(); });
function mount() {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:09Z'));
  const cfg = vue.reactive({ loading: false, syncFailed: false, load: vi.fn(), config: {
    publicStats: { registeredUsersBase: 100, registeredUsersAnchorAt: Date.now() - 9000, registeredUsersTickIntervalSec: 10, registeredUsersTickStep: 1 },
    networkPulse: { registeredUsers: 99999, onlineDevices: 200 },
  } });
  const rank = vue.reactive({ status: 'ready', snapshot: { state: 'ranked', currentRank: 12 } as { state: string; currentRank: number | null } | null, bindAccount: vi.fn(), refresh: vi.fn() });
  const props = vue.reactive({ compactView: true, estimated: true, registeredDisplay: 100 as number | null });
  const hooks = { show: [] as Array<() => void>, hide: [] as Array<() => void>, unmount: [] as Array<() => void> };
  const modules: Record<string, unknown> = {
    vue: { ...vue, onMounted: vi.fn(), onUnmounted: (fn: () => void) => hooks.unmount.push(fn) },
    '@/composables/use-tab-page-lifecycle': { onShow: (fn: () => void) => hooks.show.push(fn), onHide: (fn: () => void) => hooks.hide.push(fn) },
    '@/store/config': { useConfig: () => cfg }, '@/lib/platform-stats': stats,
    '@/store/app': { useApp: () => vue.reactive({ accountKey: 'a' }) }, '@/store/network-rank': { useNetworkRank: () => rank },
    '@/api/runtime': { remoteApiEnabled: true }, '@/i18n/use-t': { useT: () => vue.ref(zh) },
    '@/i18n/audit-ui': { useAuditUiCopy: () => vue.ref({}) }, '@/store/ui': { confirm: vi.fn() }, '@/lib/route': { navTo: vi.fn() },
  };
  function run(source: string, exposed: string) {
    const script = source.split('<script setup lang="ts">')[1].split('</script>')[0];
    const js = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const scope = vue.effectScope(); scopes.push(scope);
    return scope.run(() => new Function('require', 'exports', 'defineProps', js + `;return ${exposed};`)(
      (name: string) => name.endsWith('.vue') ? {} : modules[name], {}, () => props,
    ));
  }
  return { cfg, rank, props, hooks, snapshot: run(snapshotSource, '{ available, memberCount }'), pulse: run(pulseSource, '{ compactAvailable, metrics }') };
}

describe('optional compact network summary', () => {
  it('uses the validated tick estimate and stops/restarts timers with visibility', async () => {
    const h = mount();
    expect(h.snapshot.available.value).toBe(true); expect(h.snapshot.memberCount.value).toBe(100);
    await vi.advanceTimersByTimeAsync(1000); expect(h.snapshot.memberCount.value).toBe(101);
    h.hooks.hide.forEach(fn => fn()); expect(vi.getTimerCount()).toBe(0);
    h.hooks.show.forEach(fn => fn()); expect(vi.getTimerCount()).toBe(1);
    h.hooks.unmount.forEach(fn => fn()); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([0, -1, 0.5, 86401, NaN, undefined])('hides an invalid tick interval (%s) without substituting a published count', async interval => {
    const h = mount(); Object.assign(h.cfg.config.publicStats, { registeredUsersTickIntervalSec: interval });
    await vue.nextTick();
    expect(h.snapshot.available.value).toBe(false); expect(h.snapshot.memberCount.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    h.cfg.config.publicStats.registeredUsersTickIntervalSec = 10; await vue.nextTick();
    expect(h.snapshot.available.value).toBe(true); expect(vi.getTimerCount()).toBe(1);
  });
  it('hides loading, errors and partial data, then restores only a healthy summary', async () => {
    const h = mount();
    for (const field of ['loading', 'syncFailed'] as const) {
      h.cfg[field] = true; await vue.nextTick();
      expect(h.snapshot.available.value).toBe(false); expect(h.pulse.compactAvailable.value).toBe(false);
      expect(vi.getTimerCount()).toBe(0); h.cfg[field] = false; await vue.nextTick();
    }
    for (const value of [null, undefined, -1, NaN, 1.5]) {
      Object.assign(h.cfg.config.networkPulse, { onlineDevices: value });
      expect(h.snapshot.available.value).toBe(false); expect(h.pulse.compactAvailable.value).toBe(false);
    }
    h.cfg.config.networkPulse.onlineDevices = 0;
    expect(h.snapshot.available.value).toBe(true); expect(h.pulse.compactAvailable.value).toBe(true);
    h.rank.snapshot = null; expect(h.pulse.compactAvailable.value).toBe(false);
    h.rank.snapshot = { state: 'ranked', currentRank: NaN }; expect(h.pulse.compactAvailable.value).toBe(false);
    h.rank.snapshot = { state: 'unranked', currentRank: null }; expect(h.pulse.compactAvailable.value).toBe(true);
    h.rank.snapshot = { state: 'disabled', currentRank: null }; expect(h.pulse.compactAvailable.value).toBe(false);
    h.rank.snapshot = { state: 'unavailable', currentRank: null }; expect(h.pulse.compactAvailable.value).toBe(false);
    h.rank.snapshot = { state: 'ranked', currentRank: 7 }; expect(h.pulse.compactAvailable.value).toBe(true);
    h.props.registeredDisplay = null; expect(h.pulse.compactAvailable.value).toBe(false);
    expect(snapshotSource).toContain('v-if="available"');
    expect(pulseSource).toContain('v-if="compactView && compactAvailable"');
    expect(pulseSource).toContain('v-else-if="!compactView"');
  });
  it('does not show a retry placeholder for a valid estimate when the independent published member count is absent', () => {
    const h = mount(); Object.assign(h.cfg.config.networkPulse, { registeredUsers: null });
    expect(h.pulse.compactAvailable.value).toBe(true);
    expect(h.pulse.metrics.value[0]).toMatchObject({ v: '100', sub: '' });
    expect(h.pulse.metrics.value[0].tap).toBeUndefined();
    h.props.estimated = false;
    expect(h.pulse.compactAvailable.value).toBe(false);
  });
});
