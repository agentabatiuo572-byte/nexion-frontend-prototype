import segments from "@/components/glass-segments.vue?raw";
// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { existsSync, readFileSync } from "node:fs";
// @ts-expect-error This contract runs in Node.
import { env } from "node:process";
// @ts-expect-error This contract runs in Node.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePrototypeVisualReference } from "./prototype-visual-reference";

const formalRoot = new URL("../../", import.meta.url);
const prototypeReference = resolvePrototypeVisualReference({
  repositoryRoot: fileURLToPath(new URL("../../../", import.meta.url)),
  configuredRoot: env.NEXGRID_PROTOTYPE_ROOT,
});
if (!prototypeReference) throw new Error("Me-button parity requires the approved prototype Git checkout; configure NEXGRID_PROTOTYPE_ROOT");
const formalMe = readFileSync(new URL("pages/me/me.vue", formalRoot), "utf8").replace(/\r\n/g, "\n");
const prototypeMe = prototypeReference.read("src/pages/me/me.vue");
const pages = JSON.parse(readFileSync(new URL("pages.json", formalRoot), "utf8")) as { pages: Array<{ path: string }> };

function quickRoutes(source: string): Array<[string, string]> {
  const quickSource = source.slice(source.indexOf("const quickSections"));
  return [...quickSource.matchAll(/\{ key: "([^"]+)",[^\n]*?href: "([^"]+)"/g)]
    .map((match) => [match[1], match[2]] as [string, string]);
}

function toUniPage(href: string): string {
  if (href.startsWith("/pages/")) return href.slice(1).split("?")[0];
  const path = href.split("?")[0];
  const tabRoots: Record<string, string> = {
    "/": "pages/index/index",
    "/home": "pages/index/index",
    "/store": "pages/store/store",
    "/team": "pages/team/team",
    "/earn": "pages/earn/earn",
    "/me": "pages/me/me",
  };
  if (tabRoots[path]) return tabRoots[path];
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 1) return `pages/${segments[0]}/${segments[0]}`;
  return `pages/${segments[0]}/${segments.slice(1).join("-")}`;
}

function component(name: string): string {
  return readFileSync(new URL(`components/me/${name}`, formalRoot), "utf8").replace(/\r\n/g, "\n");
}

describe("Me button click-through parity", () => {
  it("keeps every 5174 quick button key and target route", () => {
    const formalRoutes = quickRoutes(formalMe);
    expect(formalRoutes).toEqual(quickRoutes(prototypeMe).map(([key, href]) =>
      [key, key === "orders" ? `${href}?from=me` : key === "messages" ? "/me/notifications" : href],
    ));
    expect(formalRoutes).toHaveLength(26);

    const declared = new Set(pages.pages.map((page) => page.path));
    for (const [key, href] of formalRoutes) {
      expect(declared.has(toUniPage(href)), `${key} -> ${href}`).toBe(true);
    }
  });

  it("makes every My-home action keyboard-clickable without changing its visual layout", () => {
    expect(formalMe).toContain('data-quick-key="item.key"');
    expect(formalMe).toMatch(/role="button"\s+tabindex="0"/);
    expect(formalMe).toContain('@keydown.enter.prevent="handleQuickItem(item)"');
    expect(formalMe).toContain('@keydown.space.prevent="handleQuickItem(item)"');
    expect(formalMe).toContain('data-me-action="sign-out"');
    expect(formalMe).toContain('@keydown.enter.prevent="handleSignOut"');

    const requiredComponentActions: Record<string, string[]> = {
      "profile-row.vue": ['data-me-action="profile"', 'role="button"', '@keydown.enter.prevent="goProfile"'],
      "wallet-action-btn.vue": [':data-me-action="`wallet:${props.href}`"', 'role="button"', '@keydown.enter.prevent="go"'],
      "wallet-card.vue": ['data-me-action="wallet-bills"', 'data-me-action="add-device"'],
      "withdrawal-locked-warning.vue": ['data-me-action="browse-devices"', '@keydown.enter.prevent="goStore"'],
      "orders-card.vue": ['data-me-action="browse-orders"', 'data-me-action="view-all-orders"'],
      "section-header.vue": [':data-me-action="link ? `section:${link}` : undefined"', '@keydown.enter.prevent="go"'],
    };
    for (const [name, markers] of Object.entries(requiredComponentActions)) {
      const source = component(name);
      for (const marker of markers) expect(source, `${name}: ${marker}`).toContain(marker);
    }
  });

  it("keeps trial, theme and retry controls keyboard-clickable", () => {
    const trialEntry = component("trial-entry.vue");
    expect(trialEntry).toContain('data-me-action="trial"');
    expect(trialEntry).toContain('@keydown.enter.prevent="goTrial"');

    const trialBanner = readFileSync(new URL("components/trial-promo-banner.vue", formalRoot), "utf8");
    expect(trialBanner).toContain('data-me-action="trial-claim"');
    expect(trialBanner).toContain('@keydown.space.prevent="openClaim"');

    const themePicker = component("theme-picker-sheet.vue");
    expect(themePicker).toContain('data-me-action="theme-close"');
    expect(themePicker).toMatch(/<GlassSegments[^>]*:model-value="theme.mode"[^>]*semantics="radio"[^>]*@select="choose"/);
    expect(segments).toMatch(/:tabindex="option.disabled \? -1 : [^\"]*option.value === modelValue \? 0 : -1"/);
    expect(segments).toContain('option.value === modelValue');
    expect(segments).toContain('@keydown="onKeydown($event, option)"');
    expect(segments).toContain('choose(target, "arrow")');
    expect(segments).toContain('?.focus()');

    expect(formalMe).toContain('data-me-action="retry-orders"');
    expect(formalMe).toContain('@keydown.enter.prevent="refreshRemoteOrders"');
  });

  it("keeps the 32 baseline Me routes plus bank withdrawal and method selection", () => {
    const bankRoute = "pages/me/wallet-withdraw-bank";
    expect(pages.pages.filter(item => item.path === bankRoute)).toHaveLength(1);
    expect(existsSync(new URL(`${bankRoute}.vue`, formalRoot))).toBe(true);
    // HDPay payout is a new formal capability, not a claim that the prototype implements bank payouts.
    const prototypeFiles = new Set(prototypeReference.files("src/pages/me"));
    for (const page of pages.pages.filter((item) => item.path.startsWith("pages/me/"))) {
      if (page.path === bankRoute || page.path === "pages/me/wallet-withdraw-method") continue;
      const name = `${page.path.slice("pages/me/".length)}.vue`;
      expect(existsSync(new URL(`pages/me/${name}`, formalRoot)), `5173 ${name}`).toBe(true);
      expect(prototypeFiles.has(`src/pages/me/${name}`), `5174 ${name}`).toBe(true);
    }
  });
});
