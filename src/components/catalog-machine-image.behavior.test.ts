import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import source from './catalog-machine-image.vue?raw';
import * as images from './catalog-machine-image';

const cache = vi.hoisted(() => ({ cachedProductImage: vi.fn(), invalidateProductImage: vi.fn() }));
vi.mock('@/lib/product-image-cache', () => ({ ...cache, productImageCacheKey: () => null }));
const descriptor = parse(source).descriptor;
const code = ts.transpileModule(compileScript(descriptor, { id: 'catalog-image' }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
// cacheHandlers matches production compilation; old nodes must retain their own request callbacks.
const render = new Function('Vue', compile(descriptor.template!.content, { mode: 'function', prefixIdentifiers: true,
  cacheHandlers: true, isCustomElement: tag => ['view', 'image'].includes(tag) }).code)(Vue);
const cleanups: Array<() => void> = [];
const flush = async () => { await Promise.resolve(); await Vue.nextTick(); };
beforeEach(() => { cache.cachedProductImage.mockImplementation(async (url: string) => url); });
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.resetAllMocks(); });

function find(node: Vue.VNode, type: string): Vue.VNode | undefined {
  if (node.type === type) return node;
  if (Array.isArray(node.children)) for (const child of node.children) if (Vue.isVNode(child)) {
    const match = find(child, type); if (match) return match;
  }
}
function mount() {
  const app = Vue.reactive({ accountKey: 'user:7', accountBindingEpoch: 1 });
  const props = Vue.reactive<{ sku: string; imageUrl?: string; scopeKey: string; refreshKey: number }>({
    sku: 'sku-a', imageUrl: 'https://images.example/a', scopeKey: 'purchase', refreshKey: 0,
  });
  const modules: Record<string, unknown> = { vue: Vue, '@/store/app': { useApp: () => app }, './catalog-machine-image': images };
  const exports: Record<string, any> = {};
  new Function('require', 'exports', code)((id: string) => { if (!(id in modules)) throw new Error(id); return modules[id]; }, exports);
  const scope = Vue.effectScope(), emit = vi.fn();
  const view = scope.run(() => exports.default.setup(props, { expose() {}, emit }))!;
  const renderCache: unknown[] = [];
  const node = () => render(Vue.proxyRefs(view), renderCache) as Vue.VNode;
  cleanups.push(() => scope.stop());
  return { app, props, view, emit, node, image: () => find(node(), 'image'), stop: () => scope.stop() };
}

it('keeps the neutral placeholder until decode and fits the complete supplied pedestal image', async () => {
  const screen = mount(); expect(screen.image()).toBeUndefined(); await flush();
  expect(screen.view.ready.value).toBe(false);
  const image = screen.image()!; expect(image.props).toMatchObject({ src: screen.props.imageUrl, mode: 'aspectFit' });
  image.props!.onLoad(); expect(screen.view.ready.value).toBe(true);
  screen.props.imageUrl = undefined;
  expect(screen.image()).toBeUndefined(); expect(screen.view.ready.value).toBe(false);
});

it.each(['account', 'epoch', 'sku', 'url', 'refresh', 'role'] as const)('ignores old decode/error events across %s changes', async boundary => {
  const screen = mount(); await flush(); const old = screen.image()!; old.props!.onLoad();
  if (boundary === 'account') screen.app.accountKey = 'user:8';
  if (boundary === 'epoch') screen.app.accountBindingEpoch++;
  if (boundary === 'sku') screen.props.sku = 'sku-b';
  if (boundary === 'url') screen.props.imageUrl = 'https://images.example/b';
  if (boundary === 'refresh') screen.props.refreshKey++;
  if (boundary === 'role') screen.props.scopeKey = 'gift';
  expect(screen.view.ready.value).toBe(false); expect(screen.image()).toBeUndefined();
  old.props!.onLoad(); expect(screen.view.ready.value).toBe(false);
  await flush(); const current = screen.image()!; expect(current.key).not.toBe(old.key);
  current.props!.onLoad(); old.props!.onError();
  expect(screen.view.ready.value).toBe(true); expect(screen.image()!.props!.src).toBe(screen.props.imageUrl);
});

it('recovers the same URL on refresh without accepting a late success from the failed request', async () => {
  const screen = mount(); await flush(); const failed = screen.image()!;
  failed.props!.onError(); expect(screen.image()).toBeUndefined();
  failed.props!.onLoad(); expect(screen.view.ready.value).toBe(false);
  screen.props.refreshKey++; await flush();
  screen.image()!.props!.onLoad(); expect(screen.view.ready.value).toBe(true);
  failed.props!.onError(); expect(screen.view.ready.value).toBe(true);
  expect(cache.cachedProductImage).toHaveBeenCalledTimes(2);
});

it('isolates native local-cache retry events even when the retried path is identical', async () => {
  cache.cachedProductImage.mockResolvedValue('_doc/same-path');
  const screen = mount(); await flush(); const failed = screen.image()!;
  failed.props!.onError(); await flush(); const retry = screen.image()!;
  expect(cache.invalidateProductImage).toHaveBeenCalledExactlyOnceWith(screen.props.imageUrl, '_doc/same-path');
  expect(retry.key).not.toBe(failed.key);
  failed.props!.onLoad(); expect(screen.view.ready.value).toBe(false);
  retry.props!.onLoad(); expect(screen.view.ready.value).toBe(true);
  retry.props!.onError(); await flush();
  expect(screen.image()).toBeUndefined(); expect(cache.cachedProductImage).toHaveBeenCalledTimes(2);
});

it('ignores late native resolutions and events after replacement or disposal', async () => {
  let complete!: (path: string) => void;
  cache.cachedProductImage.mockReturnValueOnce(new Promise<string>(resolve => { complete = resolve; }));
  const screen = mount(); screen.props.sku = 'sku-b'; screen.props.imageUrl = 'https://images.example/b'; await flush();
  complete('_doc/old'); await flush(); expect(screen.image()!.props!.src).toBe(screen.props.imageUrl);
  const last = screen.image()!; screen.stop(); last.props!.onLoad(); last.props!.onError();
  expect(screen.view.ready.value).toBe(false); expect(cache.invalidateProductImage).not.toHaveBeenCalled();
});

it('gives an A to B to A request a new node even when updates are batched', async () => {
  const screen = mount(); await flush(); const old = screen.image()!;
  screen.props.sku = 'sku-b'; screen.props.sku = 'sku-a'; await flush();
  expect(screen.image()!.key).not.toBe(old.key);
  old.props!.onLoad(); expect(screen.view.ready.value).toBe(false);
  screen.image()!.props!.onLoad(); expect(screen.view.ready.value).toBe(true);
});
