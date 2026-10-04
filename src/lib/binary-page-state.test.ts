import { describe, expect, it } from "vitest";
import { binaryPageState } from "@/lib/binary-page-state";

describe("binary F3 page state", () => {
  it("keeps a successful F3 projection visible when the independent member reader fails", () => {
    expect(binaryPageState({ remote: true, binaryStatus: "ready", networkStatus: "error" })).toEqual({
      primary: "ready", memberDetails: "error",
    });
  });

  it("keeps an F3 failure as the page failure and does not call it a network failure", () => {
    expect(binaryPageState({ remote: true, binaryStatus: "error", networkStatus: "ready" })).toEqual({
      primary: "error", memberDetails: "ready",
    });
  });

  it("uses the local page only in explicit non-remote mode", () => {
    expect(binaryPageState({ remote: false, binaryStatus: "idle", networkStatus: "idle" })).toEqual({
      primary: "ready", memberDetails: "ready",
    });
  });
});
