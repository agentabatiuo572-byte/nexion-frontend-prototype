import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./profile-uid.vue?raw";
import { zh } from "@/i18n/messages/zh";

const remote = vi.hoisted(() => ({ remoteApiEnabled: true, profileApi: { profile: vi.fn() } }));
vi.mock("@/api/runtime", () => remote);
const { useProfile } = await import("@/store/profile");
const identity = { userId: 70019, countryCode: "+86", phone: "13812345678", nickname: "Alex", onboardingComplete: true };
beforeEach(() => { setActivePinia(createPinia()); remote.profileApi.profile.mockReset(); });

it("projects the authenticated UID and phone independently and clears them on rebinding", () => {
  const profile = useProfile(); profile.bindAccount("user:70019"); profile.projectServerIdentity(identity);
  expect(profile.uid).toBe("70019"); expect(profile.phoneE164).toBe("+8613812345678");
  profile.bindAccount("user:80020"); expect(profile.uid).toBe(""); expect(profile.phoneE164).toBe("");
});

it.each(["account", "new-avatar"])("discards a late avatar GET after %s changes", async (change) => {
  const profile = useProfile(); profile.bindAccount("user:70019");
  let resolve!: (value: unknown) => void;
  remote.profileApi.profile.mockReturnValue(new Promise(done => { resolve = done; }));
  const pending = profile.refreshAvatar();
  if (change === "account") profile.bindAccount("user:80020");
  else profile.projectServerAvatar({ avatarUrl: "/new.jpg", avatarRevision: "new" });
  resolve({ avatarUrl: "/old.jpg", avatarRevision: "old" }); await pending;
  expect(profile.avatarUrl).toBe(change === "account" ? "" : "/new.jpg");
});

it("shares the current avatar read with both consumers and clears it on rebinding", async () => {
  const profile = useProfile(); profile.bindAccount("user:70019");
  remote.profileApi.profile.mockResolvedValue({ avatarUrl: "/confirmed.jpg", avatarRevision: "confirmed" });
  await profile.refreshAvatar(); expect(profile.avatarUrl).toBe("/confirmed.jpg");
  expect(useProfile().avatarRevision).toBe("confirmed");
  profile.bindAccount("user:80020"); expect(profile.avatarUrl).toBe("");
});

function copyControl() {
  const profile = useProfile(); profile.projectServerIdentity(identity);
  const copyText = vi.fn(async () => true), toast = { success: vi.fn(), error: vi.fn() };
  const modules: Record<string, unknown> = { "@/store/profile": { useProfile: () => profile }, "@/i18n/use-t": { useT: () => ({ value: zh }) }, "@/store/ui": { toast }, "@/lib/share": { copyText } };
  const script = source.split('<script setup lang="ts">')[1].split('</script>')[0];
  const output = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const control = new Function("require", "exports", output + ";return {copyUid};")((id: string) => modules[id], {});
  return { ...control, profile, copyText, toast };
}

it.each([true, false])("copies the raw UID and reports clipboard success=%s accurately", async (success) => {
  const h = copyControl(); h.copyText.mockResolvedValue(success); await h.copyUid();
  expect(h.copyText).toHaveBeenCalledWith("70019");
  expect(h.toast.success).toHaveBeenCalledTimes(success ? 1 : 0);
  expect(h.toast.error).toHaveBeenCalledTimes(success ? 0 : 1);
});

it("never copies an unknown UID", async () => {
  const h = copyControl(); h.profile.bindAccount("user:80020"); await h.copyUid();
  expect(h.copyText).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled();
});
