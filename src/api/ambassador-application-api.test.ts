import { describe, expect, it, vi } from "vitest";
import { createAmbassadorApplicationApi } from "./ambassador-application-api";

function application(id: number) {
  return {
    applicationId: id,
    status: "APPROVED",
    city: `City ${id}`,
    eventDate: "2026-10-01",
    budgetUsdt: 1000,
    bucket: "venue",
    submittedAt: "2026-09-05T00:00:00Z",
    source: "server",
    sourceEnvironment: "PRODUCTION",
    runId: "",
  };
}

describe("ambassador application history", () => {
  it("loads every server page without hiding older applications", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        rows: Array.from({ length: 50 }, (_, index) => application(index + 1)),
        pageNum: 1, pageSize: 50, total: 51, hasMore: true,
        source: "server", sourceEnvironment: "PRODUCTION", runId: "",
      })
      .mockResolvedValueOnce({
        rows: [application(51)], pageNum: 2, pageSize: 50, total: 51, hasMore: false,
        source: "server", sourceEnvironment: "PRODUCTION", runId: "",
      });

    const rows = await createAmbassadorApplicationApi({ request } as never).history();

    expect(rows).toHaveLength(51);
    expect(request).toHaveBeenNthCalledWith(1, { path: "/api/app/team/ambassador-applications?pageNum=1&pageSize=50" });
    expect(request).toHaveBeenNthCalledWith(2, { path: "/api/app/team/ambassador-applications?pageNum=2&pageSize=50" });
  });

  it("fails closed when page totals drift or an id is duplicated", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        rows: Array.from({ length: 50 }, (_, index) => application(index + 1)),
        pageNum: 1, pageSize: 50, total: 51, hasMore: true,
        source: "server", sourceEnvironment: "PRODUCTION", runId: "",
      })
      .mockResolvedValueOnce({
        rows: [application(1)], pageNum: 2, pageSize: 50, total: 51, hasMore: false,
        source: "server", sourceEnvironment: "PRODUCTION", runId: "",
      });

    await expect(createAmbassadorApplicationApi({ request } as never).history())
      .rejects.toMatchObject({ message: "AMBASSADOR_APPLICATION_RESPONSE_INVALID" });
  });
});
