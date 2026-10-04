// Real H5 interaction witness; all business HTTP/WS traffic uses isolated fixtures.
// BASE_URL=http://127.0.0.1:5174 HOME_FEED_OUTPUT=<outside repo> node scripts/home-feed-glass-runtime.mjs
import { chromium } from "playwright";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { directAppUrl } from "./lib/direct-app-url.mjs";
import { installFormalProbeSession } from "./lib/formal-probe-session.mjs";
import { identify } from "./lib/dev-server-pool.mjs";
import { parse } from "@babel/parser";
import cssScoped from "@dcloudio/uni-cli-shared/dist/vite/plugins/cssScoped.js";

const BASE = process.env.UI_BASE_URL || process.env.UNI_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:5174";
const OUTPUT = process.env.HOME_FEED_OUTPUT || path.join(os.tmpdir(), "home-feed-glass-runtime");
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const runId = randomUUID(), now = Date.now(), iso = new Date(now).toISOString();
const routeName = "pages/index/index", host = '.nx-home-feed-tabs';
const tabSelector = value => `${host} [data-glass-value="${value}"]`;
const manifest = JSON.parse(await readFile(new URL("../src/pages.json", import.meta.url), "utf8"));
const fullVariantKeys = [320, 390].flatMap(width => ["zh", "en", "vi"].flatMap(locale => ["dark", "light"].flatMap(theme => ["no-preference", "reduce"].map(motion => `${width}-${locale}-${theme}-${motion}`))));
const failures = [], records = [], scan = [];
let assertions = 0;
const check = (ok, message, record) => {
  assertions++; record.assertions = (record.assertions || 0) + 1;
  if (!ok) { const finding = { message, variant: record.variant, route: record.route }; failures.push(finding); (record.failures ||= []).push(message); }
};
async function snapshot() {
  const files = [];
  async function walk(dir) { for (const item of await readdir(path.join(repoRoot, dir), { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isDirectory()) await walk(file); else files.push(file); } }
  await walk("src");
  files.push("scripts/home-feed-glass-runtime.mjs", "scripts/lib/formal-probe-session.mjs", "scripts/lib/probe-conversation-realtime.mjs", "scripts/lib/direct-app-url.mjs", "scripts/lib/dev-server-pool.mjs");
  const hash = createHash("sha256");
  for (const file of files.sort()) { hash.update(file.replaceAll("\\", "/")); hash.update("\0"); hash.update(await readFile(path.join(repoRoot, file))); hash.update("\0"); }
  return { runId, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(), sourceHash: hash.digest("hex"), files: files.length, at: new Date().toISOString() };
}

// The formal parsers require these authority fields. They are only fixture
// envelope fields; this probe does not accept production money or server facts.
const authority = { sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true };
const overview = {
  ...authority, source: "server:nx_compute_receipt,nx_compute_task,nx_user_device,nx_compute_datacenter,nx_product,nx_growth_promo_banner",
  generatedAt: iso, accountScope: "authenticated-account",
  earnings: { todayVsYesterdayPct: 0, ...Object.fromEntries(["today", "week", "month", "all"].map(period => [period, { usdt: .1, nex: 0, jobCount: 1 }])) },
  earningsLedgerMode: "SETTLED", earningsLedger: [{ id: "home-glass-fixture", client: "UI Fixture Client", model: "UI Fixture Model", rewardUsdt: .1, completedAt: iso, synthetic: false }],
  marketBoard: { workloads: [], deviceRankings: [] }, doTheMath: null, weeklyPromo: null,
  onboarding: { cumulativePaidUsdt: 0, activeDevices: 0 }, onGrid: { clients: [], activeDevices: 0, activeJobs: 0, perSecUsdt: 0 },
};
function fixture(url, request, locale) {
  if (url.pathname === "/api/app/profile") return { nickname: "UI Fixture", avatarUrl: "", avatarRevision: "", language: locale };
  if (url.pathname === "/api/app/home/overview") return overview;
  if (url.pathname === "/api/devices/earnings") return { ...authority, source: "nx_user_device + nx_compute_receipt + nx_compute_e3_config", dailyUsdt: 0, dailyNex: 0, realizedTodayUsdt: .1, realizedTodayNex: 0, walletUsdt: 0, walletNex: 0, userJoinedAt: now, serverNow: now, timezone: "UTC", slotCap: 1, devices: [], capacitySchedule: {} };
  if (url.pathname === "/api/config/platform") return { featureFlags: { computeShareEnabled: false, homeNewcomerTasksEnabled: false, homeWeeklyPromoEnabled: false }, share: { baseUrl: "", channels: [], appDownload: { officialUrl: "", iosUrl: "", androidUrl: "", apkUrl: "", version: "", releaseNotes: { zh: "", en: "" }, source: "unavailable" } }, publicStats: { version: 1, ...authority, source: "server:nx_config_item,nx_user", realUserCount: 0 }, updatedAt: iso };
  if (url.pathname === "/api/app/wallet/bills/summary") return { ...authority, source: "server", timeZone: "UTC", asOf: iso, rewardsUsdt: .1, rewardsNex: 0, latestRewardAt: iso, todayNexEarn: 0, pendingNex: 0, monthBillCount: 1, recentNexBills: [] };
  if (url.pathname === "/api/app/wallet/bills") return { ...authority, source: "server", bills: [], page: 1, pageSize: 50, total: 0, nextPage: null, nextCursor: null };
  if (url.pathname === "/api/store/catalog") return { ...authority, source: "nx_product", revision: null, products: [] };
  if (url.pathname === "/api/orders") return { ...authority, source: "server", orders: [] };
  if (url.pathname === "/api/notifications") return { items: [], nextCursor: null, unread: 0 };
  return undefined;
}
async function session(browser, variant, { video = false, authenticated = true } = {}) {
  const context = await browser.newContext({ viewport: { width: variant.width, height: 844 }, deviceScaleFactor: 1, colorScheme: variant.theme, reducedMotion: variant.motion, hasTouch: true,
    ...(video ? { recordVideo: { dir: path.join(OUTPUT, "videos"), size: { width: variant.width, height: 844 } } } : {}) });
  const page = await context.newPage();
  await page.addInitScript(({ theme, locale, authenticated }) => {
    localStorage.setItem("nexgrid-theme-v1", JSON.stringify({ type: "object", data: { mode: theme } }));
    localStorage.setItem("nexgrid-locale-v1", JSON.stringify({ type: "object", data: { code: locale, userSet: true } }));
    const cooldown = JSON.stringify({ type: "object", data: { lastClosedAt: 9999999999999 } });
    localStorage.setItem("nexgrid-voucher-claim-sheet-v1", cooldown); localStorage.setItem("nexgrid-trial-claim-sheet-v1", cooldown);
    if (!authenticated) localStorage.setItem("nexgrid-auth-v1", JSON.stringify({ type: "object", data: { isAuthenticated: false, email: "", accountId: "default", onboardingComplete: false } }));
  }, { ...variant, authenticated });
  await installFormalProbeSession(page, { authenticated, responseFor: (url, request) => fixture(url, request, variant.locale) });
  return { context, page };
}
async function ready(page) {
  await page.locator(`${host} .nx-glass-indicator`).waitFor({ state: "visible" });
  await page.waitForFunction(host => document.querySelector(`${host} .nx-glass-indicator`)?.dataset.glassStrategy === "svg", host);
  await page.locator('[data-home-live-activity-row="true"]').waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}
async function settle(page) {
  await page.waitForFunction(selector => { const root = document.querySelector(selector); return root && root.dataset.glassMoving !== "true" && root.dataset.glassDragging !== "true"; }, host, { timeout: 6000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function selected(page, value, { focus = false } = {}) {
  await page.waitForFunction(({ host, value, focus }) => {
    const root = document.querySelector(host), option = root?.querySelector(`[data-glass-value="${value}"]`);
    const panel = document.getElementById(`home-live-feed-panel-${value}`);
    const other = root?.querySelector(`.nx-glass-option:not([data-glass-value="${value}"])`);
    const otherPanel = document.getElementById(other?.getAttribute("aria-controls") || "");
    return option?.getAttribute("aria-selected") === "true" && option?.tabIndex === 0 && panel?.getAttribute("aria-hidden") === "false"
      && getComputedStyle(panel).display !== "none" && other?.getAttribute("aria-selected") === "false" && other?.tabIndex === -1
      && otherPanel?.getAttribute("aria-hidden") === "true" && getComputedStyle(otherPanel).display === "none" && (!focus || document.activeElement === option);
  }, { host, value, focus });
}
async function geometry(page) {
  return page.evaluate(host => {
    const root = document.querySelector(host), lens = root.querySelector(".nx-glass-indicator"), track = root.querySelector(".nx-glass-track--filter");
    const read = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return { x: r.x, y: r.y, width: r.width, height: r.height, transform: cs.transform, radius: cs.borderRadius, background: cs.backgroundImage, backdrop: cs.backdropFilter, opacity: Number(cs.opacity), visibility: cs.visibility, display: cs.display }; };
    return { root: { ...read(root), role: root.getAttribute("role") }, lens: { ...read(lens), strategy: lens.dataset.glassStrategy, materialLayers: lens.querySelectorAll(".nx-liquid-optics,.nx-liquid-tint,.nx-liquid-specular,.nx-liquid-rim").length,
      displacement: lens.querySelector('feDisplacementMap')?.getAttribute('scale'), displacementImage: lens.querySelector('feImage')?.getAttribute('href'), canvas: Boolean(lens.querySelector('canvas')),
      layers: [...lens.children].map(el => ({ class: el.className, ...read(el), shadow: getComputedStyle(el).boxShadow, opacity: getComputedStyle(el).opacity })) }, track: read(track),
      theme: document.documentElement.dataset.theme, locale: document.documentElement.lang, runtimeIdentity: window.__NX_UNIAPP_RUNTIME_IDENTITY__,
      options: [...root.querySelectorAll(".nx-glass-option")].map(el => ({ ...read(el), id: el.id, role: el.getAttribute("role"), text: el.innerText, value: el.dataset.glassValue, selected: el.getAttribute("aria-selected"), controls: el.getAttribute("aria-controls"), tabindex: el.tabIndex, label: { ...read(el.querySelector(".nx-glass-option__label")), lineHeight: parseFloat(getComputedStyle(el.querySelector(".nx-glass-option__label")).lineHeight) }, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })),
      panels: [...document.querySelectorAll('[id^="home-live-feed-panel-"]')].map(el => ({ id: el.id, role: el.getAttribute("role"), hidden: el.getAttribute("aria-hidden"), display: getComputedStyle(el).display, labelledby: el.getAttribute("aria-labelledby") })) };
  }, host);
}
async function beginFrames(page) {
  await page.evaluate(host => {
    const root = document.querySelector(host), lens = root.querySelector(".nx-glass-indicator"), track = root.querySelector(".nx-glass-track--filter");
    const matrix = el => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return { a: m.a, d: m.d, x: m.e, y: m.f }; };
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const state = { frames: [], done: false }; window.__homeGlassFrames = state;
    let start;
    function sample(at) {
      start ??= at;
      state.frames.push({ at, elapsed: at - start, lens: matrix(lens), lensBox: box(lens), track: matrix(track), moving: root.dataset.glassMoving, dragging: root.dataset.glassDragging,
        selected: root.querySelector('[aria-selected="true"]')?.dataset.glassValue,
        options: [...root.querySelectorAll(".nx-glass-option")].map(el => ({ value: el.dataset.glassValue, ...box(el), label: box(el.querySelector(".nx-glass-option__label")), transform: getComputedStyle(el).transform })) });
      if (at - start >= 1100) state.done = true; else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, host);
}
async function endFrames(page) {
  await page.waitForFunction(() => window.__homeGlassFrames?.done, null, { timeout: 6000 });
  return page.evaluate(() => window.__homeGlassFrames.frames);
}
function frameChecks(frames, record, name, target, reduced) {
  const options = frames[0]?.options || [];
  const labelDrift = Math.max(0, ...frames.flatMap(frame => frame.options.flatMap((option, index) => ["x", "y", "width", "height"].map(axis => Math.abs(option.label[axis] - options[index].label[axis])))));
  const hitboxDrift = Math.max(0, ...frames.flatMap(frame => frame.options.flatMap((option, index) => ["x", "y", "width", "height"].map(axis => Math.abs(option[axis] - options[index][axis])))));
  const lensScale = Math.max(0, ...frames.map(frame => Math.max(Math.abs(frame.lens.a - 1), Math.abs(frame.lens.d - 1))));
  const trackScale = Math.max(0, ...frames.map(frame => Math.max(Math.abs(frame.track.a - 1), Math.abs(frame.track.d - 1))));
  const final = frames.at(-1);
  const targetOption = final?.options.find(option => option.value === target);
  const targetError = targetOption ? Math.max(...["x", "y", "width", "height"].map(axis => Math.abs(final.lensBox[axis] - targetOption[axis]))) : Infinity;
  const positionSpan = Math.max(...frames.map(frame => frame.lens.x)) - Math.min(...frames.map(frame => frame.lens.x));
  const maxPositionStep = Math.max(0, ...frames.slice(1).map((frame, i) => Math.abs(frame.lens.x - frames[i].lens.x)));
  check(frames.length >= 10 && frames.every((frame, i) => i === 0 || frame.at > frames[i - 1].at), `${name}: natural rAF sampling absent`, record);
  check(labelDrift <= .6 && hitboxDrift <= .6 && frames.every(frame => frame.options.every(option => option.transform === "none")), `${name}: labels or hitboxes deform/move with the material`, record);
  check(final?.selected === target && final?.moving !== "true" && Math.abs(final?.lens.a - 1) < .003 && Math.abs(final?.lens.d - 1) < .003 && Math.abs(final?.track.a - 1) < .003 && Math.abs(final?.track.d - 1) < .003, `${name}: material failed to return to the selected target`, record);
  check(targetError <= .8, `${name}: settled lens geometry does not align with the selected option`, record);
  if (reduced) {
    check(lensScale < .003 && trackScale < .003 && frames.every(frame => frame.moving !== "true"), `${name}: reduced motion still deforms or animates`, record);
    const firstTarget = frames.find(frame => frame.selected === target);
    const firstOption = firstTarget?.options.find(option => option.value === target);
    const immediateError = firstOption ? Math.max(...["x", "y", "width", "height"].map(axis => Math.abs(firstTarget.lensBox[axis] - firstOption[axis]))) : Infinity;
    // Pointer dragging is a direct manipulation preview; reduced motion must
    // remove shape deformation and release settling, not disable that preview.
    check(firstTarget && immediateError <= .8, `${name}: reduced motion does not move directly to the target`, record);
  } else {
    check(lensScale > .01 && trackScale > .003 && frames.some(frame => frame.moving === "true"), `${name}: capsule/track elastic scaling is absent`, record);
    check(maxPositionStep < 75 && lensScale < .3 && trackScale <= .065, `${name}: motion jumped or grew outside its bounded material range`, record);
    check(positionSpan > 8, `${name}: selection changed without real lens translation`, record);
  }
  return { frames: frames.length, elapsed: final?.elapsed, lensScale, trackScale, labelDrift, hitboxDrift, maxPositionStep, positionSpan, targetError, target, reduced };
}
async function installActivationWitness(page) {
  await page.evaluate(host => {
    const root = document.querySelector(host); window.__homeGlassActivations = { clicks: [], selections: [] };
    root.addEventListener('click', event => { const option = event.target.closest('.nx-glass-option'); if (option) window.__homeGlassActivations.clicks.push({ value: option.dataset.glassValue, trusted: event.isTrusted, detail: event.detail }); }, true);
    new MutationObserver(changes => { for (const change of changes) { if (change.target.getAttribute('aria-selected') === 'true') window.__homeGlassActivations.selections.push(change.target.dataset.glassValue); } }).observe(root, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  }, host);
}
async function activationMark(page) { return page.evaluate(() => ({ clicks: window.__homeGlassActivations.clicks.length, selections: window.__homeGlassActivations.selections.length })); }
async function activationCheck(page, before, clicks, selections, name, record) {
  const after = await activationMark(page), delta = { name, clicks: after.clicks - before.clicks, selections: after.selections - before.selections };
  (record.activations ||= []).push(delta);
  check(delta.clicks === clicks && delta.selections === selections, `${name}: duplicate/missing observed activation or selection`, record);
}
async function image(page, record, suffix) {
  const name = `${record.variant}-${suffix}.png`; await page.screenshot({ path: path.join(OUTPUT, name) }); record.screenshots.push(name);
}
async function variantRun(browser, variant) {
  const key = `${variant.width}-${variant.locale}-${variant.theme}-${variant.motion}`;
  const record = { runId, variant: key, ...variant, route: routeName, errors: [], requests: [], screenshots: [], samples: {} };
  const { context, page } = await session(browser, variant, { video: variant.width === 390 && variant.locale === "zh" });
  page.on("pageerror", error => record.errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && message.location().url.startsWith(BASE)) record.errors.push(message.text()); });
  page.on("request", request => { const url = new URL(request.url()); if (/^\/(api|auth)\//.test(url.pathname)) record.requests.push({ path: url.pathname, method: request.method(), isolated: true }); });
  try {
    await page.goto(directAppUrl(BASE, routeName), { waitUntil: "domcontentloaded" });
    await ready(page); await page.locator(host).scrollIntoViewIfNeeded(); await settle(page);
    const initial = record.initial = await geometry(page), labels = { zh: ["动态", "收益"], en: ["Activity", "Earnings"], vi: ["Hoạt động", "Thu nhập"] }[variant.locale];
    check(initial.options.length === 2 && initial.options.every((option, i) => option.text.trim() === labels[i]), "Both localized options must exist", record);
    check(initial.options.every(option => option.width >= 44 && option.height >= 44) && Math.abs(initial.options[0].width - initial.options[1].width) <= .5, "Options must have equal width and >=44px hitboxes", record);
    check(initial.options.every(option => option.label.width <= option.width && option.scrollWidth <= option.clientWidth && option.label.height <= option.label.lineHeight + .5), "Localized label wraps or overflows its hitbox", record);
    check(initial.theme === variant.theme, "Theme fixture did not reach the real page", record);
    check(initial.runtimeIdentity?.marker === "NEXGRID_UNIAPP_RUNTIME_20260809_V1", "UniApp runtime identity marker absent", record);
    check(parseFloat(initial.lens.radius) >= 20 && initial.lens.materialLayers === 4 && initial.lens.strategy === "svg" && initial.lens.opacity > 0 && initial.lens.visibility === "visible"
      && (initial.lens.strategy !== "svg" || (Number(initial.lens.displacement) > 0 && initial.lens.displacementImage?.startsWith('blob:') && initial.lens.backdrop.startsWith('url(')))
      && (initial.lens.strategy !== "webgl" || initial.lens.canvas)
      && initial.lens.layers.filter(layer => ["nx-liquid-tint", "nx-liquid-specular", "nx-liquid-rim"].includes(layer.class)).every(layer => layer.visibility === "visible" && layer.display !== "none" && layer.opacity > 0)
      && initial.lens.layers.some(layer => layer.class === "nx-liquid-specular" && layer.background.startsWith('url('))
      && initial.lens.layers.some(layer => layer.class === "nx-liquid-tint" && layer.background !== "none") && initial.lens.layers.some(layer => layer.class === "nx-liquid-rim" && layer.shadow !== "none"), "Rounded lens lacks real optics/tint/rim material", record);
    check(initial.root.role === "tablist" && initial.options.every(option => option.role === "tab" && option.id === `home-live-feed-tab-${option.value}` && initial.panels.some(panel => panel.id === option.controls && panel.role === "tabpanel" && panel.labelledby === option.id)), "Tab/panel ARIA roles or relationships are incomplete", record);
    await selected(page, "activity"); await image(page, record, "activity");
    await installActivationWitness(page);

    // Browser pointer clicks are issued while the page's natural animation runs.
    let activation = await activationMark(page);
    await beginFrames(page); await page.locator(tabSelector("earnings")).click(); await selected(page, "earnings");
    if (variant.motion !== "reduce" && variant.width === 390 && variant.locale === "zh") {
      await page.waitForFunction(host => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(`${host} .nx-glass-indicator`)).transform).a > 1.06, host);
      await image(page, record, "natural-mid-motion");
    }
    const forward = await endFrames(page); record.samples.forward = frameChecks(forward, record, "forward click", "earnings", variant.motion === "reduce");
    await activationCheck(page, activation, 1, 1, "forward click", record);
    const seeAllGeometry = await page.locator('[data-home-section="live-feed"] > uni-view > [role="link"]').first().boundingBox();
    const hostGeometry = await page.locator(host).boundingBox();
    record.seeAllGeometry = { ...seeAllGeometry, hostRight: hostGeometry.x + hostGeometry.width };
    check(seeAllGeometry && seeAllGeometry.width >= 44 && seeAllGeometry.height >= 44 && seeAllGeometry.x >= hostGeometry.x + hostGeometry.width + 7 && seeAllGeometry.x + seeAllGeometry.width <= variant.width, "See All hitbox overlaps tabs or the viewport", record);
    check(await page.locator('[data-home-live-earnings-row="true"]').count() === 1 && (await page.locator('[data-home-live-earnings-row="true"]').innerText()).includes("0.10000"), "Earnings must project the isolated ledger row", record);
    await image(page, record, "earnings");
    activation = await activationMark(page);
    await beginFrames(page); await page.locator(tabSelector("activity")).click(); await selected(page, "activity");
    const backward = await endFrames(page); record.samples.backward = frameChecks(backward, record, "backward click", "activity", variant.motion === "reduce");
    await activationCheck(page, activation, 1, 1, "backward click", record);

    record.keyboard = [];
    const keyboard = [["ArrowRight", "earnings"], ["ArrowLeft", "activity"], ["End", "earnings"], ["Home", "activity"], ["ArrowDown", "earnings"], ["ArrowUp", "activity"]];
    await page.locator(tabSelector("activity")).focus();
    for (const [keyName, target] of keyboard) {
      activation = await activationMark(page);
      await page.keyboard.press(keyName); await selected(page, target, { focus: true }); await settle(page);
      check(await page.locator(`${host} [aria-selected="true"]`).count() === 1 && await page.locator(`${host} [tabindex="0"]`).count() === 1, `${keyName}: selection and roving focus are inconsistent`, record);
      record.keyboard.push({ key: keyName, target, focused: await page.evaluate(() => document.activeElement.id) });
      await activationCheck(page, activation, 0, 1, keyName, record);
    }
    for (const [keyName, target] of [["Enter", "earnings"], ["Space", "activity"]]) {
      activation = await activationMark(page);
      await page.locator(tabSelector(target)).focus(); await page.keyboard.press(keyName); await selected(page, target, { focus: true }); await settle(page);
      record.keyboard.push({ key: keyName, target, focused: await page.evaluate(() => document.activeElement.id) });
      await activationCheck(page, activation, 0, 1, keyName, record);
    }

    activation = await activationMark(page); await beginFrames(page);
    const a = await page.locator(tabSelector("activity")).boundingBox(), b = await page.locator(tabSelector("earnings")).boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await selected(page, "earnings");
    if (variant.motion !== "reduce") await page.waitForFunction(host => document.querySelector(host)?.dataset.glassMoving === "true", host);
    await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2); await selected(page, "activity");
    const rapid = await endFrames(page); record.samples.rapidReverse = frameChecks(rapid, record, "rapid reverse", "activity", variant.motion === "reduce");
    await activationCheck(page, activation, 2, 2, "rapid reverse", record);

    // Commit on pointer release, not during horizontal preview. A vertical
    // touch gesture must retain scrolling and must not select the other tab.
    activation = await activationMark(page); await beginFrames(page);
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    for (let step = 1; step <= 10; step++) {
      await page.mouse.move(a.x + a.width / 2 + (b.x - a.x) * step / 10, a.y + a.height / 2);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    }
    check(await page.locator(tabSelector("activity")).getAttribute("aria-selected") === "true" && await page.locator(host).getAttribute("data-glass-dragging") === "true", "Drag preview commits early or did not engage", record);
    await activationCheck(page, activation, 0, 0, "drag preview", record);
    await page.mouse.up(); await selected(page, "earnings");
    const drag = await endFrames(page); record.samples.drag = frameChecks(drag, record, "horizontal drag", "earnings", variant.motion === "reduce");
    await activationCheck(page, activation, 1, 1, "drag release", record);
    await image(page, record, "drag-release");
    const scrollBefore = await page.evaluate(() => document.querySelector('uni-page[data-page="pages/index/index"] .nx-content').scrollTop);
    const cdp = await context.newCDPSession(page);
    activation = await activationMark(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 - step * 14 }] });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await selected(page, "earnings");
    const scrollAfter = await page.evaluate(() => document.querySelector('uni-page[data-page="pages/index/index"] .nx-content').scrollTop);
    record.verticalTouch = { scrollBefore, scrollAfter, selection: "earnings", dragging: await page.locator(host).getAttribute("data-glass-dragging"), touchAction: await page.locator(host).evaluate(el => getComputedStyle(el).touchAction) };
    check(scrollAfter > scrollBefore + 10 && record.verticalTouch.dragging !== "true", "Vertical touch is intercepted or scrolling did not occur", record);
    await activationCheck(page, activation, 0, 0, "vertical touch", record);
    await cdp.detach();

    // A fresh document re-mounts GlassSegments and the canonical fixture feed.
    // Tab choice is intentionally component-local; refresh resets to Activity.
    await page.reload({ waitUntil: "domcontentloaded" }); await ready(page); await page.locator(host).scrollIntoViewIfNeeded();
    record.reloaded = await geometry(page); await selected(page, "activity");
    check(record.reloaded.lens.materialLayers === 4 && record.reloaded.options.length === 2, "Reload lost the shared GlassSegments material", record);
    await page.locator(tabSelector("earnings")).click(); await selected(page, "earnings"); await settle(page);
    const seeAll = page.locator('[data-home-section="live-feed"] > uni-view > [role="link"]').first();
    await seeAll.focus(); await page.keyboard.press("Enter");
    await page.waitForFunction(() => location.hash.includes("/pages/me/wallet-bills") && [...document.querySelectorAll("uni-page")].some(el => el.dataset.page === "pages/me/wallet-bills" && el.getBoundingClientRect().height > 0));
    record.seeAll = { hash: await page.evaluate(() => location.hash), keyboard: "Enter" };
    check(record.seeAll.hash.includes("pages/me/wallet-bills"), "See All did not navigate to the real bills route", record);
    const freshHome = new URL(directAppUrl(BASE, routeName)); freshHome.searchParams.set("home_glass_return", `${runId}-${key}`);
    await page.goto(freshHome.toString(), { waitUntil: "domcontentloaded" }); await ready(page); await page.locator(tabSelector("earnings")).click(); await selected(page, "earnings");
    await page.locator('[data-home-section="live-feed"] > uni-view > [role="link"]').first().click();
    await page.waitForFunction(() => location.hash.includes("/pages/me/wallet-bills") && document.querySelector('uni-page[data-page="pages/me/wallet-bills"]'));
    record.seeAll.click = await page.evaluate(() => location.hash);
    check(record.errors.length === 0, "Page emitted runtime errors", record);
    await writeFile(path.join(OUTPUT, `${key}-frames.json`), JSON.stringify({ runId, forward, backward, rapid, drag }, null, 2));
  } catch (error) {
    record.error = error.stack; check(false, error.message, record); await image(page, record, "failure").catch(() => {});
  } finally {
    const video = page.video(); await context.close(); if (video) record.video = path.relative(OUTPUT, await video.path()).replaceAll("\\", "/"); records.push(record);
    console.log(JSON.stringify({ variant: key, assertions: record.assertions, failures: record.failures || [], video: record.video }));
  }
}

const anonymous = new Set(["pages/entry-surfaces/index", "pages/entry-surfaces/signed", "pages/entry-surfaces/h5", "pages/entry-surfaces/white", "pages/onboarding/intro", "pages/onboarding/terms", "pages/register/register", "pages/login/login", "pages/session/kicked", "pages/me/risk-disclosure", "pages/ref/code", "pages/tx/hash"]);
const query = { "pages/store/detail": "id=stellarbox-s1", "pages/store/checkout": "product=stellarbox-s1", "pages/store/order-detail": "id=probe-order", "pages/earn/device-detail": "id=701", "pages/learn/course": "id=probe-course", "pages/support/chat": "cid=probe-history", "pages/ref/code": "code=UI-PROBE", "pages/tx/hash": "hash=0xprobe", "pages/me/wallet-withdraw-tracking": "id=probe-withdrawal" };
async function scanRoutes(browser) {
  const variant = { width: 390, locale: "en", theme: "dark", motion: "no-preference" };
  for (const authenticated of [true, false]) {
    const { context, page } = await session(browser, variant, { authenticated });
    try {
      for (const entry of manifest.pages.filter(entry => anonymous.has(entry.path) !== authenticated)) {
        const record = { runId, route: entry.path, authenticated, errors: [] };
        const onError = error => record.errors.push(error.message); page.on("pageerror", onError);
        try {
          const target = new URL(directAppUrl(BASE, entry.path + (query[entry.path] ? `?${query[entry.path]}` : "")));
          target.searchParams.set("home_glass_scan", `${runId}-${scan.length}`);
          await page.goto(target.toString(), { waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => document.querySelector("uni-page") && document.body.innerText.trim().length > 0);
          await page.waitForLoadState("networkidle", { timeout: 1800 }).catch(() => {});
          Object.assign(record, await page.evaluate(() => {
            const current = location.hash.slice(2).split("?")[0];
            const root = [...document.querySelectorAll("uni-page")].find(el => el.dataset.page === current && el.getBoundingClientRect().height > 0) || [...document.querySelectorAll("uni-page")].at(-1);
            const visible = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
            const candidates = [...root.querySelectorAll('*')].filter(el => {
              if (!visible(el)) return false;
              if (el.matches('.nx-glass-segments,[role="tablist"],[role="radiogroup"]')) return true;
              if (!/(tab|segment|period|filter)/i.test(el.className || "")) return false;
              const controls = [...el.children].filter(child => visible(child) && (child.matches('[role="tab"],[role="radio"],[role="button"],button,[aria-selected],[aria-pressed]') || /(tab|segment|period|filter)/i.test(child.className || "")));
              return controls.length >= 2 && !el.closest('.nx-glass-segments');
            });
            const unique = candidates.filter(el => !candidates.some(parent => parent !== el && parent.contains(el) && !parent.matches('.nx-glass-segments')));
            return { actualRoute: root.dataset.page, hash: location.hash, groups: unique.map(el => ({ class: el.className, role: el.getAttribute('role'), text: el.innerText.trim().slice(0, 200), shared: el.classList.contains('nx-glass-segments'), strategy: el.querySelector('.nx-glass-indicator')?.dataset.glassStrategy,
              controls: [...el.querySelectorAll('.nx-glass-option,[role="tab"],[role="radio"],[role="button"],button,[aria-selected],[aria-pressed]')].filter(child => visible(child) && !unique.some(group => group !== el && group.contains(child) && el.contains(group))).map(child => { const cs = getComputedStyle(child), r = child.getBoundingClientRect(); return { class: child.className, text: child.innerText?.trim(), role: child.getAttribute('role'), selected: child.getAttribute('aria-selected') || child.getAttribute('aria-checked') || child.getAttribute('aria-pressed'), width: r.width, height: r.height, background: cs.backgroundColor, radius: cs.borderRadius }; }) })) };
          }));
          record.status = record.actualRoute === record.route ? "rendered requested route" : "redirect witnessed; requested surface unverified";
        } catch (error) { record.error = error.stack; record.status = "route unverified"; }
        finally { page.off("pageerror", onError); scan.push(record); }
      }
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ routeScan: scan.length, manifestRoutes: manifest.pages.length, independentGroups: scan.flatMap(record => record.groups?.filter(group => !group.shared) || []).length }));
}

await mkdir(OUTPUT, { recursive: true });
const sourceStart = await snapshot();
let serverIdentity;
try {
  const tree = await identify(BASE, { root: repoRoot, environment: "development" });
  const files = ["src/components/home/live-feed-card.vue", "src/components/glass-segments.vue", "src/components/liquid-glass.vue", "src/lib/liquid-glass-view.ts", "src/lib/liquid-glass-renderer.ts", "src/lib/liquid-glass-core.ts", "src/styles/tokens.css", "src/styles/glass-surfaces.css"];
  const sources = await Promise.all(files.map(async file => {
    const response = await fetch(`${BASE}/${file}?raw`, { signal: AbortSignal.timeout(10000) }), body = await response.text();
    // Parse the export as data, never evaluate server JavaScript. UniApp's TS
    // raw plugin can use single quotes and its Vue pre-plugin adds scoped.
    const declaration = parse(body, { sourceType: "module" }).program.body;
    const raw = declaration.length === 1 && declaration[0].type === "ExportDefaultDeclaration" && declaration[0].declaration.type === "StringLiteral" ? declaration[0].declaration.value : null;
    const local = await readFile(path.join(repoRoot, file), "utf8"), transformed = file.endsWith(".vue") ? cssScoped.addScoped(local) : local;
    return { file, status: response.status, sourceMatches: raw === local || raw === transformed, comparison: raw === local ? "exact raw source" : raw === transformed ? "exact UniApp addScoped transform" : "mismatch", hash: raw ? createHash("sha256").update(raw).digest("hex") : null };
  }));
  serverIdentity = { tree, sources, sourceMatches: tree.ok && sources.every(source => source.sourceMatches) };
  if (!serverIdentity.sourceMatches) failures.push({ message: "Server tree or Home/shared material sources mismatch", serverIdentity });
} catch (error) { serverIdentity = { error: error.message }; failures.push({ message: "Server source identity unverified", serverIdentity }); }
const browser = await chromium.launch();
try {
  if (!process.argv.includes("--scan-only")) {
  for (const width of (process.env.HOME_FEED_WIDTHS || "320,390").split(",").map(Number))
    for (const locale of (process.env.HOME_FEED_LOCALES || "zh,en,vi").split(","))
      for (const theme of (process.env.HOME_FEED_THEMES || "dark,light").split(","))
        for (const motion of (process.env.HOME_FEED_MOTIONS || "no-preference,reduce").split(",")) await variantRun(browser, { width, locale, theme, motion });
  }
  if (!process.argv.includes("--no-route-scan")) await scanRoutes(browser);
} finally { await browser.close(); }
const sourceEnd = await snapshot();
const sourceStable = sourceStart.head === sourceEnd.head && sourceStart.sourceHash === sourceEnd.sourceHash;
const fullMatrix = records.length === fullVariantKeys.length && new Set(records.map(record => record.variant)).size === fullVariantKeys.length && fullVariantKeys.every(key => records.some(record => record.variant === key));
const scanComplete = scan.length === manifest.pages.length && new Set(scan.map(record => record.route)).size === manifest.pages.length && scan.every(record => !record.error && record.errors.length === 0);
const scanPartial = scan.some(record => record.error || record.errors.length > 0 || record.actualRoute !== record.route);
if (!sourceStable) failures.push({ message: "Source changed during runtime; evidence is not frozen to one source", sourceStart, sourceEnd });
const summary = { runId, baseUrl: BASE, output: OUTPUT, at: new Date().toISOString(), sourceStart, sourceEnd, sourceStable, serverIdentity, frontendOnly: true, businessRequestsIsolated: true,
  assertions, combinations: records.length, matrixCoverage: fullMatrix ? "full 24 unique variants" : records.length ? "partial smoke; full matrix not accepted" : "route scan only; Home matrix unverified",
  routeScan: { status: !scan.length ? "not requested" : scanPartial || !scanComplete ? "partial; redirects/errors/unverified states listed" : "all default rendered routes observed", requested: scan.length, manifest: manifest.pages.length, rendered: scan.filter(record => record.actualRoute === record.route).length,
    runtimeErrors: scan.filter(record => record.errors.length).map(record => ({ route: record.route, errors: record.errors })),
    redirectsOrUnverified: scan.filter(record => record.actualRoute !== record.route).map(record => ({ route: record.route, actual: record.actualRoute, status: record.status, error: record.error })),
    independentGroups: scan.flatMap(record => (record.groups || []).filter(group => !group.shared).map(group => ({ route: record.actualRoute, ...group }))) }, failures,
  limitations: ["Frontend fixtures do not accept production amounts, native App-Plus rendering, real backend facts or account persistence.", "Refresh proves the shared material/feed re-mount; tab selection is component-local and resets to Activity.", "The route scan observes rendered default/unavailable/empty states at 390px English dark; conditional hidden groups and populated unrelated business branches remain unverified.", "Segment candidate classification uses rendered roles and tab/segment/period/filter classes; controls without both signals are not claimed semantically covered.", "Redirected manifest targets are explicitly unverified; their destination DOM is recorded without claiming target coverage."] };
await writeFile(path.join(OUTPUT, "runtime.json"), JSON.stringify({ ...summary, records, routes: scan }, null, 2));
await writeFile(path.join(OUTPUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ runId, sourceStable, combinations: records.length, assertions, routeScan: summary.routeScan, failures: failures.length, output: OUTPUT }));
if (failures.length) process.exitCode = 1;
