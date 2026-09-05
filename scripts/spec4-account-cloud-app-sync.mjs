import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const accountKey = "spec4-sync@nexgrid.ai";

function unwrap(raw, fallback) {
  if (!raw) return fallback;
  const parsed = JSON.parse(raw);
  return parsed && parsed.type && Object.prototype.hasOwnProperty.call(parsed, "data") ? parsed.data : parsed;
}

function wrap(data) {
  return JSON.stringify({ type: "object", data });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") collectAppConsoleErrors(errors, baseUrl)(msg);
});
page.on("pageerror", (err) => errors.push(err.message));

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.goto(`${baseUrl}/#/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);

// uni-app H5 dev 把应用渲染在同源 iframe 里;evaluate 必须进应用 frame——
// 在顶层 frame 裸 import("/src/store/app.ts") 会凭空构建第二套模块图
// (第二份 pinia,报 no active Pinia)。同 frame 内动态 import 命中 vite
// 模块缓存,拿到的才是页面主链的 store 实例。build 产物无 iframe 时回退主 frame。
async function resolveAppFrame() {
  for (let i = 0; i < 50; i++) {
    const frame = page.frames().find((f) => f !== page.mainFrame());
    if (frame) return frame;
    await page.waitForTimeout(200);
  }
  return page.mainFrame();
}
const appFrame = await resolveAppFrame();

const result = await appFrame.evaluate(
  async ({ accountKey, unwrapText, wrapText }) => {
    const unwrap = eval(`(${unwrapText})`);
    const wrap = eval(`(${wrapText})`);
    const { useApp } = await import("/src/store/app.ts");
    const app = useApp();

    app.bindAccount(accountKey);
    const cloudBefore = unwrap(localStorage.getItem("nexgrid-account-cloud-v1"), {});
    const row = cloudBefore[accountKey];
    if (!row) throw new Error("account cloud row missing after bindAccount");
    if (!row.devices.length) throw new Error("seed devices missing after bindAccount");

    const externalBalance = 999999.99;
    cloudBefore[accountKey] = {
      ...row,
      updatedAt: Date.now(),
      user: { ...row.user, usdtBalance: externalBalance },
    };
    localStorage.setItem("nexgrid-account-cloud-v1", wrap(cloudBefore));

    app.creditBalance(1);
    const afterFirst = unwrap(localStorage.getItem("nexgrid-account-cloud-v1"), {})[accountKey];
    app.creditBalance(1);
    const afterSecond = unwrap(localStorage.getItem("nexgrid-account-cloud-v1"), {})[accountKey];

    const deleteId = afterSecond.devices[0].id;
    app.devices = app.devices.filter((device) => device.id !== deleteId);
    app.persistAccountSnapshot();
    const afterDelete = unwrap(localStorage.getItem("nexgrid-account-cloud-v1"), {})[accountKey];

    return {
      firstBalance: afterFirst.user.usdtBalance,
      secondBalance: afterSecond.user.usdtBalance,
      appBalance: app.user.usdtBalance,
      deleteId,
      deletedStillInCloud: afterDelete.devices.some((device) => device.id === deleteId),
    };
  },
  { accountKey, unwrapText: unwrap.toString(), wrapText: wrap.toString() },
);

await browser.close();

if (result.firstBalance !== 1000000.99) {
  throw new Error(`first merged balance wrong: ${result.firstBalance}`);
}
if (result.secondBalance !== 1000001.99 || result.appBalance !== 1000001.99) {
  throw new Error(`merged snapshot was not adopted before second write: cloud=${result.secondBalance}, app=${result.appBalance}`);
}
if (result.deletedStillInCloud) {
  throw new Error(`device deletion did not persist to account cloud: ${result.deleteId}`);
}
if (errors.length) {
  throw new Error(`browser errors: ${errors.slice(0, 5).join(" | ")}`);
}

console.log("SPEC-4 account-cloud app sync PASS");
