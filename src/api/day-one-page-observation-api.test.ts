import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createDayOnePageObservationApi } from "./day-one-page-observation-api";

describe("Day One page observations", () => {
  it("uses only fixed authenticated read-only surfaces", async () => {
    const request = vi.fn().mockResolvedValue({ accepted: true, recorded: true });
    const api = createDayOnePageObservationApi({ request } as unknown as ApiClient);

    await api.earnPage();
    await api.storePage();
    await api.s1Roi();

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "POST", path: "/api/growth/day-one/page-observations/earn", authenticated: true,
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST", path: "/api/growth/day-one/page-observations/store", authenticated: true,
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "POST", path: "/api/growth/day-one/page-observations/s1-roi", authenticated: true,
    });
  });

  it("rejects a response that does not acknowledge the authenticated observation", async () => {
    const request = vi.fn().mockResolvedValue({ accepted: false });

    await expect(createDayOnePageObservationApi({ request } as unknown as ApiClient).earnPage())
      .rejects.toMatchObject({ message: "DAY_ONE_PAGE_OBSERVATION_RESPONSE_INVALID" });
  });

  it("returns recorded false to the caller instead of treating an accepted noop as a durable success", async () => {
    const request = vi.fn().mockResolvedValue({ accepted: true, recorded: false });

    await expect(createDayOnePageObservationApi({ request } as unknown as ApiClient).earnPage())
      .resolves.toEqual({ recorded: false });
  });
});
