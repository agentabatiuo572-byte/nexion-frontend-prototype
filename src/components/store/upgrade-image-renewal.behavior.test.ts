import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import upgradeSource from './upgrade-spotlight.vue?raw';
import imageSource from '../catalog-machine-image.vue?raw';
import * as machineImages from '../catalog-machine-image';
import { productImageCacheKey } from '@/lib/product-image-cache';

const cache = vi.hoisted(() => ({ cachedProductImage: vi.fn(), invalidateProductImage: vi.fn() }));
vi.mock('@/lib/product-image-cache', async original => ({ ...await original<typeof import('@/lib/product-image-cache')>(), ...cache }));
type Host = { tag: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const host = (tag: string): Host => ({ tag, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: host, createText: () => host('#text'), createComment: () => host('#comment'),
  setText() {}, setElementText() {}, patchProp(n, k, _old, value) { n.props[k] = value; },
  parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
  insert(n, p, anchor) { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); n.parent = p; const at = anchor ? p.children.indexOf(anchor) : -1; p.children.splice(at < 0 ? p.children.length : at, 0, n); },
  remove(n) { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); },
});
const all = (n: Host): Host[] => [n, ...n.children.flatMap(all)];
const images = (n: Host) => all(n).filter(x => x.tag === 'image');
const placeholder = (n: Host) => all(n).filter(x => String(x.props.class).includes('catalog-machine-image__placeholder'));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); await Vue.nextTick(); };
const signed = (asset: string, version: number) => `https://media.example/api/store/media/images/products/${asset.padEnd(24, '_')}?signature=${String(version).repeat(43)}&expires=${Math.floor(Date.now() / 1000) + 3600 + version}`;
function component(raw: string, deps: Record<string, unknown>): Vue.Component {
  const script = compileScript(parse(raw).descriptor, { id: 'upgrade-renewal', inlineTemplate: true, templateOptions: { compilerOptions: { cacheHandlers: true, isCustomElement: tag => ['view', 'text', 'image'].includes(tag) } } }).content;
  const exports: any = {};
  new Function('require', 'exports', ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)((id: string) => { if (!(id in deps)) throw new Error(id); return deps[id]; }, exports);
  return exports.default;
}
const apps: Vue.App[] = [];
beforeEach(() => { cache.cachedProductImage.mockImplementation(async (url: string) => `_doc/${productImageCacheKey(url) ?? url}`); });
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); vi.resetAllMocks(); });
function mount() {
  const app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1 });
  const catalog = Vue.reactive({ status: 'ready', revision: 'one' });
  const props = Vue.reactive({ base: { kind: 'stellarbox-s1', name: 'S1', baseRate: 1 }, baseImageUrl: signed('base', 1) as string | undefined, target: { id: 'stellarbox-pro', name: 'Pro', dailyEarn: 2, imageUrl: signed('target', 1) as string | undefined } });
  const mounted = Vue.ref(true), navTo = vi.fn();
  const deps: Record<string, unknown> = { vue: Vue, '@/store/app': { useApp: () => app }, './catalog-machine-image': machineImages, '@/components/catalog-machine-image': machineImages,
    '@/store/product-catalog': { productCatalogState: catalog }, '@/i18n/audit-ui': { useAuditUiCopy: () => Vue.ref({ upgrade: 'Upgrade', details: 'Details' }) },
    '@/i18n/use-t': { useT: () => Vue.ref({ store: {} }) }, '@/store/locale': { useLocaleStore: () => ({ code: 'zh' }) }, '@/i18n/format': { fmtMoney: String }, '@/lib/brand-copy': { nexGridBrandText: (s: string) => s }, '@/lib/route': { navTo }, '@/components/ui/nx-button.vue': { default: { render: () => null } } };
  deps['@/components/catalog-machine-image.vue'] = { default: component(imageSource, deps) };
  const Upgrade = component(upgradeSource, deps), root = host('root');
  const instance = renderer.createApp(Vue.defineComponent({ setup: () => () => mounted.value ? Vue.h(Upgrade, props) : null }));
  instance.mount(root); apps.push(instance);
  return { root, app, props, catalog, mounted, navTo };
}
async function decoded() { const screen = mount(); await flush(); images(screen.root).forEach(n => n.props.onLoad()); await flush(); expect(placeholder(screen.root)).toHaveLength(0); return screen; }

it('keeps decoded actual SFC nodes while the same immutable objects receive new signatures, with the native resolver deferred', async () => {
  const screen = await decoded(), previous = images(screen.root), calls = cache.cachedProductImage.mock.calls.length;
  cache.cachedProductImage.mockImplementation(() => new Promise<string>(() => {}));
  screen.catalog.status = 'loading'; await flush();
  screen.props.baseImageUrl = signed('base', 2); screen.props.target.imageUrl = signed('target', 2); screen.catalog.revision = 'two'; screen.catalog.status = 'ready'; await flush();
  expect(placeholder(screen.root)).toHaveLength(0);
  expect(images(screen.root)[0]).toBe(previous[0]); expect(images(screen.root)[1]).toBe(previous[1]);
  expect(cache.cachedProductImage).toHaveBeenCalledTimes(calls);
  expect(all(screen.root).find(n => String(n.props.class).includes('upgrade-spotlight'))!.props['data-images-ready']).toBe(true);
});

it.each(['account', 'epoch', 'sku', 'object', 'withdrawal', 'arbitrary-query', 'duplicate-query'] as const)('clears old decoded frames on %s and rejects their late native events', async boundary => {
  const screen = await decoded(), old = images(screen.root);
  if (boundary === 'account') screen.app.accountKey = 'user:8';
  if (boundary === 'epoch') screen.app.accountBindingEpoch++;
  if (boundary === 'sku') screen.props.target.id = 'other-sku';
  if (boundary === 'object') screen.props.target.imageUrl = signed('other-object', 2);
  if (boundary === 'withdrawal') screen.props.target.imageUrl = undefined;
  if (boundary === 'arbitrary-query') screen.props.target.imageUrl += '&width=200';
  if (boundary === 'duplicate-query') screen.props.target.imageUrl += '&signature=' + '3'.repeat(43);
  await flush(); old.forEach(n => { n.props.onLoad(); n.props.onError(); }); await flush();
  expect(placeholder(screen.root).length).toBeGreaterThan(0);
  expect(images(screen.root)).not.toContain(old[1]);
});

it('retries a failed same-URL image on the next catalog ready without recycling old callbacks', async () => {
  const screen = await decoded(), old = images(screen.root), baseUrl = screen.props.baseImageUrl!;
  // A terminal network image failure has no local-cache retry.
  cache.cachedProductImage.mockResolvedValue(baseUrl);
  old[0].props.onError(); await flush(); images(screen.root).find(n => n.props.src === baseUrl)!.props.onError(); await flush();
  expect(placeholder(screen.root)).toHaveLength(1);
  screen.catalog.status = 'loading'; await flush(); screen.catalog.status = 'ready'; await flush();
  const current = images(screen.root).find(n => n.props.src === baseUrl)!; expect(current).toBeDefined(); expect(current).not.toBe(old[0]);
  current.props.onLoad(); await flush(); old[0].props.onError(); old[0].props.onLoad(); await flush();
  expect(placeholder(screen.root)).toHaveLength(0); expect(images(screen.root)).toContain(old[1]);
});

it('does not transfer decoded status or async ownership to a remounted component', async () => {
  const screen = await decoded(), old = images(screen.root); screen.mounted.value = false; await flush();
  screen.mounted.value = true; await flush(); old.forEach(n => { n.props.onLoad(); n.props.onError(); }); await flush();
  expect(placeholder(screen.root)).toHaveLength(2); expect(images(screen.root)).not.toContain(old[0]);
  images(screen.root).forEach(n => n.props.onLoad()); await flush(); expect(placeholder(screen.root)).toHaveLength(0);
});

it('restarts a pending unconfirmed renewal and rejects its old deferred native resolution', async () => {
  const pending: Array<(path: string) => void> = [];
  cache.cachedProductImage.mockImplementation(() => new Promise<string>(yes => pending.push(yes)));
  const screen = mount();
  screen.props.target.imageUrl = signed('target', 2); await flush();
  expect(pending).toHaveLength(3); expect(placeholder(screen.root)).toHaveLength(2);
  pending[1]('_doc/old-target'); await flush(); expect(images(screen.root)).toHaveLength(0);
  pending[0]('_doc/base'); pending[2]('_doc/current-target'); await flush();
  expect(images(screen.root).map(n => n.props.src)).toEqual(['_doc/base', '_doc/current-target']);
  images(screen.root).forEach(n => n.props.onLoad()); await flush(); expect(placeholder(screen.root)).toHaveLength(0);
});

it('processes a real decode error even after the signed URL expires, and recovers with its current renewed URL', async () => {
  vi.useFakeTimers();
  const screen = await decoded(), old = images(screen.root);
  vi.setSystemTime(Date.now() + 7200_000);
  old[0].props.onError(); await flush();
  expect(placeholder(screen.root)).toHaveLength(1);
  screen.props.baseImageUrl = signed('base', 3); await flush();
  const current = images(screen.root)[0]; current.props.onLoad(); await flush();
  expect(placeholder(screen.root)).toHaveLength(0);
  vi.useRealTimers();
});
