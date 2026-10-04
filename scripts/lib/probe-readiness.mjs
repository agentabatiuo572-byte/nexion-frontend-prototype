const UNIAPP_RUNTIME_MARKER = "NEXGRID_UNIAPP_RUNTIME_20260809_V1";

/**
 * Wait for a direct H5 probe to reach a mounted UniApp page. This is an
 * assertion prerequisite, not a sleep: callers still make their feature
 * assertion after it resolves, and a page that never mounts rejects on the
 * bounded Playwright timeout.
 */
export async function waitForUniAppPage(page, expectedRoute, { timeout = 10_000 } = {}) {
  // getCurrentPages() reports the page path; guard destinations can include
  // query parameters in the address bar, which are not part of that path.
  const args = { route: String(expectedRoute ?? "").replace(/^\/+/, "").split("?")[0], marker: UNIAPP_RUNTIME_MARKER };
  try {
    await page.waitForFunction(
    ({ route, marker }) => {
      const identity = window.__NX_UNIAPP_RUNTIME_IDENTITY__;
      let pageStackRoute = "";
      try {
        const pages = getCurrentPages();
        pageStackRoute = pages.length ? String(pages[pages.length - 1]?.route ?? "") : "";
      } catch { /* a missing page stack is not ready */ }
      const renderedText = (document.body?.innerText || "").trim();
      return identity?.marker === marker
        && !!identity?.sourceUrl
        && document.querySelector("#app")?.hasAttribute("data-v-app") === true
        && typeof uni === "object"
        && typeof uni.reLaunch === "function"
        && pageStackRoute === route
        && renderedText.length > 0;
    },
    args,
    { timeout },
  );
  } catch (error) {
    const witness = await page.evaluate(() => {
      let pageStackRoute = "";
      try {
        const pages = getCurrentPages();
        pageStackRoute = pages.length ? String(pages[pages.length - 1]?.route ?? "") : "";
      } catch { /* record an unavailable stack */ }
      return {
        hash: location.hash,
        marker: window.__NX_UNIAPP_RUNTIME_IDENTITY__?.marker ?? "",
        sourceVerified: !!window.__NX_UNIAPP_RUNTIME_IDENTITY__?.sourceUrl,
        vueMounted: document.querySelector("#app")?.hasAttribute("data-v-app") === true,
        uniRuntime: typeof uni === "object" && typeof uni?.reLaunch === "function",
        pageStackRoute,
        bodyTextLength: (document.body?.innerText || "").trim().length,
      };
    }).catch(() => null);
    throw new Error(`${error.message}; readiness witness=${JSON.stringify(witness)}`, { cause: error });
  }
}
