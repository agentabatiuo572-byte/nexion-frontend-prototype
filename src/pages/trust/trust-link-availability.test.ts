import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./trust.vue?raw";

const script = page.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1];
const source = ts.createSourceFile("trust.ts", script, ts.ScriptTarget.Latest, true);
const functions = source.statements.filter(ts.isFunctionDeclaration)
  .filter((item) => ["safeHref", "openHref"].includes(item.name?.text ?? ""))
  .map((item) => item.getText(source)).join("\n");
const body = ts.transpileModule(`${functions}; return { safeHref, openHref };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup() {
  const navTo = vi.fn(), error = vi.fn(), open = vi.fn(() => ({}));
  const copy = { linkUnavailable: "Link unavailable", openFailed: "Opening failed" };
  vi.stubGlobal("window", { open });
  const actual = new Function("navTo", "toast", "t", body)(navTo, { error }, { value: { trust: copy } }) as {
    safeHref(raw: string): string | null; openHref(raw: string): void;
  };
  return { ...actual, navTo, error, open, copy };
}
afterEach(() => vi.unstubAllGlobals());

describe("Trust report link availability uses the actual page handler", () => {
  it.each(["", "   ", "javascript:alert(1)", "data:text/html,hello", "http://example.com/a.pdf",
    "https://user:password@example.com/a.pdf", "//example.com/a.pdf", "/pages/me/me?token=private", "not a URL"])(
    "explicitly reports an unavailable link without opening %j", (raw) => {
      const view = setup();
      expect(view.safeHref(raw)).toBeNull();
      view.openHref(raw);
      expect(view.open).not.toHaveBeenCalled();
      expect(view.navTo).not.toHaveBeenCalled();
      expect(view.error).toHaveBeenCalledOnce();
      expect(view.error).toHaveBeenCalledWith(view.copy.linkUnavailable);
    },
  );
  it("retains valid HTTPS and internal page navigation", () => {
    const view = setup();
    view.openHref(" https://example.com/report.pdf ");
    expect(view.open).toHaveBeenCalledWith("https://example.com/report.pdf", "_blank");
    view.openHref("/pages/trust/nex");
    expect(view.navTo).toHaveBeenCalledWith("/pages/trust/nex");
    expect(view.error).not.toHaveBeenCalled();
  });
  it("keeps the existing failed-opening feedback", () => {
    const view = setup();
    view.open.mockReturnValue(null as unknown as object);
    view.openHref("https://example.com/report.pdf");
    expect(view.error).toHaveBeenCalledWith(view.copy.openFailed);
  });
  it("does not render published listing claims without a verified source contract", () => {
    const template = page.slice(0, page.indexOf("<script setup"));
    expect(template).not.toMatch(/listingRows|listingsSection|row\.Exchange|row\.State/);
    expect(script).not.toMatch(/listingRows|listingsSection/);
  });
});
