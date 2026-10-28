// @ts-expect-error This browser fixture runs in Node; the App tsconfig omits Node globals.
import { readFileSync, mkdirSync } from "node:fs";
// @ts-expect-error This browser fixture runs in Node.
import { env } from "node:process";
import { beforeAll, afterAll, expect, test } from "vitest";
import { chromium, type Browser } from "playwright";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { baseParse, compile, NodeTypes, type RootNode, type TemplateChildNode } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import source from "./trial.vue?raw";
import machineSource from "@/components/catalog-machine-image.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

// Actual ended-card markup, local styles, catalog-image markup and project tokens.
// Only the image transport/UniApp image element are adapted for this serverless
// Chromium fixture; page handlers and cache failures are covered by behavior tests.
const descriptor = parse(source).descriptor;
const machine = parse(machineSource).descriptor;
// Read the stylesheet text directly, bypassing Vitest's CSS processing.
const tokens = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");
const glass = readFileSync(new URL("../../styles/glass-surfaces.css", import.meta.url), "utf8");
const fonts = readFileSync(new URL("../../styles/fonts.css", import.meta.url), "utf8");
function findEnded(node: RootNode | TemplateChildNode): string | undefined {
  if (node.type === NodeTypes.ELEMENT && node.props.some(prop => prop.type === NodeTypes.ATTRIBUTE
    && prop.name === "data-testid" && prop.value?.content === "trial-ended")) return node.loc.source;
  if (node.type === NodeTypes.ROOT || node.type === NodeTypes.ELEMENT) {
    for (const child of node.children) { const result = findEnded(child); if (result) return result; }
  }
}
const fragment = findEnded(baseParse(descriptor.template!.content));
if (!fragment) throw new Error("Missing production ended card");
function render(markup: string): Vue.RenderFunction {
  return new Function("Vue", compile(markup, { mode: "function", prefixIdentifiers: true,
    isCustomElement: tag => ["view", "text"].includes(tag),
  }).code)(Vue);
}
const cardRender = render(fragment.replace('v-else-if="status === \'ended\'"', ""));
const machineRender = render(machine.template!.content.replace(/<image\b/g, "<img"));
const names = ["terminalCardStyle", "idleTitleStyle", "idleBodyStyle", "idleCtaStyle", "idleCtaDisabledStyle", "reasonNoteStyle"];
const declarations = names.map(name => {
  const declaration = descriptor.scriptSetup!.content.match(new RegExp(`^const ${name}: CSSProperties = .*;$`, "m"))?.[0];
  if (!declaration) throw new Error(`Missing production style ${name}`);
  return declaration;
});
const styles = new Function(ts.transpileModule(`${declarations.join("\n")}\nreturn { ${names.join(", ")} };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText)();
const asset = `data:image/png;base64,${readFileSync(new URL("../../static/img/products/uvel-v3/stellarbox-s1.png", import.meta.url)).toString("base64")}`;
const embeddedFonts = fonts.replace(/url\("\.\.\/static\/fonts\/([^"/]+)"\)/g, (_match: string, name: string) => {
  const mime = name.endsWith("woff2") ? "font/woff2" : "font/ttf";
  return `url("data:${mime};base64,${readFileSync(new URL(`../../static/fonts/${name}`, import.meta.url)).toString("base64")}")`;
});
const css = [glass, tokens.replace(/^@import[^;\r\n]+;\r?$/gm, ""), embeddedFonts,
  ...descriptor.styles.map(style => style.content), ...machine.styles.map(style => style.content)].join("\n");
const CatalogMachineImage = Vue.defineComponent({
  props: ["sku", "imageUrl", "scopeKey"], render: machineRender,
  setup: props => ({ ready: Vue.computed(() => !!props.imageUrl),
    frame: Vue.computed(() => props.imageUrl ? { key: props.sku, src: props.imageUrl, load: () => {}, error: () => {} } : null) }),
});
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

for (const width of [320, 390]) {
  for (const locale of ["zh", "en", "vi"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`${width}px ${locale} ${theme}: ended device and fallback leave full-width copy and purchase readable`, async () => {
        const t = { zh, en, vi: vietnamese }[locale];
        const page = await browser.newPage({ viewport: { width, height: 640 } });
        try {
          for (const withImage of [true, false]) {
            const app = Vue.createSSRApp({ render: cardRender, setup: () => ({ ...styles, t,
              trialProductId: "stellarbox-s1", trialProduct: { imageUrl: withImage ? asset : undefined },
              productCatalogState: { status: "ready" }, trialProductUnavailable: false,
              trialCatalogLoading: false, trialBuyCtaText: t.trial.buyCtaPlain, goCheckout: () => {},
            }) });
            app.component("CatalogMachineImage", CatalogMachineImage);
            const html = await renderToString(app);
            await page.setContent(`<!doctype html><html data-theme="${theme}" lang="${locale}"><head><style>${css}
              body { margin:0;padding:24px 16px;background:var(--v5-bg);font-family:var(--font-v5); }
              view,.block { display:block; } .inline-flex { display:inline-flex; }
              .items-center { align-items:center; } .justify-center { justify-content:center; }
              img { object-fit:contain; }
            </style></head><body>${html}</body></html>`);
            await page.evaluate(() => document.fonts.ready);
            expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
              .toBe(theme === "dark" ? "rgb(0, 0, 0)" : "rgb(244, 241, 233)");
            const card = page.locator('[data-testid="trial-ended"]');
            const art = card.locator(".trial-ended-art");
            const title = card.locator(":scope > text").nth(0);
            const body = card.locator(":scope > text").nth(1);
            const button = card.locator('[role="button"]');
            const cardBox = (await card.boundingBox())!, artBox = (await art.boundingBox())!;
            const titleBox = (await title.boundingBox())!, bodyBox = (await body.boundingBox())!, buttonBox = (await button.boundingBox())!;
            expect(artBox.width).toBe(112); expect(artBox.height).toBe(104);
            expect(titleBox.y).toBeGreaterThanOrEqual(artBox.y + artBox.height + 12);
            expect(bodyBox.width).toBe(cardBox.width - 40);
            expect(buttonBox.y).toBeGreaterThanOrEqual(bodyBox.y + bodyBox.height + 16);
            expect(buttonBox.height).toBe(48);
            expect(buttonBox.x).toBeGreaterThanOrEqual(cardBox.x + 20);
            expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width - 20);
            expect(await title.textContent()).toBe(t.trial.endedTitle);
            expect(await body.textContent()).toBe(t.trial.endedDesc);
            expect(await body.evaluate(element => ({ font: getComputedStyle(element).fontSize,
              overflow: element.scrollWidth > element.clientWidth,
              clipped: getComputedStyle(element).overflow === "hidden" }))).toEqual({ font: "12px", overflow: false, clipped: false });
            expect(await button.textContent()).toBe(t.trial.buyCtaPlain);
            expect(await button.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
            expect(await art.getAttribute("aria-hidden")).toBe("true");
            expect(await card.locator(".catalog-machine-image").getAttribute("data-image-state")).toBe(withImage ? "ready" : "unavailable");
            if (withImage) expect(await art.locator("img").evaluate(element => (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
            else expect(await art.locator(".catalog-machine-image__placeholder").count()).toBe(1);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            if (env.UVEL_TRIAL_LAYOUT_OUTPUT) {
              mkdirSync(env.UVEL_TRIAL_LAYOUT_OUTPUT, { recursive: true });
              await page.screenshot({ path: `${env.UVEL_TRIAL_LAYOUT_OUTPUT}/trial-ended-${width}-${locale}-${theme}-${withImage ? "image" : "fallback"}.png` });
            }
          }
        } finally { await page.close(); }
      });
    }
  }
}
