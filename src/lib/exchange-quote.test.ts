import { describe, expect, it } from "vitest";
import { exchangeQuote } from "./exchange-quote";

describe("server-aligned exchange quote", () => {
  it("deducts minimum USDT fee before buying and truncates NEX to six decimals", () => {
    expect(exchangeQuote("usdt2nex", 10, 0.119, 0.01, 0.5)).toEqual({ grossUsdt: 10, feeUsdt: 0.5, netUsdt: 9.5, toAmount: 79.831932 });
  });
  it("uses gross USDT for caps and net USDT for sell proceeds", () => {
    expect(exchangeQuote("nex2usdt", 100, 0.119, 0.01, 0.5)).toEqual({ grossUsdt: 11.9, feeUsdt: 0.5, netUsdt: 11.4, toAmount: 11.4 });
  });
  it("treats feePct as percent and supports zero fee without a minimum charge", () => {
    expect(exchangeQuote("usdt2nex", 10000, 1, 0.01, 0.5)?.feeUsdt).toBe(1);
    expect(exchangeQuote("usdt2nex", 1, 1, 0, 5)?.toAmount).toBe(1);
  });
  it("rounds server money HALF_UP, without binary floating point drift", () => {
    expect(exchangeQuote("nex2usdt", 1, 1.0000005, 0, 0)?.grossUsdt).toBe(1.000001);
    expect(exchangeQuote("usdt2nex", 1, 1e-7, 0, 0)?.toAmount).toBe(10000000);
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid price %s", (price) => {
    expect(exchangeQuote("usdt2nex", 1, price, 1, 0)).toBeNull();
  });
  it("rejects an amount consumed by the fee", () => {
    expect(exchangeQuote("usdt2nex", 0.5, 1, 1, 0.5)).toBeNull();
  });
});
