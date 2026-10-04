import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const formalBase = process.env.NX_GENESIS_FORMAL_URL || "http://127.0.0.1:5173";
const prototypeBase = process.env.NX_GENESIS_PROTOTYPE_URL || "http://127.0.0.1:5174";
const evidenceDir = path.resolve(process.env.NX_GENESIS_UNIFIED_EVIDENCE_DIR
  || "D:/workspace/bug-pic/genesis-unified-policy-20260827");
fs.mkdirSync(evidenceDir, { recursive: true });

const legacyCopy = /累计入金|持有旗舰设备|创世邀请码|达成任一即可|cumulative deposit|flagship device|Genesis invite \(any one\)|tổng nạp tích lũy|mã mời Genesis \(chỉ cần một điều kiện\)|any-of/iu;
const evidence = {
  status: "RUNNING",
  purchasePostCount: 0,
  runtimeErrors: [],
  formal: {},
  prototype: {},
};

async function waitUntil(check, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${message}${lastError ? `:${String(lastError)}` : ""}`);
}

function appFrame(page) {
  return page.frames().find((candidate) => candidate !== page.mainFrame()
    && candidate.url().includes("nx_device_inner=1"));
}

async function openApp(browser, baseUrl, route, seedLegacy = false) {
  const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 414, height: 896 } });
  await context.addInitScript(({ legacy }) => {
    localStorage.setItem("nexgrid-locale-v1", JSON.stringify({ type: "object", data: { code: "zh", userSet: true } }));
    if (legacy) {
      localStorage.setItem("nexgrid-genesis", JSON.stringify({
        type: "object",
        data: { soldSlots: 847, nexListed: false, nexListedAt: null },
      }));
    }
  }, { legacy: seedLegacy });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => evidence.runtimeErrors.push(`${baseUrl}:pageerror:${error.message}`));
  page.on("console", (message) => {
    // Browser reports expected unauthenticated account probes as generic 401
    // resource errors; the public Genesis projection remains valid and is
    // asserted separately above.
    if (message.type() !== "error" || /favicon|ERR_ABORTED|Failed to load resource/.test(message.text())) return;
    evidence.runtimeErrors.push(`${baseUrl}:console:${message.text()}`);
  });
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/genesis/purchase") {
      evidence.purchasePostCount += 1;
    }
  });
  await page.goto(`${baseUrl}/#${route}`, { waitUntil: "domcontentloaded" });
  await waitUntil(() => appFrame(page)?.url().includes(`#${route}`), `ROUTE_NOT_REACHED:${baseUrl}:${route}`);
  const frame = appFrame(page);
  assert(frame, `APP_FRAME_MISSING:${baseUrl}`);
  return { context, page, frame };
}

const stateResponse = await fetch(`${formalBase}/api/genesis/state`);
const statePayload = await stateResponse.json();
assert.equal(stateResponse.status, 200);
assert.equal(statePayload?.code, 0);
const state = statePayload.data;
evidence.formal.state = {
  sourceEnvironment: state.sourceEnvironment,
  serverCanonical: state.sale.serverCanonical,
  totalSupply: state.series.totalSupply,
  soldSupply: state.series.soldSupply,
  remainingSupply: state.series.remainingSupply,
  eligibilityEnabled: state.sale.eligibilityEnabled,
  maxPerUser: state.sale.maxPerUser,
  minAccountAgeDays: state.sale.minAccountAgeDays,
  legacyFieldsPresent: ["mode", "appliesTo", "hasGenesisInvite"].filter((key) => Object.hasOwn(state.sale, key)),
};
assert.deepEqual(evidence.formal.state, {
  sourceEnvironment: "PRODUCTION",
  serverCanonical: true,
  totalSupply: 1000,
  soldSupply: 0,
  remainingSupply: 1000,
  eligibilityEnabled: true,
  maxPerUser: 5,
  minAccountAgeDays: 0,
  legacyFieldsPresent: [],
});

const browser = await chromium.launch({ headless: true });
try {
  const formal = await openApp(browser, formalBase, "/pages/genesis/genesis");
  try {
    await formal.frame.locator(".nx-genesis-dock").waitFor({ state: "visible" });
    const body = await formal.frame.locator("body").innerText();
    evidence.formal.page = {
      route: formal.frame.url(),
      genesisVisible: /创世节点|Genesis/iu.test(body),
      legacyCopyVisible: legacyCopy.test(body),
    };
    assert.equal(evidence.formal.page.genesisVisible, true);
    assert.equal(evidence.formal.page.legacyCopyVisible, false);
    await formal.page.screenshot({ path: path.join(evidenceDir, "5173-genesis-new-policy.png"), fullPage: true });
  } finally {
    await formal.context.close();
  }

  const prototype = await openApp(browser, prototypeBase, "/pages/genesis/genesis", true);
  try {
    await prototype.frame.locator(".nx-genesis-dock").waitFor({ state: "visible" });
    await waitUntil(async () => {
      const body = (await prototype.frame.locator("body").innerText()).replaceAll(",", "");
      return /0\s*\/\s*1000/.test(body) && /1000\s*剩余/.test(body);
    }, "PROTOTYPE_ZERO_SUPPLY_BASELINE_NOT_VISIBLE");
    const beforeClick = await prototype.frame.locator("body").innerText();
    const storage = await prototype.frame.evaluate(() => ({
      legacy: localStorage.getItem("nexgrid-genesis"),
      current: localStorage.getItem("nexgrid-genesis-v2"),
    }));
    evidence.prototype.page = {
      route: prototype.frame.url(),
      zeroOfThousand: /0\s*\/\s*1,?000/.test(beforeClick),
      thousandRemaining: /1,?000\s*剩余/.test(beforeClick),
      firstTierPrice: beforeClick.includes("7,999"),
      legacyCopyVisible: legacyCopy.test(beforeClick),
      legacyStorageRemoved: storage.legacy === null,
    };
    assert.deepEqual(evidence.prototype.page, {
      route: prototype.frame.url(),
      zeroOfThousand: true,
      thousandRemaining: true,
      firstTierPrice: true,
      legacyCopyVisible: false,
      legacyStorageRemoved: true,
    });
    await prototype.frame.locator(".nx-genesis-dock").click();
    await prototype.frame.locator(".nx-sheet-panel").waitFor({ state: "visible" });
    const sheetText = await prototype.frame.locator(".nx-sheet-panel").innerText();
    evidence.prototype.purchaseSheet = {
      opened: true,
      price7999: sheetText.includes("7,999"),
      submitted: false,
    };
    assert.equal(evidence.prototype.purchaseSheet.price7999, true);
    await prototype.page.screenshot({ path: path.join(evidenceDir, "5174-genesis-confirm-not-submitted.png"), fullPage: true });
  } finally {
    await prototype.context.close();
  }

  assert.equal(evidence.purchasePostCount, 0, "PURCHASE_REQUEST_MUST_NOT_BE_SENT");
  assert.deepEqual(evidence.runtimeErrors, [], "BROWSER_RUNTIME_ERRORS_PRESENT");
  evidence.status = "PASS";
} catch (error) {
  evidence.status = "FAIL";
  evidence.error = String(error?.stack || error);
  throw error;
} finally {
  await browser.close();
  fs.writeFileSync(path.join(evidenceDir, "evidence.json"), JSON.stringify(evidence, null, 2));
}

console.log(JSON.stringify({ status: evidence.status, evidenceDir, purchasePostCount: evidence.purchasePostCount }));
