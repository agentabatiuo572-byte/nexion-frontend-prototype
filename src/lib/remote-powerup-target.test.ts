import { describe, expect, it } from "vitest";
import { canonicalPowerUpTarget } from "./remote-powerup-target";

describe("remote power-up target", () => {
  it("keeps the backend canonical in-app href", () => {
    expect(canonicalPowerUpTarget(" /pages/staking/staking ")).toBe("/pages/staking/staking");
  });

  it("rejects an unsafe or missing target so a successful claim remains recoverable", () => {
    expect(canonicalPowerUpTarget("https://example.test/claim")).toBeNull();
    expect(canonicalPowerUpTarget("//example.test/claim")).toBeNull();
    expect(canonicalPowerUpTarget("mailto:ops@example.test")).toBeNull();
    expect(canonicalPowerUpTarget("/pages/../me/me")).toBeNull();
    expect(canonicalPowerUpTarget("/pages/%2e%2e/me/me")).toBeNull();
    expect(canonicalPowerUpTarget("/pages/not-whitelisted")).toBeNull();
    expect(canonicalPowerUpTarget(" ")).toBeNull();
  });

  it("accepts only the known in-app destinations", () => {
    expect(canonicalPowerUpTarget("/pages/team/team")).toBe("/pages/team/team");
    expect(canonicalPowerUpTarget("/pages/me/wallet")).toBe("/pages/me/wallet");
    expect(canonicalPowerUpTarget("/pages/genesis/genesis")).toBe("/pages/genesis/genesis");
    expect(canonicalPowerUpTarget("/market/genesis")).toBe("/pages/genesis/genesis");
    expect(canonicalPowerUpTarget("/wallet/staking")).toBe("/pages/staking/staking");
  });
});
