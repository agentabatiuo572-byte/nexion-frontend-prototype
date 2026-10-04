import { describe, expect, it, vi } from "vitest";
import { moveCalculatorRadio, syncAmountName } from "./calculator-webview-accessibility";

describe("calculator WebView accessibility", () => {
  it("names the actual editable input and updates its name with the language", () => {
    let name: string | null = null;
    let hostName = "锁仓金额(USDT)";
    const setAttribute = vi.fn((_key: string, value: string) => { name = value; });
    const card = { querySelector: (selector: string) => selector === "uni-input"
      ? { getAttribute: () => hostName, setAttribute: vi.fn() }
      : { getAttribute: () => name, setAttribute } };
    for (const label of ["锁仓金额(USDT)", "Stake amount (USDT)", "Số tiền khóa (USDT)"]) {
      syncAmountName(card, label);
      expect(name).toBe(label);
    }
    syncAmountName(card, "Số tiền khóa (USDT)");
    expect(setAttribute).toHaveBeenCalledTimes(3);

    // App-Vue may deliver the renderjs prop after mounted. Its uni-input host
    // still has the current translated name, and MutationObserver can resync it.
    hostName = "Stake amount (USDT)";
    syncAmountName(card);
    expect(name).toBe(hostName);
  });

  it("moves selection and focus across radios, wrapping in both directions", () => {
    const radios = Array.from({ length: 4 }, () => ({ click: vi.fn(), focus: vi.fn() }));
    const card = {
      contains: (radio: unknown) => radios.includes(radio as typeof radios[number]),
      querySelectorAll: () => radios,
    };
    const event = (key: string, at: number) => ({
      key,
      target: { closest: () => radios[at] },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    const right = event("ArrowRight", 2);
    moveCalculatorRadio(card, right);
    expect(radios[3].click).toHaveBeenCalledOnce();
    expect(radios[3].focus).toHaveBeenCalledOnce();
    expect(right.preventDefault).toHaveBeenCalledOnce();
    expect(right.stopPropagation).toHaveBeenCalledOnce();

    moveCalculatorRadio(card, event("ArrowRight", 3));
    expect(radios[0].click).toHaveBeenCalledOnce();
    moveCalculatorRadio(card, event("ArrowLeft", 0));
    expect(radios[3].click).toHaveBeenCalledTimes(2);
  });

  it("does not take arrow keys outside the calculator radio group", () => {
    const preventDefault = vi.fn();
    const card = { contains: () => false, querySelectorAll: () => [] };
    const foreignRadio = { click: vi.fn(), focus: vi.fn() };
    moveCalculatorRadio(card, {
      key: "ArrowRight", target: { closest: () => foreignRadio }, preventDefault, stopPropagation: vi.fn(),
    });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
