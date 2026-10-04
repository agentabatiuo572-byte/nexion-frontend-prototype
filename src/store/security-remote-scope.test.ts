import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const remote = vi.hoisted(() => ({ remoteApiEnabled: true }));
const storage = vi.hoisted(() => ({
  readAccountRow: vi.fn(() => ({ passwordChangedAt: 123, twoFactorEnabled: true })),
  writeAccountRow: vi.fn(),
}));
const mockAuth = vi.hoisted(() => ({
  changeMockAuthPassword: vi.fn(),
  mockAuthSecurityState: vi.fn(() => ({ passwordChangedAt: 456, twoFactorEnabled: true })),
  setMockAuthTwoFactor: vi.fn(),
}));

vi.mock("@/api/runtime", () => remote);
vi.mock("./account-scoped-storage", () => storage);
vi.mock("@/api/mock-auth-api", () => mockAuth);

const { useSecurity } = await import("./security");

beforeEach(() => {
  setActivePinia(createPinia());
  storage.readAccountRow.mockClear();
  storage.writeAccountRow.mockClear();
  mockAuth.changeMockAuthPassword.mockClear();
  mockAuth.setMockAuthTwoFactor.mockClear();
});

describe("security remote authority", () => {
  it("does not hydrate local security rows in remote mode", () => {
    const store = useSecurity();

    expect(storage.readAccountRow).not.toHaveBeenCalled();
    expect(store.passwordChangedAt).toBe(0);
    expect(store.twoFactorEnabled).toBe(false);

    store.bindAccount("remote-account");

    expect(storage.readAccountRow).not.toHaveBeenCalled();
    expect(store.passwordChangedAt).toBe(0);
    expect(store.twoFactorEnabled).toBe(false);
  });

  it("does not persist remote security mutations through the local store", () => {
    const store = useSecurity();

    store.setTwoFactor(true);
    expect(storage.writeAccountRow).not.toHaveBeenCalled();
    expect(store.twoFactorEnabled).toBe(false);

    expect(() => store.changePassword("old-password", "new-password")).not.toThrow();
    expect(storage.writeAccountRow).not.toHaveBeenCalled();
    expect(store.passwordChangedAt).toBe(0);
  });
});
