import { describe, expect, it } from "vitest";
import { computed, reactive } from "vue";
import ts from "typescript";
import { formatUsdOverviewParts } from "@/lib/usd-display";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";

const LOCALES = [
  { name: "zh", teamV3: zh.teamV3 },
  { name: "en", teamV3: en.teamV3 },
  { name: "vi", teamV3: vi.teamV3 },
] as const;

const ledgerCard = readFileSync(new URL("./team-ledger-card.vue", import.meta.url), "utf8");

describe("cooling label never asserts a period the page does not know", () => {
  it("keeps every locale's cooling label free of a hard-coded day count", () => {
    for (const { name, teamV3 } of LOCALES) {
      const label = teamV3.coolingDown;
      expect(label, name).toBeTruthy();
      expect(label, `${name} 仍写死了天数:${label}`).not.toMatch(/\d/);
    }
  });

  it("renders that label on the ledger card, so the assertion above is load-bearing", () => {
    expect(ledgerCard).toContain("t.teamV3.coolingDown");
  });

  it.each([[999.995, "1,000", "00"], [0.145, "0", "15"], [0.0003,"0","01"]] as const)(
    "separates rounded monthly amount parts without losing a carry: %s", (monthUSDT, integer, fraction) => {
      const script = ledgerCard.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1];
      const ast = ts.createSourceFile("ledger.ts", script, ts.ScriptTarget.ES2022, true);
      const names = ["hasAmounts", "monthUSDTParts", "intPart", "fracPart"];
      const statements = ast.statements.filter(statement => ts.isVariableStatement(statement)
        && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(ast))));
      expect(statements).toHaveLength(4);
      const code = ts.transpileModule(statements.map(statement => statement.getText(ast)).join("\n"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const props = reactive({ monthUSDT, available: true, failed: false });
      const view = new Function("computed", "props", "formatUsdOverviewParts", `${code}; return {intPart, fracPart, monthUSDTParts};`)(computed, props, formatUsdOverviewParts);
      expect(view.intPart.value).toBe(integer);
      expect(view.fracPart.value).toBe(fraction);
      expect(view.monthUSDTParts.value.prefix).toBe(monthUSDT < .01 ? '<$' : '$');
      expect(props.monthUSDT).toBe(monthUSDT);
    });
});
