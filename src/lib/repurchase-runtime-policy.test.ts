import { describe, expect, it } from "vitest";
import { resolveRepurchaseRuntimePolicy } from "./repurchase-runtime-policy";

describe("repurchase runtime authority", () => {
  it("uses the server flow in production", () => {
    expect(resolveRepurchaseRuntimePolicy("prod")).toEqual({
      serverAuthoritative: true,
      localMock: false,
      unavailable: false,
    });
  });

  it("uses the server flow in development", () => {
    expect(resolveRepurchaseRuntimePolicy("dev")).toEqual({
      serverAuthoritative: true,
      localMock: false,
      unavailable: false,
    });
  });
});
