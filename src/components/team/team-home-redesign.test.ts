import { describe, expect, it } from "vitest";
import { parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import * as ts from "typescript";
import summarySource from "./team-summary-card.vue?raw";
import inviteSource from "./invite-earn-card.vue?raw";
import teamSource from "@/pages/team/team.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";

function renderer(source: string) {
  const { code } = compile(parse(source).descriptor.template!.content, { mode: "function", prefixIdentifiers: true, isCustomElement: () => true });
  return new Function("Vue", code)(Vue);
}
const summaryRender = renderer(summarySource);
const inviteRender = renderer(inviteSource);
function findNode(node: Vue.VNode, className: string): Vue.VNode | undefined {
  if (String(node.props?.class ?? "").split(" ").includes(className)) return node;
  for (const child of Array.isArray(node.children) ? node.children : []) {
    if (Vue.isVNode(child)) {
      const found = findNode(child, className);
      if (found) return found;
    }
  }
}

describe.each([en, zh, vi])("team home state contract in each language", words => {
  it("keeps ready zero, positive, loading and error distinct with real counts", async () => {
    for (const status of ["idle", "loading", "ready", "error"]) {
      for (const total of [0, 37]) {
        const context = { t: words, status, total, direct: 4 };
        const html = await renderToString(Vue.createSSRApp({ render: summaryRender, setup: () => context }));
        expect(html).toContain(words.team.summaryTitle);
        expect(html).toContain(words.team.inviteTagline);
        expect(html.includes(words.team.summaryEmpty)).toBe(status === "ready" && total === 0);
        expect(html.includes(words.team.summaryInvite)).toBe(status === "ready" && total === 0);
        expect(html.includes(">" + words.team.summaryMembers + "</text>")).toBe(status === "ready" && total > 0);
        if (status === "ready" && total > 0) {
          expect(html).toContain(">37</text>");
          expect(html).toContain(">4</text>");
        }
        if (status === "error") expect(html).toContain(words.team.summaryUnavailable);
        if (status === "loading" || status === "idle") expect(html).toContain(words.team.summaryLoading);
      }
    }
  });

  it("connects empty invite, populated roster and failure retry to separate actions", () => {
    for (const [status, total, className, action] of [
      ["ready", 0, "team-summary__cta", "invite"],
      ["ready", 37, "team-summary__cta", "open"],
      ["error", 0, "team-summary__retry", "retry"],
    ] as const) {
      const emitted: string[] = [];
      const vnode = summaryRender({ t: words, status, total, direct: 4, $emit: (event: string) => emitted.push(event) }, []);
      const button = findNode(vnode, className);
      expect(button).toBeTruthy();
      expect(button!.props!.tabindex).toBe("0");
      button!.props!.onClick();
      expect(emitted).toEqual([action]);
    }
  });

  it("does not turn unavailable rewards into a zero reward or success signal", async () => {
    for (const loading of [false, true]) {
      const html = await renderToString(Vue.createSSRApp({ render: inviteRender, setup: () => ({
        t: words, rewards: { snapshot: null, loading, error: loading ? null : "unavailable", refresh() {} },
        isAuthoritativeSandbox: false, sandboxRunId: "", nexReward: 0, lifetimeEarned: 0,
        settlementStatus: words.team.settlementUnavailable, referralCode: "example", copiedCode: false, copiedLink: false,
        tickerItem: null, tickerIdx: 0, remoteApiEnabled: true, posterOpen: false, shareOpen: false,
        openRules() {}, openPoster() {}, copyCode() {}, copyLink() {}, openShare() {},
      }) }));
      expect(html).toContain(words.team.shareInvite);
      expect(html).toContain(loading ? words.team.rewardLoading : words.team.settlementUnavailable);
      expect(html).not.toContain("0 NEX");
      expect(html).not.toContain(words.team.noSettledRewards);
      expect(html).not.toContain("pulse-dot");
      expect((html.match(/invite-card__action"/g) ?? []).length).toBe(3);
    }
  });
});

it("keeps share code guards and opens the existing sheet without sending", () => {
  const script = parse(inviteSource).descriptor.scriptSetup!.content;
  const ast = ts.createSourceFile("invite.ts", script, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "openShare")!;
  const compiled = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const link of ["", "https://example.test/ref/example"]) {
    const state = { value: false };
    new Function("guardShareLink", "shareOpen", compiled + ";openShare();")(() => link, state);
    expect(state.value).toBe(Boolean(link));
  }
  expect(inviteSource).toContain("defineExpose({ openShare })");
  expect(inviteSource).not.toContain("PulseDot");
});

it("mounts the team summary unconditionally and preserves four tool destinations", () => {
  const element = teamSource.match(/<TeamSummaryCard[\s\S]*?\/>/)?.[0] ?? "";
  expect(element).not.toContain("v-if");
  expect(element).toContain(':total="network.totalMembers"');
  expect(element).toContain(':direct="byLayerBuckets[1].length"');
  expect(element).toContain('@invite="inviteCard?.openShare()"');
  expect(element).toContain('@retry="network.refreshCanonicalNetwork()"');
  const tools = teamSource.slice(teamSource.indexOf("<!-- Team tools -->"), teamSource.indexOf("</AppChassis>"));
  expect((tools.match(/nx-glass-card team-tool/g) ?? []).length).toBe(4);
  for (const path of ["quota", "agent", "network", "tree"]) expect(tools).toContain("go('/pages/team/" + path + "')");
});
