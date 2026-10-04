// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile as compileTemplate } from '@vue/compiler-dom';
import { parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';

const source = readFileSync(new URL('./agent.vue', import.meta.url), 'utf8');
const implementation = source.match(/function refreshAgentPage\(\): void \{[\s\S]*?\n\}/)?.[0]?.replace('(): void', '()');
if (!implementation) throw new Error('Missing ambassador page read function');
const compile = new Function('remoteApiEnabled', 'captureAgentRequest', 'requestIsCurrent', 'refreshLatest', 'refreshHistory', 'ambassadorApplicationApi', 'vrank', 'policy', 'budgetText', 'pageReadState', `${implementation}; return refreshAgentPage;`);
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function scenario(failing?: 'latest' | 'history' | 'policy' | 'rank', stale = false) {
  const state = { value: 'loading' };
  const policy = { value: null as unknown };
  const read = (name: string) => failing === name ? Promise.reject(new Error(name)) : Promise.resolve();
  const run = compile(true, () => ({}), () => !stale,
    () => read('latest'), () => read('history'),
    { policy: () => read('policy').then(() => ({ defaultBudgetUsdt: 3000 })) },
    { remoteReady: failing !== 'rank', refreshCanonicalVRank: () => Promise.resolve() },
    policy, { value: '' }, state);
  run();
  return state;
}
describe('ambassador required read results', () => {
  for (const pageReadState of ['loading', 'error']) {
    it(`${pageReadState} hides the application form and eligibility conclusions`, async () => {
      const template = parse(source).descriptor.template!.content;
      const render = new Function('Vue', compileTemplate(template, { mode: 'function', prefixIdentifiers: true }).code)(Vue);
      const wrapper = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h('section', slots.default?.()) });
      const app = Vue.createSSRApp({ render, setup: () => ({
        remoteApiEnabled: true, pageReadState, retryAgentPage() {},
        t: { headerTitles: { teamAgent: 'Ambassador' }, agent: { loading: 'Loading records', loadError: 'Read failed', retry: 'Retry' } },
      }) });
      for (const component of ['AppChassis', 'SubPageHeader', 'VBadge']) app.component(component, wrapper);
      const html = await renderToString(app);
      expect(html).toContain(pageReadState === 'loading' ? 'Loading records' : 'Read failed');
      expect(html).not.toContain('<input');
      expect(html.includes('Retry')).toBe(pageReadState === 'error');
    });
  }
  // 本页的必需读取是三条大使读取(policy / latest / history)。它们任一失败都必须给出可重试的失败态。
  for (const failing of ['latest', 'history', 'policy'] as const) {
    it(`exposes a retryable failure when ${failing} is unavailable`, async () => {
      const state = scenario(failing);
      await tick();
      expect(state.value).toBe('error');
    });
  }
  // 🔴 zentao #204:等级阶梯**不是**本页的必需读取。它挂在另一个端点、另一份契约上,失败时
  // 只该降级「资格横幅」(unlocked 要求 rankReady,未知即渲染未知态),不能连预算规则、活动类型
  // 和申请记录一起吃掉 —— 那会让用户看到「无法读取大使信息」,而大使数据其实全都读到了,
  // 且重试永远复现(重试跑的是同一组读)。此前的实现把 remoteReady 与进了整页就绪判据,
  // 本用例曾把这个缺陷钉成契约;现在钉住正确的边界。
  it('keeps ambassador data readable when only the rank ladder is unavailable', async () => {
    const state = scenario('rank');
    await tick();
    expect(state.value).toBe('ready');
  });
  it('reveals business data only after all required reads succeed', async () => {
    const state = scenario();
    expect(state.value).toBe('loading');
    await tick();
    expect(state.value).toBe('ready');
  });
  it('ignores completion after its account or page scope became stale', async () => {
    const state = scenario(undefined, true);
    await tick();
    expect(state.value).toBe('loading');
  });
});
