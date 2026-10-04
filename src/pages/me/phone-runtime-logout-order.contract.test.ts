import { expect, it } from "vitest";
import mePage from "./me.vue?raw";
import securityPage from "./security.vue?raw";

it("pauses the local phone before revoking an explicit sign-out session", () => {
  const signOut = mePage.slice(mePage.indexOf("async function handleSignOut()"), mePage.indexOf("const signOutStyle"));
  const pause = signOut.indexOf("await app.pauseLocalPhoneRuntimeBeforeSignOut()");
  const revoke = signOut.indexOf("await authApi.logout()");
  expect(pause).toBeGreaterThan(0);
  expect(revoke).toBeGreaterThan(pause);
});

it("pauses the local phone before revoking a successful account-deletion session", () => {
  const deletion = securityPage.slice(securityPage.indexOf("await accountApi.requestAccountDeletion("));
  const pause = deletion.indexOf("await app.pauseLocalPhoneRuntimeBeforeSignOut()");
  const revoke = deletion.indexOf("await authApi.logout()");
  expect(pause).toBeGreaterThan(0);
  expect(revoke).toBeGreaterThan(pause);
});
