import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTrialDate } from "@/lib/trial-date";
import source from "./stake-sheet.vue?raw";

// Execute the production computed callback and day constant with the real formatter.
const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
const ast = ts.createSourceFile("stake-sheet.ts", script, ts.ScriptTarget.Latest, true);
let dayConstant = "";
let dateCallback = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node)) {
    if (node.name.getText(ast) === "ONE_DAY_MS") dayConstant = node.getText(ast);
    if (node.name.getText(ast) === "unlockDateText" && node.initializer && ts.isCallExpression(node.initializer)) {
      dateCallback = node.initializer.arguments[0].getText(ast);
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (!dayConstant || !dateCallback) throw new Error("Staking unlock date consumer missing");
const compiled = ts.transpileModule(`const ${dayConstant}; return (${dateCallback})();`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
function unlockDateText(term: number | null): string {
  return new Function("props", "formatTrialDate", "dateLocale", compiled)(
    { term }, formatTrialDate, () => "zh-CN",
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("BUG 417 staking unlock date", () => {
  for (const [zone, expectedDate] of [
    ["Asia/Tokyo", "2026-11-03"],
    ["Asia/Ho_Chi_Minh", "2026-11-02"],
  ]) {
    it.each(["missing Intl", "ignored locale"])(`${zone} keeps the local numeric date with Android %s`, (mode) => {
      vi.stubEnv("TZ", zone);
      if (mode === "missing Intl") vi.stubGlobal("Intl", undefined);
      vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-03T15:01:02Z"));
      const nativeLocale = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (this: Date) {
        return this.toDateString();
      });

      expect(unlockDateText(30)).toBe(expectedDate);
      expect(nativeLocale).not.toHaveBeenCalled();
    });
  }

  it("keeps an unknown term empty without calculating an unlock instant", () => {
    const clock = vi.spyOn(Date, "now");
    expect(unlockDateText(null)).toBe("");
    expect(clock).not.toHaveBeenCalled();
  });
});
