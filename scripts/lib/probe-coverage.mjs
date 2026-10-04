function requireNonEmptyArray(value, message) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(message);
}

const UNIAPP_RUNTIME_MARKER = "NEXGRID_UNIAPP_RUNTIME_20260809_V1";

export async function collectUniAppRuntimeIdentity(page) {
  return page.evaluate(async (expectedMarker) => {
    const identity = window.__NX_UNIAPP_RUNTIME_IDENTITY__;
    const sourceUrl = String(identity?.sourceUrl ?? "");
    let sourceVerified = false;
    try {
      const url = new URL(sourceUrl, location.href);
      if (url.origin === location.origin) {
        const source = await fetch(url.href, { cache: "no-store" }).then((response) => {
          if (!response.ok) throw new Error(`identity module HTTP ${response.status}`);
          return response.text();
        });
        sourceVerified = source.includes(expectedMarker);
      }
    } catch { /* invalid/missing source remains unverified */ }
    let pageStackRoute = "";
    try {
      const pages = getCurrentPages();
      pageStackRoute = pages.length ? String(pages[pages.length - 1]?.route ?? "") : "";
    } catch { /* not a UniApp runtime */ }
    return {
      marker: String(identity?.marker ?? ""),
      sourceUrl,
      sourceVerified,
      vueMounted: document.querySelector("#app")?.hasAttribute("data-v-app") === true,
      uniRuntime: typeof uni === "object" && typeof uni.reLaunch === "function",
      pageStackRoute,
    };
  }, UNIAPP_RUNTIME_MARKER);
}

export async function collectDirectPageWitness(page, runtimeErrors = []) {
  const witness = await page.evaluate(() => ({
    actualRoute: (location.hash || "").replace(/^#/, ""),
    appChildren: document.querySelector("#app")?.childElementCount ?? 0,
    iframeCount: document.querySelectorAll("iframe").length,
    bodyElements: document.querySelectorAll("body *").length,
    bodyTextLength: (document.body?.innerText || "").trim().length,
  }));
  return { ...witness, consoleErrors: [...runtimeErrors], pageErrors: [] };
}

export function assertUniAppRuntimeIdentity(identity, label = "probe") {
  if (identity?.marker !== UNIAPP_RUNTIME_MARKER) {
    throw new Error(`${label} UniApp runtime marker is missing`);
  }
  if (!identity?.sourceVerified || !identity?.sourceUrl) {
    throw new Error(`${label} UniApp runtime marker is not backed by the loaded application module`);
  }
  if (!identity?.vueMounted || !identity?.uniRuntime || !String(identity?.pageStackRoute ?? "").trim()) {
    throw new Error(`${label} UniApp runtime identity is incomplete`);
  }
}

export function assertNoRuntimeErrors(errors, label = "probe") {
  const runtimeErrors = Array.isArray(errors)
    ? errors.map((error) => String(error ?? "").trim()).filter(Boolean)
    : [];
  if (runtimeErrors.length) {
    throw new Error(`${label} runtime error: ${runtimeErrors.join(" | ")}`);
  }
}

export function assertSemanticSelectors(selectors, label = "probe") {
  requireNonEmptyArray(selectors, `${label} semantic selector coverage is zero`);
  const generic = /^(?:html|body|#app|\*|:root)$/i;
  const invalid = selectors.filter((selector) => !String(selector).trim() || generic.test(String(selector).trim()));
  if (invalid.length) {
    throw new Error(`${label} semantic selector must identify the target feature: ${invalid.join(", ")}`);
  }
}

export function assertDirectPageCoverage(expectedRoute, witness, label = expectedRoute) {
  const expected = String(expectedRoute ?? "").replace(/^#/, "");
  const actual = String(witness?.actualRoute ?? "").replace(/^#/, "");
  if (!expected || actual !== expected) {
    throw new Error(`${label} route coverage expected ${expected || "<missing>"}, landed ${actual || "<empty>"}`);
  }
  if ((witness?.appChildren ?? 0) < 1 || (witness?.bodyElements ?? 0) < 1 || (witness?.bodyTextLength ?? 0) < 1) {
    throw new Error(`${label} direct app DOM coverage is empty`);
  }
  if ((witness?.iframeCount ?? 0) !== 0) {
    throw new Error(`${label} rendered a device-shell iframe instead of the direct app document`);
  }
  const runtimeErrors = [
    ...(Array.isArray(witness?.pageErrors) ? witness.pageErrors : []),
    ...(Array.isArray(witness?.consoleErrors) ? witness.consoleErrors : []),
  ];
  assertNoRuntimeErrors(runtimeErrors, label);
}

/** Fail closed when a capture produced no trustworthy full-page screenshots. */
export function assertCaptureCoverage(expectedPageNames, report, capturedPngFiles, expectedRoutes = {}) {
  requireNonEmptyArray(expectedPageNames, "capture coverage is zero: no expected pages");
  requireNonEmptyArray(capturedPngFiles, "capture coverage is zero: no PNG files");
  const pngs = new Set(capturedPngFiles);

  for (const name of expectedPageNames) {
    const row = report?.[name];
    if (!row) throw new Error(`${name} capture coverage missing report`);
    if (row.error) throw new Error(`${name} capture error: ${row.error}`);
    const fullPage = `${name}.png`;
    if (!pngs.has(fullPage)) throw new Error(`${fullPage} capture coverage missing`);
    assertDirectPageCoverage(expectedRoutes[name], row, `${name} capture`);
  }
}

/** Both sides of a visual diff must contain every required full-page image. */
export function assertComparablePngCoverage(requiredPngFiles, baselinePngFiles, currentPngFiles) {
  requireNonEmptyArray(requiredPngFiles, "comparison coverage is zero: no required PNG files");
  requireNonEmptyArray(baselinePngFiles, "comparison coverage is zero: baseline has no PNG files");
  requireNonEmptyArray(currentPngFiles, "comparison coverage is zero: current has no PNG files");
  const baseline = new Set(baselinePngFiles);
  const current = new Set(currentPngFiles);
  for (const file of requiredPngFiles) {
    if (!baseline.has(file)) throw new Error(`${file} missing from baseline coverage`);
    if (!current.has(file)) throw new Error(`${file} missing from current coverage`);
  }
}

/** A DOM ledger may record UI findings, never infrastructure/probe failures. */
export function assertSweepCoverage({ routes, completedRoutes, crashes, landings = {}, witnesses = {}, pageErrors = {} }) {
  requireNonEmptyArray(routes, "route coverage is zero");
  if (Array.isArray(crashes) && crashes.length) {
    throw new Error(`probe crash on ${crashes.length} route(s): ${crashes.join(", ")}`);
  }
  const completed = new Set(completedRoutes ?? []);
  const missing = routes.filter((route) => !completed.has(route));
  if (missing.length || completed.size !== routes.length) {
    throw new Error(`completed route coverage ${completed.size}/${routes.length}; missing: ${missing.join(", ") || "unknown"}`);
  }
  for (const route of routes) {
    assertDirectPageCoverage(route, {
      ...witnesses[route],
      actualRoute: landings[route],
      pageErrors: pageErrors[route],
      iframeCount: witnesses[route]?.iframeCount ?? 0,
    }, route);
  }
}

export function assertAuthGuardRoutes(actual) {
  const expected = {
    defaultAuthed_staysOnEarn: "/pages/earn/earn",
    signedOut_redirectedFromEarn: "/pages/onboarding/intro",
    unauthOnOnboarding_noLoop: "/pages/onboarding/intro",
    traversalUnderWhitelist_redirected: "/pages/onboarding/intro",
    defaultAuthed_traversalCanonicalized: "/pages/earn/earn",
    retiredVerification_redirectedToSecurity: "/pages/me/security?from=retired-flow",
    sameDocumentTraversalCanonicalized: "/pages/earn/earn",
    sameDocumentRetiredVerificationMigrated: "/pages/me/security?from=retired-flow",
    signedOutSameDocumentTraversalRedirected: "/pages/onboarding/intro",
    signedOutSameDocumentRetiredRedirected: "/pages/onboarding/intro",
    staticReviewSameDocumentTraversal1: "/pages/earn/earn",
    staticReviewSameDocumentTraversal2: "/pages/earn/earn",
    staticReviewSameDocumentTraversal3: "/pages/earn/earn",
    // Vue Router sanitizes malformed cold-start hashes to its canonical root
    // before App route repair can observe the raw value. For an authenticated
    // server session, root/Home is the safe landing; the critical assertion is
    // that neither malformed input reaches the attacker-selected Earn route.
    excessiveEncodingFailsClosed: "/",
    aboveRootTraversalFailsClosed: "/",
  };
  for (const [key, value] of Object.entries(expected)) {
    assertDirectPageCoverage(value, actual?.[key], key);
  }
  if (!String(actual?.retiredVerification_redirectedToSecurity?.retiredNoticeText ?? "").trim()) {
    throw new Error("retiredVerification_redirectedToSecurity persistent explanation is missing");
  }
  if (!String(actual?.sameDocumentRetiredVerificationMigrated?.retiredNoticeText ?? "").trim()) {
    throw new Error("sameDocumentRetiredVerificationMigrated persistent explanation is missing");
  }
}
