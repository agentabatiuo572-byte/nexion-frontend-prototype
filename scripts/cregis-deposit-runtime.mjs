#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import Jimp from "jimp";
import QrCode from "qrcode-reader";
import { ensureServer } from "./lib/dev-server-pool.mjs";
import { installFormalProbeSession } from "./lib/formal-probe-session.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await ensureServer({ root, environment: "development", timeoutMs: 90_000 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const address = "0x1111111111111111111111111111111111111111";
const txHash = `0x${"a".repeat(64)}`;
let enabled = true;

try {
  await installFormalProbeSession(page, { responseFor(url) {
    if (url.pathname === "/api/deposits/address") {
      return enabled
      ? { enabled: true, network: "BEP20", address, feeUsdt: 1, minDepositUsdt: 10, confirmations: 15 }
      : { enabled: false, network: "BEP20" };
    }
    if (url.pathname === "/api/deposits") return enabled
      ? [{ depositId: "CR-77", txHash, address, grossAmountUsdt: 10.000001,
          creditedUsdt: 9.000001, confirmations: 15, status: "CREDITED", createdAt: Date.now() },
        { depositId: "CR-78", txHash: `0x${"b".repeat(64)}`, address,
          grossAmountUsdt: 0.000001, creditedUsdt: 0, confirmations: 15,
          status: "DUST_HOLD", createdAt: Date.now() - 1000 }]
      : [];
  } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.baseUrl}/?nx_device=off#/pages/me/wallet-topup`, { waitUntil: "domcontentloaded" });
  await page.locator(".nx-topup-seg-crypto").click();
  await page.locator(".nx-dep-copy-address-cta").waitFor({ timeout: 20_000 });
  if (await page.locator(".nx-dep-net-bep20").count() !== 1
      || await page.locator(".nx-dep-net-trc20, .nx-dep-net-erc20").count() !== 0
      || await page.locator(".nx-dep-record-row").count() !== 2
      || await page.locator(".nx-dep-copy-address-cta").getAttribute("aria-label") === null) {
    throw new Error("USDT deposit page did not show the server-backed BEP20 address and record");
  }
  const enabledText = await page.locator(".nx-dep-net-bep20").textContent();
  const qrImage = page.locator(".nx-dep-qr-image");
  if (!enabledText?.includes("BEP20") || await qrImage.count() !== 1)
    throw new Error("BEP20 QR bitmap missing");
  const qrSource = await qrImage.evaluate((node) => node.querySelector("img")?.src ?? node.getAttribute("src"));
  if (!qrSource?.startsWith("data:image/gif;base64,")) throw new Error("QR bitmap source missing");
  const qrPixels = await Jimp.read(Buffer.from(qrSource.split(",")[1], "base64"));
  const { width, height } = qrPixels.bitmap;
  if (width !== height || width < 100 || (width - 32) % 4 !== 0)
    throw new Error("QR bitmap dimensions invalid");
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = qrPixels.getPixelColor(x, y);
    if (color !== 0x000000ff && color !== 0xffffffff)
      throw new Error("QR bitmap must use opaque black and white pixels");
    if ((x < 16 || y < 16 || x >= width - 16 || y >= height - 16) && color !== 0xffffffff)
      throw new Error("QR bitmap four-module quiet zone missing");
  }
  let finderWidth = 0;
  while (qrPixels.getPixelColor(16 + finderWidth, 16) === 0x000000ff) finderWidth++;
  if (finderWidth !== 7 * 4) throw new Error("QR bitmap module size invalid");
  const bitmap = await Jimp.read(await page.locator(".nx-dep-qr-box").screenshot());
  const decoded = await new Promise((resolve, reject) => {
    const reader = new QrCode();
    reader.callback = (error, value) => error ? reject(error) : resolve(value?.result);
    reader.decode(bitmap.bitmap);
  });
  if (decoded !== address) throw new Error("Rendered QR did not decode to the Cregis address");
  const records = await page.locator(".nx-dep-record-row").allTextContents();
  if (!records.some((text) => text.includes("9.000001"))
      || !records.some((text) => text.includes("0.000001")))
    throw new Error("USDT six-decimal amounts were rounded in the page");

  await page.evaluate(async () => {
    const { useApp } = await import("/src/store/app.ts");
    useApp().bindAccount("user:900002");
  });
  if (await page.locator(".nx-dep-copy-address-cta").count() !== 0
      || await page.locator(".nx-dep-record-row").count() !== 0)
    throw new Error("Old account deposit data remained visible after rebinding");

  enabled = false;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".nx-topup-seg-crypto").click();
  await page.locator(".nx-dep-net-bep20").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(700);
  if (await page.locator(".nx-dep-copy-address-cta").count() !== 0
      || await page.locator(".nx-dep-net-bep20").getAttribute("aria-disabled") !== "true") {
    throw new Error("Disabled USDT channel still exposes an address");
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  console.log("CREGIS-DEPOSIT-RUNTIME: PASS (BEP20 address, QR, credited net record, disabled state)");
} finally {
  await browser.close();
  server.stop();
}
