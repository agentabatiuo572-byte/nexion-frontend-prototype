// @ts-expect-error This regression check runs in Node.
import { readFileSync, readdirSync } from "node:fs";
// @ts-expect-error This regression check runs in Node.
import { fileURLToPath } from "node:url";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { expect, it } from "vitest";
import { formatAmount } from "./amount-display";
import { en } from "../i18n/messages/en";
import { zh } from "../i18n/messages/zh";
import { vi } from "../i18n/messages/vi";
import { EVENTS } from "../mock/events";
import { PRODUCTS } from "../mock/products";

function staticCurrencyAmounts(text: string): string[] {
  const number = String.raw`\d(?:[\d,.]*\d)?`;
  const units = "(?:USDT|NEX|VND|USD|₫|美元)";
  const rates = new RegExp(String.raw`\b1\s+(?:NEX|USDT)\s*(?:=|≈)\s*\$?(?:\{[^}]+\}|—|${number})(?:\s*${units})?`, "g");
  const amounts = new RegExp(String.raw`\$\s*(${number})[KMBkmb]?|(?:(${number})[KMBkmb]?\s*[–-]\s*)?(${number})[KMBkmb]?\s*${units}(?![A-Za-z])`, "g");
  return [...text.replace(rates, "").matchAll(amounts)].flatMap(match => [match[1], match[2], match[3]].filter((value): value is string => value !== undefined));
}

function hasTwoDecimals(amount: string): boolean {
  return /^(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(amount)
    || /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(amount);
}

function messageStrings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => messageStrings(child, path ? `${path}.${key}` : key));
}

it.each([["en", en], ["zh", zh], ["vi", vi]] as const)("uses two decimals for every static currency amount in %s messages", (_locale, messages) => {
  const violations = messageStrings(messages).flatMap(([key, text]) => staticCurrencyAmounts(text)
    .filter(amount => !hasTwoDecimals(amount)).map(amount => `${key}: ${amount}`));
  expect(violations).toEqual([]);
});

it.each([["event", EVENTS], ["product", PRODUCTS]] as const)("uses two decimals in static %s catalog copy", (_kind, catalog) => {
  const violations = messageStrings(catalog).flatMap(([key, text]) => staticCurrencyAmounts(text)
    .filter(amount => !hasTwoDecimals(amount)).map(amount => `${key}: ${amount}`));
  expect(violations).toEqual([]);
  expect(PRODUCTS.find(product => product.id === "cloud-share")!.price).toBe(19.9);
});

it("detects static currency regressions while preserving exchange rates and non-money units", () => {
  for (const text of ["Stake $100", "$4.2M volume", "+200 NEX", "100–10,000 USDT", "$50.123456", "$20.000"]) {
    expect(staticCurrencyAmounts(text).some(amount => !hasTwoDecimals(amount)), text).toBe(true);
  }
  for (const text of ["Stake $100.00", "$4.20M volume", "+200.00 NEX", "100.00–10,000.00 USDT", "$20.000,00", "$0,62 per job"]) {
    expect(staticCurrencyAmounts(text).length, text).toBeGreaterThan(0);
    expect(staticCurrencyAmounts(text).every(hasTwoDecimals), text).toBe(true);
  }
  expect(staticCurrencyAmounts("1 NEX = 0.125 USDT · 1 NEX ≈ $0.12500 USDT · 1 USDT ≈ {vnd}")).toEqual([]);
  expect(staticCurrencyAmounts("≈ 98.63 USDT · 1 NEX = 0.125 USDT")).toEqual(["98.63"]);
  expect(staticCurrencyAmounts("$NEX · UVELBox S1 · V8 · 8 GB · 50% · 90 days · 10,000 winners")).toEqual([]);
});

const moneyFields = new Set([
  "amountUsdt", "subtotalUsdt", "discountUsdt", "totalUsdt", "unitPriceUsdt", "lineAmountUsdt",
  "usdtBalance", "nexBalance", "rewardUsdt", "rewardNex", "amountExact", "balanceAfterExact", "giftUsdt", "giftNex",
  "amountUSD", "amountUSDT", "minAmountUsdt", "maxAmountUsdt", "completedPayoutUsdt", "baseRateNEX",
]);
function rawMoney(expression: ts.Expression): boolean {
  if (/^(t|w)\./.test(expression.getText())) return false;
  if (ts.isPropertyAccessExpression(expression)) return moneyFields.has(expression.name.text);
  if (ts.isIdentifier(expression)) return moneyFields.has(expression.text);
  if (ts.isParenthesizedExpression(expression)) return rawMoney(expression.expression);
  if (ts.isConditionalExpression(expression)) return rawMoney(expression.whenTrue) || rawMoney(expression.whenFalse);
  if (ts.isTemplateExpression(expression)) return expression.templateSpans.some(span => rawMoney(span.expression));
  if (ts.isBinaryExpression(expression) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(expression.operatorToken.kind)) {
    return rawMoney(expression.left) || rawMoney(expression.right);
  }
  if (!ts.isCallExpression(expression)) return false;
  if (ts.isIdentifier(expression.expression)) return ["String", "Number"].includes(expression.expression.text) && expression.arguments.some(rawMoney);
  return ts.isPropertyAccessExpression(expression.expression)
    && ["toFixed", "toLocaleString"].includes(expression.expression.name.text)
    && rawMoney(expression.expression.expression);
}
function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry: { name: string; isDirectory(): boolean }) => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? vueFiles(file) : file.endsWith(".vue") ? [file] : [];
  });
}
it("does not render transport money directly anywhere in the application", () => {
  const violations: string[] = [];
  for (const file of vueFiles(fileURLToPath(new URL("../", import.meta.url)))) {
    const template = parse(readFileSync(file, "utf8")).descriptor.template?.content ?? "";
    for (const match of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      const ast = ts.createSourceFile("display.ts", `const display = ${match[1]};`, ts.ScriptTarget.Latest, true);
      const statement = ast.statements[0];
      if (ts.isVariableStatement(statement)) {
        const expression = statement.declarationList.declarations[0].initializer;
        if (expression && rawMoney(expression)) violations.push(`${file}: ${match[1].trim()}`);
      }
    }
  }
  expect(violations).toEqual([]);
});

it("formats historical receipt prices without rewriting stored values or billing units", () => {
  const source = parse(readFileSync(new URL("../components/me/receipt-modal.vue", import.meta.url), "utf8")).descriptor.scriptSetup!.content;
  const ast = ts.createSourceFile("receipt.ts", source, ts.ScriptTarget.Latest, true);
  let expression = "";
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node) && node.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText() === "k" && p.initializer.getText() === '"unit_price"')) {
      const value = node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText() === "v");
      if (value && ts.isPropertyAssignment(value)) expression = value.initializer.getText();
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  expect(expression).not.toBe("");
  const body = ts.transpile(`function display(r: any, formatAmount: any) { return ${expression}; }`);
  const display = new Function(`${body}; return display;`)() as (r: { unitPriceLabel: string }, formatter: typeof formatAmount) => string;
  for (const [stored, expected] of [["$50 / job", "$50.00 / job"], ["$12.345678 / 1k tok", "$12.35 / 1k tok"], ["$0.0030 / audio sec", "$0.00 / audio sec"]]) {
    const receipt = { unitPriceLabel: stored };
    expect(display(receipt, formatAmount)).toBe(expected);
    expect(receipt.unitPriceLabel).toBe(stored);
  }
});
