import { describe, expect, it } from "vitest";
import {
  firstLiveSession,
  formatCountdown,
  isSessionLive,
  normalizeSessions,
  PENDING_CHECKOUT_WINDOW_MIN,
  pruneExpiredSessions,
  reconcileInvoiceQuote,
  sessionSecondsLeft,
  type PendingCheckoutSession,
} from "./pending-checkout-core";

const T0 = 1_760_000_000_000;

function session(over: Partial<PendingCheckoutSession> = {}): PendingCheckoutSession {
  return {
    id: "pc-a",
    kind: "purchase",
    orderNo: null,
    productId: "stellarbox-s1",
    method: "usdt-trc20",
    amountUsdt: 1299,
    address: "TABC",
    createdAt: T0,
    expiresAt: T0 + PENDING_CHECKOUT_WINDOW_MIN * 60_000,
    quote: { total: 1299, voucher: { id: null, discount: 0 }, trial: { applied: false, promo: 0, offsetUSD: 0, remainderUSD: 0, shadowNEX: 0 }, tradeIn: null },
    leftNoticeShown: false,
    ...over,
  };
}

describe("pending-checkout-core", () => {
  it("is live strictly before expiresAt and dead at/after it", () => {
    const s = session();
    expect(isSessionLive(s, s.expiresAt - 1)).toBe(true);
    expect(isSessionLive(s, s.expiresAt)).toBe(false);
    expect(isSessionLive(s, s.expiresAt + 1)).toBe(false);
    expect(isSessionLive(session({ expiresAt: Number.NaN }), T0)).toBe(false);
  });

  it("counts down in whole seconds and floors at 0", () => {
    const s = session();
    expect(sessionSecondsLeft(s, T0)).toBe(30 * 60);
    expect(sessionSecondsLeft(s, T0 + 1_500)).toBe(30 * 60 - 1);
    expect(sessionSecondsLeft(s, s.expiresAt + 5_000)).toBe(0);
    expect(formatCountdown(30 * 60)).toBe("30:00");
    expect(formatCountdown(61)).toBe("01:01");
    expect(formatCountdown(-4)).toBe("00:00");
  });

  it("prunes expired rows and picks the earliest live one as current", () => {
    const dead = session({ id: "pc-dead", expiresAt: T0 - 1 });
    const a = session({ id: "pc-a" });
    const b = session({ id: "pc-b", createdAt: T0 + 10 });
    expect(pruneExpiredSessions([dead, a, b], T0).map((s) => s.id)).toEqual(["pc-a", "pc-b"]);
    expect(firstLiveSession([dead, a, b], T0)?.id).toBe("pc-a");
    expect(firstLiveSession([dead], T0)).toBeNull();
  });

  it("normalizes storage rows: keeps well-formed sessions, drops broken ones", () => {
    const good = session({ leftNoticeShown: true, quote: { ...session().quote, voucher: { id: "v1", discount: 20 }, tradeIn: { deviceId: "d1" } } });
    const rows = [
      good,
      { ...session(), id: "" },                       // no id
      { ...session(), method: "card" },               // not a chain method
      { ...session(), address: "" },                  // no address
      { ...session(), amountUsdt: Number.NaN },       // bad amount
      { ...session(), quote: undefined },             // no quote snapshot
      null,
      "junk",
    ];
    const out = normalizeSessions(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(good);
    expect(normalizeSessions(undefined)).toEqual([]);
    expect(normalizeSessions({ not: "array" })).toEqual([]);
  });
  it("normalizes storage rows: rejects out-of-domain values (untrusted local rows)", () => {
    const base = session();
    const rows = [
      { ...base, id: "eternal", expiresAt: T0 + 10 * 365 * 24 * 3600_000 },              // window > 30 min → an immortal invoice
      { ...base, id: "shifted", createdAt: T0 + 10 * 365 * 24 * 3600_000, expiresAt: T0 + 10 * 365 * 24 * 3600_000 + 30 * 60_000 }, // width OK, but 10 years in the future
      { ...base, id: "inverted", createdAt: T0 + 60_000, expiresAt: T0 },                    // createdAt after expiresAt
      { ...base, id: "zero-window", expiresAt: T0 },                                          // window 0
      { ...base, id: "face-mismatch", amountUsdt: 1299, quote: { ...base.quote, total: 600 } }, // QR amount ≠ quoted total
      { ...base, id: "neg-discount", quote: { ...base.quote, voucher: { id: "v1", discount: -50 } } }, // negative discount → clamped to 0
    ];
    const out = normalizeSessions(rows, T0);
    expect(out.map((s) => s.id)).toEqual(["neg-discount"]);
    expect(out[0]!.quote.voucher.discount).toBe(0);
  });

  it("reconcileInvoiceQuote: each discount = min(live, invoice); voucher only when it is the invoice's voucher", () => {
    const trial = (over: Partial<PendingCheckoutSession["quote"]["trial"]>) => ({ applied: true, promo: 20, offsetUSD: 21, remainderUSD: 5, shadowNEX: 120, ...over });
    const invoice = { total: 608, voucher: { id: "v1", discount: 10 }, trial: trial({}), tradeIn: null };
    // tampered invoice (discount 648, trial numbers inflated) → capped by live
    const tampered = reconcileInvoiceQuote(
      { trial: trial({}), voucher: { id: "v1", discount: 10 } },
      { ...invoice, voucher: { id: "v1", discount: 648 }, trial: trial({ promo: 600, offsetUSD: 600, remainderUSD: 600, shadowNEX: 9_999 }) },
    );
    expect(tampered.voucher).toEqual({ id: "v1", discount: 10 });
    expect(tampered.trial).toEqual(trial({}));
    // live grew inside the window (trial accrual, bigger voucher) → capped by the invoice → charge stays at face amount
    const grown = reconcileInvoiceQuote({ trial: trial({ offsetUSD: 40, remainderUSD: 30, shadowNEX: 300 }), voucher: { id: "v1", discount: 25 } }, invoice);
    expect(grown.voucher).toEqual({ id: "v1", discount: 10 });
    expect(grown.trial).toEqual(trial({}));
    // trial ended / not re-applied live → no trial (pay-time face gate then rejects the invoice)
    expect(reconcileInvoiceQuote({ trial: { ...trial({}), applied: false }, voucher: { id: "v1", discount: 10 } }, invoice).trial.applied).toBe(false);
    // invoice had no voucher, user claimed one inside the window → still no voucher, no id (this settlement does not depend on it)
    const newVoucher = reconcileInvoiceQuote({ trial: trial({}), voucher: { id: "v2", discount: 50 } }, { ...invoice, voucher: { id: null, discount: 0 } });
    expect(newVoucher.voucher).toEqual({ id: null, discount: 0 });
    // invoice's voucher gone / replaced by another → no voucher (charge above face → rejected at pay time)
    expect(reconcileInvoiceQuote({ trial: trial({}), voucher: { id: "v9", discount: 10 } }, invoice).voucher).toEqual({ id: null, discount: 0 });
    expect(reconcileInvoiceQuote({ trial: trial({}), voucher: { id: null, discount: 0 } }, invoice).voucher).toEqual({ id: null, discount: 0 });
  });
});
