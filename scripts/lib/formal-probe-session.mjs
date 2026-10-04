import { installProbeConversationRealtime, probeConversationReadFixture } from "./probe-conversation-realtime.mjs";

export async function installFormalProbeSession(page, { authenticated = true, responseFor } = {}) {
  if (authenticated) {
    await page.addInitScript((snapshot) => {
      localStorage.setItem("nexgrid-auth-v1", JSON.stringify({ type: "object", data: snapshot }));
    }, {
      isAuthenticated: true,
      email: "",
      accountId: "user:900001",
      onboardingComplete: true,
    });
  }
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!/^\/(?:api|auth)\//.test(url.pathname)) return route.continue();
    if (url.pathname === "/auth/users/refresh") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authenticated
          ? {
              code: 0,
              message: "OK",
              data: {
                accessToken: "formal-probe-access-token",
                refreshToken: null,
                tokenType: "Bearer",
                user: {
                  userId: 900001,
                  countryCode: "+86",
                  phone: "13800000000",
                  nickname: "Formal Probe",
                  onboardingComplete: true,
                },
              },
            }
          : { code: 401, message: "AUTH_REQUIRED", data: null }),
      });
    }
    if (url.pathname === "/api/legal/terms/current") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 0,
          message: "OK",
          data: {
            source: "server",
            sourceEnvironment: "PRODUCTION",
            runId: "",
            requestedLocale: url.searchParams.get("locale") || "en",
            resolvedLocale: "en",
            requestedJurisdiction: "GLOBAL",
            resolvedJurisdiction: "GLOBAL",
            provenance: "formal-probe-fixture",
            version: "v1",
            effectiveAt: "2026-08-01T00:00:00Z",
            title: "Terms",
            summary: "Accepted for the authenticated runtime probe.",
            sections: [{ key: "probe", title: "Probe", body: "Runtime witness", sortOrder: 10 }],
            acknowledged: true,
            acknowledgedAt: "2026-08-01T00:00:00Z",
          },
        }),
      });
    }
    const custom = typeof responseFor === "function" ? responseFor(url, route.request()) : undefined;
    const fixture = custom !== undefined ? custom : authenticated ? probeConversationReadFixture(url, route.request()) : undefined;
    if (fixture !== undefined) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, message: "OK", data: fixture }),
      });
    }
    // Authenticated restoration waits for the account-owned language before
    // reading Terms. A valid profile keeps this control focused on its target
    // business page; responseFor above can still supply failure fixtures.
    if (url.pathname === "/api/app/profile" && authenticated && route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, message: "OK", data: {
          nickname: "Formal Probe", avatarUrl: "", avatarRevision: "", language: "en",
        } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authenticated
        ? { code: 0, message: "OK", data: {} }
        : { code: 401, message: "AUTH_REQUIRED", data: null }),
    });
  });
  await installProbeConversationRealtime(page, { authenticated });
}
