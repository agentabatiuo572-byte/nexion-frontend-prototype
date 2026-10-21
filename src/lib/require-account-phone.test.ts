import { beforeEach, expect, it, vi } from "vitest";

const { read, navTo, warn } = vi.hoisted(() => ({ read: vi.fn(), navTo: vi.fn(), warn: vi.fn() }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, sessionVault: { read } }));
vi.mock("@/i18n/use-t", () => ({ getT: () => ({ security: { phoneBindingRequired: "Phone not linked" } }) }));
vi.mock("@/lib/route", () => ({ navTo }));
vi.mock("@/store/ui", () => ({ toast: { warn } }));

import { requireAccountPhone } from "./require-account-phone";

beforeEach(() => { vi.clearAllMocks(); });

it("sends only authenticated accounts without a phone to binding", () => {
  read.mockReturnValueOnce({ user: { phone: "", userId: 1 } });
  expect(requireAccountPhone()).toBe(false);
  expect(warn).toHaveBeenCalledWith("Phone not linked");
  expect(navTo).toHaveBeenCalledWith("/pages/me/phone-binding");

  read.mockReturnValueOnce({ user: { phone: "901234567", userId: 1 } });
  expect(requireAccountPhone()).toBe(true);
  expect(navTo).toHaveBeenCalledTimes(1);

  read.mockReturnValueOnce(null);
  expect(requireAccountPhone()).toBe(false);
  expect(navTo).toHaveBeenCalledTimes(1);
});
