import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.APP_H5_BASE_URL || "http://127.0.0.1:5173";
const expectedDefault = process.env.EXPECTED_DIAL_CODE || "+86";
assert(["+84", "+86"].includes(expectedDefault), `unsupported EXPECTED_DIAL_CODE: ${expectedDefault}`);

const browser = await chromium.launch({ headless: true });

async function assertSelector(page, route, pagePrefix) {
  await page.goto(`${baseUrl}/?nx_device=off&country-code-e2e=${Date.now()}#${route}`, { waitUntil: "domcontentloaded" });
  const trigger = page.locator(`.${pagePrefix}-phone__cc`);
  const currentCode = page.locator(`.${pagePrefix}-phone__cc-t`);
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  assert.equal((await currentCode.innerText()).trim(), expectedDefault, `${route} default country code`);
  const phoneInput = page.locator(`.${pagePrefix}-phone__in`);
  const phoneControl = phoneInput.locator("input");
  const expectedPhone = expectedDefault === "+84" ? "912345678" : "13800138000";
  await phoneControl.fill(expectedPhone);
  assert.equal(await phoneInput.getAttribute("aria-invalid"), "false", `${route} default phone must validate`);

  await trigger.click();
  const rows = page.locator(".cc-row");
  await rows.first().waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(350);
  assert.equal(await rows.count(), 16, `${route} must keep all 16 countries visible`);

  const matrix = await rows.evaluateAll((elements) => elements.map((element) => ({
    code: element.querySelector(".cc-row__code")?.textContent?.trim() ?? "",
    ariaDisabled: element.getAttribute("aria-disabled"),
    tabIndex: element.getAttribute("tabindex"),
    opacity: getComputedStyle(element).opacity,
  })));
  const enabled = matrix.filter((row) => row.ariaDisabled === "false");
  const disabled = matrix.filter((row) => row.ariaDisabled === "true");
  assert.deepEqual(enabled.map((row) => row.code), ["+84", "+86"], `${route} selectable codes`);
  assert.equal(disabled.length, 14, `${route} disabled country count`);
  assert(enabled.every((row) => row.tabIndex === "0"), `${route} enabled rows must remain keyboard focusable`);
  assert(disabled.every((row) => row.tabIndex === "-1" && Number(row.opacity) < 0.5), `${route} disabled rows must be gray and out of Tab order`);

  const enabledRows = page.locator('.cc-row[aria-disabled="false"]');
  await enabledRows.first().focus();
  await page.keyboard.press("Tab");
  assert(await enabledRows.nth(1).evaluate((element) => element === document.activeElement), `${route} Tab must skip disabled countries`);
  await page.keyboard.press("Tab");
  assert.equal(await page.locator('.cc-row[aria-disabled="true"]:focus').count(), 0, `${route} Tab focused a disabled country`);

  const disabledRows = page.locator('.cc-row[aria-disabled="true"]');
  const disabledRow = disabledRows.first();
  const disabledRect = await disabledRow.evaluate((element) => element.getBoundingClientRect().toJSON());
  assert(disabledRect.y >= 0 && disabledRect.bottom <= 844, `${route} needs a visible disabled country for pointer testing`);
  await page.mouse.click(disabledRect.x + disabledRect.width / 2, disabledRect.y + disabledRect.height / 2);
  assert.equal((await currentCode.innerText()).trim(), expectedDefault, `${route} disabled click changed country code`);
  assert(await page.locator(".cc-sheet").isVisible(), `${route} disabled click closed the selector`);
  await disabledRow.evaluate((element) => element.focus());
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  assert.equal((await currentCode.innerText()).trim(), expectedDefault, `${route} disabled keyboard activation changed country code`);

  const alternate = expectedDefault === "+84" ? "+86" : "+84";
  await rows.filter({ hasText: alternate }).first().click();
  assert.equal((await currentCode.innerText()).trim(), alternate, `${route} enabled alternate code was not selectable`);
  const alternatePhone = alternate === "+84" ? "912345678" : "13800138000";
  await phoneControl.fill(alternatePhone);
  assert.equal(await phoneInput.getAttribute("aria-invalid"), "false", `${route} alternate phone must validate`);
}

try {
  const login = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await assertSelector(login, "/pages/login/login", "lg");
  const register = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await assertSelector(register, "/pages/register/register", "rg");
  console.log(`country-code-selector-h5:PASS default=${expectedDefault} routes=2 rows=16 enabled=2 disabled=14`);
} finally {
  await browser.close();
}
