import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureServer } from "./lib/dev-server-pool.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, ".codex-runtime/team-home-redesign");
await mkdir(output, { recursive: true });
const server = await ensureServer({ root, reuseUrl: process.env.TEAM_HOME_BASE_URL || process.env.FIXED_MOCK_REUSE_URL || process.env.UNI_BASE_URL || "http://127.0.0.1:54282", log: console.log });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [], cases = [];
page.on("pageerror", error => errors.push(error.message));
async function check(name, action) {
  await action();
  cases.push(name);
  console.log("PASS " + name);
}
async function boundary(status, total = 0, direct = 0) {
  await page.evaluate(({ status, total, direct }) => {
    const element = [...document.querySelectorAll(".team-summary")].find(element => element.getClientRects().length);
    let instance = element?.__vueParentComponent;
    while (instance && !String(instance.type.__file).endsWith("team-summary-card.vue")) instance = instance.parent;
    if (!instance) throw Error("Summary component missing");
    // Isolated component-boundary fixture; this is not a remote API integration test.
    Object.assign(instance.props, { status, total, direct });
  }, { status, total, direct });
}
try {
  await page.goto(server.baseUrl + "/?nx_device_inner=1#/pages/team/team", { waitUntil: "domcontentloaded" });
  await page.locator(".team-summary:visible").waitFor();
  await page.evaluate(async () => {
    const network = (await import("/src/store/network.ts")).useNetwork();
    window.__teamOriginal = { members: [...network.members], total: network.totalMembers };
    window.__teamNetwork = network;
  });
  for (const locale of ["zh", "en", "vi"]) {
    await page.evaluate(async locale => (await import("/src/store/locale.ts")).useLocaleStore().setLocale(locale), locale);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await check(locale + "-" + width + "-states-and-layout", async () => {
        for (const [status, total, direct] of [["ready", 0, 0], ["ready", 37, 4], ["ready", 999999999999, 888888888888], ["loading", 0, 0], ["error", 0, 0]]) {
          await boundary(status, total, direct);
          const summary = page.locator(".team-summary:visible");
          if (status === "ready") {
            assert.equal(await summary.locator(".team-summary__cta").count(), 1);
            assert.equal(await summary.locator(".team-summary__empty").count(), total === 0 ? 1 : 0);
          } else {
            assert.equal(await summary.locator(".team-summary__empty").count(), 0);
            assert.equal(await summary.locator(".team-summary__retry").count(), status === "error" ? 1 : 0);
          }
          const overflow = await summary.evaluate(element => [...element.querySelectorAll("*")].filter(child => {
            const r = child.getBoundingClientRect(), p = element.getBoundingClientRect();
            return r.width && (r.right > p.right + 1 || r.left < p.left - 1);
          }).map(child => child.className));
          assert.deepEqual(overflow, []);
        }
        assert.equal(await page.locator(".team-tools .team-tool:visible").count(), 4);
        const actions = await page.locator(".invite-card__action:visible").evaluateAll(elements => elements.map(element => {
          const r = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return { width: r.width, height: r.height, x: r.x, right: r.right, flat: !element.classList.contains("nx-glass-action") && style.boxShadow === "none" && style.backgroundColor === "rgba(0, 0, 0, 0)" && parseFloat(style.borderTopWidth) === 0 };
        }));
        assert.equal(actions.length, 3);
        assert.ok(actions.every(action => action.flat && action.height >= 44 && action.width >= 44 && Math.abs(action.width - actions[0].width) < 1 && action.right <= width));
        await boundary("ready", 37, 4);
      });
    }
  }
  await page.evaluate(async () => {
    (await import("/src/store/locale.ts")).useLocaleStore().setLocale("zh");
    window.__teamNetwork.members = [];
    window.__teamNetwork.totalMembers = 0;
  });
  await check("empty-and-primary-share-keyboard-opens-sheet-once", async () => {
    for (const selector of [".team-summary__cta", ".invite-card__cta"]) {
      for (const key of ["Enter", "Space"]) {
        const button = page.locator(selector + ":visible");
        await button.scrollIntoViewIfNeeded();
        await button.focus();
        await page.keyboard.press("Tab");
        await button.focus();
        assert.equal(await button.evaluate(element => getComputedStyle(element).outlineStyle), "solid");
        await button.press(key);
        await page.locator(".ss-sheet:visible").waitFor();
        assert.equal(await page.locator(".ss-sheet:visible").count(), 1);
        assert.equal(await page.locator(".ss-sheet:visible").getAttribute("role"), "dialog");
        await page.waitForFunction(() => document.activeElement?.classList.contains("ss-head__x"));
        await page.keyboard.press("Shift+Tab");
        assert.equal(await page.locator(".ss-cancel:visible").evaluate(el => el === document.activeElement), true);
        await page.keyboard.press("Tab");
        assert.equal(await page.locator(".ss-head__x:visible").evaluate(el => el === document.activeElement), true);
        await page.keyboard.press("Escape");
        await page.locator(".ss-sheet:visible").waitFor({ state: "hidden" });
      }
    }
  });
  await check("summary-retry-is-keyboard-operable", async () => {
    await boundary("error");
    const button = page.locator(".team-summary__retry:visible");
    await button.focus();
    assert.equal(await button.evaluate(element => getComputedStyle(element).outlineStyle), "solid");
    await button.press("Enter");
    // Local network refresh is deliberately a no-op; the emitted action is covered by the unit check.
  });
  await check("share-channel-to-poster-keeps-focus-in-dialog", async () => {
    const opener = page.locator(".invite-card__cta:visible");
    await opener.focus();
    await opener.press("Enter");
    const channel = page.locator(".ss-ch:visible").filter({ hasText: "海报" });
    await channel.focus();
    await channel.press("Enter");
    await page.locator(".ps-preview:visible").waitFor();
    assert.equal(await page.locator(".ss-sheet:visible,.ps-sheet:visible").count(), 1);
    assert.equal(await page.locator(".nx-poster-dialog").evaluate(el => el.contains(document.activeElement)), true);
    const toggle = page.locator(".ps-toggle:visible");
    const before = await toggle.getAttribute("aria-checked");
    await toggle.focus();
    await toggle.press("Space");
    assert.notEqual(await toggle.getAttribute("aria-checked"), before);
    await page.locator(".ps-preview:visible").waitFor();
    assert.ok(await page.locator(".ps-ch[role='button'][tabindex='0']:visible").count() >= 2);
    await page.keyboard.press("Escape");
    await page.locator(".ps-sheet:visible").waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("invite-card__cta"));
  });
  await boundary("ready", 37, 4);
  await page.locator(".invite-card").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "team-invite.png") });
  await page.locator(".team-summary").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "team-summary.png") });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed: true, cases, errors, limitation: "Loading/error are rendered component-boundary fixtures; remote API correctness remains covered separately." }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(output, "failure.png") }).catch(() => {});
  await writeFile(resolve(output, "result.json"), JSON.stringify({ passed: false, cases, errors, failure: String(error) }, null, 2));
  throw error;
} finally {
  await page.evaluate(() => {
    if (window.__teamNetwork && window.__teamOriginal) {
      window.__teamNetwork.members = window.__teamOriginal.members;
      window.__teamNetwork.totalMembers = window.__teamOriginal.total;
    }
  }).catch(() => {});
  await context.close();
  await browser.close();
  server.stop();
}
