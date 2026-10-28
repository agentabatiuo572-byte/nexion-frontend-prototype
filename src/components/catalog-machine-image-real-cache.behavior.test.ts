import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import imageSource from './catalog-machine-image.vue?raw';
import * as machine from './catalog-machine-image';

type Host = { tag: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const host = (tag: string): Host => ({ tag, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: host, createText: () => host('#text'), createComment: () => host('#comment'), setText() {}, setElementText() {},
  patchProp(n, key, _old, value) { n.props[key] = value; }, parentNode: n => n.parent,
  nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert(n, p, anchor) { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); n.parent = p; const at = anchor ? p.children.indexOf(anchor) : -1; p.children.splice(at < 0 ? p.children.length : at, 0, n); },
  remove(n) { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); },
});
const all = (n: Host): Host[] => [n, ...n.children.flatMap(all)];
const image = (n: Host) => all(n).find(x => x.tag === 'image');
const ready = (n: Host) => all(n).find(x => String(x.props.class).split(' ').includes('catalog-machine-image'))!.props['data-image-state'];
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await Vue.nextTick(); };
const signed = (asset: string, expires: number, signature: string) => `https://media.example/api/store/media/images/products/${asset.padEnd(24, '_')}?signature=${signature.repeat(43)}&expires=${expires}`;
const script = ts.transpileModule(compileScript(parse(imageSource).descriptor, { id: 'image-real-cache', inlineTemplate: true, templateOptions: { compilerOptions: { cacheHandlers: true, isCustomElement: tag => ['view', 'image'].includes(tag) } } }).content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
let downloads: any[], files: Map<string, number>, clock: number, serial = 0;
const apps: Vue.App[] = [];
beforeEach(() => {
  clock = 1793000000000; vi.spyOn(Date, 'now').mockImplementation(() => clock); downloads = []; files = new Map();
  const storage = new Map();
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, structuredClone(value)),
    removeSavedFile: ({ filePath }: any) => files.delete(filePath),
    getSavedFileInfo: ({ filePath, success, fail }: any) => files.has(filePath) ? success({ size: 100 }) : fail(),
    downloadFile: (request: any) => { downloads.push(request); return { onProgressUpdate() {}, abort() {} }; },
    getImageInfo: ({ success }: any) => success({}), getFileInfo: ({ success }: any) => success({ size: 100 }),
    saveFile: ({ success }: any) => { const path = `_doc/uniapp_save/real-cache-${++serial}`; files.set(path, 100); success({ savedFilePath: path }); },
  });
});
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(url: string) {
  const props = Vue.reactive({ sku: 'sku-a', imageUrl: url, scopeKey: 'real-cache', refreshKey: 0 });
  const app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1 }), exports: any = {};
  const deps: Record<string, any> = { vue: Vue, '@/store/app': { useApp: () => app }, './catalog-machine-image': machine };
  new Function('require', 'exports', script)((id: string) => { if (!(id in deps)) throw new Error(id); return deps[id]; }, exports);
  const root = host('root'), instance = renderer.createApp(Vue.defineComponent({ setup: () => () => Vue.h(exports.default, props) }));
  instance.mount(root); apps.push(instance); return { root, props, app };
}
function finish(index: number, status = 200) { downloads[index].success({ statusCode: status, tempFilePath: `/tmp/real-cache-${++serial}` }); }

it('keeps the decoded node but retries a current error with the accepted new signature after the old signature expires', async () => {
  const now = clock / 1000, oldUrl = signed('real-error', now + 5, 'a'), currentUrl = signed('real-error', now + 900, 'b');
  const screen = mount(oldUrl); finish(0); await flush(); const old = image(screen.root)!; old.props.onLoad(); await flush();
  screen.props.imageUrl = currentUrl; await flush(); expect(image(screen.root)).toBe(old); expect(ready(screen.root)).toBe('ready'); expect(downloads).toHaveLength(1);
  clock += 10_000; old.props.onError(); await flush(); expect(downloads).toHaveLength(2); expect(downloads[1].url).toBe(currentUrl); expect(ready(screen.root)).not.toBe('ready');
  old.props.onLoad(); await flush(); expect(ready(screen.root)).not.toBe('ready');
  finish(1); await flush(); const current = image(screen.root)!; expect(current).not.toBe(old); expect(ready(screen.root)).not.toBe('ready');
  current.props.onLoad(); await flush(); old.props.onError(); await flush(); expect(ready(screen.root)).toBe('ready');
  current.props.onError(); await flush(); expect(ready(screen.root)).not.toBe('ready'); expect(downloads).toHaveLength(2);
});

it('maps a coalesced old HTTP failure to the new caller URL, and a later explicit refresh can recover', async () => {
  const now = clock / 1000, oldUrl = signed('real-pending-fail', now + 100, 'a'), currentUrl = signed('real-pending-fail', now + 900, 'b');
  const screen = mount(oldUrl); screen.props.imageUrl = currentUrl; await flush(); expect(downloads).toHaveLength(1);
  finish(0, 403); await flush(); expect(image(screen.root)!.props.src).toBe(currentUrl); expect(ready(screen.root)).not.toBe('ready');
  const failed = image(screen.root)!; failed.props.onError(); failed.props.onLoad(); await flush(); expect(ready(screen.root)).not.toBe('ready'); expect(downloads).toHaveLength(1);
  screen.props.refreshKey++; await flush(); expect(downloads).toHaveLength(2); expect(downloads[1].url).toBe(currentUrl);
  finish(1); await flush(); image(screen.root)!.props.onLoad(); await flush(); failed.props.onError(); failed.props.onLoad(); await flush(); expect(ready(screen.root)).toBe('ready');
});

it('still shares a successful local path from a pending old signature without sharing decode ownership', async () => {
  const now = clock / 1000, screen = mount(signed('real-pending-success', now + 100, 'a'));
  screen.props.imageUrl = signed('real-pending-success', now + 900, 'b'); await flush(); expect(downloads).toHaveLength(1);
  finish(0); await flush(); expect(image(screen.root)!.props.src).toMatch(/^_doc\/uniapp_save\//); expect(ready(screen.root)).not.toBe('ready');
  image(screen.root)!.props.onLoad(); await flush(); expect(ready(screen.root)).toBe('ready'); expect(downloads).toHaveLength(1);
});
