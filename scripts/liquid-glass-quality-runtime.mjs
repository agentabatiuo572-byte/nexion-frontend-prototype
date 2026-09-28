import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer } from './lib/dev-server-pool.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, '.codex-runtime/liquid-glass/quality');
await mkdir(out, { recursive: true });
const server = await ensureServer({ root, reuseUrl: process.env.LIQUID_GLASS_BASE_URL, log: console.log });
const cases = [], errors = [], evidence = [];
let passed = false;

async function material(page, engine, theme, dpr) {
  await page.evaluate(async ({ theme }) => {
    (await import('/src/store/theme.ts')).useTheme().setMode(theme);
    await document.fonts.ready;
    const { mountLiquidGlass } = await import('/src/lib/liquid-glass-renderer.ts');
    const source = document.createElement('canvas');
    source.className = 'quality-source'; source.width = 390; source.height = 844;
    source.style.cssText = 'position:absolute;inset:0;width:390px;height:844px';
    const ctx = source.getContext('2d');
    for (let y = 0; y < 844; y += 16) for (let x = 0; x < 390; x += 16) {
      ctx.fillStyle = (x + y) % 32 === 0 ? '#000' : '#fff'; ctx.fillRect(x, y, 16, 16);
    }
    const scope = document.createElement('div'); scope.className = 'nx-chassis'; scope.id = 'quality-scope';
    scope.style.cssText = 'position:fixed;inset:0;z-index:9999';
    const rail = document.querySelector('.nx-tabbar-pill').cloneNode(true);
    rail.id = 'quality-rail'; rail.style.cssText = 'position:absolute;left:10px;top:280px;width:370px;height:68px';
    const controllers = [];
    // Actual component layers and generated CSS scope attributes are retained.
    scope.append(source, rail); document.body.append(scope);
    for (const host of rail.querySelectorAll('.nx-liquid-glass')) {
      host.querySelectorAll('svg,canvas').forEach(el => el.remove());
      host.id = ''; host.style.removeProperty('backdrop-filter'); host.style.removeProperty('-webkit-backdrop-filter');
      const selection = host.classList.contains('nx-glass-indicator');
      if (selection) {
        const selected = rail.querySelector('[data-selected="true"]');
        Object.assign(host.style, { width: selected.offsetWidth + 'px', height: selected.offsetHeight + 'px', visibility: 'visible' });
        host.style.transform = `translate(${selected.offsetLeft}px,${selected.offsetTop}px)`;
      }
      controllers.push(mountLiquidGlass(host, { radius: selection ? 28 : 34, tone: selection ? 'selection' : 'navigation', backdrop: '.quality-source' }));
    }
    window.__qualityFixture = { scope, controllers };
  }, { theme });
  try {
    await page.waitForFunction(engine => [...document.querySelectorAll('#quality-rail .nx-liquid-glass')].every(el => el.dataset.glassStrategy === (engine === 'webkit' ? 'webgl' : 'svg')), engine);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const path = resolve(out, `${engine}-${theme}-${dpr}x.png`);
    await page.screenshot({ path }); evidence.push(path);
    const labels = await page.locator('#quality-rail').evaluate(el => {
      const labels = [...el.querySelectorAll('.nx-tab__label')].map(label => {
        const r = label.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, color: getComputedStyle(label).color, text: label.textContent };
      });
      el.querySelectorAll('.nx-glass-option').forEach(option => option.style.opacity = '0');
      return labels;
    });
    const background = await page.screenshot();
    const contrast = await page.evaluate(async ({ data, labels, dpr }) => {
      const im = new Image(); im.src = data; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0); const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      const lum = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
      return labels.map(label => {
        const ink = lum(label.color.match(/[\d.]+/g).slice(0, 3).map(Number));
        let minimum = Infinity;
        for (let y = Math.ceil(label.y * dpr); y < (label.y + label.height) * dpr; y++) {
          for (let x = Math.ceil(label.x * dpr); x < (label.x + label.width) * dpr; x++) {
            const p = (y * c.width + x) * 4, bg = lum(Array.from(pixels.slice(p, p + 3)));
            minimum = Math.min(minimum, (Math.max(ink, bg) + .05) / (Math.min(ink, bg) + .05));
          }
        }
        return { text: label.text, minimum };
      });
    }, { data: 'data:image/png;base64,' + background.toString('base64'), labels, dpr });
    assert.ok(contrast.every(label => label.minimum >= 4.5), `Background obscures navigation: ${JSON.stringify(contrast)}`);
    const sampling = await page.locator('#quality-rail .nx-glass-track').evaluate(async el => {
      const layer = el.querySelector('.nx-liquid-specular');
      const im = new Image(); im.src = getComputedStyle(layer).backgroundImage.slice(5, -2); await im.decode();
      return { cssWidth: el.offsetWidth, pixels: im.naturalWidth, sampling: im.naturalWidth / el.offsetWidth, specular: Number(getComputedStyle(layer).opacity), smoothing: getComputedStyle(layer).filter };
    });
    assert.ok(sampling.sampling >= 2 && sampling.sampling <= 3 && Number.isInteger(sampling.sampling), `Curved maps must be supersampled at an integer scale: ${JSON.stringify(sampling)}`);
    assert.ok(sampling.specular <= .5 && sampling.smoothing !== 'none', 'Hard high-contrast bitmap fringe returned');
    cases.push({ engine, theme, dpr, contrast, sampling });
    console.log(`PASS ${engine} ${theme} ${dpr}x contrast ${Math.min(...contrast.map(v => v.minimum)).toFixed(2)}`);
  } finally {
    await page.evaluate(() => { const f = window.__qualityFixture; f.controllers.forEach(c => c.destroy()); f.scope.remove(); delete window.__qualityFixture; });
  }
}

async function backgroundMotion(page, engine) {
  const rail = page.locator('.nx-chassis:visible .nx-glass-segments--filter').first();
  await rail.locator('[data-glass-value="Today"]').click();
  await page.waitForFunction(id => document.getElementById(id).dataset.glassMoving === 'false', await rail.getAttribute('id'));
  await rail.evaluate(el => {
    window.__qualityMotion = { frames: [], done: false };
    el.addEventListener('click', () => {
      const start = performance.now();
      function sample(now) {
        const track = el.querySelector('.nx-glass-backdrop').getBoundingClientRect();
        const bounds = el.getBoundingClientRect(), option = el.querySelector('.nx-glass-option').getBoundingClientRect();
        window.__qualityMotion.frames.push({ t: now - start, scale: track.width / bounds.width, x: option.x, y: option.y, w: option.width, h: option.height });
        if (now - start < 1000) requestAnimationFrame(sample); else window.__qualityMotion.done = true;
      }
      requestAnimationFrame(sample);
    }, { once: true, capture: true });
  });
  await rail.locator('[data-glass-value="All"]').click();
  await page.waitForFunction(() => window.__qualityMotion.done);
  const frames = await page.evaluate(() => window.__qualityMotion.frames);
  assert.ok(Math.max(...frames.map(f => f.scale)) > 1.035, 'Background does not visibly stretch');
  assert.ok(Math.min(...frames.map(f => f.scale)) < .9995, 'Background never rebounds past rest');
  assert.ok(Math.abs(frames.at(-1).scale - 1) < .0005, 'Background did not settle');
  const first = frames[0];
  assert.ok(frames.every(f => ['x', 'y', 'w', 'h'].every(axis => Math.abs(f[axis] - first[axis]) < .1)), 'Hit areas move with the decorative background');
  const path = resolve(out, `${engine}-background-frames.json`); await writeFile(path, JSON.stringify(frames)); evidence.push(path);
  const bounds = await rail.boundingBox();
  await page.mouse.move(bounds.x + bounds.width - 30, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 12 });
  await page.waitForFunction(id => { const el = document.getElementById(id); return el.querySelector('.nx-glass-backdrop').getBoundingClientRect().width / el.getBoundingClientRect().width > 1.015; }, await rail.getAttribute('id'));
  await page.mouse.up();
  await page.waitForFunction(id => document.getElementById(id).dataset.glassMoving === 'false', await rail.getAttribute('id'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await rail.locator('[data-glass-value="Today"]').click();
  const reduced = await rail.evaluate(el => el.querySelector('.nx-glass-backdrop').getBoundingClientRect().width / el.getBoundingClientRect().width);
  assert.ok(Math.abs(reduced - 1) < .0005, 'Reduced motion still stretches the background');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await rail.evaluate(el => {
    window.__qualityBurst = { widest: 0, stop: false };
    function sample() {
      const r = el.getBoundingClientRect(), b = el.querySelector('.nx-glass-backdrop').getBoundingClientRect();
      window.__qualityBurst.widest = Math.max(window.__qualityBurst.widest, b.width - r.width);
      if (!window.__qualityBurst.stop) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  const targets = await Promise.all(['All', 'Today'].map(value => rail.locator(`[data-glass-value="${value}"]`).boundingBox()));
  for (let n = 0; n < 12; n++) { const r = targets[n % 2]; await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(40); }
  await page.waitForFunction(id => document.getElementById(id).dataset.glassMoving === 'false', await rail.getAttribute('id'));
  const widest = await page.evaluate(() => { window.__qualityBurst.stop = true; return window.__qualityBurst.widest; });
  assert.ok(widest > 8 && widest <= 18.1, `Rapid pulses escape the safe gutters: ${widest}`);
  for (const cancel of [false, true]) {
    await rail.locator('[data-glass-value="All"]').click();
    await page.waitForFunction(id => document.getElementById(id).dataset.glassMoving === 'false', await rail.getAttribute('id'));
    const r = await rail.locator('[data-glass-value="All"]').boundingBox(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 20, y, { steps: 4 });
    // Clamp against the last slot, then stop there until the held background
    // spring has settled. Releasing must restart it even with zero lens travel.
    await page.mouse.move(x + 2, y); await page.mouse.move(x + 3, y);
    await page.waitForFunction(id => { const el = document.getElementById(id); return el.dataset.glassDragging === 'true' && el.dataset.glassMoving === 'false'; }, await rail.getAttribute('id'));
    if (cancel) await page.mouse.move(x + 3, y - 100);
    await page.mouse.up();
    await page.waitForFunction(id => { const el = document.getElementById(id); return Math.abs(el.querySelector('.nx-glass-backdrop').getBoundingClientRect().width / el.getBoundingClientRect().width - 1) < .0005; }, await rail.getAttribute('id'), { timeout: 3000 });
    assert.equal(await rail.locator('[data-selected="true"]').getAttribute('data-glass-value'), 'All');
  }
  cases.push({ engine, motion: { frames: frames.length, min: Math.min(...frames.map(f => f.scale)), max: Math.max(...frames.map(f => f.scale)), reduced, widest } });
}

async function scrollBoundary(page, engine) {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/me/help`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => (await import('/src/store/locale.ts')).useLocaleStore().setLocale('vi'));
  const rail = page.locator('.nx-chassis:visible .nx-glass-segments--scroll').first();
  const options = rail.locator('.nx-glass-option');
  await options.last().click();
  const idle = () => page.waitForFunction(id => document.getElementById(id).dataset.glassMoving === 'false', railId);
  const railId = await rail.getAttribute('id'); await idle();
  const baseline = await rail.evaluate(el => ({ width: el.clientWidth, content: el.scrollWidth }));
  assert.ok(baseline.content > baseline.width, 'The regression must exercise a real overflowing rail');
  for (let n = 0; n < 3; n++) {
    await options.nth(await options.count() - 2).click();
    const r = await rail.boundingBox(); await page.mouse.move(r.x + r.width - 20, r.y + r.height / 2);
    for (let wheel = 0; wheel < 8; wheel++) { await page.mouse.wheel(100, 0); await page.waitForTimeout(16); }
    await idle(); await options.last().click(); await idle();
  }
  const after = await rail.evaluate(el => {
    const last = [...el.querySelectorAll('.nx-glass-option')].at(-1).getBoundingClientRect(), r = el.getBoundingClientRect();
    return { content: el.scrollWidth, left: el.scrollLeft, trailingGap: r.right - last.right };
  });
  assert.ok(after.content <= baseline.content + 1, `Background inflated the scroll range: ${JSON.stringify({ baseline, after })}`);
  assert.ok(after.trailingGap <= 6, `A blank tail remains after rebound: ${JSON.stringify(after)}`);
  cases.push({ engine, scroll: { baseline, after } });
  await page.setViewportSize({ width: 390, height: 844 });
}

try {
  for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await browserType.launch();
    try {
      for (const dpr of [1, 2, 2.625, 3]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr });
        const page = await context.newPage(); page.on('pageerror', e => errors.push(`${engine}: ${e.message}`));
        await page.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/earn/earn`, { waitUntil: 'domcontentloaded' });
        await page.locator('.nx-tabbar-pill .nx-glass-track').waitFor();
        await page.evaluate(() => document.fonts.ready);
        for (const theme of ['dark', 'light']) await material(page, engine, theme, dpr);
        if (dpr === 1) { await backgroundMotion(page, engine); await scrollBoundary(page, engine); }
        await page.screenshot({ path: resolve(out, `${engine}-${dpr}x-page.png`) });
        await context.close();
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors, []); passed = true;
} finally {
  const report = { at: new Date().toISOString(), verdict: passed ? 'pass' : 'fail', mode: 'full', treeMoved: false, capability: 'runtime', taskId: process.env.WORKFLOW_TASK_ID, stepId: process.env.WORKFLOW_STEP_ID, checkId: process.env.WORKFLOW_CHECK_ID, runId: process.env.WORKFLOW_RUN_ID, repo: process.env.WORKFLOW_REPO ?? root, snapshotHash: process.env.WORKFLOW_SNAPSHOT_HASH, innerSkipped: 0, steps: ['glass-readable', 'glass-smooth', 'glass-background-spring'].map(id => ({ id, status: passed ? 'pass' : 'fail', verdict: passed ? 'pass' : 'fail', evidence: [resolve(out, 'result.json'), ...evidence] })), cases, errors };
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2)); server.stop();
}
