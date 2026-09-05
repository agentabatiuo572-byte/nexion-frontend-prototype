import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
// Mirrors the accepted backend `UserLoginResponse.user` shape.  The browser
// reload below exercises the real UniApp App + My page, rather than mounting a
// component in isolation.
const serverUser = {
  userId: 60723152644,
  countryCode: "+86",
  phone: "1990811152754",
  nickname: "NexGrid 2754",
};

async function waitUntil(check, message, timeoutMs = 15_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const network = [];
  page.on("request", (request) => {
    if (request.resourceType() === "fetch" || request.resourceType() === "xhr" || request.url().includes(":8110")) {
      network.push({ type: request.resourceType(), method: request.method(), url: request.url() });
    }
  });
  // Install before App.onLaunch so unauthenticated background probes from the
  // login screen cannot race the synthetic test session below.
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    return type === "fetch" || type === "xhr" ? route.abort() : route.continue();
  });
  await page.goto(`${baseUrl}/#/pages/login/login`, { waitUntil: "domcontentloaded" });

  let loginFrame;
  await waitUntil(async () => {
    for (const candidate of page.frames()) {
      if (await candidate.locator(".lg-root").count()) {
        loginFrame = candidate;
        return true;
      }
    }
    return false;
  }, "live 5173 login frame unavailable");

  // The test session has no real bearer token, so abort only its background
  // server probes. This prevents test credentials from creating a false
  // SESSION_EXPIRED redirect while leaving the actual 5173 DOM/lifecycle and
  // account projection intact.
  // Establish the same state that authApi.login establishes after the genuine
  // HTTP response has been validated. This test intentionally does not stub a
  // Vue component; it navigates the complete H5 application below.
  const projection = await loginFrame.evaluate(async (user) => {
    const [{ completeSignIn }, { sessionVault }, { useProfile }, { useSession }] = await Promise.all([
      import("/src/auth/complete-sign-in.ts"),
      import("/src/api/runtime.ts"),
      import("/src/store/profile.ts"),
      import("/src/store/session.ts"),
    ]);
    // A test-only token is intentionally not accepted by the server. Prevent
    // the resulting fail-closed redirect from replacing the real My page while
    // the DOM assertion runs; navigation to My itself stays on the genuine
    // uni-app router and renders the production component tree.
    const reLaunch = uni.reLaunch.bind(uni);
    uni.reLaunch = (options) => options.url === "/pages/me/me" ? reLaunch(options) : undefined;
    // A returning user has already calibrated this browser. Keep the check
    // orthogonal to identity rendering so the test lands on My, not the
    // device recalibration wizard.
    const session = useSession();
    session.claim(`user:${user.userId}`);
    session.markCalibrated(`user:${user.userId}`);
    session.signOutSession();
    sessionVault.save({ accessToken: "render-proof-access", refreshToken: "render-proof-refresh", tokenType: "Bearer", user });
    const result = completeSignIn({ identity: `user:${user.userId}`, serverProfile: user, onboardingComplete: true });
    return { result, initialProjection: { name: useProfile().displayName, phone: useProfile().phoneE164 } };
  }, serverUser);
  assert.equal(projection.result.ok, true);
  assert.deepEqual(projection.initialProjection, { name: "NexGrid 2754", phone: "+861990811152754" });

  await loginFrame.evaluate(() => {
    uni.reLaunch({ url: "/pages/me/me", fail: () => {} });
  });

  let liveFrame;
  let observed = { frameUrl: "", text: "" };
  try {
    await waitUntil(async () => {
      for (const candidate of page.frames()) {
        if (!candidate.url().includes("nx_device_inner")) continue;
        const text = await candidate.locator("body").innerText().catch(() => "");
        observed = { frameUrl: candidate.url(), text: text.slice(0, 240) };
        if (text.includes("NexGrid 2754") && text.includes("+86 ••••• 2754")) {
          liveFrame = candidate;
          return true;
        }
      }
      return false;
    }, "real 5173 My page did not render the projected server identity");
  } catch (error) {
    const runtimeState = await page.frames().find((candidate) => candidate.url().includes("nx_device_inner"))?.evaluate(async () => {
      const [{ useAuth }, { sessionVault }, { useProfile }] = await Promise.all([
        import("/src/store/auth.ts"),
        import("/src/api/runtime.ts"),
        import("/src/store/profile.ts"),
      ]);
      const auth = useAuth();
      return { auth: { isAuthenticated: auth.isAuthenticated, accountId: auth.accountId }, vault: sessionVault.read(), profile: { name: useProfile().displayName, phone: useProfile().phoneE164 } };
    });
    throw new Error(`${error instanceof Error ? error.message : "LIVE_MY_RENDER_FAILED"}: ${JSON.stringify({ observed, runtimeState, network: network.slice(-12) })}`);
  }

  const liveText = await liveFrame.locator("body").innerText();
  const liveVisibility = await liveFrame.evaluate(() => {
    const node = [...document.querySelectorAll("*")].find((candidate) => candidate.textContent?.trim() === "NexGrid 2754");
    if (!node) return { present: false };
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const centerX = Math.min(innerWidth - 1, Math.max(0, rect.left + Math.max(1, rect.width / 2)));
    const centerY = Math.min(innerHeight - 1, Math.max(0, rect.top + Math.max(1, rect.height / 2)));
    const top = document.elementFromPoint(centerX, centerY);
    return {
      present: true,
      rendered: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0,
      unobscured: !!top && (top === node || node.contains(top)),
      route: location.hash,
    };
  });
  assert.match(liveText, /NexGrid 2754/);
  assert.match(liveText, /\+86 ••••• 2754/);
  assert.doesNotMatch(liveText, /Hyper Summit|\+1 \(415\)|· US/);
  assert.deepEqual(liveVisibility, {
    present: true,
    rendered: true,
    unobscured: true,
    route: "#/pages/me/me",
  });
  await liveFrame.locator("body").screenshot({ path: "scripts/.baseline/_check/live-5173-server-profile.png" });
  process.stdout.write(`live 5173 My DOM identity: ${JSON.stringify({
    name: /NexGrid 2754/.test(liveText),
    maskedPhone: /\+86 ••••• 2754/.test(liveText),
    seedIdentity: /Hyper Summit|\+1 \(415\)|· US/.test(liveText),
    visible: liveVisibility,
  })}\n`);
  process.stdout.write("server login identity render: PASS\n");
} finally {
  await browser.close();
}
