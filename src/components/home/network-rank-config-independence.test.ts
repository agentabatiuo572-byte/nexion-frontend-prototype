// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';

const source = readFileSync(new URL('./network-pulse-card.vue', import.meta.url), 'utf8');
const start = source.indexOf('function unverifiedCell(');
const end = source.indexOf('</script>', start);
if (start < 0 || end < 0) throw new Error('Actual metrics implementation not found');
const implementation = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const compile = new Function('computed', 'cfg', 'health', 'registered', 'app', 'rank',
  't', 'compact', 'fmt', 'ramp', 'toast', 'navTo', 'rankSnapshotStale', 'displayDelta',
  'showSkeleton', 'remoteApiEnabled', 'remoteRank', `${implementation}; return metrics;`);

function scenario({ remote = true, failed = false, rankOk = false, kind = 'ranked', status = 'ready' } = {}) {
  const configRefresh = vi.fn();
  const rankRefresh = vi.fn();
  const messages = new Proxy({}, { get: (_, key) => String(key) });
  const metrics = compile((run: () => unknown) => run(),
    { syncFailed: failed, config: { publicStats: { registeredUsersMonthlyGrowthPct: 1 } }, load: configRefresh },
    { value: { membersOk: true, devicesOk: true, rankOk } }, { value: 100 },
    { global: { activeDevices: 20 } }, { value: { kind, rank: 7 } },
    { value: { home: messages } }, String, (text: string) => text, () => [],
    { info: vi.fn() }, vi.fn(), { value: false }, { value: null },
    { value: true }, remote, { status, refresh: rankRefresh });
  return { metrics, configRefresh, rankRefresh };
}

describe('actual homepage remote ranking is independent of H9 estimates', () => {
  it('keeps a successful real rank when legacy virtual population is invalid', () => {
    expect(scenario().metrics[2].v).toBe('#7');
  });
  it('keeps a successful real rank when public configuration fails', () => {
    const { metrics } = scenario({ failed: true, rankOk: true });
    expect(metrics[2].v).toBe('#7');
    // #59:配置读失败且没有服务端可核验聚合时,两格不拿配置派生量充事实 ——
    // 如实说「无实测口径」,而不是伪装成「更新中」再回落到配置值。
    expect(metrics[0].v).toBe('networkStatUnverified');
    expect(metrics[1].v).toBe('networkStatUnverified');
  });
  it('keeps an authoritative unranked state when public configuration fails', () => {
    expect(scenario({ failed: true, kind: 'unranked' }).metrics[2].v).toBe('networkRankUnranked');
  });
  it('retries the rank endpoint rather than H9 when the rank is unavailable', () => {
    const result = scenario({ kind: 'unavailable', status: 'error' });
    result.metrics[2].tap();
    expect(result.rankRefresh).toHaveBeenCalledOnce();
    expect(result.configRefresh).not.toHaveBeenCalled();
    expect(result.metrics[2].skeleton).toBe(false);
  });
  it('uses rank loading state for its own placeholder', () => {
    expect(scenario({ kind: 'unavailable', status: 'loading' }).metrics[2].skeleton).toBe(true);
  });
  it('preserves the configuration guard and retry for local estimates', () => {
    const result = scenario({ remote: false });
    expect(result.metrics[2].v).toBe('networkStatUpdating');
    result.metrics[2].tap();
    expect(result.configRefresh).toHaveBeenCalledOnce();
    expect(result.rankRefresh).not.toHaveBeenCalled();
  });
});
