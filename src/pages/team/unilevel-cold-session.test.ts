import { expect, test } from "vitest";
import { directPage, flush } from "./direct-referral.test-support";
test("waits for authenticated account binding and joins mount/show reads", async () => {
  const page = await directPage({ ready: false });
  await page.show(); expect(page.api.snapshot).not.toHaveBeenCalled();
  page.auth.isAuthenticated = true; page.auth.accountId = "user:607"; await flush();
  expect(page.api.snapshot).not.toHaveBeenCalled();
  page.app.accountKey = "user:607"; await flush();
  expect(page.api.snapshot).toHaveBeenCalledTimes(1); expect(page.api.policy).toHaveBeenCalledTimes(1);
  page.app.accountBindingEpoch++; await flush(); expect(page.api.snapshot).toHaveBeenCalledTimes(2);
});
test("runtime revision reloads both policy and events", async () => {
  const page = await directPage(); await flush();
  page.revision(); await flush();
  expect(page.api.snapshot).toHaveBeenCalledTimes(2); expect(page.api.policy).toHaveBeenCalledTimes(2);
});
