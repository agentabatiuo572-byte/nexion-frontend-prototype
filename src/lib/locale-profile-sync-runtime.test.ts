import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: 7, revision: 1, code: "zh", explicitRevision: 0,
  profile: vi.fn(), updateLanguage: vi.fn(),
}));
vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  sessionVault: { read: () => ({ user: { userId: state.userId } }), revision: () => state.revision },
  profileApi: { profile: () => state.profile(), updateLanguage: (language: string) => state.updateLanguage(language) },
}));
vi.mock("@/store/app", () => ({ useApp: () => ({ accountKey: `user:${state.userId}` }) }));
vi.mock("@/store/locale", () => ({ useLocaleStore: () => ({
  get code() { return state.code; },
  get explicitRevision() { return state.explicitRevision; },
  applyServerLocale: (code: string) => { state.code = code; },
}) }));

beforeEach(() => {
  vi.resetModules();
  state.userId = 7; state.revision = 1; state.code = "zh"; state.explicitRevision = 0;
  state.profile.mockReset().mockResolvedValue({ language: "en" });
  state.updateLanguage.mockReset().mockResolvedValue({ language: "zh", status: "UPDATED" });
});

test("new registration keeps its form language and initializes only the current profile", async () => {
  const runtime = await import("./locale-profile-sync-runtime");
  const tracker = await import("./locale-profile-hydration");
  runtime.hydrateCurrentProfileLocale("zh");
  await tracker.pendingProfileLocaleHydration({ accountId: "user:7", revision: 1 });
  expect(state.code).toBe("zh");
  expect(state.updateLanguage).toHaveBeenCalledExactlyOnceWith("zh");
  expect(state.profile).not.toHaveBeenCalled();
});

test("existing account login reads its saved language without overwriting it", async () => {
  const runtime = await import("./locale-profile-sync-runtime");
  const tracker = await import("./locale-profile-hydration");
  runtime.hydrateCurrentProfileLocale();
  await tracker.pendingProfileLocaleHydration({ accountId: "user:7", revision: 1 });
  expect(state.code).toBe("en");
  expect(state.updateLanguage).not.toHaveBeenCalled();
});

test("failed registration language persistence remains retryable without changing the displayed language", async () => {
  state.updateLanguage.mockRejectedValueOnce(new Error("offline"));
  const runtime = await import("./locale-profile-sync-runtime");
  const tracker = await import("./locale-profile-hydration");
  runtime.hydrateCurrentProfileLocale("zh");
  await expect(tracker.pendingProfileLocaleHydration({ accountId: "user:7", revision: 1 })).rejects.toThrow("PROFILE_LANGUAGE_SYNC_FAILED");
  expect(state.code).toBe("zh");
  expect(runtime.profileLocaleSyncState.value).toBe("failed");
  expect(state.profile).not.toHaveBeenCalled();
  runtime.retryCurrentProfileLocale();
  await tracker.pendingProfileLocaleHydration({ accountId: "user:7", revision: 1 });
  expect(runtime.profileLocaleSyncState.value).toBe("idle");
  expect(state.updateLanguage).toHaveBeenCalledTimes(2);
});

test("a stale profile failure cannot replace the retry for a newer explicit language", async () => {
  let failProfile!: (reason: Error) => void;
  state.profile.mockReturnValueOnce(new Promise((_ok, fail) => { failProfile = fail; }));
  state.updateLanguage.mockRejectedValueOnce(new Error("offline"));
  const runtime = await import("./locale-profile-sync-runtime");
  const tracker = await import("./locale-profile-hydration");
  const scope = { accountId: "user:7", revision: 1 };
  runtime.hydrateCurrentProfileLocale();
  const oldProfile = tracker.pendingProfileLocaleHydration(scope);
  state.code = "vi"; state.explicitRevision += 1;
  runtime.syncExplicitProfileLocale("vi");
  await expect(tracker.pendingProfileLocaleHydration(scope)).rejects.toThrow("PROFILE_LANGUAGE_SYNC_FAILED");
  failProfile(new Error("old profile unavailable"));
  await oldProfile;
  runtime.retryCurrentProfileLocale();
  await tracker.pendingProfileLocaleHydration(scope);
  expect(state.code).toBe("vi");
  expect(state.updateLanguage.mock.calls).toEqual([["vi"], ["vi"]]);
  expect(state.profile).toHaveBeenCalledOnce();
  expect(runtime.profileLocaleSyncState.value).toBe("idle");
});

test.each(["account", "selection"])("late profile hydration cannot overwrite a newer %s", async (change) => {
  let resolve!: (profile: { language: string }) => void;
  state.profile.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const runtime = await import("./locale-profile-sync-runtime");
  const tracker = await import("./locale-profile-hydration");
  runtime.hydrateCurrentProfileLocale();
  const pending = tracker.pendingProfileLocaleHydration({ accountId: "user:7", revision: 1 });
  if (change === "account") { state.userId = 8; state.revision = 2; }
  else state.explicitRevision += 1;
  state.code = "vi";
  resolve({ language: "en" });
  await pending;
  expect(state.code).toBe("vi");
  expect(tracker.pendingProfileLocaleHydration({ accountId: "user:8", revision: 2 })).toBeNull();
});
