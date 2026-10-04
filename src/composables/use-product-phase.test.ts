import { describe, expect, it, vi } from "vitest";
import { computed } from "vue";
import { PHASES } from "@/store/product-phase";
import { serverProductPhaseState } from "@/store/server-product-phase";

const remote = vi.hoisted(() => ({ remoteApiEnabled: true, productPhaseApi: { current: vi.fn(() => new Promise(() => {})) } }));
vi.mock("@/api/runtime", () => remote);
vi.mock("@/store/app", () => ({ useApp: () => ({ user: { joinedAt: Date.now() } }) }));

const { useProductPhase } = await import("./use-product-phase");

describe("product phase holds its last confirmed release decision", () => {
  it("does not collapse to the closed-side placeholder while re-reading", () => {
    serverProductPhaseState.status = "ready";
    serverProductPhaseState.phase = "P4";
    const phase = useProductPhase();
    expect(phase.value.id).toBe("P4");

    // A background re-read must not re-partition phase-locked products into
    // locked cards and back (BUG 16: store cards rebuilt on every refresh).
    serverProductPhaseState.status = "loading";
    expect(phase.value.id).toBe("P4");
    expect(phase.value).toEqual(PHASES[3]);
  });

  it("falls back to the closed-side placeholder only with no confirmed phase", () => {
    serverProductPhaseState.status = "loading";
    serverProductPhaseState.phase = null;
    const phase = useProductPhase();
    expect(phase.value.id).toBe("P1");
  });
});
