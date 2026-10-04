import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
// argv 优先于环境变量：WSL 调用 node.exe 时临时环境变量可能不会跨进 Windows
// 进程，而 argv 能稳定保留 EN/ZH 两轮运行时回归的目标语言。
const locale = process.argv[2] === "zh" || (process.argv[2] !== "en" && process.env.AUTH02_LOCALE === "zh") ? "zh" : "en";
const phoneDigits = `1390${String(Date.now()).slice(-7)}`;
const fullPhone = `+86${phoneDigits}`;
const accountId = `${fullPhone}@demo.nexgrid.ai`;
const referralCode = "NEXGRID-AB12";
const registeredTitle = locale === "zh" ? "该手机号已注册" : "This number is already registered";
const registeredBody = locale === "zh" ? "验证通过,正在登录…" : "Verification complete. Signing you in…";
const successDownloadHint = locale === "zh"
  ? "浏览器版可通过 NexGrid 官网下载 APP"
  : "Download the APP from NexGrid's website in your browser";
const successDownloadPending = locale === "zh"
  ? "官网下载 APP 地址暂未开放"
  : "APP download link unavailable";
const successDownloadLink = locale === "zh"
  ? "前往官网下载 APP"
  : "Download the APP from NexGrid";
const successTitle = locale === "zh" ? "注册成功" : "You're in";
const successSub = locale === "zh" ? "欢迎加入 NexGrid" : "Welcome to NexGrid";
const successTeamPrefix = locale === "zh" ? "欢迎加入 NexGrid," : "Welcome to NexGrid — you joined ";
const successBenefits = locale === "zh"
  ? ["APP 在线时长可加速礼包与收益解锁", "设备收益实时推送,睡醒先看进账", "更稳的连接与算力调度"]
  : ["APP online hours speed up gift & yield release", "Real-time yield alerts — wake up to earnings", "Steadier connection & compute scheduling"];
const successContinue = locale === "zh" ? "继续" : "Continue";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 🔴 超时 12s→30s(2026-07-23 C3):断言问的是「页面能不能渲染出来」,不是「能不能在
// 12 秒内渲染出来」。12s 是个任意值,它把「机器负载」这个与产品无关的变量引进了判据 ——
// 本轮并发跑多个 headless chromium 时这条稳定误报,回退代码后又「通过」,险些据此改错代码
// (实为偶发:同一份代码连跑 2 次都过)。30s 仍能抓住「页面根本渲染不出来」的真故障,
// 断言强度不变,只是不再把慢启动算成失败。
async function waitUntil(check, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];

page.on("console", collectAppConsoleErrors(errors, baseUrl));
page.on("pageerror", (error) => errors.push(error.message));

async function resolveAppFrame(selector = null) {
  let match = null;
  await waitUntil(async () => {
    const frames = [...page.frames().filter((frame) => frame !== page.mainFrame()), page.mainFrame()];
    for (const frame of frames) {
      if (!selector || (await frame.locator(selector).count())) {
        match = frame;
        return true;
      }
    }
    return false;
  }, `app frame not ready${selector ? ` for ${selector}` : ""}`);
  return match;
}

async function gotoRegister(sequence, withReferral = true) {
  await page.goto(
    `${baseUrl}/?auth02=${runId}-${sequence}#/pages/register/register${withReferral ? `?ref=${referralCode}` : ""}`,
    { waitUntil: "domcontentloaded" },
  );
  const frame = await resolveAppFrame(".rg-root");
  await frame.locator(".rg-phone__in input").waitFor({ state: "visible" });
  return frame;
}

async function gotoLogin(sequence) {
  await page.goto(
    `${baseUrl}/?auth02=${runId}-${sequence}#/pages/login/login`,
    { waitUntil: "domcontentloaded" },
  );
  const frame = await resolveAppFrame(".lg-root");
  await frame.locator(".lg-phone__in input").waitFor({ state: "visible" });
  return frame;
}

async function signOutToDefault(frame, phone) {
  await frame.evaluate(async (phoneToReset) => {
    const { useApp } = await import("/src/store/app.ts");
    const { useAuth } = await import("/src/store/auth.ts");
    const { useSession } = await import("/src/store/session.ts");
    const { rebindAccountScopedStores } = await import("/src/lib/account-scope.ts");
    const auth = useAuth();
    useApp().interruptAllTasks("runtime-auth02-sign-out");
    useSession().signOutSession();
    auth.signOut();
    useApp().bindAccount("default");
    rebindAccountScopedStores("default");
    window.__nexgridAuthDev.reset(phoneToReset);
  }, phone);
}

// FEAT-AUTH03:注册场景发码前 server 可要求滑块。真拖解层(不是 stub):读 dev bridge
// 暴露的 targetRatio,按组件同一几何式(offsetRatio = curX / (trackW − 48),容差 ±2%)
// 反解落点,用 Playwright 鼠标事件走 H5 window 级 move/up 监听链。
async function solveCaptchaSlider(frame, phone) {
  // challenge 就绪的 DOM 证据:拼块只在 challenge 加载后渲染(v-if)。
  await frame.locator(".cs-piece").waitFor({ state: "visible", timeout: 10_000 });
  const geometry = await frame.evaluate((p) => ({
    targetRatio: window.__nexgridAuthDev.inspect(p).captcha?.targetRatio ?? null,
    trackWidth: document.querySelector("#cs-track")?.getBoundingClientRect().width ?? 0,
  }), phone);
  assert(typeof geometry.targetRatio === "number" && geometry.targetRatio > 0, `captcha targetRatio unavailable for ${phone}`);
  assert(geometry.trackWidth > 48, `captcha track geometry unavailable (width=${geometry.trackWidth})`);
  const handleBox = await frame.locator(".cs-handle").boundingBox();
  const trackBox = await frame.locator("#cs-track").boundingBox();
  assert(handleBox && trackBox, "captcha slider bounding boxes unavailable");
  // 组件判定 offsetRatio = curX / (trackW − 48),坐标全在 iframe 内部系;device-shell
  // 可能对 iframe 施加缩放,页面级拖距按实测 scale 换算(未缩放时 scale=1 恒等)。
  const scale = trackBox.width / geometry.trackWidth;
  const dx = geometry.targetRatio * (geometry.trackWidth - 48) * scale;
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY, { steps: 12 });
  await page.mouse.up();
  // 成功 → 组件短暂展示成功态后 emit → 弹层卸载,页面自动带票重发。
  await frame.locator(".cs-mask").waitFor({ state: "detached", timeout: 10_000 });
}

async function enterPhoneAndSend(frame, digits = phoneDigits) {
  // 正式环境默认 +84，开发环境默认 +86；本运行时夹具统一使用开发专用的 +86 号码。
  // 显式选择 +86，既覆盖真实选择步骤，也避免测试依赖运行环境默认值。
  if ((await frame.locator(".rg-phone__cc-t").innerText()).trim() !== "+86") {
    await frame.locator(".rg-phone__cc").click();
    const row = frame.locator(".cc-row", { hasText: "+86" }).first();
    await row.waitFor({ state: "visible", timeout: 10_000 });
    await row.click();
    await waitUntil(async () => (await frame.locator(".rg-phone__cc-t").innerText()).trim() === "+86", "country code did not switch to +86");
  }
  await frame.locator(".rg-phone__in input").fill(digits);
  await frame.locator(".rg-cta").click();
  // FEAT-AUTH03 容忍式:滑块层弹出则真拖解层,未弹则直过(.rg-step2 与 .cs-card 均为
  // 条件渲染,presence 即可判)。「注册必弹滑块」的正向断言不在这儿 —— 在
  // assertAuthDirectorySchemaBarrier 的 reserve() auth03-gate 探针,这样对闸门判定做
  // 注入实验(I3 红测)时 4 条 UI 流不被连坐。
  let sawCaptcha = false;
  await waitUntil(async () => {
    if (await frame.locator(".rg-step2").count()) return true;
    if (await frame.locator(".cs-card").count()) {
      sawCaptcha = true;
      return true;
    }
    return false;
  }, "neither the OTP step nor the captcha layer appeared after send");
  if (sawCaptcha) {
    await solveCaptchaSlider(frame, `+86${digits}`);
    await frame.locator(".rg-step2").waitFor({ state: "visible", timeout: 10_000 });
  }
}

async function enterOtp(frame) {
  const inputs = frame.locator(".rg-otp__in input");
  assert((await inputs.count()) === 6, "OTP input count is not 6");
  for (let index = 0; index < 6; index += 1) await inputs.nth(index).fill("1");
}

async function snapshot(frame, expectedPhone = fullPhone, expectedAccount = accountId) {
  return frame.evaluate(async ({ expectedPhone, expectedAccount }) => {
    const { inspectAuthAccounts } = await import("/src/store/auth-account.ts");
    const { listRiskRecords } = await import("/src/store/risk-identity.ts");
    const { useAuth } = await import("/src/store/auth.ts");
    const accounts = inspectAuthAccounts();
    const risks = listRiskRecords();
    const bills = (uni.getStorageSync("nexgrid-bills-accounts-v1") || {})[expectedAccount]?.bills || [];
    const sponsorship = uni.getStorageSync("nexgrid-sponsorship-v1") || {};
    return {
      accountsForPhone: accounts.filter((account) => account.phoneE164 === expectedPhone),
      accountCount: accounts.length,
      riskCount: risks.filter((risk) => risk.accountKey === expectedAccount).length,
      bonusBills: bills.filter((bill) => bill.type === "bonus" && bill.ref?.startsWith("GIFT-")).map((bill) => bill.id).sort(),
      giftClaimed: sponsorship.bindingsByAccount?.[expectedAccount]?.giftClaimed === true,
      giftMirror: sponsorship.giftClaimedByAccount?.[expectedAccount] === true,
      auth: {
        isAuthenticated: useAuth().isAuthenticated,
        accountId: useAuth().accountId,
        onboardingComplete: useAuth().onboardingComplete,
      },
    };
  }, { expectedPhone, expectedAccount });
}

async function assertRegistrationSuccessUi(frame, expectGift, expectRouteEntryFocus = false) {
  await frame.locator(".rs-badge").waitFor({ state: "visible" });
  const themeStyles = await frame.evaluate(() => {
    const html = document.documentElement;
    const originalTheme = html.getAttribute("data-theme");
    const rgba = (value) => {
      const channels = (value.match(/[\d.]+/g) || []).map(Number);
      if (value.startsWith("color(srgb")) return [channels[0] * 255, channels[1] * 255, channels[2] * 255, channels[3] ?? 1];
      return [channels[0], channels[1], channels[2], channels[3] ?? 1];
    };
    const composite = (foreground, background) => [
      foreground[0] * foreground[3] + background[0] * (1 - foreground[3]),
      foreground[1] * foreground[3] + background[1] * (1 - foreground[3]),
      foreground[2] * foreground[3] + background[2] * (1 - foreground[3]),
      1,
    ];
    const luminance = (color) => {
      const [r, g, b] = color.slice(0, 3).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (foregroundValue, backgroundValue, underlayValue = backgroundValue) => {
      const underlay = rgba(underlayValue);
      const background = composite(rgba(backgroundValue), underlay);
      const foreground = composite(rgba(foregroundValue), background);
      const [light, dark] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
      return (light + 0.05) / (dark + 0.05);
    };
    const rows = [];
    for (const theme of ["light", "dark"]) {
      html.setAttribute("data-theme", theme);
      const root = getComputedStyle(document.querySelector(".rs-root"));
      const title = getComputedStyle(document.querySelector(".rs-title"));
      const sub = getComputedStyle(document.querySelector(".rs-sub"));
      const benefits = getComputedStyle(document.querySelector(".rs-why"));
      const pending = getComputedStyle(document.querySelector(".rs-h5-download__action--disabled"));
      const chip = document.querySelector(".rs-chip");
      const chipText = document.querySelector(".rs-chip__t");
      const gift = document.querySelector(".rs-gift");
      const originalChipClass = chip?.getAttribute("class") || "";
      const originalTextClass = chipText?.getAttribute("class") || "";
      const sampleChip = (variant) => {
        if (!chip || !chipText || !gift) return null;
        chip.classList.remove("rs-chip--ok", "rs-chip--pd");
        chip.classList.add(variant === "posted" ? "rs-chip--ok" : "rs-chip--pd");
        chipText.classList.remove("rs-chip__t--ok", "rs-chip__t--pd");
        chipText.classList.add(variant === "posted" ? "rs-chip__t--ok" : "rs-chip__t--pd");
        return contrast(getComputedStyle(chipText).color, getComputedStyle(chip).backgroundColor, getComputedStyle(gift).backgroundColor);
      };
      const postedChipContrast = sampleChip("posted");
      const pendingChipContrast = sampleChip("pending");
      if (chip) chip.setAttribute("class", originalChipClass);
      if (chipText) chipText.setAttribute("class", originalTextClass);
      rows.push({
        theme,
        titleContrast: contrast(title.color, root.backgroundColor),
        subContrast: contrast(sub.color, root.backgroundColor),
        rootBackground: root.backgroundColor,
        benefitBackground: benefits.backgroundColor,
        pendingBackground: pending.backgroundColor,
        postedChipContrast,
        pendingChipContrast,
      });
    }
    if (originalTheme) html.setAttribute("data-theme", originalTheme);
    else html.removeAttribute("data-theme");
    return rows;
  });
  for (const row of themeStyles) {
    assert(row.titleContrast >= 4.5, `${row.theme} success title contrast=${row.titleContrast}`);
    assert(row.subContrast >= 4.5, `${row.theme} success subtitle contrast=${row.subContrast}`);
    assert(row.benefitBackground !== row.rootBackground, `${row.theme} benefit card lost its surface layer`);
    assert(row.pendingBackground !== row.rootBackground, `${row.theme} disabled download placeholder lost its surface layer`);
    if (row.postedChipContrast !== null) assert(row.postedChipContrast >= 4.5, `${row.theme} posted-gift chip contrast=${row.postedChipContrast}`);
    if (row.pendingChipContrast !== null) assert(row.pendingChipContrast >= 4.5, `${row.theme} pending-gift chip contrast=${row.pendingChipContrast}`);
  }
  const metrics = await frame.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`missing ${selector}`);
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left, height: bounds.height };
    };
    const placeholder = document.querySelector(".rs-h5-download__action--disabled");
    const criticalStyles = [".rs-root", ".rs-content", ".rs-h5-download", ".rs-footer", ".rs-continue"].map((selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return {
        selector,
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        pointerEvents: style.pointerEvents,
      };
    });
    return {
      viewportHeight: innerHeight,
      badge: rect(".rs-badge"),
      benefits: rect(".rs-why"),
      prompt: rect(".rs-h5-download"),
      continueCta: rect(".rs-continue"),
      benefitRows: document.querySelectorAll(".rs-why__r").length,
      giftCount: document.querySelectorAll(".rs-gift").length,
      body: document.body.innerText,
      badgeHasCheck: !!document.querySelector(".rs-badge__in svg path"),
      title: document.querySelector(".rs-title")?.textContent?.trim() || "",
      titleRole: document.querySelector(".rs-title")?.getAttribute("role"),
      titleLevel: document.querySelector(".rs-title")?.getAttribute("aria-level"),
      titleFocused: document.activeElement?.classList.contains("rs-title") === true,
      sub: document.querySelector(".rs-sub")?.textContent?.trim() || "",
      benefitsText: [...document.querySelectorAll(".rs-why__t")].map((element) => element.textContent?.trim() || ""),
      continueText: document.querySelector(".rs-continue")?.textContent?.trim() || "",
      visibleDecorativeSvgs: [...document.querySelectorAll("svg")].filter((element) => element.getAttribute("aria-hidden") !== "true" || element.getAttribute("focusable") !== "false").length,
      criticalStyles,
      placeholder: placeholder && {
        role: placeholder.getAttribute("role"),
        ariaDisabled: placeholder.getAttribute("aria-disabled"),
        href: placeholder.getAttribute("href"),
      },
    };
  });

  const visualCenter = (metrics.badge.top + metrics.benefits.bottom) / 2;
  assert(
    Math.abs(visualCenter - metrics.viewportHeight / 2) <= metrics.viewportHeight * 0.10,
    `success content is not vertically centered: ${visualCenter}/${metrics.viewportHeight / 2}`,
  );
  const bottomGap = metrics.viewportHeight - metrics.continueCta.bottom;
  assert(bottomGap >= 22 && bottomGap <= 48, `success continue CTA bottom gap=${bottomGap}`);
  assert(metrics.benefitRows === 3, "success benefit rows are not exactly three");
  assert(metrics.giftCount === (expectGift ? 1 : 0), `success gift-state mismatch: ${metrics.giftCount}/${expectGift}`);
  assert(metrics.badgeHasCheck, "success badge lost its check icon");
  assert(metrics.title === successTitle && metrics.titleRole === "heading" && metrics.titleLevel === "1", "success heading semantics or copy drifted");
  if (expectRouteEntryFocus) assert(metrics.titleFocused, "success heading did not receive route-entry focus");
  assert(metrics.visibleDecorativeSvgs === 0, "success page exposed decorative SVGs to assistive technology");
  assert(
    expectGift ? metrics.sub.startsWith(successTeamPrefix) && metrics.sub.length > successTeamPrefix.length : metrics.sub === successSub,
    `success subtitle copy drifted: ${metrics.sub}`,
  );
  assert(JSON.stringify(metrics.benefitsText) === JSON.stringify(successBenefits), `success benefit copy drifted: ${JSON.stringify(metrics.benefitsText)}`);
  assert(metrics.continueText === successContinue, "success Continue copy drifted");
  for (const style of metrics.criticalStyles) {
    assert(style.display !== "none" && style.visibility !== "hidden" && style.opacity > 0, `success critical block is visually hidden: ${JSON.stringify(style)}`);
    if (style.selector === ".rs-continue") assert(style.pointerEvents !== "none", "success Continue CTA ignores pointer input");
  }
  assert(metrics.benefits.bottom <= metrics.prompt.top, "success content overlaps the H5 download prompt");
  assert(metrics.prompt.bottom <= metrics.continueCta.top, "H5 download prompt overlaps the continue CTA");
  if (metrics.viewportHeight > 720) assert(metrics.body.includes(successDownloadHint), "H5 official-download hint is missing");
  assert(metrics.body.includes(successDownloadPending), "blank official URL does not expose an unavailable reason");
  assert(!/APP 即将上线|APP launching soon/.test(metrics.body), "obsolete coming-soon copy remains");
  assert(
    metrics.placeholder?.role === "status" && metrics.placeholder.ariaDisabled === "true" && !metrics.placeholder.href,
    `blank official URL rendered a dead link: ${JSON.stringify(metrics.placeholder)}`,
  );

  const officialUrl = "https://download.example.invalid/nexgrid";
  for (const invalidUrl of ["http://download.example.invalid/nexgrid", "javascript:alert(1)", "not-a-url"]) {
    await frame.evaluate(async (url) => {
      const { useConfig } = await import("/src/store/config.ts");
      useConfig().config.share.appDownload.officialUrl = url;
    }, invalidUrl);
    await frame.locator(".rs-h5-download__action--disabled").waitFor({ state: "visible" });
    assert(await frame.locator(".rs-h5-download__action:not(.rs-h5-download__action--disabled)").count() === 0, `unsafe official URL became clickable: ${invalidUrl}`);
  }
  await page.context().route(officialUrl, (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>NexGrid download</title><p>official download test</p>",
  }));
  await frame.evaluate(async (url) => {
    const { useConfig } = await import("/src/store/config.ts");
    useConfig().config.share.appDownload.officialUrl = url;
  }, officialUrl);
  const officialLink = frame.locator(".rs-h5-download__action:not(.rs-h5-download__action--disabled)");
  await officialLink.waitFor({ state: "visible" });
  assert((await officialLink.innerText()).includes(successDownloadLink), "configured official-download link has the wrong label");
  const linkA11y = await officialLink.evaluate((element) => ({
    role: element.getAttribute("role"),
    tabindex: element.getAttribute("tabindex"),
  }));
  assert(linkA11y.role === "link" && linkA11y.tabindex === "0", "official-download link is not keyboard reachable");
  async function assertOfficialActivation(label, activate) {
    const mainUrlBeforeDownload = page.url();
    const popupPromise = page.context().waitForEvent("page");
    await activate();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    assert(popup.url() === officialUrl, `${label} opened the wrong official page: ${popup.url()}`);
    assert(await popup.evaluate(() => window.opener === null), `${label} retained a window.opener handle`);
    assert(page.url() === mainUrlBeforeDownload, `${label} also navigated the registration page`);
    await popup.close();
  }
  await assertOfficialActivation("official download click", () => officialLink.click());
  await officialLink.focus();
  await assertOfficialActivation("official download Enter", () => officialLink.press("Enter"));
  await assertOfficialActivation("official download Space", () => officialLink.press("Space"));
  await page.context().unroute(officialUrl);
  await frame.evaluate(async () => {
    const { useConfig } = await import("/src/store/config.ts");
    useConfig().config.share.appDownload.officialUrl = "";
  });
  await frame.locator(".rs-h5-download__action--disabled").waitFor({ state: "visible" });

  await frame.evaluate(() => {
    window.__successOriginalReLaunch = uni.reLaunch;
    window.__successReLaunchUrl = "";
    uni.reLaunch = (options) => {
      window.__successReLaunchUrl = options?.url || "";
    };
  });
  const continueCta = frame.locator(".rs-continue");
  await continueCta.click();
  assert(
    await frame.evaluate(() => window.__successReLaunchUrl) === "/pages/onboarding/estimator",
    "success continue click did not enter onboarding",
  );
  await frame.evaluate(() => { window.__successReLaunchUrl = ""; });
  await continueCta.focus();
  await continueCta.press("Enter");
  assert(
    await frame.evaluate(() => window.__successReLaunchUrl) === "/pages/onboarding/estimator",
    "success continue Enter key did not enter onboarding",
  );
  await frame.evaluate(() => { window.__successReLaunchUrl = ""; });
  await continueCta.press("Space");
  assert(
    await frame.evaluate(() => window.__successReLaunchUrl) === "/pages/onboarding/estimator",
    "success continue Space key did not enter onboarding",
  );
  await frame.evaluate(() => {
    uni.reLaunch = window.__successOriginalReLaunch;
    delete window.__successOriginalReLaunch;
    delete window.__successReLaunchUrl;
  });
}

async function assertAuthDirectorySchemaBarrier(frame) {
  const suffix = String(Date.now()).slice(-7);
  const legacyPhone = `+861355${suffix}`;
  const legacyAccount = `${legacyPhone}@demo.nexgrid.ai`;
  const recoveryPhone = `+861358${suffix}`;
  const recoveryAccount = `${recoveryPhone}@demo.nexgrid.ai`;
  const cleanupPhone = `+861359${suffix}`;
  const cleanupAccount = `${cleanupPhone}@demo.nexgrid.ai`;
  const pendingPhone = `+861356${suffix}`;
  const pendingAccount = `${pendingPhone}@demo.nexgrid.ai`;
  const freshPhone = `+861357${suffix}`;
  const result = await frame.evaluate(async ({ legacyPhone, legacyAccount, recoveryPhone, recoveryAccount, cleanupPhone, cleanupAccount, pendingPhone, pendingAccount, freshPhone }) => {
    const { buildCandidateRecord, readRiskRecordsStrict } = await import("/src/store/risk-identity.ts");
    const {
      AUTH_ACCOUNT_STORAGE_KEY,
      AUTH_ACCOUNT_LEGACY_MIGRATION_KEY,
      resolveAuthAccount,
      resolveAuthAccountById,
    } = await import("/src/store/auth-account.ts");
    const { captchaChallenge, captchaVerify, otpSend, otpVerify, registerVerifiedPhone } = await import("/src/store/auth-otp.ts");
    const { commitRegistration } = await import("/src/store/risk-cluster.ts");
    const { completeSignIn } = await import("/src/auth/complete-sign-in.ts");
    const riskKey = "nexgrid-risk-registry-v1";
    const reset = () => localStorage.clear();
    const reserve = async (phone) => {
      // FEAT-AUTH03 正向断言:注册场景无票 send 必须返回 captcha_required(harness 既
      // 适配又是 AUTH03 的 runtime 证据,不是单纯绕过;删掉 otpSend 判定行时这里必红)。
      // captcha_required 分支不写 SendLog,后续带票 send 不会撞冷却。
      const gateProbe = await otpSend(phone, "register");
      if (gateProbe.ok || gateProbe.error !== "captcha_required") {
        return { ok: false, stage: "auth03-gate", gateProbe };
      }
      const challenge = await captchaChallenge(phone);
      const pass = await captchaVerify(phone, {
        challengeId: challenge.challengeId,
        offsetRatio: challenge.targetRatio,
      });
      if (!pass.ok) return { ok: false, stage: "captcha", pass };
      const sent = await otpSend(phone, "register", pass.ticket);
      if (!sent.ok) return { ok: false, stage: "send", sent };
      const verified = await otpVerify(phone, "register", sent.requestId, "111111");
      if (!verified.ok) return { ok: false, stage: "verify", verified };
      return registerVerifiedPhone(phone, verified.verifyToken, {
        sponsorCode: null,
        giftRoute: "pending_review",
      });
    };

    // A/B: schema1 is the only legacy provenance. Its first migration seals risk to
    // schema2; a later directory deletion must not recreate an active account.
    reset();
    uni.setStorageSync(riskKey, {
      schema: 1,
      accounts: { [legacyAccount]: buildCandidateRecord(legacyAccount, null) },
    });
    uni.removeStorageSync(AUTH_ACCOUNT_STORAGE_KEY);
    const legacyFirst = resolveAuthAccount(legacyPhone);
    const legacyRiskAfterMigration = readRiskRecordsStrict();
    const legacyDirectory = uni.getStorageSync(AUTH_ACCOUNT_STORAGE_KEY);
    uni.removeStorageSync(AUTH_ACCOUNT_STORAGE_KEY);
    const legacyAfterDeletePhone = resolveAuthAccount(legacyPhone);
    const legacyAfterDeleteId = resolveAuthAccountById(legacyAccount);
    const legacyDirectoryRecreated = uni.getStorageSync(AUTH_ACCOUNT_STORAGE_KEY);

    // C: schema1→schema2 的两 key 迁移中，目录写失败一次也必须保留可恢复证据；
    // 恢复写入后只补完这个明确的 legacy 事务，不能把普通 schema2 缺目录重建。
    reset();
    uni.setStorageSync(riskKey, {
      schema: 1,
      accounts: { [recoveryAccount]: buildCandidateRecord(recoveryAccount, null) },
    });
    const originalSetStorageSync = uni.setStorageSync;
    let blockedDirectoryWrite = false;
    uni.setStorageSync = (key, value) => {
      if (!blockedDirectoryWrite && key === AUTH_ACCOUNT_STORAGE_KEY) {
        blockedDirectoryWrite = true;
        throw new Error("runtime injected auth-directory write failure");
      }
      return originalSetStorageSync.call(uni, key, value);
    };
    let interruptedLegacyMigration;
    try {
      interruptedLegacyMigration = resolveAuthAccount(recoveryPhone);
    } finally {
      uni.setStorageSync = originalSetStorageSync;
    }
    const recoveryRiskAfterFailure = readRiskRecordsStrict();
    const recoveryDirectoryAfterFailure = uni.getStorageSync(AUTH_ACCOUNT_STORAGE_KEY);
    const recoveryJournalAfterFailure = uni.getStorageSync(AUTH_ACCOUNT_LEGACY_MIGRATION_KEY);
    const recoveredLegacy = resolveAuthAccount(recoveryPhone);
    const recoveryDirectory = uni.getStorageSync(AUTH_ACCOUNT_STORAGE_KEY);
    const recoveryJournalAfterSuccess = uni.getStorageSync(AUTH_ACCOUNT_LEGACY_MIGRATION_KEY);

    // D: 目录成功后 journal 的 remove 即使失败，也必须留下 committed 栅栏；此时
    // 再删除目录不得触发 legacy 恢复，避免普通 schema2 数据复活为 active。
    reset();
    uni.setStorageSync(riskKey, {
      schema: 1,
      accounts: { [cleanupAccount]: buildCandidateRecord(cleanupAccount, null) },
    });
    const originalRemoveStorageSync = uni.removeStorageSync;
    let blockedJournalCleanup = false;
    uni.removeStorageSync = (key) => {
      if (!blockedJournalCleanup && key === AUTH_ACCOUNT_LEGACY_MIGRATION_KEY) {
        blockedJournalCleanup = true;
        throw new Error("runtime injected legacy journal cleanup failure");
      }
      return originalRemoveStorageSync.call(uni, key);
    };
    let cleanupMigration;
    try {
      cleanupMigration = resolveAuthAccount(cleanupPhone);
    } finally {
      uni.removeStorageSync = originalRemoveStorageSync;
    }
    const cleanupJournalAfterFailure = uni.getStorageSync(AUTH_ACCOUNT_LEGACY_MIGRATION_KEY);
    uni.removeStorageSync(AUTH_ACCOUNT_STORAGE_KEY);
    const cleanupAfterDirectoryDelete = resolveAuthAccount(cleanupPhone);
    const cleanupDirectoryRecreated = uni.getStorageSync(AUTH_ACCOUNT_STORAGE_KEY);

    // E: a real pending reservation that has reached K1 risk persistence writes
    // schema2. Removing only the directory must fail closed for both lookup paths.
    reset();
    const pendingReserve = await reserve(pendingPhone);
    const pendingRiskCommitted = pendingReserve.ok && commitRegistration(pendingAccount, { sponsorId: null });
    const pendingBeforeDelete = resolveAuthAccountById(pendingAccount);
    const pendingRisk = readRiskRecordsStrict();
    uni.removeStorageSync(AUTH_ACCOUNT_STORAGE_KEY);
    const pendingAfterDeletePhone = resolveAuthAccount(pendingPhone);
    const pendingAfterDeleteId = resolveAuthAccountById(pendingAccount);
    const pendingSignIn = completeSignIn({ identity: pendingAccount });

    // F: an empty store still permits a genuine pending reservation for a new phone.
    reset();
    const freshReserve = await reserve(freshPhone);
    const freshById = resolveAuthAccountById(`${freshPhone}@demo.nexgrid.ai`);
    const freshDirectory = uni.getStorageSync(AUTH_ACCOUNT_STORAGE_KEY);
    return {
      legacyFirst,
      legacyRiskAfterMigration,
      legacyDirectory,
      legacyAfterDeletePhone,
      legacyAfterDeleteId,
      legacyDirectoryRecreated,
      blockedDirectoryWrite,
      interruptedLegacyMigration,
      recoveryRiskAfterFailure,
      recoveryDirectoryAfterFailure,
      recoveryJournalAfterFailure,
      recoveredLegacy,
      recoveryDirectory,
      recoveryJournalAfterSuccess,
      blockedJournalCleanup,
      cleanupMigration,
      cleanupJournalAfterFailure,
      cleanupAfterDirectoryDelete,
      cleanupDirectoryRecreated,
      pendingReserve,
      pendingRiskCommitted,
      pendingBeforeDelete,
      pendingRisk,
      pendingAfterDeletePhone,
      pendingAfterDeleteId,
      pendingSignIn,
      freshReserve,
      freshById,
      freshDirectory,
    };
  }, { legacyPhone, legacyAccount, recoveryPhone, recoveryAccount, cleanupPhone, cleanupAccount, pendingPhone, pendingAccount, freshPhone });

  assert(result.legacyFirst?.ok && result.legacyFirst.account?.status === "active" && result.legacyFirst.account?.onboardingComplete, "schema1 legacy account did not migrate as active/onboarding-complete");
  assert(result.legacyRiskAfterMigration?.ok && result.legacyRiskAfterMigration.sourceSchema === 2, "legacy migration did not seal risk storage to schema2");
  assert(result.legacyDirectory?.schema === 2, "legacy migration did not write auth directory schema2");
  assert(!result.legacyAfterDeletePhone?.ok && result.legacyAfterDeletePhone.error === "account_directory_unavailable", "schema2 legacy directory deletion recreated an active phone account");
  assert(!result.legacyAfterDeleteId?.ok && result.legacyAfterDeleteId.error === "account_directory_unavailable", "schema2 legacy directory deletion recreated an active account id");
  assert(!result.legacyDirectoryRecreated, "schema2 legacy directory was unexpectedly rewritten after deletion");
  assert(result.blockedDirectoryWrite, "legacy migration failure injection did not block the auth-directory write");
  assert(!result.interruptedLegacyMigration?.ok && result.interruptedLegacyMigration.error === "account_directory_unavailable", "interrupted legacy migration did not fail safely for the current request");
  assert(result.recoveryRiskAfterFailure?.ok && result.recoveryRiskAfterFailure.sourceSchema === 2, "interrupted legacy migration did not preserve sealed risk evidence");
  assert(!result.recoveryDirectoryAfterFailure, "interrupted legacy migration unexpectedly wrote the auth directory");
  assert(result.recoveryJournalAfterFailure?.state === "risk-sealed-pending-directory", "interrupted legacy migration did not preserve its recoverable journal state");
  assert(result.recoveredLegacy?.ok && result.recoveredLegacy.account?.status === "active", "legacy migration did not recover after a transient auth-directory write failure");
  assert(result.recoveryDirectory?.schema === 2, "recovered legacy migration did not write the auth directory");
  assert(!result.recoveryJournalAfterSuccess, "legacy migration recovery journal was not cleared after a successful directory write");
  assert(result.blockedJournalCleanup, "legacy migration cleanup-failure injection did not block journal removal");
  assert(result.cleanupMigration?.ok && result.cleanupMigration.account?.status === "active", "legacy migration did not finish before the injected journal cleanup failure");
  assert(result.cleanupJournalAfterFailure?.state === "directory-committed", "failed journal cleanup did not retain a committed fail-closed barrier");
  assert(!result.cleanupAfterDirectoryDelete?.ok && result.cleanupAfterDirectoryDelete.error === "account_directory_unavailable", "committed legacy migration recreated an account after directory deletion");
  assert(!result.cleanupDirectoryRecreated, "committed legacy migration unexpectedly rewrote a deleted directory");
  assert(
    result.pendingReserve?.stage !== "auth03-gate" && result.freshReserve?.stage !== "auth03-gate",
    `AUTH03 gate probe failed: bare register send did not return captcha_required (pending=${JSON.stringify(result.pendingReserve?.gateProbe ?? null)} fresh=${JSON.stringify(result.freshReserve?.gateProbe ?? null)})`,
  );
  assert(
    result.pendingReserve?.ok && result.pendingRiskCommitted,
    `pending reservation did not reach persisted K1 state: ${JSON.stringify({ reserve: result.pendingReserve, committed: result.pendingRiskCommitted })}`,
  );
  assert(result.pendingBeforeDelete?.ok && result.pendingBeforeDelete.account?.status === "pending", "pending reservation was not preserved before deletion");
  assert(result.pendingRisk?.ok && result.pendingRisk.sourceSchema === 2, "pending K1 persistence did not seal risk storage to schema2");
  assert(!result.pendingAfterDeletePhone?.ok && result.pendingAfterDeletePhone.error === "account_directory_unavailable", "pending phone became resolvable after directory deletion");
  assert(!result.pendingAfterDeleteId?.ok && result.pendingAfterDeleteId.error === "account_directory_unavailable", "pending account id became resolvable after directory deletion");
  assert(result.pendingSignIn?.ok === false && result.pendingSignIn.error === "account_directory_unavailable", "pending account bypassed canonical sign-in after directory deletion");
  assert(result.freshReserve?.ok && !result.freshReserve.alreadyCommitted, "empty storage did not permit a new pending reservation");
  assert(result.freshById?.ok && result.freshById.account?.status === "pending", "fresh reservation did not remain pending");
  assert(result.freshDirectory?.schema === 2, "fresh reservation did not create auth directory schema2");
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  let localeFrame = await gotoRegister("schema-barrier");
  await assertAuthDirectorySchemaBarrier(localeFrame);
  await page.evaluate(() => localStorage.clear());
  localeFrame = await gotoRegister("locale");
  await localeFrame.evaluate(async (nextLocale) => {
    const { useLocaleStore } = await import("/src/store/locale.ts");
    useLocaleStore().setLocale(nextLocale);
  }, locale);

  // 新号在验证码前不泄露账号状态，验码后才走设置密码；成功后只创建一套账号、风控
  // 与礼包副作用。
  let frame = await gotoRegister("new");
  assert(!(await frame.locator("body").innerText()).includes(registeredTitle), "new-number page disclosed account status before OTP");
  await enterPhoneAndSend(frame);
  assert(!(await frame.locator("body").innerText()).includes(registeredTitle), "OTP send disclosed account status");
  await enterOtp(frame);
  await frame.locator(".rg-step3").waitFor({ state: "visible", timeout: 10_000 });

  const beforeCreate = await frame.evaluate((phone) => window.__nexgridAuthDev.inspect(phone), fullPhone);
  assert(beforeCreate.account?.ok && beforeCreate.account.account === null, "new phone became active before password submit");
  assert(beforeCreate.verifyTokens?.[0]?.nextAction === "continue_registration", "new-number OTP did not continue registration");

  const passwords = frame.locator(".rg-step3 input");
  await passwords.nth(0).fill("StrongPass123!");
  await passwords.nth(1).fill("StrongPass123!");
  await frame.locator(".rg-cta").click();
  await waitUntil(() => Promise.resolve(page.url().includes("#/pages/register/success")), "new-number registration did not reach success page");
  frame = await resolveAppFrame(".rs-root");
  await assertRegistrationSuccessUi(frame, true, true);
  const afterCreate = await snapshot(frame);
  assert(afterCreate.accountsForPhone.length === 1 && afterCreate.accountCount === 1, "new registration did not create exactly one account");
  assert(afterCreate.riskCount === 1, "new registration did not create exactly one risk record");
  assert(afterCreate.bonusBills.length === 2, "new registration did not create two welcome-gift bills");
  assert(afterCreate.giftClaimed && afterCreate.giftMirror, "welcome gift was not safely bound to this account");
  assert(afterCreate.auth.isAuthenticated && afterCreate.auth.accountId === accountId, "new registration did not establish the expected session");
  assert(!afterCreate.auth.onboardingComplete, "new registration skipped onboarding");

  // 真实礼包态也必须在紧凑 iPhone 视口首屏落到 Home Indicator 安全线上方；
  // 不能靠脚本先滚到底再把贴底错位洗成绿灯。
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(
    `${baseUrl}/?nx_device=off&nx_device_inner=1&auth02=${runId}-gift-compact#/pages/register/success`,
    { waitUntil: "domcontentloaded" },
  );
  frame = await resolveAppFrame(".rs-root");
  await frame.locator(".rs-gift").waitFor({ state: "visible" });
  const compactGiftGeometry = await frame.evaluate(() => {
    const cta = document.querySelector(".rs-cta")?.getBoundingClientRect();
    const home = document.querySelector(".nx-home-indicator")?.getBoundingClientRect();
    const prompt = document.querySelector(".rs-h5-download")?.getBoundingClientRect();
    const root = document.querySelector(".rs-root");
    return cta && home && prompt && root ? {
      ctaTop: cta.top,
      ctaBottom: cta.bottom,
      promptBottom: prompt.bottom,
      homeTop: home.top,
      scrollTop: root.scrollTop,
    } : null;
  });
  assert(compactGiftGeometry?.scrollTop === 0, `compact gift success was pre-scrolled: ${JSON.stringify(compactGiftGeometry)}`);
  assert(
    compactGiftGeometry && compactGiftGeometry.ctaBottom <= compactGiftGeometry.homeTop - 16,
    `compact gift CTA enters Home Indicator reserve: ${JSON.stringify(compactGiftGeometry)}`,
  );
  assert(
    compactGiftGeometry && compactGiftGeometry.promptBottom <= compactGiftGeometry.ctaTop - 12,
    `compact gift prompt overlaps CTA: ${JSON.stringify(compactGiftGeometry)}`,
  );
  await page.setViewportSize({ width: 390, height: 844 });

  // 将该账号完成 onboarding 后按真实登出链退出，证明回访入口恢复的是同一账号而非
  // 再走注册副作用。
  await frame.evaluate(async (phone) => {
    const { useApp } = await import("/src/store/app.ts");
    const { useAuth } = await import("/src/store/auth.ts");
    const { markAuthAccountOnboardingComplete } = await import("/src/store/auth-account.ts");
    const { useSession } = await import("/src/store/session.ts");
    const { rebindAccountScopedStores } = await import("/src/lib/account-scope.ts");
    const auth = useAuth();
    if (!markAuthAccountOnboardingComplete(auth.accountId)) throw new Error("onboarding account fact did not persist");
    auth.completeOnboarding();
    useApp().interruptAllTasks("runtime-auth02-sign-out");
    useSession().signOutSession();
    auth.signOut();
    useApp().bindAccount("default");
    rebindAccountScopedStores("default");
    window.__nexgridAuthDev.reset(phone);
  }, fullPhone);

  // 已注册号同样不在发码前泄露状态；验码后立即进入既有登录链，目标页 toast
  // 持续展示双行反馈；这个过程中不得挂载密码页或再次进入注册成功页。
  frame = await gotoRegister("existing");
  assert(!(await frame.locator("body").innerText()).includes(registeredTitle), "existing-number page disclosed account status before OTP");
  await enterPhoneAndSend(frame);
  assert(!(await frame.locator("body").innerText()).includes(registeredTitle), "existing-number OTP send disclosed account status");
  await frame.evaluate(() => {
    window.__auth02SawPassword = false;
    const inspect = () => {
      if (document.querySelector(".rg-step3")) window.__auth02SawPassword = true;
    };
    new MutationObserver(inspect).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    inspect();
  });
  await enterOtp(frame);
  await waitUntil(() => Promise.resolve(!page.url().includes("#/pages/register/register")), "existing-number OTP did not switch to the existing sign-in route");
  assert(!(await frame.evaluate(() => window.__auth02SawPassword)), "existing-number flow mounted the password step");
  frame = await resolveAppFrame();
  const toastFrame = await resolveAppFrame(".nx-toast");
  const toast = toastFrame.locator(".nx-toast").first();
  const toastText = await toast.innerText();
  const toastA11y = await toast.evaluate((element) => ({
    role: element.getAttribute("role"),
    live: element.getAttribute("aria-live"),
    atomic: element.getAttribute("aria-atomic"),
  }));
  assert(toastText.includes(registeredTitle), "existing-number handoff feedback did not persist to the destination toast");
  assert(toastText.includes(registeredBody), "existing-number handoff toast did not explain automatic sign-in");
  assert(toastA11y.role === "status" && toastA11y.live === "polite" && toastA11y.atomic === "true", "existing-number handoff toast is not announced to assistive technology");
  if (process.env.AUTH02_SCREENSHOT) {
    await toast.screenshot({ path: process.env.AUTH02_SCREENSHOT });
  }
  const afterExistingSignIn = await snapshot(frame);
  assert(afterExistingSignIn.auth.isAuthenticated && afterExistingSignIn.auth.accountId === accountId, "existing-number flow authenticated the wrong account");
  assert(afterExistingSignIn.auth.onboardingComplete, "existing-number flow lost completed onboarding state");
  assert(afterExistingSignIn.accountCount === afterCreate.accountCount && afterExistingSignIn.accountsForPhone.length === 1, "existing-number flow created another account");
  assert(afterExistingSignIn.riskCount === afterCreate.riskCount, "existing-number flow created another risk record");
  assert(JSON.stringify(afterExistingSignIn.bonusBills) === JSON.stringify(afterCreate.bonusBills), "existing-number flow created duplicate welcome-gift bills");
  assert(afterExistingSignIn.giftClaimed && afterExistingSignIn.giftMirror, "existing-number flow changed gift ownership");

  // 登录收口不能让不存在的手机号身份绕过目录直接建立会话。
  const unregisteredGuard = await frame.evaluate(async ({ expectedAccount, phone }) => {
    const { completeSignIn } = await import("/src/auth/complete-sign-in.ts");
    const { useAuth } = await import("/src/store/auth.ts");
    const result = completeSignIn({ identity: `${phone}@demo.nexgrid.ai` });
    return { result, accountId: useAuth().accountId, expectedAccount };
  }, { expectedAccount: accountId, phone: `+861351${String(Date.now()).slice(-7)}` });
  assert(unregisteredGuard.result?.ok === false && unregisteredGuard.result.error === "account_not_found", "unregistered phone bypassed the account directory");
  assert(unregisteredGuard.accountId === unregisteredGuard.expectedAccount, "rejected sign-in changed the active account");

  // 登录 OTP 第六位触发验码后立刻“更换手机号”，旧异步响应不得在退回步骤一后
  // 把已注册账号重新登录。
  await signOutToDefault(frame, fullPhone);
  let loginFrame = await gotoLogin("stale-login");
  await loginFrame.locator(".lg-switch").click();
  // 登录页同样显式选择开发专用的 +86，避免依赖语言或构建环境默认值。
  if ((await loginFrame.locator(".lg-phone__cc-t").innerText()).trim() !== "+86") {
    await loginFrame.locator(".lg-phone__cc").click();
    const row = loginFrame.locator(".cc-row", { hasText: "+86" }).first();
    await row.waitFor({ state: "visible", timeout: 10_000 });
    await row.click();
    await waitUntil(async () => (await loginFrame.locator(".lg-phone__cc-t").innerText()).trim() === "+86", "login country code did not switch to +86");
  }
  await loginFrame.locator(".lg-phone__in input").fill(phoneDigits);
  await loginFrame.locator(".lg-cta").click();
  await loginFrame.locator(".lg-otp").waitFor({ state: "visible", timeout: 10_000 });
  const loginOtpInputs = loginFrame.locator(".lg-otp__in input");
  assert((await loginOtpInputs.count()) === 6, "login OTP input count is not 6");
  for (let index = 0; index < 6; index += 1) await loginOtpInputs.nth(index).fill("1");
  await loginFrame.locator(".lg-resend__change").click();
  await page.waitForTimeout(1_200);
  assert(page.url().includes("#/pages/login/login"), "stale login OTP response navigated away from the login page");
  await loginFrame.locator(".lg-phone__in input").waitFor({ state: "visible" });
  const staleLoginState = await loginFrame.evaluate(async (expectedAccount) => {
    const { useApp } = await import("/src/store/app.ts");
    const { useAuth } = await import("/src/store/auth.ts");
    const { readAccountSessionRecords, useSession } = await import("/src/store/session.ts");
    const auth = useAuth();
    const session = useSession();
    return {
      auth: { isAuthenticated: auth.isAuthenticated, accountId: auth.accountId },
      session: { status: session.status, sessionId: session.sessionId, activeTargetSessions: readAccountSessionRecords(expectedAccount).length },
      appAccountKey: useApp().accountKey,
    };
  }, accountId);
  assert(!staleLoginState.auth.isAuthenticated && staleLoginState.auth.accountId === "default", "stale login OTP response restored authentication");
  assert(staleLoginState.session.sessionId === "" && staleLoginState.session.activeTargetSessions === 0, `stale login OTP response recreated a session: ${JSON.stringify(staleLoginState)}`);
  assert(staleLoginState.appAccountKey === "default", "stale login OTP response rebound the app account scope");

  // K1 落表失败时，注册页面虽已暂时切到新作用域，也必须恢复此前已登录账号；解除
  // 故障后的重试只能完成一份风险/礼包/账单副作用。
  const resumeOldForRollback = await loginFrame.evaluate(async (identity) => {
    const { completeSignIn } = await import("/src/auth/complete-sign-in.ts");
    return completeSignIn({ identity });
  }, accountId);
  assert(resumeOldForRollback?.ok, "could not restore the existing account before rollback test");
  const rollbackDigits = `1363${String(Date.now()).slice(-7)}`;
  const rollbackPhone = `+86${rollbackDigits}`;
  const rollbackAccount = `${rollbackPhone}@demo.nexgrid.ai`;
  frame = await gotoRegister("risk-rollback");
  await enterPhoneAndSend(frame, rollbackDigits);
  await enterOtp(frame);
  await frame.locator(".rg-step3").waitFor({ state: "visible", timeout: 10_000 });
  const rollbackPasswords = frame.locator(".rg-step3 input");
  await rollbackPasswords.nth(0).fill("StrongPass123!");
  await rollbackPasswords.nth(1).fill("StrongPass123!");
  await frame.evaluate(() => {
    const original = Storage.prototype.setItem;
    let consumed = false;
    Storage.prototype.setItem = function setItemWithRiskFailure(key, value) {
      if (!consumed && String(key).includes("nexgrid-risk-registry-v1")) {
        consumed = true;
        throw new Error("runtime_auth02_injected_risk_storage_failure");
      }
      return original.call(this, key, value);
    };
    window.__auth02RestoreRiskStorage = () => { Storage.prototype.setItem = original; };
  });
  try {
    await frame.locator(".rg-cta").click();
    await frame.locator(".rg-error").waitFor({ state: "visible", timeout: 10_000 });
    const rolledBack = await frame.evaluate(async ({ oldAccount, newAccount }) => {
      const { useApp } = await import("/src/store/app.ts");
      const { useAuth } = await import("/src/store/auth.ts");
      const { useSession } = await import("/src/store/session.ts");
      const { resolveAuthAccountById } = await import("/src/store/auth-account.ts");
      const { getRiskRecord } = await import("/src/store/risk-identity.ts");
      const auth = useAuth();
      const session = useSession();
      return {
        auth: { isAuthenticated: auth.isAuthenticated, accountId: auth.accountId },
        session: { accountKey: session.accountKey, status: session.status, sessionId: session.sessionId },
        appAccountKey: useApp().accountKey,
        pending: resolveAuthAccountById(newAccount),
        riskForNewAccount: getRiskRecord(newAccount),
        oldAccount,
      };
    }, { oldAccount: accountId, newAccount: rollbackAccount });
    assert(rolledBack.auth.isAuthenticated && rolledBack.auth.accountId === rolledBack.oldAccount, "K1 failure did not retain the prior authenticated account");
    assert(rolledBack.session.accountKey === rolledBack.oldAccount && rolledBack.session.status === "active", "K1 failure changed the prior session scope");
    assert(rolledBack.appAccountKey === rolledBack.oldAccount, "K1 failure did not restore the prior app account scope");
    assert(rolledBack.pending?.ok && rolledBack.pending.account?.status === "pending", "K1 failure did not preserve only the new pending reservation");
    assert(rolledBack.riskForNewAccount === null, "K1 failure wrote a partial risk identity");
  } finally {
    await frame.evaluate(() => window.__auth02RestoreRiskStorage?.());
  }
  await frame.locator(".rg-cta").click();
  await waitUntil(() => Promise.resolve(page.url().includes("#/pages/register/success")), "retry after K1 failure did not reach success page");
  frame = await resolveAppFrame(".rs-root");
  const afterRollbackRetry = await snapshot(frame, rollbackPhone, rollbackAccount);
  assert(afterRollbackRetry.auth.isAuthenticated && afterRollbackRetry.auth.accountId === rollbackAccount, "retry after K1 failure did not establish the new account session");
  assert(afterRollbackRetry.accountsForPhone.length === 1 && afterRollbackRetry.riskCount === 1, "retry after K1 failure did not converge on one account and risk record");
  assert(afterRollbackRetry.bonusBills.length === 2 && afterRollbackRetry.giftClaimed && afterRollbackRetry.giftMirror, "retry after K1 failure duplicated or lost welcome-gift side effects");

  // 验码请求尚未返回时改号，旧响应不能污染新号码步骤或生成账号。
  const stalePhoneDigits = `1362${String(Date.now()).slice(-7)}`;
  const stalePhone = `+86${stalePhoneDigits}`;
  frame = await gotoRegister("stale", false);
  await enterPhoneAndSend(frame, stalePhoneDigits);
  await enterOtp(frame);
  await frame.locator(".rg-resend__change").click();
  await page.waitForTimeout(800);
  assert(await frame.locator(".rg-phone").count() === 1, "stale OTP response did not return to the changed-number step");
  assert(await frame.locator(".rg-step3").count() === 0, "stale OTP response entered the password step");
  const staleAccount = await frame.evaluate((phone) => window.__nexgridAuthDev.inspect(phone), stalePhone);
  assert(staleAccount.account?.ok && staleAccount.account.account === null, "stale OTP response created an account");

  // 截图对应的无礼包直达态也必须保持主体居中、H5 提醒完整、Continue 贴底。
  await page.goto(`${baseUrl}/?nx_device=off&auth02=${runId}-success-no-gift-clear`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(
    `${baseUrl}/?nx_device=off&auth02=${runId}-success-no-gift#/pages/register/success`,
    { waitUntil: "domcontentloaded" },
  );
  frame = await resolveAppFrame(".rs-root");
  await frame.evaluate(async (nextLocale) => {
    const { useLocaleStore } = await import("/src/store/locale.ts");
    useLocaleStore().setLocale(nextLocale);
  }, locale);
  await assertRegistrationSuccessUi(frame, false, true);
  await page.setViewportSize({ width: 320, height: 568 });
  await assertRegistrationSuccessUi(frame, false);

  assert(errors.length === 0, `browser console/page errors: ${errors.join(" | ")}`);
  console.log(`FEAT-AUTH02 runtime PASS (${locale}): new registration + readable existing-number handoff + no duplicate side effects`);
} finally {
  await browser.close();
}
