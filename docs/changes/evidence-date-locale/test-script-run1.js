// Independent black-box acceptance test for pkg/zp-date-locale (T1)
// Method: single browser instance, serial navigation; per-language FRESH context
// whose `locale` (navigator.language / Accept-Language) differs from the app
// language under test. Language switching is done ONLY by clicking the real UI
// row on /pages/me/language — NO storage injection anywhere in this script.
const fs = require('fs');
const path = require('path');
const REPO = 'D:/WORKS/PLAN/Nexion-uniapp';
let chromium;
try { ({ chromium } = require(path.join(REPO, 'node_modules', 'playwright'))); }
catch { ({ chromium } = require(path.join(REPO, 'node_modules', 'playwright-core'))); }

const BASE = 'http://localhost:5223/?nx_device=off'; // ?nx_device=off MUST precede '#'
const EVID = path.join(REPO, 'docs', 'changes', 'evidence-date-locale');
const OUT = path.join(__dirname, 'date-locale-result.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const firstLine = e => String((e && e.message) || e).split('\n')[0];

const CASES = [
  { app: 'en', ctxLocale: 'zh-CN', rowText: 'English', label: 'Member since',
    monthReSrc: '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\\s+\\d{4}', monthFlags: '',
    forbidReSrc: '[\u5e74\u6708]|thg|th\u00e1ng|Th\u00e0nh vi\u00ean|\u52a0\u5165', forbidFlags: 'iu' },
  { app: 'vi', ctxLocale: 'en-US', rowText: 'Ti\u1ebfng Vi\u1ec7t', label: 'Th\u00e0nh vi\u00ean t\u1eeb',
    monthReSrc: '(thg|th\u00e1ng)\\s*\\d{1,2},?\\s*\\d{4}', monthFlags: 'iu',
    forbidReSrc: '[\u5e74\u6708]|\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\b|Member since|\u52a0\u5165', forbidFlags: 'u' },
  { app: 'zh', ctxLocale: 'en-US', rowText: '\u7b80\u4f53\u4e2d\u6587', label: '\u52a0\u5165\u4e8e',
    monthReSrc: '\\d{4}\\s*\u5e74\\s*\\d{1,2}\\s*\u6708', monthFlags: 'u',
    forbidReSrc: '\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\b|thg|th\u00e1ng|Member since|Th\u00e0nh vi\u00ean', forbidFlags: 'u' },
];

async function launchBrowser() {
  const opts = { headless: true };
  try { return await chromium.launch(opts); }
  catch (e1) {
    try { return await chromium.launch({ ...opts, channel: 'msedge' }); }
    catch (e2) { return await chromium.launch({ ...opts, channel: 'chrome' }); }
  }
}

// goto (may be SPA hash-nav) + reload (forces fresh document under target URL,
// proving persistence) + explicit wait for page text. 3 attempts, 3s backoff.
async function gotoFresh(page, url, waitText, log, label) {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      lastErr = e; log.push(`[${label}] goto attempt ${i} FAILED: ${firstLine(e)}`);
      if (i < 3) { await sleep(3000); continue; } else break;
    }
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      lastErr = e; log.push(`[${label}] reload attempt ${i} FAILED: ${firstLine(e)}`);
      if (i < 3) { await sleep(3000); continue; } else break;
    }
    try {
      await page.getByText(waitText).first().waitFor({ state: 'visible', timeout: 25000 });
      log.push(`[${label}] loaded OK on attempt ${i} (text "${waitText}" visible)`);
      return;
    } catch (e) {
      lastErr = e; log.push(`[${label}] waitFor text "${waitText}" attempt ${i} TIMED OUT`);
      if (i < 3) await sleep(3000);
    }
  }
  throw lastErr;
}

async function extractLine(page, label) {
  return await page.evaluate((label) => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const all = Array.from(document.querySelectorAll('body *'));
    const cands = all.filter(el => (el.textContent || '').includes(label));
    if (!cands.length) return null;
    const deepest = cands.filter(el => !Array.from(el.children).some(c => (c.textContent || '').includes(label)));
    let el = deepest[0] || cands[cands.length - 1];
    for (let i = 0; i < 6 && el; i++) {
      const t = norm(el.innerText || el.textContent);
      if (/\d{4}/.test(t) && t.length <= 200) return t;
      el = el.parentElement;
    }
    return norm((deepest[0] || cands[0]).textContent).slice(0, 200);
  }, label);
}

async function shoot(page, file, anchorText) {
  try { if (anchorText) await page.getByText(anchorText).first().scrollIntoViewIfNeeded({ timeout: 3000 }); } catch {}
  try { await page.screenshot({ path: file, fullPage: true }); }
  catch { await page.screenshot({ path: file }); }
}

async function runCase(browser, C, results) {
  const r = { app: C.app, ctxLocale: C.ctxLocale, steps: [], console: [], ok: false };
  results.cases.push(r);
  const context = await browser.newContext({ locale: C.ctxLocale, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const sink = r.console;
  page.on('console', m => sink.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 400), loc: ((m.location() || {}).url || '').slice(0, 200) }));
  page.on('pageerror', e => sink.push({ kind: 'pageerror', type: 'error', text: String(e).slice(0, 400), loc: '' }));
  page.on('requestfailed', req => sink.push({ kind: 'requestfailed', type: 'info', text: ((req.failure() || {}).errorText || '') , loc: req.url().slice(0, 200) }));
  try {
    console.log(`== case ${C.app}: context locale=${C.ctxLocale}, opening language page`);
    // AC2: switch via real UI on /pages/me/language
    await gotoFresh(page, BASE + '#/pages/me/language', C.rowText, r.steps, `${C.app}/lang`);
    await page.getByText(C.rowText, { exact: false }).first().click();
    r.steps.push(`clicked language row "${C.rowText}" (real UI, no storage injection)`);
    await sleep(1500);
    console.log(`== case ${C.app}: clicked "${C.rowText}", loading proof page`);
    // AC1: proof page fresh-loaded (reload => uses persisted app language)
    r.proofConsoleStart = sink.length;
    await gotoFresh(page, BASE + '#/pages/me/proof', C.label, r.steps, `${C.app}/proof`);
    r.navLang = await page.evaluate(() => navigator.language);
    r.intlLocale = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().locale);
    r.line = await extractLine(page, C.label);
    r.pageTextSample = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n').slice(0, 1500);
    r.proofConsoleEnd = sink.length;
    // AC3: screenshot
    const shot = path.join(EVID, `proof-${C.app}.png`);
    await shoot(page, shot, C.label);
    r.screenshot = shot;
    // verdicts
    const monthRe = new RegExp(C.monthReSrc, C.monthFlags);
    const forbidRe = new RegExp(C.forbidReSrc, C.forbidFlags);
    r.monthOk = !!(r.line && monthRe.test(r.line));
    r.mixed = !!(r.line && forbidRe.test(r.line));
    r.ok = r.monthOk && !r.mixed;
    console.log(`== case ${C.app}: line=${JSON.stringify(r.line)} monthOk=${r.monthOk} mixed=${r.mixed} navLang=${r.navLang}`);
    // AC5: spot-check /pages/me/profile in zh
    if (C.app === 'zh') {
      r.profileConsoleStart = sink.length;
      await gotoFresh(page, BASE + '#/pages/me/profile', C.label, r.steps, 'zh/profile');
      r.profileLine = await extractLine(page, C.label);
      r.profileTextSample = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n').slice(0, 1200);
      const pshot = path.join(EVID, 'profile-zh.png');
      await shoot(page, pshot, C.label);
      r.profileShot = pshot;
      console.log(`== case zh profile: line=${JSON.stringify(r.profileLine)}`);
    }
  } catch (e) {
    r.error = firstLine(e);
    try { r.debugText = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n').slice(0, 1500); } catch {}
    try { await page.screenshot({ path: path.join(__dirname, `debug-${C.app}.png`), fullPage: false }); r.debugShot = path.join(__dirname, `debug-${C.app}.png`); } catch {}
    console.log(`== case ${C.app} ERROR: ${r.error}`);
  } finally {
    await context.close().catch(() => {});
  }
}

(async () => {
  fs.mkdirSync(EVID, { recursive: true });
  const results = { startedAt: new Date().toISOString(), base: BASE, cases: [] };
  const browser = await launchBrowser();
  try {
    for (const C of CASES) {
      await runCase(browser, C, results);
      fs.writeFileSync(OUT, JSON.stringify(results, null, 2)); // partial save each case
    }
  } finally {
    await browser.close().catch(() => {});
    results.finishedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    console.log('RESULT_JSON=' + OUT);
    console.log('SUMMARY=' + JSON.stringify(results.cases.map(c => ({ app: c.app, ok: c.ok, line: c.line, profileLine: c.profileLine, error: c.error || null }))));
  }
})();
