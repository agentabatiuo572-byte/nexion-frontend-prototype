import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = process.env.NOTIFICATIONS_H5_BASE_URL || "http://127.0.0.1:5698";
const output = process.env.NOTIFICATIONS_H5_OUTPUT || fileURLToPath(new URL("../output/notifications-pagination/", import.meta.url));
await mkdir(output, { recursive: true });
const rows = Array.from({ length: 125 }, (_, index) => ({ id: 125 - index, kind: index === 124 ? "wallet" : "system",
  priority: "normal", title: `通知 ${125 - index}`, body: "分页与固定操作区候选验证", ctaLabel: "", ctaHref: "",
  createdAt: Date.now() - index * 1000, readAt: null }));
const requests = [], layouts = [];
let loggedIn = false;
const fixtureSession = { accessToken: "notification-ui-fixture", refreshToken: null, tokenType: "Bearer",
  user: { userId: 90210, countryCode: "+86", phone: "13800138000", nickname: "分页界面验证", onboardingComplete: true } };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
await context.routeWebSocket("**/ws/conversations**", socket => { socket.onMessage(() => {}); });
const reply = (route, data, status = 200) => route.fulfill({ status, contentType: "application/json",
  body: JSON.stringify({ code: status === 200 ? 0 : status, message: "Fixture", data }) });
await context.route("**/*", route => {
  const url = new URL(route.request().url());
  if (url.origin !== new URL(base).origin) return route.continue();
  if (url.pathname === "/auth/users/refresh") return loggedIn ? reply(route, fixtureSession) : reply(route, null, 401);
  if (url.pathname === "/auth/users/login") { loggedIn = true; return reply(route, fixtureSession); }
  if (url.pathname === "/api/notifications") {
    const category = url.searchParams.get("category") || "all", cursor = Number(url.searchParams.get("cursor")) || Infinity;
    const matching = rows.filter(row => row.id < cursor && (category === "all" || (category === "finance" ? row.kind === "wallet" : category === "system" && row.kind === "system")));
    const page = matching.slice(0, Number(url.searchParams.get("limit")) || 100);
    requests.push({ category, cursor: url.searchParams.get("cursor"), count: page.length });
    return reply(route, { items: page, unread: rows.length, nextCursor: matching.length > page.length ? String(page.at(-1).id) : null });
  }
  if (url.pathname === "/api/legal/terms/current") return reply(route, { source: "server", sourceEnvironment: "PRODUCTION", runId: "", requestedLocale: url.searchParams.get("locale") || "zh-CN", resolvedLocale: "zh-CN", requestedJurisdiction: "GLOBAL", resolvedJurisdiction: "GLOBAL", provenance: "notification-ui-fixture", version: "v1", effectiveAt: "2026-09-02T00:00:00Z", title: "Terms", summary: "Accepted", sections: [{ key: "main", title: "Terms", body: "Accepted", sortOrder: 0 }], acknowledged: true, acknowledgedAt: "2026-09-02T00:00:00Z" });
  if (url.pathname === "/api/app/support/conversations/cursor") return reply(route, { records: [], total: 0, pageSize: 100 });
  if (url.pathname === "/api/app/support/conversation-dismissals") return reply(route, []);
  if (url.pathname === "/api/app/support/conversation-management") return reply(route, { clearUserHistory: false, clearedPeers: [] });
  if (url.pathname === "/api/app/support/conversation-categories") return reply(route, [{ type: "advisor", enabled: true }, { type: "support", enabled: true }, { type: "ai", enabled: false }]);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return reply(route, {});
  return route.continue();
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
try {
  await page.goto(`${base}/?nx_device=off#/pages/login/login`);
  await page.locator(".lg-phone__in input, input.lg-phone__in").fill("13800138000");
  await page.locator(".lg-field--flex input, input.lg-field--flex").first().fill("fixture-password");
  await page.locator(".lg-cta").click();
  await page.waitForURL(url => url.hash === "#/" || url.hash.includes("/pages/index/index"));
  await page.evaluate(async () => {
    const [{ useLocaleStore }, { navTo }] = await Promise.all([import("/src/store/locale.ts"), import("/src/lib/route.ts")]);
    useLocaleStore().setLocale("zh"); await navTo("/pages/me/notifications");
  });
  const footer = page.locator(".notification-management");
  await footer.waitFor();
  await page.locator(".notification-item").nth(99).waitFor();
  const firstFooter = await footer.boundingBox();
  assert(firstFooter.y >= 0 && firstFooter.y + firstFooter.height <= 740);
  await page.locator(".message-more .message-button").click();
  await page.locator(".notification-item").nth(124).waitFor();
  await page.locator(".notification-item").last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const layout = await page.evaluate(() => {
    const box = selector => { const rect = document.querySelector(selector).getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom }; };
    return { footer: box(".notification-management"), scroll: box(".message-scroll"), last: box(".notification-item:last-of-type"),
      footerInsideScroll: !!document.querySelector(".message-scroll .notification-management") };
  });
  assert.equal(layout.footerInsideScroll, false);
  assert(Math.abs(layout.footer.top - firstFooter.y) < 1, "Footer stays fixed while the long list scrolls");
  assert(layout.scroll.bottom <= layout.footer.top + 1, "Footer reserves space and cannot cover the last row");
  assert(layout.last.bottom <= layout.footer.top + 1, "The actual last row remains reachable above the footer");
  layouts.push({ viewport: "360x740", ...layout });
  await page.screenshot({ path: `${output}/candidate-long-list-footer.png` });
  await page.locator('.message-filters [data-glass-value="finance"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".notification-item").length === 1);
  assert.equal(await page.locator(".message-more").count(), 0);
  assert.equal(requests.at(-1).category, "finance");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${output}/candidate-finance-final-page.png` });
  await footer.locator('[role="button"]').click();
  await page.getByText("清空已读通知？", { exact: true }).waitFor();
  await page.getByText("取消", { exact: true }).click();
  assert.equal(await page.locator(".notification-item").count(), 1);
  await page.locator('.message-primary [data-glass-value="service"]').click();
  assert.equal(await footer.count(), 0);
  await writeFile(`${output}/candidate-ui-receipt.json`, JSON.stringify({ requests, layouts, pageErrors, checks: ["125-row footer fixed and last item visible", "one-row finance final page has no load more", "cleanup confirm cancels", "Service has no notification cleanup"] }, null, 2));
  assert.deepEqual(pageErrors, []);
  console.log("PASS: 125-row footer, finance final page, cleanup cancellation, Service partition");
} catch (cause) {
  await page.screenshot({ path: `${output}/candidate-ui-failure.png` });
  await writeFile(`${output}/candidate-ui-failure.json`, JSON.stringify({ url: page.url(), body: await page.locator("body").innerText(), pageErrors }, null, 2));
  throw cause;
} finally {
  await browser.close();
}
