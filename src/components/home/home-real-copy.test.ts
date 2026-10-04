import { describe, expect, it } from "vitest";
import techMoneyCardSource from "./tech-money-card.vue?raw";

import { homeEarningsSubtitle } from "./home-real-copy";

describe("home real-data copy", () => {
  it("uses the prototype live label without a remote-only settlement badge", () => {
    const template = techMoneyCardSource.split("<script setup")[0];
    expect(template).toContain("{{ t.home.techStreaming }}");
    expect(template).not.toContain("techSettlementSnapshot");
  });

  it("shows loading instead of telling an already authenticated user to sign in", () => {
    expect(homeEarningsSubtitle(true, "loading", null, null, null,
      "mock trend", "loading", "unavailable", "empty", "{arrow} {delta} settled {count}"))
      .toBe("loading");
  });

  it("uses an honest empty state after the authenticated overview is loaded", () => {
    expect(homeEarningsSubtitle(true, "ready", null, null, null,
      "mock trend", "loading", "unavailable", "empty", "{arrow} {delta} settled {count}"))
      .toBe("empty");
  });

  it("does not leave a failed authenticated request looking like an endless load", () => {
    expect(homeEarningsSubtitle(true, "error", null, null, null,
      "mock trend", "loading", "unavailable", "empty", "{arrow} {delta} settled {count}"))
      .toBe("unavailable");
  });

  it("renders the real settled-job count and keeps the prototype copy only in mock mode", () => {
    expect(homeEarningsSubtitle(true, "ready", 323.89, 5, 5.24,
      "mock trend", "loading", "unavailable", "empty", "{arrow} {delta} vs yesterday · {count} jobs settled"))
      .toBe("↑ +5.2% vs yesterday · 5 jobs settled");
    expect(homeEarningsSubtitle(false, "ready", null, null, null,
      "mock trend", "loading", "unavailable", "empty", "{arrow} {delta} settled {count}"))
      .toBe("mock trend");
  });

  it("renders negative, flat, and unavailable comparisons without inventing a trend", () => {
    const template = "{arrow} {delta} vs yesterday · {count} jobs settled";
    expect(homeEarningsSubtitle(true, "ready", 10, 2, -5.24,
      "mock", "loading", "unavailable", "empty", template))
      .toBe("↓ -5.2% vs yesterday · 2 jobs settled");
    expect(homeEarningsSubtitle(true, "ready", 10, 2, 0,
      "mock", "loading", "unavailable", "empty", template))
      .toBe("→ 0.0% vs yesterday · 2 jobs settled");
    expect(homeEarningsSubtitle(true, "ready", 10, 2, null,
      "mock", "loading", "unavailable", "empty", template))
      .toBe("— vs yesterday · 2 jobs settled");
  });
});
