import { describe, expect, it } from "vitest";
import { advanceMessageHeader as advance, createMessageHeaderState as initial } from "./message-header-scroll";
describe("message center scroll header", () => {
  it("keeps short lists and small touch jitter expanded", () => {
    let state = initial();
    for (const top of [0, 24, 48, 52, 49, 53, 51, 54]) state = advance(state, top, false, 1000);
    expect(state.title && state.primary).toBe(true);
  });
  it("collapses after real downward travel, reveals primary on reverse travel and title near top", () => {
    let state = advance(initial(), 145, false, 1000);
    expect([state.title, state.primary]).toEqual([false, false]);
    state = advance(state, 140, false, 1400); state = advance(state, 112, false, 1500);
    expect([state.title, state.primary]).toEqual([false, true]);
    state = advance(state, 10, false, 1800);
    expect([state.title, state.primary]).toEqual([true, true]);
  });
  it("does not hide a focused control or reverse on a layout-induced scroll clamp", () => {
    expect(advance(initial(), 220, true, 1000).primary).toBe(true);
    const compact = advance(initial(), 200, false, 1000);
    expect(advance(compact, 30, false, 1100).primary).toBe(false);
    expect(advance(compact, 0, false, 1100).title).toBe(true);
    expect(advance(compact, 0, false, 1100).primary).toBe(true);
  });
  it("honors a real reversal while a collapse is still animating", () => {
    const compact = advance(initial(), 200, false, 1000);
    const reversed = advance(compact, 160, false, 1040, true);
    expect([reversed.title, reversed.primary]).toEqual([false, true]);
    expect(advance(reversed, 210, false, 1090, true).primary).toBe(false);
    expect(advance(reversed, 210, true, 1090, true).primary).toBe(true);
  });
});
