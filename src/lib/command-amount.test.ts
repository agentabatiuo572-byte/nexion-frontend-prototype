import { describe, expect, it } from "vitest";

import { formatCommandAmount, normalizeCommandAmount } from "./command-amount";

describe("money-command amounts", () => {
  it("preserves the server-supported six decimal places across a confirmation boundary", () => {
    expect(normalizeCommandAmount("100.123456")).toBe(100.123456);
    expect(formatCommandAmount(100.123456)).toBe("100.123456");
  });

  it("truncates excess input rather than silently increasing a money command", () => {
    expect(normalizeCommandAmount("100.1234569")).toBe(100.123456);
  });

  it("keeps whole values readable without changing their command value", () => {
    expect(formatCommandAmount(normalizeCommandAmount("100"))).toBe("100.00");
  });
});
