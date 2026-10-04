import { describe, expect, it, vi } from "vitest";
import { settleRemoteMeLoaders } from "./remote-me-refresh";

describe("remote Me refresh isolation", () => {
  it("runs every module even when one authority fails", async () => {
    const profile = vi.fn().mockResolvedValue("profile-ready");
    const wallet = vi.fn().mockRejectedValue(new Error("wallet-offline"));
    const network = vi.fn().mockResolvedValue("network-ready");

    const outcomes = await settleRemoteMeLoaders([
      ["profile", profile],
      ["wallet", wallet],
      ["network", network],
    ] as const);

    expect(profile).toHaveBeenCalledOnce();
    expect(wallet).toHaveBeenCalledOnce();
    expect(network).toHaveBeenCalledOnce();
    expect(outcomes).toEqual({
      profile: "fulfilled",
      wallet: "rejected",
      network: "fulfilled",
    });
  });

  it("converts a synchronous loader failure into one rejected module", async () => {
    const outcomes = await settleRemoteMeLoaders([
      ["profile", () => { throw new Error("profile-invalid"); }],
      ["wallet", () => Promise.resolve()],
    ] as const);

    expect(outcomes).toEqual({ profile: "rejected", wallet: "fulfilled" });
  });
});
