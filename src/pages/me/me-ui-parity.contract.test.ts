// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { existsSync, readFileSync, readdirSync } from "node:fs";
// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { createHash } from "node:crypto";
// @ts-expect-error This contract runs in Node.
import { env } from "node:process";
// @ts-expect-error This contract runs in Node.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from '@vue/compiler-sfc';
import { resolvePrototypeVisualReference } from "./prototype-visual-reference";

const source = readFileSync(new URL("./me.vue", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const formalMeDir = new URL("./", import.meta.url);
const prototypeReference = resolvePrototypeVisualReference({
  repositoryRoot: fileURLToPath(new URL("../../../", import.meta.url)),
  configuredRoot: env.NEXGRID_PROTOTYPE_ROOT,
});
const EXPECTED_TEMPLATE_DIFFERENCES = [
  "achievements.vue",
  "devices.vue",
  "goals.vue",
  "help.vue",
  "language.vue",
  "me.vue",
  "notifications.vue",
  "preferences.vue",
  "profile.vue",
  "proof.vue",
  "receipts.vue",
  "rewards-list.vue",
  "rewards.vue",
  "risk-disclosure.vue",
  "security.vue",
  "support-tickets.vue",
  "support.vue",
  "trial.vue",
  "wallet-address-rebind.vue",
  "wallet-bills.vue",
  "wallet-cards-new.vue",
  "wallet-cards.vue",
  "wallet-exchange-how.vue",
  "wallet-exchange.vue",
  "wallet-nex.vue",
  "wallet-repurchase-how.vue",
  "wallet-repurchase.vue",
  "wallet-topup.vue",
  "wallet-withdraw-tracking.vue",
  "wallet-withdraw.vue",
  "wallet.vue"
];
// Pin the exact formal/reference template pair for every approved difference.
// A new edit inside an approved file therefore still fails until its specific
// production-only delta is reviewed; this is not a file-level exemption.
// Reviewed 710e9ee visual refresh with formal server and accessibility boundaries.
// Reviewed 710e9ee visual refresh with formal server and accessibility boundaries.
const EXPECTED_TEMPLATE_PAIR_SHA256: Record<string, string> = {
  "achievements.vue": "e7cfef2560a4a60747043f2a4d76b875a0faad0383b5cbcf1fb15deeab98e60f",
  "devices.vue": "227aa03a6c8ba621deb6d5e69fa1672cd80e918fc18cf37deeac446818adb125",
  "goals.vue": "43658431af1e6739fa4a269c4758f7a432b9e74dd33fa031f8fec5cb408e0a60",
  "help.vue": "3eeec6995d290e03d6a008b83f3a2ba8365f702b6c59d3acb306eab055437d7d",
  "language.vue": "147e4114cec9c44704a643c833d582e043565ee17240fe474622f656ae104da9",
  // Owner requested removal of the unsolicited overview withdrawal warning.
  "me.vue": "4eb7f786750e279d7d7101415c5d4857dbbdcd20a4e2afcd4979b28f21c823e6",
  // Approved smooth centered message header and shared message-family interactions.
  "notifications.vue": "0c754690e400fe1b137de31e968d31a0f347c5020ed6d4a22322abb7fe327344",
  "preferences.vue": "f671d2462d5c346657790bfb9f75c92cfb0a63d1039c886ed8ad02cd6789e3cc",
  "profile.vue": "67bb87df27035ea1a2f8a374d3653b44d7c2623bc002ff054d412eb6fccc9e95",
  "proof.vue": "956e804b2c96dced42cc10cb0dd757e7abd5c4a6a3596c56bca63490e93f3616",
  "receipts.vue": "ee45b67eef9b7054af4c16b095d1adc9c5c1c48e979469f37dbc41f0f03c613f",
  "rewards-list.vue": "75c2e5fa485fda8e0bf6dbc742b3333f7b70cf3e2788dc5923edf50038bc1218",
  "rewards.vue": "2d899c2643e74a74e5ad4102a8d7c6b328d539cd5368dfe977fe1529c167a782",
  "risk-disclosure.vue": "5f1d1f52b62559b79785d91fd28fd9e4de6597cf91b9174a87191740c95ba2bf",
  "security.vue": "277a220c6aeb77b2c7316ee00dcb945a43d6e63ddb1891888958b19a7cf8e164",
  // Reviewed #439: BASIC retains the existing hint; enhanced policy owns retry timing and existing-ticket/retry actions.
  "support-tickets.vue": "3ac98300ccd1317d0947818bb97a0f9ff0fa5a5562a20d645b5c80af2e739415",
  "support.vue": "9a89c364bbc52d36f0218752b5bb69ffbba692fd113feaf285e7d0273180bad0",
  "trial.vue": "9ba1ff2296064a5ccf0c750018c06c722853136431dc2f8e14ffa0ef7bd20d2e",
  "wallet-address-rebind.vue": "64f22ae20b3725ff6df6c516a9f99a6714efd94834cc5b02734c146e377e9e32",
  "wallet-bills.vue": "66562e30900e2169f5ff8bc8bbf6651293d8f33294663b7f90f3b97b249edf0f",
  "wallet-cards-new.vue": "6af630a5acf97669826202e3842042a8b28af8813f0657da0a6085336f7a3fc2",
  "wallet-cards.vue": "4ba7080a2d1b7c9ce4d56c4ea90b5fed3614c689aaeccaf3811d166f08391692",
  "wallet-exchange-how.vue": "53a85b180c00d4a33e73d101a628e8f786924b2e23c48f045147b9f15cb8b9b0",
  "wallet-exchange.vue": "f6e7c49b78de3c05e25da2648b73673ec654ab69330d416dda6042ef63fe8eb6",
  // Reviewed #413: native number/date formatting and finite display boundaries.
  "wallet-nex.vue": "e79b540f1eacd429f044fba4bfd7fb2d15732cac2fc7cda274406416d035ee86",
  "wallet-repurchase-how.vue": "238439b99d5b73f9cf7c6ad7b8479cb86f39ef92f93d216938b071c28372e4f0",
  "wallet-repurchase.vue": "19b1c868b06086a2384a8f3bba7f013dc026f2c1bf97a5ff886f3fed3a40adca",
  "wallet-topup.vue": "010252b7630c35defdf57a3f262d0e389c011d2b9d79ad2f5fb788e794d87768",
  "wallet-withdraw-tracking.vue": "7e295fb4b5e5bc50dcbfbbe136c6ede7bcab07ae9bb6193b666bf397acb60e9a",
  "wallet-withdraw.vue": "e3f41cf165b08b6a7813a6f1b180d3da96e5d786f1daa138e95fb4ba334ed10d",
  "wallet.vue": "95b9805fdebe39db2a8920a235436fca6b8d21e65101df5cb866a244122a6bd5"
};
const EXPECTED_STYLE_PAIR_SHA256: Record<string, string> = {
  // Approved unified center uses shared flat-row styles and fixed native scrolling.
  "notifications.vue": "e065437c45004cdd395d81d27ebc06f17e7f3e4c5da3e9e9f7092d8204e2d30a",
  "preferences.vue": "2329be1da2edb9adaa473f5ef7408aa3edd688413331fdf42c4abd406c57415f",
  "proof.vue": "c21851c57140a23d48746e19c798781a56bccc946028165e9f3f61323e6eb2bd",
  "support-tickets.vue": "3f3dc61ed7dbf90e34e879979cb6f4c1ed0d2d3f1d83176b371c8ded789cca0b",
  "wallet-repurchase.vue": "49b410e94f8d119d898b3c05f01d735af70aac979d6f8d8559341b13841d1477"
};

function block(text: string, tag: "style" | "template"): string {
  const normalized = text.replace(/\r\n/g, "\n");
  if (tag === "style") {
    return [...normalized.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(match => match[0]).join("\n");
  }
  return normalized.match(/<template[^>]*>[\s\S]*?<\/template>/)?.[0] ?? "";
}

// New slot-bearing surfaces also pin the full compiler-parsed template; keep
// the historical pair fingerprints stable for unrelated approved pages.
function fullTemplate(text: string): string {
  const template = parse(text.replace(/\r\n/g, '\n')).descriptor.template;
  return template ? `<template>${template.content}</template>` : '';
}

function quickKeys(section: string): string[] {
  const quickSource = source.slice(source.indexOf("const quickSections"));
  const match = quickSource.match(new RegExp(`key: "${section}"[\\s\\S]*?items: \\[([\\s\\S]*?)\\n    \\],`, "m"));
  if (!match) throw new Error(`ME_SECTION_NOT_FOUND:${section}`);
  return [...match[1].matchAll(/\{ key: "([^"]+)"/g)].map((row) => row[1]);
}

describe("Me page 5174 normal-state UI parity", () => {
  it('includes content after nested template slots in the visual fingerprint', () => {
    const markup = '<template><view><template #option><text>label</text></template><text>tail</text></view></template>';
    expect(fullTemplate(markup)).toBe(markup);
    expect(fullTemplate(markup.replace('tail', 'changed'))).not.toBe(fullTemplate(markup));
  });
  it('pins the complete notification page including content after category slots', () => {
    const notification = readFileSync(new URL('./notifications.vue', import.meta.url), 'utf8');
    expect(createHash('sha256').update(fullTemplate(notification)).digest('hex')).toBe('be9ba0b339c494422691051390b9f15ca3df444d5f8817f08009072b6f20c7b1');
  });
  it("includes every page-local style block in the visual fingerprint", () => {
    const shared = '<style src="@/styles/message-center.css"></style>';
    const local = '<style scoped>.message-title { text-align: center; }</style>';
    expect(block(shared + "\n" + local, "style")).toBe(shared + "\n" + local);
    expect(block(shared + "\n" + local.replace("center", "left"), "style")).not.toBe(block(shared + "\n" + local, "style"));
  });
  it("detects ticket layout changes after its shared stylesheet import", () => {
    const ticket = readFileSync(new URL("./support-tickets.vue", import.meta.url), "utf8");
    const changed = ticket.replace("grid-template-columns: repeat(3, minmax(0, 1fr))", "grid-template-columns: repeat(1, minmax(0, 1fr))");
    expect(changed).not.toBe(ticket);
    const digest = (value: string) => createHash("sha256").update(block(value, "style")).digest("hex");
    expect(digest(changed)).not.toBe(digest(ticket));
  });
  it("checks the message center stylesheet content", () => {
    const css = readFileSync(new URL("../../styles/message-center.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    const expected = "f35ad74803936999ee631a18ae0a94c82559f4164ebae2fe2105670fd9e5ebb9";
    expect(digest(css)).toBe(expected);
    const changed = css.replace("font-size: 34px", "font-size: 44px");
    expect(changed).not.toBe(css);
    expect(digest(changed)).not.toBe(expected);
  });
  it("pins the approved ticket timeline component and its account-scoped disclosure wiring", () => {
    const record = readFileSync(new URL("../../components/me/ticket-message.vue", import.meta.url), "utf8");
    const ticket = readFileSync(new URL("./support-tickets.vue", import.meta.url), "utf8");
    const surface = (value: string) => createHash("sha256").update(block(value, "template")).update("\0").update(block(value, "style")).digest("hex");
    expect(surface(record)).toBe("4c88bb8dde28774be8d7a67c81cb7edd3f921679cbc5e0d222b9e3bec54477d8");
    expect(ticket).toContain(':scope="`${app.accountKey}:${detailTicket.id}`"');
    expect(ticket).toContain(':key="`${app.accountKey}:${detailTicket.id}:${m.id}`"');
    expect(ticket).toContain(':show-date="index === 0 || messageDay(m.ts) !== messageDay(detailTicket.messages[index - 1].ts)"');
    expect(record).toContain('@keydown.enter.prevent="toggle"');
    expect(record).toContain('@keydown.space.prevent="toggle"');
    const changed = record.replace("font-size: 15px; font-weight: 400", "font-size: 13px; font-weight: 400");
    expect(changed).not.toBe(record);
    expect(surface(changed)).not.toBe(surface(record));
  });
  it("keeps 16px inline padding on message text actions and both segment layouts", () => {
    const rules = [
      ["../../styles/message-center.css", ".message-center .message-action", /padding-inline:\s*16px\s*;/],
      ["../../styles/message-center.css", ".message-center .nx-glass-segments .nx-glass-option", /padding-inline:\s*16px\s*;/],
      ["../../styles/message-family.css", ".message-family .nx-glass-segments .nx-glass-option", /padding-inline:\s*16px\s*;/],
      ["../../components/support/conversation-thread.vue", ".message-family .nx-conv-cta-row", /padding:\s*0\s+16px\s*;/],
      ["../../components/support/conversation-thread.vue", ".message-family .nx-conv-queue-action, .message-family .nx-conv-chip", /padding-inline:\s*16px\s*;/],
    ] as const;
    for (const [path, selector, expected] of rules) {
      const css = readFileSync(new URL(path, import.meta.url), "utf8");
      const declarations = css.split(`${selector} {`)[1]?.split("}")[0];
      expect(declarations, selector).toBeDefined();
      expect(declarations, selector).toMatch(expected);
    }
  });
  it("limits the shared message finish to the approved message-family surfaces", () => {
    const css = readFileSync(new URL("../../styles/message-family.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(css).digest("hex")).toBe("265243f29e0e34caf0873a5a2980378e83d247ee07ef12991089a9fef0e4f985");
    const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)]
      .map(match => match[1].trim()).filter(selector => !selector.startsWith("@"));
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors.flatMap(value => value.split(","))) expect(selector.trim().startsWith(".message-family")).toBe(true);
    const srcDir = new URL("../../", import.meta.url);
    function vueFiles(dir: URL, prefix = ""): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry: { name: string; isDirectory: () => boolean }) => {
        const name = prefix + entry.name;
        return entry.isDirectory() ? vueFiles(new URL(`${entry.name}/`, dir), `${name}/`) : name.endsWith(".vue") ? [name] : [];
      });
    }
    const imports = vueFiles(srcDir).filter(name => readFileSync(new URL(name, srcDir), "utf8").includes('<style src="@/styles/message-family.css">')).sort();
    expect(imports).toEqual(["components/support/conversation-thread.vue", "pages/me/preferences.vue", "pages/me/support-tickets.vue", "pages/support/chat.vue", "pages/support/messages.vue"]);
    for (const name of imports) expect(block(readFileSync(new URL(name, srcDir), "utf8"), "template"), name).toMatch(/class="[^"]*\bmessage-family\b/);
  });
  it("keeps the same five large modules and quick-entry order", () => {
    expect(quickKeys("network")).toEqual(["team", "invite", "commissions", "rank"]);
    expect(quickKeys("devices")).toEqual(["inventory", "add", "slots", "goals"]);
    expect(quickKeys("account")).toEqual(["rewards", "receipts", "orders", "genesis", "cards", "profile", "security"]);
    expect(quickKeys("preferences")).toEqual(["preferences", "theme", "language"]);
    expect(quickKeys("help")).toEqual(["messages", "support", "faq", "tickets", "trust", "learning", "risk", "developer"]);
  });

  it("preserves the overview order without an unsolicited withdrawal warning", () => {
    const markers = [
      "<ProfileRow />",
      "<WalletCard />",
      "<TrialEntry v-if=\"trialIsHero\" />",
      "v-for=\"section in quickSections\"",
      "<TrialEntry v-if=\"trialIsActive\" />",
      "<OrdersCard v-if=\"orderCount > 0\" />",
      "t.me.signOut",
    ];
    const indexes = markers.map((marker) => source.indexOf(marker));
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(source).not.toContain("WithdrawalLockedWarning");
  });

  it("isolates authenticated module refreshes with all-settled semantics", () => {
    expect(source).toContain("settleRemoteMeLoaders");
    for (const key of ["home", "fleet", "funds", "orders", "security", "notifications", "conversations", "trial", "vouchers", "rank", "genesis", "bills", "market"]) {
      expect(source).toContain(`["${key}"`);
    }
  });

  it("derives the unified Message Center badge from the same total as the bell", () => {
    expect(source).toContain('import { useMessageDrawer } from "@/store/message-drawer"');
    expect(source).toContain("const messageUnread = computed(() => messageCenter.totalUnread)");
    expect(source).toContain('key: "messages", label: t.value.notifs.drawerTitle, href: "/me/notifications"');
    expect(source).toContain('badge: formatUnreadBadge(messageUnread.value) || undefined');
  });

  it("matches the checked-out 5174 Me-page visual baseline when it is available", () => {
    if (!prototypeReference) return;
    // User-requested HDPay payout is a new server-only page, covered by bank-withdrawal-runtime.mjs.
    expect(existsSync(new URL("wallet-withdraw-bank.vue", formalMeDir))).toBe(true);
    const files = readdirSync(formalMeDir).filter((name: string) => name.endsWith(".vue") && !["wallet-withdraw-bank.vue", "wallet-withdraw-method.vue"].includes(name)).sort();
    const prototypeFiles = prototypeReference.files("src/pages/me").map((name) => name.slice("src/pages/me/".length)).filter((name) => name.endsWith(".vue")).sort();
    expect(files).toEqual(prototypeFiles);
    expect(files).toHaveLength(32);

    const templateDifferences: string[] = [];
    const templatePairHashes: Record<string, string> = {};
    for (const name of files) {
      const formal = readFileSync(new URL(name, formalMeDir), "utf8");
      const prototype = prototypeReference.read(`src/pages/me/${name}`);
      const formalStyle = block(formal, "style"), prototypeStyle = block(prototype, "style");
      if (EXPECTED_STYLE_PAIR_SHA256[name]) {
        expect(createHash("sha256").update(formalStyle).update("\0").update(prototypeStyle).digest("hex"), name).toBe(EXPECTED_STYLE_PAIR_SHA256[name]);
      } else expect(formalStyle, name).toBe(prototypeStyle);
      const formalTemplate = block(formal, "template");
      const prototypeTemplate = block(prototype, "template");
      if (formalTemplate !== prototypeTemplate) {
        templateDifferences.push(name);
        templatePairHashes[name] = createHash("sha256")
          .update(formalTemplate)
          .update("\0")
          .update(prototypeTemplate)
          .digest("hex");
      }
    }
    expect(templateDifferences).toEqual(EXPECTED_TEMPLATE_DIFFERENCES);
    expect(templatePairHashes).toEqual(EXPECTED_TEMPLATE_PAIR_SHA256);
  });
});
