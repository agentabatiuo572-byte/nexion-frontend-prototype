import { describe, expect, it } from "vitest";
import { howContentMode } from "@/lib/team-how-content-mode";

describe("team published How content mode", () => {
  it("keeps the remote error surface mounted when published content fails", () => {
    expect(howContentMode(true)).toBe("published");
  });

  it("uses the local narrative only for explicit non-remote mode", () => {
    expect(howContentMode(false)).toBe("local");
  });
});
