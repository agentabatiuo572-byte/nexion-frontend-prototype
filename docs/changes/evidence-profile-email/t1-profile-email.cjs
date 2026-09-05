/*
 * T1 black-box acceptance: profile identity line must be email-shaped, no bare `default`.
 * Round: 2026-08-16. Tester is independent; no src read, no storage injection.
 * Run: node <this file>   (playwright resolved from worktree node_modules)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const WT = 'D:\\WORKS\\PLAN\\Nexion-uniapp\\.claude\\worktrees\\zr-profile-email';
const EVID = path.join(WT, 'docs', 'changes', 'evidence-profile-email');
const BASE = 'http://127.0.0.1:5399';
const LANG_URL = BASE + '/?nx_device=off#/pages/me/language';
const PROFILE_URL = BASE + '/?nx_device=off#/pages/me/profile';

const envFailures = [];

async function gotoRetry(page, url, tag) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { timeout: 30000 });
      return attempt;
    } catch (e) {
      lastErr = e;
      envFailures.push(`[${tag}] goto attempt ${attempt} failed: ${String(e).split('\n')[0]}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastErr;
}

async function waitForText(page) {
  await page.waitForFunction(
    () => document.body && document.body.innerText && document.body.innerText.trim().length > 30,
    null,
    { timeout: 20000 }
  );
  await page.waitForTimeout(800);
}

function attachSinks(page, sink) {
  page.on('console', (m) => sink.console.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => sink.pageerrors.push(String(e)));
  page.on('requestfailed', (r) => sink.requestfailed.push(r.url() + ' :: ' + ((r.failure() && r.failure().errorText) || '')));
}

async function dumpNodes(page) {
  return await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const out = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      out.push({
        text: t,
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 140),
        x: +r.x.toFixed(1),
        y: +r.y.toFixed(1),
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
      });
    }
    return out;
  });
}

function analyze(nodes, fullText) {
  const nickIdx = nodes.findIndex((n) => /hyper\s*drift/i.test(n.text));
  const nick = nickIdx >= 0 ? nodes[nickIdx] : null;
  let belowDoc = null;
  let belowVisual = null;
  if (nick) {
    for (let i = nickIdx + 1; i < nodes.length; i++) {
      if (nodes[i].text) { belowDoc = nodes[i]; break; }
    }
    const cands = nodes.filter(
      (n) => n !== nick && n.y > nick.y + 1 && n.x < nick.x + nick.w && n.x + n.w > nick.x
    );
    cands.sort((a, b) => a.y - b.y);
    belowVisual = cands[0] || null;
  }
  const bareDefaultNodes = nodes.filter((n) => n.text.toLowerCase() === 'default');
  const bareDefaultLines = fullText
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.toLowerCase() === 'default');
  const emailNodes = nodes.filter((n) => /@/.test(n.text));
  const suspicious = nodes.filter((n) =>
    /\b(undefined|null|NaN)\b|\{\{|\[object /.test(n.text) ||
    (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+){2,}$/i.test(n.text) && !n.text.includes('@'))
  );
  return { nick, belowDoc, belowVisual, bareDefaultNodes, bareDefaultLines, emailNodes, suspicious };
}

(async () => {
  fs.mkdirSync(EVID, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = { meta: { when: new Date().toISOString(), base: BASE, viewport: '390x844 dark' } };

  // ---------- Scenario ZH: language page -> click 简体中文 -> fresh-load profile ----------
  {
    const sink = { console: [], pageerrors: [], requestfailed: [] };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const page = await ctx.newPage();
    attachSinks(page, sink);
    const attLang = await gotoRetry(page, LANG_URL, 'zh:lang');
    await waitForText(page);
    const loc = page.locator('text=简体中文');
    await loc.first().waitFor({ state: 'visible', timeout: 15000 });
    const langNodes = await dumpNodes(page);
    const zhMatches = langNodes.filter((n) => n.text.includes('简体中文'));
    const clickCount = await loc.count();
    await loc.first().click({ timeout: 10000 });
    await page.waitForTimeout(1500);
    await page.goto('about:blank'); // force next goto to be a fresh document load
    const attProfile = await gotoRetry(page, PROFILE_URL, 'zh:profile');
    await waitForText(page);
    await page.waitForTimeout(700);
    const nodes = await dumpNodes(page);
    const fullText = await page.evaluate(() => document.body.innerText);
    const hasCJK = /[\u4e00-\u9fff]/.test(fullText);
    await page.screenshot({ path: path.join(EVID, 'profile-zh.png'), fullPage: true });
    evidence.zh = {
      gotoAttempts: { lang: attLang, profile: attProfile },
      langNodes, zhMatches, clickCount, hasCJK, nodes, fullText,
      analysis: analyze(nodes, fullText), sink,
    };
    await ctx.close();
  }

  // ---------- Scenario EN: fresh context, direct profile ----------
  {
    const sink = { console: [], pageerrors: [], requestfailed: [] };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const page = await ctx.newPage();
    attachSinks(page, sink);
    const att = await gotoRetry(page, PROFILE_URL, 'en:profile');
    await waitForText(page);
    await page.waitForTimeout(700);
    const nodes = await dumpNodes(page);
    const fullText = await page.evaluate(() => document.body.innerText);
    const hasCJK = /[\u4e00-\u9fff]/.test(fullText);
    await page.screenshot({ path: path.join(EVID, 'profile-en.png'), fullPage: true });
    evidence.en = { gotoAttempts: { profile: att }, hasCJK, nodes, fullText, analysis: analyze(nodes, fullText), sink };
    await ctx.close();
  }

  await browser.close();
  evidence.envFailures = envFailures;
  fs.writeFileSync(path.join(EVID, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');

  const s = (o) => JSON.stringify(o, null, 2);
  for (const k of ['zh', 'en']) {
    const e = evidence[k];
    console.log(`=== ${k.toUpperCase()} analysis ===`);
    console.log(
      s({
        hasCJK: e.hasCJK,
        nick: e.analysis.nick,
        belowDoc: e.analysis.belowDoc,
        belowVisual: e.analysis.belowVisual,
        bareDefaultNodes: e.analysis.bareDefaultNodes,
        bareDefaultLines: e.analysis.bareDefaultLines,
        emailNodes: e.analysis.emailNodes,
        suspicious: e.analysis.suspicious,
      })
    );
    console.log(`${k} console msgs:`, s(e.sink.console));
    console.log(`${k} pageerrors:`, s(e.sink.pageerrors));
    console.log(`${k} requestfailed:`, s(e.sink.requestfailed));
  }
  console.log('envFailures:', s(envFailures));
  console.log('--- ZH fullText ---\n' + evidence.zh.fullText);
  console.log('--- EN fullText ---\n' + evidence.en.fullText);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
