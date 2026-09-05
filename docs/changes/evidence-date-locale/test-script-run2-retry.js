// Retry of the two segments interrupted by dev-server congestion:
// 1) full "en" case (browser locale zh-CN, click English row, proof page)
// 2) AC5 spot check: fresh context (en-US), click 简体中文, open /pages/me/profile
// Same method: real UI clicks only, no storage injection; serial, one browser.
const fs = require('fs');
const path = require('path');
const REPO = 'D:/WORKS/PLAN/Nexion-uniapp';
let chromium;
try { ({ chromium } = require(path.join(REPO, 'node_modules', 'playwright'))); }
catch { ({ chromium } = require(path.join(REPO, 'node_modules', 'playwright-core'))); }

const BASE = 'http://localhost:5223/?nx_device=off';
const EVID = path.join(REPO, 'docs', 'changes', 'evidence-date-locale');
const OUT = path.join(__dirname, 'date-locale-result-retry.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const firstLine = e => String((e && e.message) || e).split('\n')[0];

async function gotoFresh(page, url, waitText, log, label) {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch (e) { lastErr = e; log.push(`[${label}] goto attempt ${i} FAILED: ${firstLine(e)}`); if (i < 3) { await sleep(3000); continue; } else break; }
    try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch (e) { lastErr = e; log.push(`[${label}] reload attempt ${i} FAILED: ${firstLine(e)}`); if (i < 3) { await sleep(3000); continue; } else break; }
    try {
      await page.getByText(waitText).first().waitFor({ state: 'visible', timeout: 25000 });
      log.push(`[${label}] loaded OK on attempt ${i} (text "${waitText}" visible)`);
      return;
    } catch (e) { lastErr = e; log.push(`[${label}] waitFor text "${waitText}" attempt ${i} TIMED OUT`); if (i < 3) await sleep(3000); }
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

function attach(page, sink) {
  page.on('console', m => sink.push({ kind: 'console', type: m.type(), text: m.text().slice(0, 400), loc: ((m.location() || {}).url || '').slice(0, 200) }));
  page.on('pageerror', e => sink.push({ kind: 'pageerror', type: 'error', text: String(e).slice(0, 400), loc: '' }));
  page.on('requestfailed', req => sink.push({ kind: 'requestfailed', type: 'info', text: ((req.failure() || {}).errorText || ''), loc: req.url().slice(0, 200) }));
}

(async () => {
  fs.mkdirSync(EVID, { recursive: true });
  const results = { startedAt: new Date().toISOString(), cases: [] };
  const browser = await chromium.launch({ headless: true });
  try {
    // ---- Case A: en (browser zh-CN) full run ----
    {
      const r = { app: 'en', ctxLocale: 'zh-CN', steps: [], console: [], ok: false };
      results.cases.push(r);
      const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      attach(page, r.console);
      try {
        await gotoFresh(page, BASE + '#/pages/me/language', 'English', r.steps, 'en/lang');
        await page.getByText('English', { exact: false }).first().click();
        r.steps.push('clicked language row "English" (real UI, no storage injection)');
        await sleep(1500);
        r.proofConsoleStart = r.console.length;
        await gotoFresh(page, BASE + '#/pages/me/proof', 'Member since', r.steps, 'en/proof');
        r.navLang = await page.evaluate(() => navigator.language);
        r.intlLocale = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().locale);
        r.line = await extractLine(page, 'Member since');
        r.pageTextSample = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n').slice(0, 1500);
        r.proofConsoleEnd = r.console.length;
        const shot = path.join(EVID, 'proof-en.png');
        await shoot(page, shot, 'Member since');
        r.screenshot = shot;
        r.monthOk = !!(r.line && /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s+\d{4}/.test(r.line));
        r.mixed = !!(r.line && /[\u5e74\u6708]|thg|th\u00e1ng|Th\u00e0nh vi\u00ean|\u52a0\u5165/iu.test(r.line));
        r.ok = r.monthOk && !r.mixed;
        console.log(`== en: line=${JSON.stringify(r.line)} monthOk=${r.monthOk} mixed=${r.mixed} navLang=${r.navLang}`);
      } catch (e) {
        r.error = firstLine(e);
        try { r.debugText = (await page.evaluate(() => document.body.innerText)).slice(0, 1200); } catch {}
        console.log('== en ERROR: ' + r.error);
      } finally { await ctx.close().catch(() => {}); }
      fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    }
    // ---- Case B: AC5 zh profile spot check ----
    {
      const r = { app: 'zh-profile', ctxLocale: 'en-US', steps: [], console: [], ok: false };
      results.cases.push(r);
      const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      attach(page, r.console);
      try {
        await gotoFresh(page, BASE + '#/pages/me/language', '\u7b80\u4f53\u4e2d\u6587', r.steps, 'zhp/lang');
        await page.getByText('\u7b80\u4f53\u4e2d\u6587', { exact: false }).first().click();
        r.steps.push('clicked language row "简体中文" (real UI, no storage injection)');
        await sleep(1500);
        r.profileConsoleStart = r.console.length;
        await gotoFresh(page, BASE + '#/pages/me/profile', '\u52a0\u5165\u4e8e', r.steps, 'zhp/profile');
        r.navLang = await page.evaluate(() => navigator.language);
        r.profileLine = await extractLine(page, '\u52a0\u5165\u4e8e');
        r.profileTextSample = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n').slice(0, 1200);
        const pshot = path.join(EVID, 'profile-zh.png');
        await shoot(page, pshot, '\u52a0\u5165\u4e8e');
        r.profileShot = pshot;
        r.ok = !!(r.profileLine && /\d{4}\s*\u5e74\s*\d{1,2}\s*\u6708/u.test(r.profileLine)
          && !/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|thg|th\u00e1ng/u.test(r.profileLine));
        console.log(`== zh profile: line=${JSON.stringify(r.profileLine)} ok=${r.ok}`);
      } catch (e) {
        r.error = firstLine(e);
        try { r.debugText = (await page.evaluate(() => document.body.innerText)).slice(0, 1200); } catch {}
        console.log('== zh profile ERROR: ' + r.error);
      } finally { await ctx.close().catch(() => {}); }
      fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    }
  } finally {
    await browser.close().catch(() => {});
    results.finishedAt = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    console.log('RESULT_JSON=' + OUT);
  }
})();
