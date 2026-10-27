import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import * as dates from "@/lib/display-date";
import { displayGenesisHoldingId } from "@/lib/genesis-holding-id";
import * as presentation from "@/lib/genesis-marketplace-presentation";
import listing from "./listing-card.vue?raw";
import activity from "./activity-row.vue?raw";
import nft from "./nft-card.vue?raw";

// Compile the production setup AND template, preserving the actual money consumers.
async function render(source: string, props: Record<string, unknown>, copy: typeof en) {
  const script = compileScript(parse(source).descriptor, { id: "genesis-price", inlineTemplate: true });
  const code = ts.transpileModule(script.content, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  }}).outputText;
  const imports: Record<string, unknown> = {
    vue: Vue, "@/lib/genesis-marketplace-presentation": presentation,
    "@/components/genesis/genesis-artwork.vue": { default: { render: () => null } },
    "@/lib/genesis-holding-id": { displayGenesisHoldingId },
    "@/i18n/use-t": { useT: () => Vue.ref(copy) }, "@/i18n/format": { fmt, dateLocale: () => copy === zh ? "zh" : copy === vietnamese ? "vi" : "en" },
    "@/lib/display-date": dates,
  };
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in imports)) throw new Error(`Unexpected price import: ${id}`);
    return imports[id];
  }, exports);
  const app = Vue.createSSRApp(exports.default, props);
  app.component("GenesisArtwork", { render: () => null });
  return renderToString(app);
}

it.each([en, zh, vietnamese])("renders exact live listing, purchase, last sale and activity prices in each locale", async copy => {
  for (const [amount, text] of [[0.000001, "0.000001"], [1.234567, "1.234567"], [7999.2, "7999.20"]] as const) {
    const l = { tokenId: "G4P-ONE-01", priceUSDT: amount, lastSaleUSDT: amount,
      seller: "owner", listedAt: Date.now(), traits: { tier: "ONE", boost: "", mintYear: 2026 } };
    const listingHtml = await render(listing, { l }, copy);
    expect(listingHtml).toContain(`$${text}`);
    expect(listingHtml).toContain(fmt(copy.marketplace.lastSale, { price: text }));
    expect(listingHtml).not.toContain("$0.00<");
    expect(await render(nft, { id: l.tokenId, price: amount, ago: "1m" }, copy)).toContain(`$${text}`);
    expect(await render(activity, { e: { id: "sale-one", kind: "sale", tokenId: l.tokenId,
      priceUSDT: amount, from: "owner", to: "buyer", ts: Date.now() }, isLast: true }, copy)).toContain(`$${text}`);
  }
});
