import { describe, expect, it } from "vitest";
import { parse } from "@vue/compiler-sfc";
import * as ts from "typescript";
import { fmt } from "../../i18n/format";
import { en, type Messages } from "../../i18n/messages/en";
import { zh } from "../../i18n/messages/zh";
import { vi } from "../../i18n/messages/vi";

const sources = import.meta.glob([
  "../../pages/daily/daily.vue",
  "./streak-power-ups.vue",
], { query: "?raw", import: "default", eager: true });

// Execute the component functions themselves so a broken mapping fails this check.
function displayFunction<T>(path: string, name: string, words: Messages): T {
  const { descriptor } = parse(String(sources[path] ?? ""));
  if (!descriptor.scriptSetup) throw new Error(`Missing script: ${path}`);
  const source = ts.createSourceFile(path, descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!fn) throw new Error(`Missing function: ${name}`);
  const powerUps = source.statements.find((node) => ts.isVariableStatement(node)
    && node.declarationList.declarations.some((item) => item.name.getText(source) === "POWERUPS"));
  const script = `${powerUps?.getText(source) ?? ""}\n${fn.getText(source)}`;
  const { outputText } = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return new Function("t", "w", "fmt", `${outputText}\nreturn ${name};`)(
    { value: words }, { value: words.daily.powerUps }, fmt,
  ) as T;
}

describe.each([{ locale: "en", words: en }, { locale: "zh", words: zh }, { locale: "vi", words: vi }])(
  "$locale public reward copy",
  ({ words }) => {
    const reward = displayFunction<(type: string, amount: number) => string>("../../pages/daily/daily.vue", "rewardLabel", words);
    const history = displayFunction<(reason: string) => string>("../../pages/daily/daily.vue", "historyReason", words);
    const benefit = displayFunction<(code: string, value: string, status: string) => string>("./streak-power-ups.vue", "benefitDescription", words);

    it.each([
      ["NEX", 12.5, "+12.5 NEX"],
      ["usdt", 3, "+3 USDT"],
      ["SPIN", 2, fmt(words.publicCopy.rewardSpin, { n: 2 })],
      ["BADGE", 1, fmt(words.publicCopy.rewardBadge, { n: 1 })],
      ["INTERNAL_UNKNOWN_TYPE", 8, fmt(words.publicCopy.rewardOther, { n: 8 })],
    ] as const)("keeps the amount and localizes %s", (type, amount, expected) => {
      expect(reward(type, amount)).toBe(expected);
    });

    it.each([
      ["Milestone Day-30: Lucky Spin", fmt(words.publicCopy.dailyMilestone, { n: 30 })],
      ["Streak saver used", words.daily.saver.restored],
      ["Day-7 streak bonus", words.publicCopy.dailyHistory],
    ])("localizes stored history: %s", (reason, expected) => {
      expect(history(reason)).toBe(expected);
    });

    it.each([
      ["ROYALTY_BOOST", "5%", "AVAILABLE", fmt(words.publicCopy.benefitAmount, { value: "5%" })],
      ["royalty_boost", "1.5x", "ACTIVATED", fmt(words.publicCopy.benefitAmount, { value: "1.5×" })],
      ["UNKNOWN_INTERNAL_CODE", "5%", "AVAILABLE", words.publicCopy.benefitAvailable],
      ["royalty_boost", "INTERNAL_VALUE", "ACTIVATED", words.daily.powerUps.activated],
      ["UNKNOWN_INTERNAL_CODE", "raw", "LOCKED", words.daily.powerUps.locked],
    ])("renders a safe benefit for %s / %s / %s", (code, value, status, expected) => {
      expect(benefit(code, value, status)).toBe(expected);
    });
  },
);
