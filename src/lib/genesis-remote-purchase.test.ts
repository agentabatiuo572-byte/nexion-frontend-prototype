import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { classifyRemoteGenesisPurchaseError, resolveRemoteGenesisPurchase } from "./genesis-remote-purchase";
import { vi } from "vitest";

describe("remote genesis purchase failure classification", () => {
  it("recognizes only explicit sold-out and paused domain outcomes", () => {
    expect(classifyRemoteGenesisPurchaseError(new ApiError({ kind: "business", message: "GENESIS_SOLD_OUT" }))).toBe("sold-out");
    expect(classifyRemoteGenesisPurchaseError(new ApiError({ kind: "http", message: "GENESIS_MARKET_PAUSED" }))).toBe("market-closed");
    expect(classifyRemoteGenesisPurchaseError(new ApiError({ kind: "business", message: "GENESIS_PRESALE_NOT_OPEN" }))).toBe("market-closed");
    expect(classifyRemoteGenesisPurchaseError(new ApiError({ kind: "business", message: "GENESIS_SALE_POLICY_UNAVAILABLE" }))).toBe("market-closed");
  });

  it("applies a committed receipt immediately without a success-path readback or storage downgrade", async () => {
    const applyReceipt = vi.fn();
    const retireIntent = vi.fn(() => false);
    const recoverUnknown = vi.fn(async () => { throw new Error("transient read failure"); });

    await expect(resolveRemoteGenesisPurchase({
      execute: async () => ({ orderNo: "G4-1", balance: 2711 }),
      isCurrent: () => true,
      applyReceipt,
      retireIntent,
      recoverUnknown,
    })).resolves.toEqual({ ok: true, state: { orderNo: "G4-1", balance: 2711 } });

    expect(applyReceipt).toHaveBeenCalledOnce();
    expect(retireIntent).toHaveBeenCalledOnce();
    expect(recoverUnknown).not.toHaveBeenCalled();
  });

  it("keeps unknown outcomes pending and never applies a stale-account receipt", async () => {
    const recoverUnknown = vi.fn(async () => true);
    const applyReceipt = vi.fn();
    const retireIntent = vi.fn();
    await expect(resolveRemoteGenesisPurchase({
      execute: async () => { throw new Error("offline"); },
      isCurrent: () => true,
      applyReceipt,
      retireIntent,
      recoverUnknown,
    })).resolves.toEqual({ ok: false, reason: "unavailable" });
    await Promise.resolve();
    expect(recoverUnknown).toHaveBeenCalledOnce();
    expect(retireIntent).not.toHaveBeenCalled();

    await expect(resolveRemoteGenesisPurchase({
      execute: async () => ({ orderNo: "G4-stale" }),
      isCurrent: () => false,
      applyReceipt,
      retireIntent,
      recoverUnknown,
    })).resolves.toEqual({ ok: false, reason: "unavailable" });
    expect(applyReceipt).not.toHaveBeenCalled();
  });

  it("does not run an unknown-outcome recovery read for an explicit business rejection", async () => {
    const recoverUnknown = vi.fn(async () => true);
    const applyReceipt = vi.fn();
    const retireIntent = vi.fn();

    await expect(resolveRemoteGenesisPurchase({
      execute: async () => {
        throw new ApiError({
          kind: "business",
          message: "GENESIS_WALLET_INSUFFICIENT",
          status: 409,
        });
      },
      isCurrent: () => true,
      applyReceipt,
      retireIntent,
      recoverUnknown,
    })).resolves.toEqual({ ok: false, reason: "insufficient-funds" });

    await Promise.resolve();
    expect(recoverUnknown).not.toHaveBeenCalled();
    expect(applyReceipt).not.toHaveBeenCalled();
    expect(retireIntent).not.toHaveBeenCalled();
  });

  it("fails closed for unknown, network, and conflicting failures", () => {
    expect(classifyRemoteGenesisPurchaseError(new ApiError({ kind: "business", message: "GENESIS_SUPPLY_CONFLICT" }))).toBe("unavailable");
    expect(classifyRemoteGenesisPurchaseError(new Error("offline"))).toBe("unavailable");
  });

  it("never reports a connected server's balance or cap rejection as a network outage", () => {
    expect(classifyRemoteGenesisPurchaseError(new ApiError({
      kind: "business", message: "GENESIS_WALLET_INSUFFICIENT", status: 409,
    }))).toBe("insufficient-funds");
    expect(classifyRemoteGenesisPurchaseError(new ApiError({
      kind: "business", message: "GENESIS_USER_CAP_REACHED", status: 409,
    }))).toBe("cap");
    for (const message of ["GENESIS_ACCOUNT_AGE_REQUIRED", "GENESIS_COUNTRY_REQUIRED", "GENESIS_GEO_BLOCKED"]) {
      expect(classifyRemoteGenesisPurchaseError(new ApiError({ kind: "business", message, status: 403 }))).toBe("not-eligible");
    }
  });
});
