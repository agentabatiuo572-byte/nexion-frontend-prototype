import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

// The actual renderjs adapter and controller run against browser layout. No API or app session.
const bundled = await build({ stdin: { contents: `import { chassisView } from "./src/lib/liquid-glass-view.ts";
import { scrollNativeCurrentTabToTop, scrollCurrentTabToTop } from "./src/lib/chassis-scroll.ts";
window.chassisView = chassisView;
window.tabToTop = {
  native: () => scrollNativeCurrentTabToTop({ $getAppWebview: () => ({ evalJS: script => new Function(script)() }) }),
  h5: () => scrollCurrentTabToTop(document.querySelector('.nx-content'), true),
};`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), sourcefile: 'tab-first-frame-fixture.ts' }, bundle: true, write: false, format: 'iife', platform: 'browser' });
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser.close(); });
async function fixture(run, argument) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/*', route => route.abort());
  await page.setContent(`<style>body{margin:0}.nx-chassis{position:fixed;inset:0;overflow:hidden}.nx-content{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden}.nx-page-enter{padding-top:100px;padding-bottom:100px}.nx-tab-content{display:block}</style><div id="host" class="nx-chassis" data-tab-key="A" data-tab-revision="0" data-page-visible="true"><div class="nx-content"><div class="nx-page-enter"><div class="nx-tab-content" data-tab-content-key="A" style="height:2000px"></div><div class="nx-tab-content" data-tab-content-key="B" style="display:none;height:100px"></div></div></div></div>`);
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  await page.evaluate(async () => {
    const root = document.getElementById('host'), scroll = root.querySelector('.nx-content');
    const instance = {}, adapter = window.chassisView;
    const config = (key, revision, visible = true) => ({ hostId: 'host', tabKey: key, tabRevision: revision, visible });
    const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve({ key: root.dataset.tabKey, revision: root.dataset.tabRevision, top: scroll.scrollTop, height: scroll.scrollHeight })));
    function commit(key, revision, notify = true) {
      root.dataset.tabKey = key; root.dataset.tabRevision = String(revision);
      for (const body of root.querySelectorAll('.nx-tab-content')) body.style.display = body.dataset.tabContentKey === key ? '' : 'none';
      // Force the genuine browser clamp while the short incoming DOM is current.
      void scroll.scrollHeight;
      if (notify) adapter.methods.update.call(instance, config(key, revision));
    }
    adapter.methods.update.call(instance, config('A', 0)); await frame(); await frame();
    window.probe = { root, scroll, instance, adapter, config, frame, commit,
      async move(top) { scroll.scrollTop = top; scroll.dispatchEvent(new Event('scroll')); await frame(); },
      destroy() { adapter.beforeUnmount.call(instance); } };
  });
  try { return await page.evaluate(run, argument); } finally { await page.close(); }
}

test('warm return restores before its first paint through the actual renderjs adapter', async () => {
  const result = await fixture(async () => {
    const p = window.probe;
    await p.move(625); p.commit('B', 1); await p.frame(); await p.frame();
    p.commit('A', 2);
    const first = await p.frame(), second = await p.frame(); p.destroy();
    return { first, second };
  });
  assert.equal(result.first.top, 625, JSON.stringify(result));
  assert.equal(result.second.top, 625);
});

test('DOM revision owns rapid A/B/A and rejects a late B renderjs receipt', async () => {
  const result = await fixture(async () => {
    const p = window.probe;
    await p.move(625); p.commit('B', 1); p.commit('A', 2, false);
    const first = await p.frame();
    p.adapter.methods.update.call(p.instance, p.config('B', 1));
    const stale = await p.frame();
    await p.move(420);
    p.adapter.methods.update.call(p.instance, p.config('A', 2));
    const current = await p.frame(); p.destroy(); return { first, stale, current };
  });
  assert.equal(result.first.top, 625);
  assert.equal(result.stale.top, 625);
  assert.equal(result.current.top, 420);
});

test('waits for the matching visible native content when host markers arrive first', async () => {
  const result = await fixture(async () => {
    const p = window.probe;
    await p.move(625); p.commit('B', 1); await p.frame();
    p.root.dataset.tabKey = 'A'; p.root.dataset.tabRevision = '2';
    p.adapter.methods.update.call(p.instance, p.config('A', 2));
    const oldLayout = await p.frame();
    p.commit('A', 2, false);
    const firstIncoming = await p.frame(); p.destroy(); return { oldLayout, firstIncoming };
  });
  assert.equal(result.oldLayout.top, 0);
  assert.equal(result.firstIncoming.top, 625);
});

test('retains restoration while the incoming real layout is too short, then restores before paint', async () => {
  const result = await fixture(async () => {
    const p = window.probe, content = p.root.querySelector('[data-tab-content-key="A"]');
    await p.move(1050); p.commit('B', 1); await p.frame();
    content.style.height = '100px'; p.commit('A', 2);
    const short = await p.frame();
    content.style.height = '2000px';
    const grown = await p.frame(); p.destroy(); return { short, grown };
  });
  assert.equal(result.short.top, 0);
  assert.equal(result.grown.top, 1050);
});

for (const event of ['wheel', 'touchstart', 'pointerdown']) {
  test(`a user's ${event} cancels a pending restore and a late same-visit receipt cannot undo it`, async () => {
    const result = await fixture(async event => {
      const p = window.probe, content = p.root.querySelector('[data-tab-content-key="A"]');
      await p.move(1050); p.commit('B', 1); await p.frame();
      content.style.height = '800px'; p.commit('A', 2); await p.frame();
      p.scroll.dispatchEvent(new Event(event)); await p.move(100);
      content.style.height = '2000px';
      p.adapter.methods.update.call(p.instance, p.config('A', 2));
      const after = await p.frame(); p.destroy(); return after.top;
    }, event);
    assert.equal(result, 100);
  });
}

for (const platform of ['native', 'h5']) {
  test(`${platform}: reselecting the current tab cancels pending restoration before scrolling to top`, async () => {
    const result = await fixture(async platform => {
      const p = window.probe, content = p.root.querySelector('[data-tab-content-key="A"]');
      await p.move(1050); p.commit('B', 1); await p.frame();
      content.style.height = '800px'; p.commit('A', 2); await p.frame();
      window.tabToTop[platform]();
      content.style.height = '2000px';
      const after = await p.frame(); p.destroy(); return after.top;
    }, platform);
    assert.equal(result, 0);
  });
  test(`${platform}: reselect then leave in the same task retains the requested top snapshot`, async () => {
    const result = await fixture(async platform => {
      const p = window.probe, content = p.root.querySelector('[data-tab-content-key="A"]');
      await p.move(1050); p.commit('B', 1); await p.frame();
      content.style.height = '944px'; p.commit('A', 2); await p.frame();
      window.tabToTop[platform](); p.commit('B', 3); await p.frame();
      content.style.height = '2000px'; p.commit('A', 4);
      const after = await p.frame(); p.destroy(); return after.top;
    }, platform);
    assert.equal(result, 0);
  });
}

for (const invalidOwner of ['hidden', 'old-revision']) {
  test(`a ${invalidOwner} top intent cannot overwrite the current owner's snapshot`, async () => {
    const result = await fixture(async invalidOwner => {
      const p = window.probe, content = p.root.querySelector('[data-tab-content-key="A"]');
      await p.move(1050); p.commit('B', 1); await p.frame();
      content.style.height = '944px'; p.commit('A', 2); await p.frame();
      if (invalidOwner === 'hidden') p.root.dataset.pageVisible = 'false';
      else p.root.dataset.tabRevision = '1';
      p.scroll.dispatchEvent(new Event('uvel-scroll-to-top'));
      p.root.dataset.pageVisible = 'true'; p.root.dataset.tabRevision = '2';
      content.style.height = '2000px';
      const after = await p.frame(); p.destroy(); return after.top;
    }, invalidOwner);
    assert.equal(result, 1050);
  });
}

test('a first visit and a replaced tab query have no previous snapshot', async () => {
  const result = await fixture(async () => {
    const p = window.probe;
    await p.move(625); p.commit('B', 1); const fresh = await p.frame();
    const content = p.root.querySelector('[data-tab-content-key="A"]');
    // Like the host, only the newest query of this tab stays mounted.
    content.dataset.tabContentKey = 'A?query=new'; p.commit('A?query=new', 2);
    const replacement = await p.frame(); await p.move(400);
    content.dataset.tabContentKey = 'A'; p.commit('A', 3);
    const back = await p.frame(); p.destroy(); return { fresh, replacement, back };
  });
  assert.equal(result.fresh.top, 0); assert.equal(result.replacement.top, 0); assert.equal(result.back.top, 0);
});

test('background return restores on the first visible paint after a hidden clamp', async () => {
  const result = await fixture(async () => {
    const p = window.probe;
    await p.move(625);
    p.root.dataset.pageVisible = 'false'; p.root.style.display = 'none';
    p.adapter.methods.update.call(p.instance, p.config('A', 0, false)); await p.frame();
    p.scroll.scrollTop = 0; p.scroll.dispatchEvent(new Event('scroll'));
    p.root.style.display = ''; p.root.dataset.pageVisible = 'true';
    p.adapter.methods.update.call(p.instance, p.config('A', 0, true));
    const first = await p.frame(); p.destroy(); return first.top;
  });
  assert.equal(result, 625);
});

test('account/epoch chassis replacement discards old snapshots and outstanding frames', async () => {
  const result = await fixture(async () => {
    const p = window.probe;
    await p.move(625); p.commit('B', 1); await p.frame();
    p.commit('A', 2); p.destroy();
    // tabs.vue keys AppChassis by accountScope, so a new controller owns this DOM.
    p.scroll.scrollTop = 0; const instance = {};
    p.adapter.methods.update.call(instance, p.config('A', 0));
    p.root.dataset.tabRevision = '0';
    const first = await p.frame(), second = await p.frame();
    p.adapter.beforeUnmount.call(instance); return { first, second };
  });
  assert.equal(result.first.top, 0); assert.equal(result.second.top, 0);
});

test('ordinary H5/subpage containers without native tab markers still restore', async () => {
  const result = await fixture(async () => {
    const p = window.probe; p.destroy();
    delete p.root.dataset.tabKey; delete p.root.dataset.tabRevision;
    for (const body of p.root.querySelectorAll('.nx-tab-content')) body.classList.remove('nx-tab-content');
    const instance = {}, config = visible => ({ hostId: 'host', visible });
    p.adapter.methods.update.call(instance, config(true)); await p.frame();
    await p.move(432); p.root.dataset.pageVisible = 'false';
    p.adapter.methods.update.call(instance, config(false)); await p.frame();
    p.scroll.scrollTop = 0; p.scroll.dispatchEvent(new Event('scroll'));
    p.root.dataset.pageVisible = 'true'; p.adapter.methods.update.call(instance, config(true));
    const first = await p.frame(); p.adapter.beforeUnmount.call(instance); return first.top;
  });
  assert.equal(result, 432);
});
