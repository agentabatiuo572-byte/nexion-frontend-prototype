import { describe, expect, it } from "vitest";
import { parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import * as ts from "typescript";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import type { Notification } from "@/store/notifications";
import { notificationCopy } from "./notification-copy";
import { EVENTS, localizeEvent } from "@/mock/events";
import { fmt } from "@/i18n/format";

const sources = import.meta.glob([
  "../components/home/earnings-ledger-card.vue", "../components/team/quota-tier-card.vue",
  "../pages/team/network.vue", "../pages/genesis/genesis.vue", "../pages/me/language.vue",
  "../pages/team/quota.vue", "../pages/store/detail.vue", "../pages/store/checkout.vue",
  "../components/message-drawer.vue", "../pages/me/wallet-bills.vue",
  "../components/tradein-sheets.vue", "../components/me/tradein-ladder-sheet.vue",
  "../components/store/live-social-proof.vue",
  "../components/home/do-the-math-card.vue", "../components/home/nova-card-slot.vue",
  "../pages/genesis/holder.vue", "../pages/genesis/marketplace.vue",
  "../pages/login/login.vue", "../pages/register/register.vue", "../pages/me/security.vue",
  "../pages/me/proof.vue", "../pages/events/events.vue",
  "../components/earn/missed-income-banner.vue", "../components/home/trust-chip-wall.vue",
], { query: "?raw", import: "default", eager: true });
const source = (path: string) => String(sources[path] ?? "");
function componentFunction(path: string, name: string): string {
  const { descriptor } = parse(source(path));
  const script = ts.createSourceFile(path, descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
  const fn = script.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!fn) throw new Error(`Missing function: ${name}`);
  return ts.transpileModule(fn.getText(script), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

describe.each([en, zh, vi])("public copy in each supported dictionary", (words) => {
  it("compares displayed daily amounts without promising a rounded earnings multiplier", () => {
    const script = parse(source("../components/home/do-the-math-card.vue")).descriptor.scriptSetup!.content;
    const ast = ts.createSourceFile("comparison.ts", script, ts.ScriptTarget.Latest, true);
    const expression = (name: string) => {
      const declaration = ast.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
        .find(node => node.name.getText(ast) === name)!;
      return ts.transpileModule(`const result = ${declaration.initializer!.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    };
    for (const [baseDaily, targetDaily] of [[45, 75], [0, 6.5], [6.5, 6.5]]) {
      const promo = { value: { baseDaily, targetDaily, multiplier: 2 } };
      const stats = new Function("computed", "fmt", "t", "promo", "baseShort", `${expression("stats")}; return result.value;`)(Vue.computed, fmt, { value: words }, promo, { value: "UVELRack P1" });
      expect(stats.map((stat: { v: string }) => stat.v)).toEqual([`$${targetDaily.toFixed(2)}`, `$${(targetDaily - baseDaily).toFixed(2)}`]);
      const headline = new Function("computed", "t", "targetLabel", "baseShort", `${expression("headlineSegs")}; return result.value;`)(Vue.computed, { value: words }, { value: "UVELRack P2" }, { value: "UVELRack P1" });
      expect(headline.map((segment: { text: string }) => segment.text).join("")).toBe(fmt(words.home.doMathHeadline, { target: "UVELRack P2", base: "UVELRack P1" }));
    }
    expect(words.home.doMathHeadline).not.toContain("{mult}");
    expect(source("../components/home/do-the-math-card.vue")).toContain("t.earn.estimateDisclaimer");
  });

  it("localizes every event without changing event conditions or stored state", () => {
    expect(Object.keys(words.events.catalog).sort()).toEqual(EVENTS.map(event => event.id).sort());
    for (const event of EVENTS) {
      const snapshot = JSON.stringify(event);
      const localized = localizeEvent(event, words.events.catalog);
      const copy = words.events.catalog[event.id as keyof typeof words.events.catalog];
      expect(localized.title).toBe(copy.title);
      expect(localized.ctaLabel).toBe(copy.ctaLabel);
      expect(localized.reward).toBe(copy.reward);
      if (event.progress) {
        expect(localized.progress).toEqual({ ...event.progress, label: copy.progressLabel });
      }
      for (const field of ["id", "kind", "status", "joined", "trackable", "done", "rewardNEX", "href", "useHref"] as const) {
        expect(localized[field]).toBe(event[field]);
      }
      expect(JSON.stringify(event)).toBe(snapshot);
    }
    const unknown = { ...EVENTS[0], id: "remote-only-event" };
    expect(localizeEvent(unknown, words.events.catalog)).toBe(unknown);
    expect(source("../pages/events/events.vue")).toContain("label: t.value.events.progressLabel");
  });

  it("generates localized share text from actual values and discloses simulated data", () => {
    const script = parse(source("../pages/me/proof.vue")).descriptor.scriptSetup!.content;
    const ast = ts.createSourceFile("proof.ts", script, ts.ScriptTarget.Latest, true);
    const declaration = ast.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
      .find(node => node.name.getText(ast) === "shareText")!;
    const expression = ts.transpileModule(`const result = ${declaration.initializer!.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const make = new Function("computed", "fmt", "t", "variant", "longestOrCurrent", "totalMembers", "earningsTotalText", "activeDays", "referralLink", "remoteApiEnabled", "remoteSnapshot", `${expression}; return result.value;`);
    for (const variant of ["streak", "network", "earnings"]) {
      for (const environment of ["LOCAL", "SANDBOX", "PRODUCTION"]) {
        const result = make(Vue.computed, fmt, { value: words }, { value: variant }, { value: 9 }, { value: 17 }, { value: "23.45" }, { value: 31 }, { value: "https://example.test/ref/test" }, environment !== "LOCAL", { value: { sourceEnvironment: environment } });
        const expected = fmt(variant === "streak" ? words.proof.shareStreak : variant === "network" ? words.proof.shareNetwork : words.proof.shareEarnings,
          { n: variant === "streak" ? "9" : "17", amount: "23.45", days: "31", link: "https://example.test/ref/test" });
        expect(result).toBe(environment === "PRODUCTION" ? expected : `${words.proof.shareDemo} ${expected}`);
        expect(result).not.toMatch(/7 layers|Compound earnings|passive NEX/);
      }
    }
  });

  it("keeps estimates, withdrawal thresholds and staking currency truthful", () => {
    expect(words.empty.stakingDesc).toContain("USDT");
    expect(words.empty.stakingDesc).not.toContain("NEX");
    expect(words.me.withdrawalLockedBody).not.toMatch(/325|0\.06|S1|\$20/);
    expect(words.me.withdrawalLockedBody).toContain("{min}");
    expect(words.me.withdrawalLockedBody).toContain("{short}");
    expect(words.onboarding.estimatorHint).not.toMatch(/±|15%/);
    expect(words.earn.estimateDisclaimer).toBeTruthy();
    const banner = parse(source("../components/earn/missed-income-banner.vue")).descriptor.template!.content;
    expect(banner).not.toContain("−");
    expect(banner).toContain("t.earn.estimateDisclaimer");
    expect(words.repurchaseHowItWorks.s3HintBody).toContain("15%");
    expect(source("../components/home/trust-chip-wall.vue")).not.toMatch(/CertiK|SOC 2|102\.4%|ISO 27001/);
    expect(source("../pages/store/detail.vue")).not.toMatch(/Forbes|CoinDesk|TechCrunch|SOC 2 Type II|ISO 27001/);
  });

  it("keeps store FAQs free of fixed deployment, withdrawal and earnings promises", () => {
    const faq = words.store.faq;
    expect(Object.keys(faq).sort()).toEqual(["demand", "location", "refund", "withdraw"]);
    expect(Object.values(faq).map(item => item.a).join(" ")).not.toMatch(/[0-9$%]/);
    expect(faq.location.a).not.toMatch(/Singapore|新加坡/i);
    expect(faq.refund.a).toMatch(/不支持退款|non-refundable|không hỗ trợ hoàn tiền/);
    expect(faq.refund.a).toMatch(/抵扣升级|credited toward an upgrade|khấu trừ để nâng cấp/);
    expect(faq.refund.a).not.toMatch(/转售|resale|bán lại/i);
  });

  it("re-renders saved simulator notices without changing records or real notifications", () => {
    const old: Notification = { id: "team_/team/commissions-123", kind: "team", priority: "normal",
      title: "5% peer bonus from internal formula", body: "V5 allocation", ctaHref: "/team/commissions",
      ctaLabel: "Unlock V5", ts: 123, readAt: 124 };
    const result = notificationCopy(JSON.parse(JSON.stringify(old)), words, false);
    expect(result.title).toBe(words.notifs.kindTeam);
    expect(result.body).toBe(words.publicCopy.experienceMode);
    expect(result.ctaLabel).toBe(words.store.viewDetails);
    expect([result.id, result.readAt, result.ts, result.ctaHref]).toEqual([old.id, old.readAt, old.ts, old.ctaHref]);
    expect(old.title).toContain("5%");
    expect(notificationCopy(old, words, true)).toBe(old);
    const real = { ...old, id: "bank-card-123", title: "Card unbound" };
    expect(notificationCopy(real, words, false)).toBe(real);
  });

  it("localizes all member states and hides unknown state codes", () => {
    const compiled = componentFunction("../pages/team/network.vue", "memberStatusText");
    const label = new Function("t", `${compiled}; return memberStatusText;`)({ value: words }) as (s: string) => string;
    expect([label("active"), label("idle"), label("offline")]).toEqual([words.network.activeNow, words.publicCopy.memberIdle, words.earn.offline]);
    expect(label("INTERNAL_UNKNOWN")).toBe(words.uiChrome.unavailable);
  });

  it.each(["SETTLED", "SANDBOX_QUOTE_EXAMPLES"])("keeps the demo disclosure for %s ledgers", async mode => {
    const { descriptor } = parse(source("../components/home/earnings-ledger-card.vue"));
    const { code } = compile(descriptor.template!.content, { mode: "function", prefixIdentifiers: true, isCustomElement: () => true });
    const render = new Function("Vue", code)(Vue);
    const renderLedger = (environment: string) => renderToString(Vue.createSSRApp({ render, setup: () => ({
      t: words, app: { homeTruth: { sourceEnvironment: environment } },
      ledgerTitle: words.home.earningsLedgerTitle, isQuoteExample: mode === "SANDBOX_QUOTE_EXAMPLES",
      remoteApiEnabled: true, rows: [], ledgerStatusText: "", goAll() {}, retryHome() {},
    }) }));
    expect(await renderLedger("SANDBOX")).toContain(words.publicCopy.experienceMode);
    expect(await renderLedger("PRODUCTION")).not.toContain(words.publicCopy.experienceMode);
  });

  it("uses safe shared copy without technical codes or restored reward mechanisms", () => {
    expect(Object.keys(words.publicCopy).sort()).toEqual(Object.keys(en.publicCopy).sort());
    for (const key of Object.keys(en.publicCopy) as (keyof typeof en.publicCopy)[]) {
      const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
      expect(placeholders(words.publicCopy[key])).toEqual(placeholders(en.publicCopy[key]));
      expect(words.publicCopy[key]).not.toMatch(/SANDBOX|PRODUCTION|ACCOUNT_|服务器|服务端|Mock/);
    }
    expect([words.agent.heroBody, words.agent.lockedV5, words.home.poolV3Unlock,
      words.genesisHowItWorks.s3Step1Title, words.proof.posterHint,
      words.nexHowItWorks.s4BurnBody, words.trust.nexAnchorSubhero].join(" "))
      .not.toMatch(/V[35]|5%|30%|阶梯|售罄跳|tiered|price jump/i);
    expect(JSON.stringify(words)).not.toMatch(/回本|回收周期|覆盖.{0,8}成本|\bpay[ -]?back\b|paid back|break[ -]?even|pays? (?:for )?itself|hoàn vốn|hòa vốn|hoàn lại chi phí kích hoạt/iu);
    expect([words.home.dayOneTaskSeeRoi, words.milestones.earn500, words.novaCard.messageWithPercent,
      words.conversations.advisorReply2, words.weeklyQuest.tier1_buy_first_box_body].join(" "))
      .not.toMatch(/\bROI\b|回报率|\{pct\}/i);
    const memo = new Function("t", "fmt", `${componentFunction("../pages/me/wallet-bills.vue", "billMemo")}; return billMemo;`)({ value: words }, () => "");
    expect(memo({ ref: "QST-view_product_roi", memo: "5% legacy formula" })).toBe(words.bills.typeBonus);
  });

  it("keeps preview notices in demo mode and removes unsupported Genesis and registration claims", async () => {
    const { descriptor } = parse(source("../pages/genesis/holder.vue"));
    const { code } = compile(descriptor.template!.content, { mode: "function", prefixIdentifiers: true, isCustomElement: () => true });
    const render = new Function("Vue", code)(Vue);
    for (const remoteApiEnabled of [false, true]) {
      const html = await renderToString(Vue.createSSRApp({ render, setup: () => ({
        t: words, hasNodes: false, remoteApiEnabled, notHolderBodyText: "Seat availability", goGenesis() {},
        ctaCardStyle: {}, ctaIconStyle: {}, ctaTitleStyle: {}, ctaBodyStyle: {}, previewStyle: {}, previewTextStyle: {},
      }) }));
      expect(html).toContain(words.genesisHolder.notHolderTitle);
      expect(html).toContain("Seat availability");
      expect(html.includes(words.publicCopy.experienceMode)).toBe(!remoteApiEnabled);
      expect(html).not.toMatch(/0xNX|CertiK|Halborn|ERC-721|Ethereum/);
      for (const path of ["../pages/login/login.vue", "../pages/register/register.vue", "../pages/me/security.vue"]) {
        const template = parse(source(path)).descriptor.template!.content;
        const badge = template.match(/<view\b[^>]*data-testid="(?:auth-runtime-label|mock-security-label)"[^>]*>[\s\S]*?<\/view>/)?.[0];
        expect(badge, path).toBeTruthy();
        const compiled = compile(badge!, { mode: "function", prefixIdentifiers: true, isCustomElement: () => true });
        const html = await renderToString(Vue.createSSRApp({ render: new Function("Vue", compiled.code)(Vue), setup: () => ({
          remoteApiEnabled, modeLabel: words.security.mockModeLabel, mockModeBannerStyle: {}, mockModeBannerTextStyle: {},
        }) }));
        expect(html.includes(words.security.mockModeLabel), path).toBe(!remoteApiEnabled);
      }
    }
    expect(JSON.stringify([words.genesisHolder, words.marketplace])).not.toMatch(/0xNX|CertiK|Halborn|ERC-721|Ethereum/);
    expect(JSON.stringify(words.terms)).not.toMatch(/MSB|MiCA|segregated reserve|隔离储备|dự trữ tách biệt/);
    expect(source("../pages/genesis/marketplace.vue")).not.toMatch(/Verified|erc721Line|verifiedStyle/);
  });
});

it("keeps internal quota conditions, tier prices and language priorities out of templates", () => {
  const template = (path: string) => parse(source(path)).descriptor.template!.content;
  expect(template("../components/team/quota-tier-card.vue")).not.toMatch(/tier\.conditions|unlockKind|condRank|inviteCta/);
  expect(template("../pages/genesis/genesis.vue")).not.toMatch(/genesis\.tier|tr in tiers/);
  expect(template("../pages/me/language.vue")).not.toMatch(/priorityLabels|priorityTagStyle|RTL/);
  expect(template("../pages/store/detail.vue")).not.toMatch(/detAnnual|annualYieldText|annualPctText|monthlyPctText/);
  for (const path of ["../pages/store/detail.vue", "../pages/store/checkout.vue", "../components/home/do-the-math-card.vue"]) {
    expect(source(path)).not.toMatch(/payback|breakEven/i);
  }
  expect(source("../pages/store/checkout.vue")).not.toMatch(/annualRoiPct/);
  expect(source("../components/home/nova-card-slot.vue")).not.toMatch(/yieldPct|msgBefore|msgAfter/);
  expect(template("../components/tradein-sheets.vue")).not.toMatch(/sheetBandLabel|sheetEarnedLabel|bandText/);
  expect(template("../components/me/tradein-ladder-sheet.vue")).not.toMatch(/ladderRows|creditPct|ratioPct|deviceLine/);
  expect(template("../components/store/live-social-proof.vue")).not.toMatch(/:aria-label="[^\n]*FIXTURE_ID/);
});

it("filters annual-return and payback perks while retaining daily output and hardware terms", () => {
  const compiled = componentFunction("../pages/team/quota.vue", "visibleQuotaPerks");
  const visible = new Function(`${compiled}; return visibleQuotaPerks;`)() as (s: readonly string[]) => string[];
  const allowed = ["每天产出80 NEX", "80 NEX/day", "RTX 4090 ·24GB", "3-year warranty", "Bảo hành 3 năm", "7-day return window"];
  const annual = ["约394%年化产出", "~394% annualized output", "394% APY", "Sản lượng ~394%/năm", "$100 per year", "394% ROI"];
  const payback = ["约93天回本", "3.1个月收回本金", "投资回收期93天", "93-day payback", "Break-even in 3 months", "Pays itself back in 93 days", "Paid back in 93 days", "Capital recovery: 3 months", "Recoup your investment", "Hoàn vốn sau 93 ngày", "Hòa vốn sau 3 tháng", "Hoà vốn sau 3 tháng", "Thu hồi vốn sau 93 ngày"];
  const input = Object.freeze([...annual, ...payback, ...allowed, "394%/năm".normalize("NFD"), "Hoàn vốn sau 93 ngày".normalize("NFD")]);
  expect(visible(input)).toEqual(allowed);
  expect(input.length).toBe(annual.length + payback.length + allowed.length + 2);
});

it.each([false, true])("notification detail navigation remains usable, remote=%s", async remote => {
  const events: string[] = [];
  const fn = new Function("remoteApiEnabled", "notifs", "close", "navTo",
    `${componentFunction("../components/message-drawer.vue", "onCta")}; return onCta;`)(remote,
    { recordCta: async () => { events.push("record"); return "/remote"; }, markRead: async () => events.push("read") },
    () => events.push("close"), (path: string) => events.push(path));
  await fn({ id: "team_/team/rank-123", ctaHref: "/local" });
  expect(events).toEqual(remote ? ["record", "close", "/remote"] : ["read", "close", "/local"]);
});
