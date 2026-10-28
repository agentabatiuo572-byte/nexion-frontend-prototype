// @ts-expect-error This browser fixture runs in Node; App types omit Node globals.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
// @ts-expect-error This browser fixture runs in Node.
import { env } from "node:process";
import { beforeAll, afterAll, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { parse, compileScript, compileStyle } from "@vue/compiler-sfc";
import { baseParse, compile, NodeTypes, type RootNode, type TemplateChildNode } from "@vue/compiler-dom";
import ts from "typescript";
import source from "./detail.vue?raw";
import productSource from "@/components/store/product-render.vue?raw";
import stickySource from "@/components/sticky-cta-bar.vue?raw";
import buttonSource from "@/components/ui/nx-button.vue?raw";
import glassSource from "@/components/liquid-glass.vue?raw";
import { productTierCode } from "@/lib/product-image";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

// Real hero, ProductRender, StickyCtaBar, NxButton and LiquidGlass markup/styles.
// The fixture supplies a catalog photo and CTA payload, adapts UniApp's image
// element, and omits the native glass bridge. It does not build/serve the APP.
const scope = "data-v-detail-surfaces";
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const fonts = read("../../styles/fonts.css").replace(/url\("\.\.\/static\/fonts\/([^"/]+)"\)/g, (_match: string, name: string) =>
  `url("data:${name.endsWith("woff2") ? "font/woff2" : "font/ttf"};base64,${readFileSync(new URL(`../../static/fonts/${name}`, import.meta.url)).toString("base64")}")`);
const globalCss = read("../../styles/glass-surfaces.css") + read("../../styles/tokens.css").replace(/^@import[^;\r\n]+;\r?$/gm, "") + fonts;
const photo = `data:image/webp;base64,${readFileSync(new URL("../../static/img/products/uvel-pedestal/stellarbox-pro-v2.webp", import.meta.url)).toString("base64")}`;

function component(raw: string, id: string, dependencies: Record<string, unknown>) {
  const descriptor = parse(raw
    .replace(':change:glass-config="glassView.update"', "")
    .replace(/<image\b([\s\S]*?)\/>/g, (_match, attrs: string) => `<uni-image${attrs}><img :src="photo.src" alt="" /></uni-image>`),
    { templateParseOptions: { isCustomElement: tag => ["view", "text", "uni-image"].includes(tag) } }).descriptor;
  descriptor.script = null; // renderjs executes in the native view bridge, outside this fixture.
  const code = ts.transpileModule(compileScript(descriptor, { id, inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text", "uni-image"].includes(tag) } },
  }).content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Vue.Component & { __scopeId?: string } };
  new Function("require", "exports", code)((name: string) => {
    if (name === "vue") return Vue;
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected visual fixture dependency: ${name}`);
  }, exports);
  exports.default.__scopeId = id;
  return exports;
}
function styles(raw: string, id: string) {
  return parse(raw).descriptor.styles.filter(style => !style.src).map(style => {
    const result = compileStyle({ source: style.content, filename: `${id}.vue`, id, scoped: !!style.scoped });
    if (result.errors.length) throw result.errors[0];
    return result.code;
  }).join("\n");
}
const glass = component(glassSource, "data-v-fixture-glass", {});
const button = component(buttonSource, "data-v-fixture-button", { "@/components/liquid-glass.vue": glass });
const product = component(productSource, "data-v-fixture-product", {
  "@/lib/product-image": { productTierCode },
  "@/composables/use-product-image": { useProductImage: (get: () => string) => ({ imageSrc: Vue.computed(get), imageError: () => {} }) },
});
const sharedCss = [[productSource, "data-v-fixture-product"], [stickySource, "data-v-fixture-sticky"],
  [buttonSource, "data-v-fixture-button"], [glassSource, "data-v-fixture-glass"]].map(([raw, id]) => styles(raw, id)).join("\n");

function hero(node: RootNode | TemplateChildNode): string | undefined {
  if (node.type === NodeTypes.ELEMENT && node.props.some(prop => prop.type === NodeTypes.ATTRIBUTE
    && prop.name === "class" && prop.value?.content.includes("nx-glass-card overflow-hidden relative"))) return node.loc.source;
  if (node.type === NodeTypes.ROOT || node.type === NodeTypes.ELEMENT) {
    for (const child of node.children) { const result = hero(child); if (result) return result; }
  }
}
async function fixture(page: Page, raw: string, language: "zh" | "en" | "vi", theme: "light" | "dark", media: "image" | "video" | "missing" = "image") {
  const t = { zh, en, vi: vietnamese }[language];
  const descriptor = parse(raw).descriptor;
  const markup = hero(baseParse(descriptor.template!.content));
  if (!markup) throw new Error("Missing actual product hero");
  const script = ts.createSourceFile("detail.ts", descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
  const names = ["auroraStyle", "ribbonStyle", "nameStyle", "codeChip"];
  const declarations = script.statements.filter(statement => ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.some(d => names.includes(d.name.getText(script)))
    : ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text ?? "")).map(statement => statement.getText(script)).join("\n");
  const styleValues = new Function(ts.transpileModule(`${declarations}; return { ${names.join(", ")} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText)();
  const heroRender = new Function("Vue", compile(markup, { mode: "function", prefixIdentifiers: true,
    isCustomElement: tag => ["view", "text"].includes(tag),
  }).code)(Vue);
  const heroApp = Vue.createSSRApp({ __scopeId: scope, render: heroRender, setup: () => ({ ...styleValues, t,
    product: { id: "stellarbox-pro-v2", tier: "Pro", name: "UVELBox Pro v2", imageUrl: media === "missing" ? undefined : photo,
      videoUrl: media === "video" ? "data:video/mp4;base64," : undefined },
    copy: t.store.catalog["stellarbox-pro-v2"], nexGridBrandText: (name: string) => name,
    soldText: "1,234", stockUnavailable: false, stockLow: false,
  }) });
  heroApp.component("ProductRender", product.default);
  const cta = { amount: "$1,299.00", amountSubtext: `${t.bundle.estimatedDaily}: $13.00`, buttonLabel: t.store.cardBuyNow,
    href: "/pages/store/checkout?product=stellarbox-pro-v2", showTabBar: false,
    quantity: { value: 2, min: 1, max: 6, decrease: () => {}, increase: () => {} } };
  const sticky = component(stickySource, "data-v-fixture-sticky", {
    "@/components/ui/nx-button.vue": button, "@/lib/route": { navTo: () => {} },
    "@/i18n/use-t": { useT: () => Vue.ref(t) }, "@/store/sticky-cta-bar": { useStickyCTA: () => ({ cta }) },
  });
  const stickyHtml = await renderToString(Vue.createSSRApp(sticky.default));
  const scopedClass = descriptor.template!.content.includes('class="product-detail-page"') ? "product-detail-page" : "";
  await page.setContent(`<!doctype html><html lang="${language}" data-theme="${theme}"><head><style>${globalCss}${sharedCss}${styles(raw, scope)}
    body { margin:0; font-family:var(--font-v5); } view,.block,uni-image { display:block; }
    .fixture-chassis { position:relative;height:100vh;overflow:hidden;background:var(--v5-bg); }
    .fixture-scroll { position:absolute;inset:0;overflow:auto;padding-top:24px; }
    .mx-4 { margin-inline:16px; } .relative { position:relative; } .absolute { position:absolute; }
    .w-full { width:100%; } .overflow-hidden { overflow:hidden; } .border-b { border-bottom:1px solid; }
    .text-right { text-align:right; } .flex { display:flex; } .flex-wrap { flex-wrap:wrap; }
    .items-start { align-items:flex-start; } .justify-between { justify-content:space-between; }
    .min-w-0 { min-width:0; } .truncate { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
    uni-image > img { width:100%;height:100%;object-fit:contain; }
    .fixture-color { height:160px;background:linear-gradient(90deg,#ef2b2d 0 35%,#08c5ee 35% 70%,#d7f326 70%); }
    .fixture-color:nth-child(even) { background:linear-gradient(90deg,#772be6 0 50%,#f5c631 50%); }
  </style></head><body><main class="fixture-chassis ${scopedClass}" ${scope} data-page-visible="true">
    <section class="fixture-scroll">${await renderToString(heroApp)}${'<div class="fixture-color"></div>'.repeat(6)}</section>${stickyHtml}
  </main></body></html>`);
  await page.evaluate(() => document.fonts.ready);
}
async function glassFacts(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".scb-bar")!, root = getComputedStyle(bar), decoration = getComputedStyle(bar, "::before");
    const nested = Array.from(document.querySelectorAll(".scb-quantity .nx-liquid-glass")).map(glass => {
      let count = 0;
      for (let node = glass.parentElement; node; node = node.parentElement) if (getComputedStyle(node).backdropFilter !== "none") count++;
      return count;
    });
    const aura = document.querySelector('.nx-glass-card > [aria-hidden]')!;
    return { rootBlur: root.backdropFilter, decorationBlur: decoration.backdropFilter,
      decorationBackground: decoration.backgroundImage, decorationEvents: decoration.pointerEvents,
      transform: root.transform, filter: root.filter, clipPath: root.clipPath,
      buttonGlassCount: nested.length, buttonBackdropAncestors: nested,
      auraFilter: getComputedStyle(aura).filter, auraAnimation: getComputedStyle(aura).animationName };
  });
}
async function capture(page: Page, name: string) {
  if (!env.UVEL_DETAIL_SURFACES_OUTPUT) return;
  mkdirSync(env.UVEL_DETAIL_SURFACES_OUTPUT, { recursive: true });
  await page.screenshot({ path: `${env.UVEL_DETAIL_SURFACES_OUTPUT}/${name}.png` });
}
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

for (const width of [320, 390]) for (const language of ["zh", "en", "vi"] as const) for (const theme of ["light", "dark"] as const) {
  test(`${width} ${language} ${theme}: full pedestal image, one corner clip and stable glass over colored content`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    try {
      await fixture(page, source, language, theme);
      const media = page.locator(".detail-product-render"), image = media.locator("uni-image");
      expect(await media.evaluate(element => getComputedStyle(element).borderRadius)).toBe("0px");
      expect(await page.locator(".detail-hero").evaluate(element => getComputedStyle(element).borderRadius)).toBe("20px");
      const vignette = media.locator(":scope > [aria-hidden]").last();
      const fade = await vignette.evaluate(element => getComputedStyle(element).backgroundImage);
      expect(fade).not.toContain("rgb(15, 15, 15)");
      if (theme === "light") expect(fade).toContain("rgb(255, 255, 255)");
      expect(await media.locator("img").evaluate(element => (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
      const mediaBox = (await media.boundingBox())!, imageBox = (await image.boundingBox())!;
      expect(imageBox.width).toBeCloseTo(width - 32, 2); expect(imageBox.height).toBeCloseTo(mediaBox.height, 2);
      expect(await image.locator("img").evaluate(element => getComputedStyle(element).objectFit)).toBe("contain");
      const facts = await glassFacts(page);
      expect(facts).toMatchObject({ rootBlur: "none", decorationBlur: "blur(22px) saturate(1.8)", decorationEvents: "none",
        transform: "none", filter: "none", clipPath: "none", buttonGlassCount: 2, buttonBackdropAncestors: [0, 0],
        auraFilter: "none", auraAnimation: "none" });
      expect(facts.decorationBackground).toContain("rgba(");
      const bar = page.locator(".scb-outer"), before = await bar.boundingBox();
      await capture(page, `detail-${width}-${language}-${theme}`);
      for (const scroll of [170, 330, 510, 700, 510, 330, 170, 0]) {
        await page.locator(".fixture-scroll").evaluate((element, top) => { element.scrollTop = top; }, scroll);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        expect(await bar.boundingBox()).toEqual(before);
        expect(await page.locator(".scb-price-num").textContent()).toBe("1,299.00");
      }
      for (const selector of [".scb-cta", ".scb-quantity .nx-button"]) {
        const hit = await page.locator(selector).last().evaluate(element => {
          const box = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        });
        expect(hit).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { await page.close(); }
  });
}

test("automatic image motion runs without hover, has 4px travel, and pauses for scrolling, reduced motion or a hidden page", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    await fixture(page, source, "en", "light");
    const image = page.locator(".detail-product-render uni-image");
    const motion = await image.evaluate(async element => {
      const animation = element.getAnimations()[0], start = Number(animation.currentTime);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const advanced = Number(animation.currentTime) > start;
      animation.pause(); animation.currentTime = 0;
      const low = element.getBoundingClientRect().y;
      animation.currentTime = 2500;
      return { advanced, duration: animation.effect!.getTiming().duration, iterations: animation.effect!.getTiming().iterations,
        travel: low - element.getBoundingClientRect().y };
    });
    expect(motion).toEqual({ advanced: true, duration: 5000, iterations: Infinity, travel: 4 });
    await page.locator(".product-detail-page").evaluate(element => element.setAttribute("data-scrolling", "true"));
    expect(await image.evaluate(element => getComputedStyle(element).animationPlayState)).toBe("paused");
    await page.locator(".product-detail-page").evaluate(element => element.setAttribute("data-scrolling", "false"));
    expect(await image.evaluate(element => getComputedStyle(element).animationPlayState)).toBe("running");
    await page.locator(".product-detail-page").evaluate(element => element.setAttribute("data-page-visible", "false"));
    expect(await image.evaluate(element => getComputedStyle(element).animationPlayState)).toBe("paused");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await image.evaluate(element => ({ animation: getComputedStyle(element).animationName, transform: getComputedStyle(element).transform })))
      .toEqual({ animation: "none", transform: "none" });
  } finally { await page.close(); }
});

test.each(["video", "missing"] as const)("%s media retains its existing static behavior", async kind => {
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
  try {
    await fixture(page, source, "vi", "dark", kind);
    expect(await page.locator(".detail-product-render uni-image").count()).toBe(0);
    expect(await page.locator(".detail-product-render").evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    if (kind === "video") expect(await page.locator("video").getAttribute("controls")).not.toBeNull();
    else expect(await page.locator(".detail-product-render svg").count()).toBe(1);
  } finally { await page.close(); }
});

test.runIf(!!env.UVEL_DETAIL_SURFACES_BASELINE)("records the original nested glass and hero defects from the saved source", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    await fixture(page, readFileSync(env.UVEL_DETAIL_SURFACES_BASELINE!, "utf8"), "en", "light");
    const before = await glassFacts(page);
    expect(before).toMatchObject({ rootBlur: "blur(22px) saturate(1.8)", buttonBackdropAncestors: [1, 1], auraFilter: "blur(10px)" });
    expect(before.auraAnimation).toBe("v5-aurora-drift");
    await capture(page, "detail-baseline-390-en-light");
    await fixture(page, source, "en", "light");
    const after = await glassFacts(page);
    if (env.UVEL_DETAIL_SURFACES_OUTPUT) writeFileSync(`${env.UVEL_DETAIL_SURFACES_OUTPUT}/glass-before-after.json`, JSON.stringify({ before, after }, null, 2));
  } finally { await page.close(); }
});
