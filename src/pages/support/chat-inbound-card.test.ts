import ts from "typescript";
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import source from "./chat.vue?raw";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { localizedIdleClose } from "@/lib/support-idle-message";
import routeSource from "@/lib/route.ts?raw";

const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
const ast = ts.createSourceFile("chat.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const wanted = new Set(["threadMessages", "humanMessageRecommendation", "avatarImageKey", "loadPrivateImages", "clearPrivateImages", "receiptFor"]);
const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? wanted.has(node.name?.text ?? "")
  : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => wanted.has(d.name.getText(ast))));
const code = ts.transpileModule(nodes.map(node => node.getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const routeAst = ts.createSourceFile("route.ts", routeSource, ts.ScriptTarget.Latest, true);
const routeNodes = routeAst.statements.filter(node => ts.isFunctionDeclaration(node) ? node.name?.text === "toUniRoute"
  : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(routeAst) === "TAB_ROOT"));
const routeCode = ts.transpileModule(routeNodes.map(node => node.getText(routeAst).replace(/^export /, "")).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const toUniRoute = new Function(routeCode + ";return toUniRoute;")();
const author = { sender: "agent", authorName: "Real historical author", senderId: 19, authorConfidence: "VERIFIED",
  senderAvatar: { assetId: "c87c520a-0748-4cef-a790-9c8646a29083", version: 3 }, ts: 1 };
function harness(messages: unknown[], translations = zh, download = vi.fn(async () => "blob:author")) {
  const conv = ref({ id: "CV-old-support", type: "support", status: "open", messages });
  const humanHistory = ref([conv.value]);
  const app = { accountBindingEpoch: 1 }, store = { scopeInvalidated: 1 };
  const sources = ref<Record<string, string>>({}), failures = ref<Record<string, boolean>>({});
  const api = { authorAvatarContent: download, attachmentContent: vi.fn(async () => "blob:attachment"), conversation: vi.fn(async () => conv.value) };
  const state = new Function("computed", "ref", "conv", "app", "convStore", "imageSources", "imageFailures", "supportApi", "t", "localizedIdleClose", "humanHistory",
    `const isAi=ref(false), nova={}, locale={code:'zh'}, supportSessionReady=ref(true),failedHumanSend=ref(null),humanSendBusy=ref(false),localHumanSend=ref(null),humanComposerKey=ref('conversation:test'),imageDraft=ref(null);let novaPageVisible=true,imageEpoch=0,imageLoads=new Set();\n${code}\nreturn {threadMessages,loadPrivateImages,clearPrivateImages};`)(
    computed, ref, conv, app, store, sources, failures, api, ref(translations), localizedIdleClose, humanHistory);
  return { state, conv, app, store, sources, failures, api, humanHistory };
}
describe("human incoming cards reuse existing CTA", () => {
  it.each([zh, en, vietnamese])("maps the actual destination and keeps body, SKU snapshot, identity and read receipt", translations => {
    const cards = [{ ...author, id: "1", kind: "SKU", text: "Actual body", skuId: "stellarbox-s1", skuName: "Snapshot", targetAvailability: "AVAILABLE" },
      ...["HOME", "WALLET", "SUPPORT"].map((type, i) => ({ ...author, id: String(i + 2), kind: "LINK", text: "Link body", linkTarget: { type, params: {} }, targetAvailability: "AVAILABLE" })),
      { id: "5", sender: "user", text: "Reply", status: "read", ts: 1 }];
    const h = harness(cards, translations); const result = h.state.threadMessages.value;
    expect(result.map((m: any) => m.ctaHref)).toEqual(["/pages/store/detail?id=stellarbox-s1", "/home", "/me/wallet", "/pages/support/messages", undefined]);
    expect(result[0].text).toBe("Actual body\nSnapshot");
    expect(result.slice(0, 4).map((m: any) => toUniRoute(m.ctaHref))).toEqual([
      { url: "/pages/store/detail?id=stellarbox-s1", tab: false }, { url: "/pages/index/index", tab: true },
      { url: "/pages/me/wallet", tab: false }, { url: "/pages/support/messages", tab: false },
    ]);
    expect(result[0].meta).toContain("Real historical author");
    expect(result[0].receipt).toBeUndefined(); expect(result[4].receipt).toBe(translations.conversations.receiptRead);
    expect(result.slice(0, 4).map((m: any) => m.ctaLabel)).toEqual([translations.conversations.recommendation.product,
      translations.conversations.recommendation.home, translations.conversations.recommendation.wallet, translations.conversations.recommendation.support]);
  });
  it("encodes the entire SKU value instead of injecting navigation query parameters", () => {
    const h = harness([{ ...author, id: "1", kind: "SKU", text: "Snapshot", skuName: "Snapshot", skuId: "s1?redirect=/me&next=x", targetAvailability: "AVAILABLE" }]);
    expect(h.state.threadMessages.value[0].ctaHref).toBe("/pages/store/detail?id=s1%3Fredirect%3D%2Fme%26next%3Dx");
  });
  it.each(["UNAVAILABLE", "UNKNOWN"])("preserves the recommendation and disables all %s destinations", availability => {
    const h = harness([{ ...author, id: "1", kind: "SKU", text: "Original body", skuId: "old", skuName: "Old snapshot", targetAvailability: availability },
      { ...author, id: "2", kind: "LINK", text: "Original link", linkTarget: { type: "WALLET", params: {} }, targetAvailability: availability }]);
    for (const card of h.state.threadMessages.value) { expect(card.ctaHref).toBeUndefined(); expect(card.ctaLabel).toBeUndefined(); }
    expect(h.state.threadMessages.value[0].text).toContain("Old snapshot");
    expect(h.state.threadMessages.value[0].text).toContain(availability === "UNAVAILABLE" ? zh.conversations.recommendation.unavailable : zh.conversations.recommendation.unknown);
  });
});
describe("author avatar uses existing private image owner guard", () => {
  const message = { ...author, id: "1", kind: "TEXT", text: "Hello" };
  it("validates an aggregated historical author's avatar against its source conversation", async () => {
    const h = harness([message]);
    const historical = { ...h.conv.value, id: "CV-original-source" };
    h.humanHistory.value = [historical];
    h.conv.value = { ...h.conv.value, id: "CV-current-window" };
    h.api.conversation.mockResolvedValue(historical);
    await h.state.loadPrivateImages();
    expect(h.api.conversation).toHaveBeenCalledExactlyOnceWith("CV-original-source", 2);
    expect(h.state.threadMessages.value[0].authorAvatarSrc).toBe("blob:author");
  });
  it("loads the exact historical author once and preserves attachment display", async () => {
    const h = harness([message, { ...author, id: "2", kind: "IMAGE", attachmentId: "private-1", text: "" }]);
    await h.state.loadPrivateImages(); await h.state.loadPrivateImages();
    expect(h.api.authorAvatarContent).toHaveBeenCalledExactlyOnceWith(19);
    expect(h.state.threadMessages.value[0].authorAvatarSrc).toBe("blob:author");
    expect(h.state.threadMessages.value[1].imageSrc).toBe("blob:attachment");
  });
  it.each(["binding", "scope"])("drops a late author download after %s switches and clears the private cache", async boundary => {
    let release!: (value: string) => void;
    const h = harness([message], zh, vi.fn(() => new Promise<string>(resolve => { release = resolve; })));
    const pending = h.state.loadPrivateImages();
    if (boundary === "binding") h.app.accountBindingEpoch++; else h.store.scopeInvalidated++;
    h.state.clearPrivateImages(); release("blob:old-account"); await pending;
    expect(h.sources.value).toEqual({}); expect(h.state.threadMessages.value[0].authorAvatarSrc).toBeUndefined();
    expect(h.api.conversation).not.toHaveBeenCalled();
  });
  it("keeps the actual author's text when the guarded avatar request fails", async () => {
    const h = harness([message], zh, vi.fn(async () => { throw new Error("HTTP_404"); }));
    await h.state.loadPrivateImages(); await h.state.loadPrivateImages();
    expect(h.state.threadMessages.value[0].authorAvatarSrc).toBeUndefined();
    expect(h.state.threadMessages.value[0].meta).toContain("Real historical author");
    expect(h.api.authorAvatarContent).toHaveBeenCalledTimes(1);
  });
  it("never caches the current photo under an old author avatar revision", async () => {
    const h = harness([message]);
    h.api.conversation.mockResolvedValueOnce({ ...h.conv.value, messages: [{ ...message, senderAvatar: { ...message.senderAvatar, version: 4 } }] });
    await h.state.loadPrivateImages();
    expect(h.sources.value).toEqual({}); expect(h.state.threadMessages.value[0].authorAvatarSrc).toBeUndefined();
    expect(h.api.conversation).toHaveBeenCalledWith("CV-old-support", 2);
  });
});


it.each([zh, en, vietnamese])("uses stored SKU snapshots verbatim while preserving authored messages and raw history", translations => {
  const cards = [
    { ...author, id: "1", kind: "SKU", text: "NexGridBox S1", skuName: "NexGridBox S1", skuId: "stellarbox-s1", targetAvailability: "AVAILABLE" },
    { ...author, id: "2", kind: "SKU", text: "I liked NexGrid", skuName: "NexGridBox S1", skuId: "stellarbox-s1", targetAvailability: "UNAVAILABLE" },
    { ...author, id: "3", kind: "TEXT", text: "NexGridBox S1" },
    { ...author, id: "4", sender: "user", kind: "TEXT", text: "My NexGrid" },
  ];
  const h = harness(cards, translations);
  expect(h.state.threadMessages.value[0].text).toBe("NexGridBox S1");
  expect(h.state.threadMessages.value[0].ctaHref).toBe("/pages/store/detail?id=stellarbox-s1");
  expect(h.state.threadMessages.value[1].text).toContain("I liked NexGrid\nNexGridBox S1");
  expect(h.state.threadMessages.value[1].ctaHref).toBeUndefined();
  expect(h.state.threadMessages.value[2].text).toBe("NexGridBox S1");
  expect(h.state.threadMessages.value[3].text).toBe("My NexGrid");
  expect(h.conv.value.messages).toEqual(cards);
});


it.each([
  ["custom", "My NexGrid collection"], ["custom", "NexGridBox S1"],
  ["stellarbox-s1", "My NexGrid collection"], ["stellarbox-s1", "NexGridBox S1 Limited"],
])("preserves custom SKU snapshots and identical authored bodies for %s / %s", (skuId, skuName) => {
  const card = { ...author, id: "custom", kind: "SKU", text: skuName, skuName, skuId, targetAvailability: "AVAILABLE" };
  const h = harness([card]);
  expect(h.state.threadMessages.value[0].text).toBe(skuName);
  expect(h.conv.value.messages[0]).toEqual(card);
});

it.each([zh, en, vietnamese])("retains stored recommendation templates and authored text verbatim", translations => {
  const cards = [
    ["stellarbox-s1", "NexGridBox S1", "NexGridBox S1"],
    ["stellarbox-pro-v2", "NexGridBox Pro v2", "NexGridBox Pro v2"],
    ["stellarbox-pro", "StellarBox Pro", "StellarBox Pro"],
    ["stellarrack-p1", "StellarRack P1", "StellarRack P1"],
    ["custom", "NexGridBox S1", "NexGridBox S1"],
    ["stellarbox-s1", "NexGridBox S1 Limited", "NexGridBox S1 Limited"],
  ].flatMap(([skuId, skuName, displayName]) => ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"].map(targetAvailability => ({
    card: { ...author, id: `${skuId}-${targetAvailability}`, kind: "SKU", skuId, skuName,
      text: `推荐商品：${skuName}`, targetAvailability }, displayName,
  })));
  for (const { card, displayName } of cards) {
    const h = harness([card], translations);
    expect(h.state.threadMessages.value[0].text).toContain(`推荐商品：${displayName}\n${displayName}`);
    expect(h.conv.value.messages[0]).toEqual(card);
  }
  const authored = { ...author, id: "authored", kind: "SKU", skuId: "stellarbox-s1", skuName: "NexGridBox S1",
    text: "推荐商品：NexGridBox S1 was my favorite", targetAvailability: "AVAILABLE" };
  expect(harness([authored], translations).state.threadMessages.value[0].text)
    .toBe("推荐商品：NexGridBox S1 was my favorite\nNexGridBox S1");
});
