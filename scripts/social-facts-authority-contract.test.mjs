import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertKeyInAllLocales, namespaceBlock } from "./lib/i18n-namespace.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

test("daily leaderboard consumes the remote points snapshot", () => {
  const page = read("src/pages/daily/daily.vue");
  const faucet = read("src/store/nex-faucet.ts");
  assert.match(page, /faucet\.topStreakers/);
  assert.doesNotMatch(page, /v-for="\(s, i\) in TOP_STREAKERS"/);
  assert.match(faucet, /snapshot\.topStreakers/);
  assert.match(faucet, /createRemoteAccountEpoch/);
  assert.match(faucet, /isCurrent\(/);
});

test("home earnings and live feed have a server-backed remote branch", () => {
  const earnings = read("src/components/home/earnings-ledger-card.vue");
  const feed = read("src/components/home/live-feed-card.vue");
  assert.match(earnings, /remoteApiEnabled/);
  assert.match(earnings, /app\.homeTruth\?\.earningsLedger/);
  assert.match(earnings, /app\.refreshHomeTruth\(\)/);
  assert.match(feed, /buildCanonicalHomeFeed\(app\.homeTruth\?\.earningsLedger \?\? \[\]\)/);
  assert.match(feed, /app\.refreshHomeTruth\(\)/);
  const app = read("src/store/app.ts");
  assert.match(app, /createRemoteAccountEpoch/);
  assert.match(app, /isCurrent\(/);
  assert.match(app, /before applying remote task assignments/);
});

test("genesis surfaces do not synthesize remote social proof", () => {
  const genesis = read("src/pages/genesis/genesis.vue");
  const marketplace = read("src/pages/genesis/marketplace.vue");
  assert.doesNotMatch(genesis, /LIVE_MARKET|BUYER_NAMES|emitSocial|tickSales/);
  assert.doesNotMatch(marketplace, /SEED_ACTIVITY|FOMO_ADDR_POOL|genFomoSale|scheduleFomo|Math\.random/);
  assert.match(marketplace, /remoteTransactions/);
  const store = read("src/store/genesis.ts");
  assert.match(store, /createRemoteAccountEpoch/);
  assert.match(store, /isCurrent\(/);
  // remote 档不许从本地存量 hydrate 出「已售 N 席」的稀缺感。原断言钉的是 globalDefaults(),
  // 但那份默认值里带着写死的 847 已售 —— 正是本测试标题要消灭的伪社交证明。现在 remote 档走
  // remoteDefaults()(从 0 起,权威由服务端给),比原断言更贴它自己保护的语义;两条一起钉,
  // 免得日后有人把 remoteDefaults 的 soldSlots 改回 847 而门照绿。
  assert.match(store, /remoteApiEnabled \? remoteDefaults\(\)/);
  assert.match(store, /function remoteDefaults\(\)[\s\S]{0,240}soldSlots: 0/);
  assert.match(store, /remoteApiEnabled \? remoteDefaults\(\) : hydrateGlobal\(\)/);
  assert.match(store, /Remote mode starts unknown, never with the mock's seeded 847 slots/);
});

// 旧断言的前提是「remote 档只有 NEX 币价有服务端权威」,该前提已被 /api/app/home/overview 消除:
// 行情行现在整块来自服务端投影(取不到就显示 Unavailable,不编数)。断言不能删 —— 全仓只有这一条门
// 守这张卡;改成守「remote 只渲染服务端投影 + mock 那几行必须留在 mock 分支里 + 无权威时显式不可用」。
test("remote market board renders only the server-owned home truth rows", () => {
  const board = read("src/components/home/market-board-card.vue");
  assert.match(board, /homeTruth\?\.marketBoard\.workloads/);
  assert.match(board, /app\.homeTruth\?\.marketBoard\.workloads \?\? \[\]/);
  assert.match(board, /v-if="homeMarketRows\.length"/);
  assert.doesNotMatch(board, /MOCK_MARKET|Math\.random/);
  // 🔴 2026-08-17:原断言钉的是**英文字面量** `Unavailable`,而那句话已收进 i18n(它此前在
  //    中文 / 越南语界面直出英文,由 i18n-hardcoded-en-copy-sentinel 抓出)。字面量断言与
  //    「文案必须走词典」这条不变量方向相反 —— 任何一次正确的 i18n 收编都会让它翻红,
  //    于是两道门不可能同时绿(同 g-remote-authority-contract 早先踩过的那一坑)。
  //    改锚 i18n key + 三语有值,守的语义(无权威时显式不可用、不编数)没变而且更强:
  //    key 被删或某语种译文被清空时也判红,字面量断言对这两种失效全瞎。
  // key 名收尾带边界:不带的话 `unavailableXX` 这种笔误 key 照样匹配,页面渲染空白而门报绿。
  assert.match(board, /t\.value\.uiChrome\.unavailable\b(?!\w)/);
  assertKeyInAllLocales(read, "uiChrome", ["unavailable"]);
});

// 🔴 上一条断言依赖「按命名空间切片」这个前提,而那个前提本身此前没有任何靶:独立验收把
// `namespaceBlock` 改成 `return source`(退化成整文件),两个契约测试 10/10 照样全绿 ——
// 因为 `unavailable` 这个 key 名在别的命名空间也存在,整文件匹配时它会替 uiChrome 那条满足断言。
// 这条测试把前提本身钉住。
test("i18n 命名空间切片不许退化成整文件(否则同名 key 跨命名空间互相顶替)", () => {
  // 🔴 三份词典都验(en.ts / zh.ts / vi.ts)—— 这条不变量在三语上都该成立,而且仓内元门
  //    selfcheck-gate-targets 判「点名了一种语言就得点名三种」。它按**字面量**扫语言文件名,
  //    所以动态拼 `${locale}.ts` 它看不见 —— 三个名字必须在源码里各出现一次,
  //    让「三语都覆盖」这件事 grep 可见(元门抓到过我这条测试只写了一种)。
  for (const locale of ["en", "zh", "vi"]) {
    const dict = read(`src/i18n/messages/${locale}.ts`);
    // 前提:该 key 名确实在多个命名空间并存 —— 前提不成立时这条测试就没有意义,要大声失败。
    const wholeFileHits = (dict.match(/\bunavailable:\s*"/g) ?? []).length;
    assert.ok(wholeFileHits >= 2, `${locale}.ts:前提不再成立,整份词典里 unavailable 只出现 ${wholeFileHits} 次,请换一个跨命名空间重名的 key 做靶`);
    const ns = namespaceBlock(dict, "uiChrome");
    assert.ok(ns.length < dict.length, `${locale}.ts:切片等于整文件 = 退化`);
    assert.equal((ns.match(/\bunavailable:\s*"/g) ?? []).length, 1, `${locale}.ts:切片里该 key 只该出现一次`);
  }
  // 纯空白值不算有值(旧判据 `"[^"]+"` 会把 `" "` 判成有值,而页面渲染空白)
  const fake = () => '  uiChrome: {\n    unavailable: " ",\n  },\n';
  assert.throws(() => assertKeyInAllLocales(fake, "uiChrome", ["unavailable"], ["en"]), /为空\/纯空白/);
});

test("purchase social proof consumes the authenticated storefront activity API", () => {
  const ticker = read("src/components/store/purchase-ticker.vue");
  const proof = read("src/components/store/live-social-proof.vue");
  const api = read("src/api/storefront-activity-api.ts");
  assert.match(ticker, /storefrontActivityApi\.activity/);
  assert.match(proof, /storefrontActivityApi\.socialProof/);
  assert.match(api, /\/api\/storefront\/activity/);
  assert.match(api, /social-proof/);
  assert.match(ticker, /createRemoteAccountEpoch/);
  assert.match(ticker, /remoteItems\.value = \[\]/);
  assert.match(proof, /createRemoteAccountEpoch/);
  assert.match(proof, /remoteProof\.value = null/);
});

test("account-scoped event, event-page, and V-rank reads reject stale responses", () => {
  const eventQuest = read("src/store/event-quest.ts");
  const eventsPage = read("src/pages/events/events.vue");
  const missionsPage = read("src/pages/missions/missions.vue");
  const vRank = read("src/store/v-rank.ts");
  for (const source of [eventQuest, eventsPage, missionsPage, vRank]) {
    assert.match(source, /createRemoteAccountEpoch/);
    assert.match(source, /isCurrent\(/);
  }
  assert.match(eventsPage, /watch\(\[\(\) => String\(app\.accountKey\)/);
  assert.match(missionsPage, /watch\(\[\(\) => String\(app\.accountKey\)/);
  assert.match(eventQuest, /clearRemoteFacts\(\)/);
  assert.match(vRank, /ladder\.value = \[\]/);
});
