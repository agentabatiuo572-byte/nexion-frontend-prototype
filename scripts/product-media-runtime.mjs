#!/usr/bin/env node
// Isolated presentation acceptance. Catalog phase and listing fixtures stay in disposable contexts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ensureServer } from "./lib/dev-server-pool.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, ".codex-run/uvel-product-media");
const ids = ["stellarbox-s1", "stellarbox-pro", "stellarbox-pro-v2", "stellarrack-p1", "stellarrack-p2", "cloud-share"];
const assetPath = id => `/static/img/products/uvel-v3/${id}.png`;
const evidence = [];
let browser, server;
async function go(page, base, route) {
  // Use uni navigation to mount the requested page and run its onLoad query handling.
  if (page.url().startsWith(base)) {
    await page.evaluate(route => uni.reLaunch({ url: route }), route);
    await page.waitForURL(`${base}/?nx_device_inner=1#${route}`);
  } else {
    await page.goto(`${base}/?nx_device_inner=1#${route}`, { waitUntil: "domcontentloaded" });
  }
}
async function login(page, base) {
  await go(page, base, "/pages/login/login");
  await page.locator('.lg-wrap[data-preview-account-status="ready"]').waitFor();
  await page.getByTestId("mock-preview-password").locator("input").press("Enter");
  await page.waitForURL(/#\/$|#\/pages\/index\/index|pages\/onboarding\/connect/);
  if (page.url().includes("/onboarding/connect")) {
    await page.locator(".cn-back").click();
    await page.evaluate(() => uni.reLaunch({ url: "/pages/index/index" }));
  }
  await page.locator(".home-earnings-cluster").waitFor();
  await page.evaluate(async () => (await import("/src/store/product-phase.ts")).useProductPhaseOverride().setPinned("P6"));
}
async function imageState(locator, expected) {
  await locator.waitFor();
  await locator.locator("img").evaluate(img => img.decode());
  const value = await locator.evaluate(e => {
    const img = e.querySelector("img");
    const rect = e.getBoundingClientRect();
    const style = getComputedStyle(e);
    return { src: new URL(img.src).pathname, loaded: img.complete, natural: [img.naturalWidth, img.naturalHeight],
      mode: e.getAttribute("mode"), backgroundSizes: [...e.querySelectorAll("div")].map(d => getComputedStyle(d).backgroundSize),
      width: rect.width, height: rect.height, left: rect.left, right: rect.right,
      filter: style.filter, opacity: style.opacity, mask: style.maskImage, viewport: innerWidth };
  });
  assert.equal(value.src, assetPath(expected));
  assert.deepEqual(value.natural, [1254, 1254]);
  assert.ok(value.loaded && value.width > 0 && value.height > 0);
  if (expected === "genesis" || expected === "genesis-holder-base") {
    assert.ok(Math.abs(value.width - value.height) < 1, `${expected}: square Genesis artwork without side bars`);
  }
  assert.ok(value.mode === "aspectFit" || value.backgroundSizes.includes("contain"), "complete source image fits its frame: " + JSON.stringify(value));
  assert.equal(value.filter, "none");
  assert.equal(value.opacity, "1");
  assert.equal(value.mask, "none");
  assert.ok(value.left >= -1 && value.right <= value.viewport + 1, "image remains within viewport");
  return value;
}
async function capture(page, name, locator) {
  const backdrop = page.locator(".ms-backdrop");
  if (await backdrop.count()) await backdrop.click({ position: { x: 4, y: 4 } });
  await locator.evaluate(e => e.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: resolve(out, `${name}.png`), animations: "disabled" });
}
async function titleState(locator) {
  const value = await locator.evaluate(e => ({ text: e.textContent, fontSize: getComputedStyle(e).fontSize,
    width: e.getBoundingClientRect().width, left: e.getBoundingClientRect().left,
    right: e.getBoundingClientRect().right, overflow: e.scrollWidth > e.clientWidth + 1, viewport: innerWidth }));
  assert.ok(value.width > 0 && value.left >= -1 && value.right <= value.viewport + 1 && !value.overflow,
    "store title fits without clipping: " + JSON.stringify(value));
  return value;
}
async function runCase(base, locale, theme, width) {
  const name = `${locale}-${theme}-${width}`;
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const result = { name, products: [], sources: [], components: [] };
  try {
    await login(page, base);
    await page.evaluate(async ({ locale, theme }) => {
      (await import("/src/store/theme.ts")).useTheme().setMode(theme);
      (await import("/src/store/locale.ts")).useLocaleStore().setLocale(locale);
    }, { locale, theme });
    const promo = page.locator(".weekly-quest__product");
    await page.locator("#home-task-carousel").press("ArrowRight");
    await page.waitForFunction(() => {
      const photo = document.querySelector('.weekly-quest[aria-hidden="false"] .weekly-quest__product');
      return photo && photo.getBoundingClientRect().right <= innerWidth;
    });
    const promoId = await page.evaluate(async () => {
      const app = (await import("/src/store/app.ts")).useApp();
      return (await import("/src/store/device-types.ts")).derivePromoUpgrade(app.visibleDevices).targetKind;
    });
    result.sources.push(await imageState(promo, promoId));
    const overlap = await page.locator(".weekly-quest").evaluate(e => {
      const image = e.querySelector(".weekly-quest__product").getBoundingClientRect();
      const body = e.querySelector(".weekly-quest__body").getBoundingClientRect();
      const cta = e.querySelector(".weekly-quest__cta").getBoundingClientRect();
      return { bodyOverlaps: body.right > image.left + 1 && body.bottom > image.top, ctaOverlaps: cta.top < image.bottom - 1 };
    });
    assert.deepEqual(overlap, { bodyOverlaps: false, ctaOverlaps: false }, "homepage image must not overlap the copy or action");
    await capture(page, `${name}-home`, promo);
    await go(page, base, "/pages/store/store");
    const productNames = await page.evaluate(async () => Object.fromEntries((await import("/src/mock/products.ts")).PRODUCTS.map(p => [p.id, p.name])));
    for (const id of ids) {
      const photo = page.locator(`uni-image[data-product-id="${id}"]`);
      result.products.push({ id, list: await imageState(photo, id),
        title: await titleState(photo.locator("xpath=../..").getByText(productNames[id], { exact: true })) });
      const frame = result.products.at(-1).list;
      assert.ok(Math.abs(frame.width - frame.height) < 1, `${id}: square store image without side bars`);
      await capture(page, `${name}-store-${id}`, photo);
    }
    result.sources.push(await imageState(page.locator('.genesis-artwork[data-art-context="showcase"] uni-image'), "genesis"));
    const genesisTitle = await page.evaluate(async () => (await import("/src/i18n/use-t.ts")).getT().store.genesisCardTitle);
    result.genesisTitle = await titleState(page.getByText(genesisTitle, { exact: true }));
    assert.equal(result.genesisTitle.fontSize, result.products[0].title.fontSize, "Genesis uses the same store title size");
    await capture(page, `${name}-store-genesis`, page.locator(".genesis-artwork"));
    await page.evaluate(async () => (await import("/src/store/product-phase.ts")).useProductPhaseOverride().setPinned("P1"));
    await go(page, base, "/pages/store/store");
    result.lockedTitles = [];
    for (const id of ["stellarbox-pro-v2", "stellarrack-p2"]) {
      const title = await titleState(page.getByText(productNames[id], { exact: true }));
      assert.equal(title.fontSize, result.products.find(p => p.id === id).title.fontSize, "locked and available titles match");
      result.lockedTitles.push(title);
    }
    await page.evaluate(async () => (await import("/src/store/product-phase.ts")).useProductPhaseOverride().setPinned("P6"));
    for (const entry of result.products) {
      await go(page, base, `/pages/store/detail?id=${entry.id}`);
      const photo = page.locator(`.product-render[data-product-id="${entry.id}"] uni-image`);
      entry.detail = await imageState(photo, entry.id);
      entry.detailTitleSize = await photo.locator("xpath=../../..").getByText(productNames[entry.id], { exact: true })
        .evaluate(e => getComputedStyle(e).fontSize);
      assert.equal(entry.title.fontSize, entry.detailTitleSize, "store and detail product title sizes match");
      await capture(page, `${name}-detail-${entry.id}`, photo);
      const words = await page.evaluate(async locale => (await import(`/src/i18n/messages/${locale}.ts`))[locale].store, locale);
      assert.ok(await page.getByText(words.detTrustedBy, { exact: true }).isVisible(), "trust heading is present");
      entry.faq = [];
      for (const item of Object.values(words.faq)) {
        const toggle = page.getByRole("button", { name: item.q, exact: true });
        if (await page.getByText(item.a, { exact: true }).isVisible()) {
          await toggle.click();
          await page.getByText(item.a, { exact: true }).waitFor({ state: "detached" });
        }
        await toggle.click();
        await page.getByText(item.a, { exact: true }).waitFor({ state: "visible" });
        assert.ok(await page.getByText(item.a, { exact: true }).isVisible(), "FAQ answer expands");
        entry.faq.push({ question: item.q, answer: item.a });
        if (entry.id === "cloud-share") await capture(page, `${name}-faq-${entry.faq.length}`, toggle);
        await toggle.press("Enter");
        await page.getByText(item.a, { exact: true }).waitFor({ state: "detached" });
        assert.equal(await page.getByText(item.a, { exact: true }).count(), 0, "FAQ closes with keyboard");
      }
      if (entry.id === "cloud-share") {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: words.faq.refund.q, exact: true }).click();
        await page.getByText(words.faq.refund.a, { exact: true }).waitFor({ state: "visible" });
        assert.ok(await page.getByText(words.faq.refund.a, { exact: true }).isVisible(), "updated copy survives reload");
      }
    }
    await go(page, base, "/pages/genesis/genesis");
    result.sources.push(await imageState(page.locator('.genesis-artwork[data-art-context="showcase"] uni-image'), "genesis"));
    assert.equal(await page.locator(".genesis-artwork__serial").count(), 0, "campaign number exists in the asset only");
    await capture(page, `${name}-genesis`, page.locator(".genesis-artwork").first());
    // Remote listing and live-market cards are empty in fixed-mock mode. Mount their actual
    // exported components in the same browser context to test representative supplied identities.
    await page.evaluate(async () => {
      const { createApp, h } = await import("/node_modules/@dcloudio/uni-h5-vue/dist/vue.runtime.esm.js");
      const components = await Promise.all(["listing-card", "my-token-card", "nft-card"].map(name => import(`/src/components/genesis/${name}.vue`).then(m => m.default)));
      const props = [{ l: { tokenId: 903, holdingNo: "HOLD-7A", priceUSDT: 1200, lastSaleUSDT: null, seller: "fixture", listedAt: Date.now(), traits: { tier: "Genesis", boost: "", mintYear: 2026 } }, disabled: true }, { tokenId: 904 }, { id: 905, price: 1.2, ago: "1m" }];
      document.querySelector("uni-app").style.display = "none";
      const host = document.createElement("div");
      host.id = "artwork-fixture";
      host.style.cssText = "position:fixed;inset:0;z-index:2000;overflow:auto;padding:16px;display:grid;grid-template-columns:1fr 1fr;align-content:start;gap:12px;box-sizing:border-box;background:var(--v5-bg)";
      document.body.append(host);
      const app = createApp({ render: () => components.map((component, index) => h("div", { "data-card": index }, [h(component, props[index])])) });
      const original = document.querySelector("#app").__vue_app__;
      app._context.provides = original._context.provides;
      for (const [name, component] of Object.entries(original._context.components)) app.component(name, component);
      app.mount(host);
    });
    for (const [index, serial] of ["No.HOLD-7A", "No.0904", "No.0905"].entries()) {
      const card = page.locator(`[data-card="${index}"]`);
      result.components.push(await imageState(card.locator("uni-image"), "genesis-holder-base"));
      assert.equal(await card.locator(".genesis-artwork__serial").innerText(), serial);
    }
    await page.screenshot({ path: resolve(out, `${name}-holding-components.png`), animations: "disabled" });
    assert.deepEqual(errors, []);
    evidence.push(result);
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(await page.locator("body").innerText());
    await page.screenshot({ path: resolve(out, `${name}-media-failed.png`) });
    throw error;
  } finally { await context.close(); }
}
try {
  await mkdir(out, { recursive: true });
  server = await ensureServer({ root, reuseUrl: process.env.UNI_BASE_URL || "http://127.0.0.1:5174" });
  browser = await chromium.launch({ headless: true });
  const hashes = [];
  for (const id of [...ids, "genesis", "genesis-holder-base"]) {
    const response = await fetch(server.baseUrl + assetPath(id));
    assert.equal(response.status, 200);
    const served = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(served, await readFile(resolve(root, "src" + assetPath(id))), `${id}: HTTP serves exact original bytes`);
    hashes.push({ id, sha256: createHash("sha256").update(served).digest("hex") });
  }
  for (const locale of ["zh", "en", "vi"]) {
    for (const theme of ["dark", "light"]) {
      for (const width of [320, 390]) await runCase(server.baseUrl, locale, theme, width);
    }
  }
  await writeFile(resolve(out, "media-result.json"), JSON.stringify({ verdict: "pass", executedAt: new Date().toISOString(), hashes, evidence }, null, 2));
  console.log(`Product media: ${evidence.length}/12, exact assets ${hashes.length}/8. Evidence: ${out}`);
} finally { await browser?.close(); server?.stop(); }
