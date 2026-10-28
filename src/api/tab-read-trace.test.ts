import { afterEach, expect, it, vi } from "vitest";
import { withTabReadTrace } from "./tab-read-trace";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it.each(["production", "development"])("requires explicit trace opt-in in mode %s", async mode => {
  vi.stubEnv("MODE", mode); vi.stubEnv("VITE_NEXGRID_TAB_READ_TRACE", "0");
  const transport = { request: vi.fn() };
  expect(withTabReadTrace(transport)).toBe(transport);
  vi.stubEnv("VITE_NEXGRID_TAB_READ_TRACE", "1");
  if (mode === "production") expect(withTabReadTrace(transport)).toBe(transport);
});
it("logs only a sequence, elapsed time, method and path at real dispatch", async () => {
  vi.stubEnv("MODE", "development"); vi.stubEnv("VITE_NEXGRID_TAB_READ_TRACE", "1");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const transport = { request: vi.fn().mockResolvedValue({ status: 200, headers: {}, data: null }) };
  const traced = withTabReadTrace(transport);
  await traced.request({ url: "https://api.test/api/example?secret=private#hidden", method: "GET", headers: { Authorization: "private" }, body: {secret:"private"}, timeoutMs: 1 });
  expect(transport.request).toHaveBeenCalledOnce();
  const value = JSON.parse(log.mock.calls[0][1]);
  expect(value).toEqual({ sequence: 1, elapsedMs: expect.any(Number), method: "GET", path: "/api/example" });
  expect(JSON.stringify(log.mock.calls)).not.toContain("private");
});
