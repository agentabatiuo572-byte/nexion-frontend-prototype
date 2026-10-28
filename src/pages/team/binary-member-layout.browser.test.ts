import { teamPrivacyFixture } from './team-privacy.test-support';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { baseParse, compile } from '@vue/compiler-dom';
import { parse, compileScript } from '@vue/compiler-sfc';
import ts from 'typescript';
import source from './binary.vue?raw';
import badgeSource from '@/components/team/v-badge.vue?raw';
import emblemSource from '@/components/team/team-rank-emblem.vue?raw';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi as vietnamese } from '@/i18n/messages/vi';
import { fmt } from '@/i18n/format';
import { formatComputePoints } from '@/i18n/compute-points';
import { rankTitle } from '@/lib/v-rank-copy';

// Render the real comparison subtree, badge/emblem templates and scoped styles
// in Chromium. This test does not build or serve the shared H5 dist.
const descriptor = parse(source).descriptor;
function findWings(node: any): string | undefined {
  if (node.props?.some((p: any) => p.name === 'class' && p.value?.content === 'reward-wings')) return node.loc.source;
  for (const child of node.children ?? []) { const found = findWings(child); if (found) return found; }
}
const fragment = findWings(baseParse(descriptor.template!.content));
if (!fragment) throw new Error('Missing production comparison subtree');
const render = new Function('Vue', compile(fragment, { mode: 'function', prefixIdentifiers: true,
  isCustomElement: tag => ['view', 'text'].includes(tag),
}).code)(Vue);
const stylesCode = ts.transpileModule(source.slice(source.indexOf('const blockedStyle:'), source.indexOf('</script>')),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const styles = new Function(`${stylesCode}; return { wingStyle, topMemberStyle };`)();
function component(sfc: string, dependencies: Record<string, unknown> = {}) {
  const script = compileScript(parse(sfc).descriptor, { id: 'layout', inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } },
  });
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Vue.Component };
  new Function('require', 'exports', code)((id: string) => {
    if (id === 'vue') return Vue;
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected badge dependency ${id}`);
  }, exports);
  return exports;
}
const emblem = component(emblemSource);
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });
for (const width of [320, 360, 390]) {
  for (const language of ['zh', 'en', 'vi'] as const) {
    it(`T3 ${language} ${width}px keeps member rank and full compute points separate`, async () => {
      const t = { en, zh, vi: vietnamese }[language];
      const badge = component(badgeSource, {
        './team-rank-emblem.vue': emblem,
        '@/store/v-rank': { useVRank: () => ({ remoteReady: true, ladder: [] }) },
        '@/store/locale': { useLocaleStore: () => ({ code: language }) },
        '@/lib/v-rank-copy': { rankTitle },
      });
      const app = Vue.createSSRApp({ render, setup: () => ({
        ...styles, visibility: teamPrivacyFixture().visibility, t, locale: { code: language }, formatComputePoints,
        wingMembersText: (n: number) => fmt(t.binary.monthVolMembers, { n }),
        wings: ['left', 'right'].map((key, i) => ({ key, name: i ? t.binary.rightWing : t.binary.leftWing,
          count: 2, computePoints: i ? 1480 : 1720, isWeak: !!i, color: '#ddd',
          top: { name: 'Alexandra Nguyễn Quốc Anh', vRank: 8, monthComputePoints: i ? 1480 : 1234567.123456 },
        })),
      }) });
      app.component('VBadge', badge.default);
      const html = await renderToString(app);
      const css = [descriptor, parse(badgeSource).descriptor, parse(emblemSource).descriptor].flatMap(d => d.styles.map(s => s.content)).join('\n');
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await page.setContent(`<style>
          * { box-sizing: border-box; } body { margin: 0; padding: 16px; font: 14px Arial,sans-serif; }
          view { display: block; } .panel { padding: 0 18px 16px; border: 1px solid #555; border-radius: 20px; }
          .flex { display: flex; } .items-center { align-items: center; } .justify-between { justify-content: space-between; }
          .block { display: block; } .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .border-t { border-top: 1px solid #555; } ${css}
        </style><div class="panel">${html}</div>`);
        const facts = page.locator('.reward-wing-member__facts');
        for (let i = 0; i < 2; i++) {
          const row = facts.nth(i), rank = row.locator('.nx-vbadge'), points = row.locator('.reward-wing-member__points');
          const rankBox = await rank.boundingBox(), pointBox = await points.boundingBox(), rowBox = await row.boundingBox();
          expect(rankBox).not.toBeNull(); expect(pointBox).not.toBeNull(); expect(rowBox).not.toBeNull();
          expect(pointBox!.y).toBeGreaterThanOrEqual(rankBox!.y + rankBox!.height);
          expect(rankBox!.width).toBeGreaterThanOrEqual(42);
          expect(rankBox!.x + rankBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1);
          expect(await points.textContent()).toBe(formatComputePoints(i ? 1480 : 1234567.123456, language));
          expect(await points.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      } finally { await page.close(); }
    });
  }
}
