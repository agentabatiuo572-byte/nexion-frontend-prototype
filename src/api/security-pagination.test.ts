import { expect, test, vi } from "vitest";
import { createAccountApi } from "./account-api";
import type { ApiClient } from "./api-client";
test("security pages preserve the server cursor and request the next page", async () => {
  const request = vi.fn().mockResolvedValue({ twoFactorEnabled: false, passwordChangedAt: null, sessions: [], nextCursor: "100" });
  const api = createAccountApi({ request } as unknown as ApiClient);
  const first = await api.securityOverview();
  expect(first.nextCursor).toBe("100");
  await api.securityOverview(first.nextCursor!);
  expect(request.mock.calls[1][0].path).toBe("/api/app/security?cursor=100");
});
