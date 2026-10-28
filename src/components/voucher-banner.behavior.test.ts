import { computed } from "vue";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./voucher-banner.vue?raw";
import { voucherSupportsSurface } from "@/lib/voucher-sheet-authority";

const ast = ts.createSourceFile("banner.ts", parse(source).descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
const names = new Set(["claimable", "offers", "visible"]);
const code = ts.transpileModule(ast.statements.filter(node =>
  ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(ast)))
  || ts.isFunctionDeclaration(node) && node.name?.text === "open",
).map(node => node.getText(ast)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

it.each(["home", "store", "me", "earn"] as const)("actual banner opens unrestricted offers on the %s surface and respects explicit restrictions", surface => {
  const unrestricted = { id: "all", claimSurfaces: [] }, storeOnly = { id: "store", claimSurfaces: ["store"] };
  const voucher = { remoteStatus: 'ready', claimableVouchers: [unrestricted, storeOnly], claimedUnused: [], presentationClaimable: [unrestricted, storeOnly], presentationOffers: [unrestricted, storeOnly] };
  const sheet = { show: vi.fn() }, navTo = vi.fn();
  const view = new Function("computed", "voucher", "props", "sheet", "navTo", "voucherSupportsSurface", "remoteApiEnabled", code + ";return {claimable,visible,open};")
    (computed, voucher, { surface }, sheet, navTo, voucherSupportsSurface, true);
  expect(view.visible.value).toBe(true);
  expect(view.claimable.value.map((v: { id: string }) => v.id)).toEqual(surface === "store" ? ["all", "store"] : ["all"]);
  view.open();
  expect(sheet.show).toHaveBeenCalledExactlyOnceWith(surface);
  expect(navTo).not.toHaveBeenCalled();
});
