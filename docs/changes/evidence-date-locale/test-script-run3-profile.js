// Final AC5 attempt: patient timeouts (90s goto), SPA in-app navigation to
// /pages/me/profile after real-UI language click (realistic user flow, fewer
// doc loads against the congested dev server). Dumps evidence unconditionally.
const fs = require('fs');
const path = require('path');
const REPO = 'D:/WORKS/PLAN/Nexion-uniapp';
let chromium;
try { ({ chromium } = require(path.join(REPO, 'node_modules', 'playwright'))); }
catch { ({ chromium } = require(path.join(REPO, 'node_modules', 'playwright-core'))); }
const BASE = 'http://localhost:5223/?nx_device=off';
const EVID = path.join(REPO, 'docs', 'changes', 'evidence-date-locale');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const firstLine = e => String((e && e.message) || e).split('\n')[0];
const ZH = '\u7b80\u4f53\u4e2d\u6587';
const JOIN = '\u52a0\u5165\u4e8e';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const sink = [];
  page.on('console', m => sink.push({ type: m.type(), text: m.text().slice(0, 300), loc: ((m.location() || {}).url || '').slice(0, 150) }));
  page.on('pageerror', e => sink.push({ type: 'pageerror', text: String(e).slice(0, 300), loc: '' }));
  try {
    let loaded = false;
    for (let i = 1; i <= 3 && !loaded; i++) {
      try {
        await page.goto(BASE + '#/pages/me/language', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText(ZH).first().waitFor({ state: 'visible', timeout: 30000 });
        loaded = true;
      } catch (e) { console.log(`lang attempt ${i}: ${firstLine(e)}`); if (i < 3) await sleep(3000); }
    }
    if (!loaded) { console.log('ENV_UNAVAILABLE: language page never loaded'); return; }
    await page.getByText(ZH).first().click();
    console.log('clicked zh row');
    await sleep(1500);
    const consoleStart = sink.length;
    // SPA in-app hash navigation (no full doc reload)
    await page.goto(BASE + '#/pages/me/profile', { waitUntil: 'domcontentloaded', timeout: 90000 });
    let found = true;
    try { await page.getByText(JOIN).first().waitFor({ state: 'visible', timeout: 45000 }); }
    catch { found = false; }
    console.log('JOIN_TEXT_FOUND=' + found);
    console.log('URL_NOW=' + page.url());
    const text = await page.evaluate(() => document.body.innerText);
    console.log('BODY_TEXT_START>>>');
    console.log(text.replace(/\n{2,}/g, '\n').slice(0, 2500));
    console.log('<<<BODY_TEXT_END');
    if (found) {
      const line = await page.evaluate((label) => {
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
      }, JOIN);
      console.log('JOIN_LINE=' + JSON.stringify(line));
      try { await page.getByText(JOIN).first().scrollIntoViewIfNeeded({ timeout: 3000 }); } catch {}
      await page.screenshot({ path: path.join(EVID, 'profile-zh.png'), fullPage: true });
      console.log('SHOT=' + path.join(EVID, 'profile-zh.png'));
    } else {
      await page.screenshot({ path: path.join(__dirname, 'profile-final-diag.png'), fullPage: true });
      console.log('DIAG_SHOT=' + path.join(__dirname, 'profile-final-diag.png'));
    }
    console.log('CONSOLE_ERRORS=' + JSON.stringify(sink.slice(consoleStart).filter(s => s.type === 'error' || s.type === 'pageerror')));
  } catch (e) {
    console.log('FINAL ERROR: ' + firstLine(e));
  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }
})();
