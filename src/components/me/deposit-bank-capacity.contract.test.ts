// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computed, reactive, ref } from "vue";
import ts from "typescript";
import { fmt } from "@/i18n/format";
import { en } from "@/i18n/messages/en";

const source = readFileSync(new URL("./deposit-bank-pane.vue", import.meta.url), "utf8");

describe("VietQR live daily-capacity guard", () => {
  it("refreshes server-owned payment capacity before every remote create", () => {
    expect(source).toMatch(
      /async function completeCreateOrder[\s\S]{0,700}await fx\.load\(\)[\s\S]{0,1600}dep\.createRemoteBankIntent/,
    );
  });

  it("stops before creating when today's refreshed remaining capacity cannot cover the amount", () => {
    expect(source).toMatch(
      /usdt > todayRemainingDeposit\.value[\s\S]{0,500}dailyCapacityExceeded[\s\S]{0,500}return/,
    );
  });

  it("keeps per-transaction and daily-capacity limits as separate concepts", () => {
    expect(source).toMatch(/usdt > maxDeposit\.value[\s\S]{0,500}singleLimitExceeded/);
    expect(source).toMatch(/todayRemainingNote/);
    expect(source).toMatch(/dailyCapacityExhausted/);
  });

  it("shows configured per-transaction minimum and maximum independently from today's capacity", () => {
    expect(source).toContain("bankPane.limitNote");
    expect(source).toMatch(/const limitLine = computed\([\s\S]{0,250}minLabel[\s\S]{0,250}maxLabel/);
    expect(source).toMatch(/limitLine[\s\S]{0,500}todayRemainingLine/);
  });

  it("does not present a numeric transaction limit before the FX configuration is ready", () => {
    const start = source.indexOf("const limitLine = computed(");
    const end = source.indexOf("const todayRemainingLabel", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const code = ts.transpileModule(source.slice(start, end) + "; return limitLine;", {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const fx = reactive({ configReady: false });
    const minLabel = ref("$10");
    const maxLabel = ref("$5,000");
    const limit = new Function("computed", "fx", "fmt", "t", "minLabel", "maxLabel", code)(
      computed, fx, fmt, ref(en), minLabel, maxLabel,
    );
    expect(limit.value).toBe("—");
    fx.configReady = true;
    expect(limit.value).toBe(fmt(en.bankPane.limitNote, { min: "$10", max: "$5,000" }));
    maxLabel.value = "$100";
    expect(limit.value).toBe(fmt(en.bankPane.limitNote, { min: "$10", max: "$100" }));
    fx.configReady = false;
    expect(limit.value).toBe("—");
  });

  it("returns credited users to the wallet while new top-up remains a separate reset action", () => {
    expect(source).toMatch(/async function finishCreditedFlow\(\)[\s\S]{0,600}await app\.refreshRemoteFleet[\s\S]{0,300}navBack\("\/pages\/me\/wallet"\)/);
    expect(source).toMatch(/function startNewTopup\(\)[\s\S]{0,250}viewIntentId\.value = null/);
  });

  it("turns a final server daily-capacity race into today's-limit guidance", () => {
    expect(source).toMatch(
      /VIETQR_DAILY_CAPACITY_EXCEEDED[\s\S]{0,700}await fx\.load\(\)[\s\S]{0,700}dailyCapacityExceeded/,
    );
  });
});
