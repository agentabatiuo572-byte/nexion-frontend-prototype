import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseParse, compile, type ElementNode, type RootNode } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import ts from 'typescript';
import componentSource from '@/components/liquid-glass.vue?raw';
import { mountLiquidGlass, type GlassConfiguration } from './liquid-glass-renderer';

const runtime = vi.hoisted(() => ({ assets: vi.fn(), surface: vi.fn() }));
vi.mock('@lollipopkit/liquid-glass', () => ({ createLiquidGlassRuntimeAssets: runtime.assets }));
vi.mock('simple-liquid-glass/webgl', () => ({ createWebGLSurface: runtime.surface }));

const cleanups: Array<() => void> = [];
beforeEach(() => { vi.useFakeTimers(); runtime.assets.mockReset(); runtime.surface.mockReset(); });
afterEach(() => {
  cleanups.splice(0).forEach(stop => stop());
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function asset(id: string) {
  return { displacementUrl: 'blob:map-' + id, specularUrl: 'blob:shine-' + id,
    maxDisplacement: 12, params: { radius: 24 }, dispose: vi.fn() };
}
class MaterialStyle {
  values = new Map<string, string>();
  cssText = ''; visibility = '';
  setProperty(key: string, value: string) { this.values.set(key, value); }
  removeProperty(key: string) { this.values.delete(key); }
  get backdropFilter() { return this.values.get('backdrop-filter') ?? ''; }
  set backdropFilter(value: string) { this.setProperty('backdrop-filter', value); }
  get backgroundImage() { return this.values.get('background-image') ?? ''; }
  set backgroundImage(value: string) { this.setProperty('background-image', value); }
}
class MaterialNode {
  style = new MaterialStyle(); dataset: Record<string, string> = {};
  attributes = new Map<string, string>(); listeners = new Map<string, Function>();
  children: MaterialNode[] = []; parent: MaterialNode | undefined;
  targets = new Map<string, MaterialNode>(); innerHTML = '';
  offsetWidth = 320; offsetHeight = 64;
  constructor(readonly tag: string) {}
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  querySelector(selector: string) { return this.targets.get(selector) ?? null; }
  closest(selector: string): MaterialNode | null { return selector === '.nx-chassis' ? this.parent ?? null : null; }
  contains(node: MaterialNode): boolean { return this === node || this.children.some(child => child.contains(node)); }
  getClientRects() { return [{}]; }
  append(node: MaterialNode) { node.parent = this; this.children.push(node); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = undefined; }
  replaceChildren() { this.children.forEach(child => { child.parent = undefined; }); this.children = []; }
  addEventListener(name: string, listener: Function) { this.listeners.set(name, listener); }
  removeEventListener(name: string) { this.listeners.delete(name); }
}
type Engine = 'svg' | 'webgl';
function environment(engine: Engine = 'svg') {
  const frames = new Map<number, FrameRequestCallback>(); let frameId = 0;
  const observers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  class Observer {
    observe = vi.fn(); disconnect = vi.fn();
    constructor(readonly notify: Function) { observers.push(this); }
  }
  const documentEvents = new MaterialNode('document');
  const media = [false, false].map(matches => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const createElementNS = vi.fn((_ns: string, tag: string) => new MaterialNode(tag));
  vi.stubGlobal('document', { hidden: false, documentElement: new MaterialNode('html'),
    createElementNS,
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents) });
  vi.stubGlobal('navigator', { userAgent: engine === 'svg' ? 'Chrome/130.0' : 'Version/18.0 Safari/605.1' });
  vi.stubGlobal('devicePixelRatio', 2);
  vi.stubGlobal('matchMedia', (query: string) => media[query.includes('transparency') ? 0 : 1]);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++frameId, fn); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('ResizeObserver', Observer); vi.stubGlobal('IntersectionObserver', Observer); vi.stubGlobal('MutationObserver', Observer);
  vi.stubGlobal('window', { setTimeout });
  const surfaces: Array<{ destroy: ReturnType<typeof vi.fn>; refresh: ReturnType<typeof vi.fn>; status: (value: string) => void }> = [];
  runtime.surface.mockImplementation((_host, _output, _source, _options, status) => {
    const surface = { destroy: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined), status };
    surfaces.push(surface); status('active'); return surface;
  });
  return { frames, observers, media, documentEvents, surfaces, createElementNS,
    preference(index: number, matches: boolean) {
      media[index].matches = matches;
      for (const [event, listener] of media[index].addEventListener.mock.calls) if (event === 'change') listener();
    },
    frame() { const pending = [...frames.values()]; frames.clear(); return Promise.all(pending.map(fn => fn(16))); },
    mount(initial: Partial<GlassConfiguration> = {}) {
      const host = new MaterialNode('host'), optics = new MaterialNode('optics'), shine = new MaterialNode('shine');
      const scope = new MaterialNode('chassis'), backdrop = new MaterialNode('backdrop');
      scope.append(host); scope.append(backdrop); host.append(optics); host.append(shine);
      host.targets.set('.nx-liquid-optics', optics); host.targets.set('.nx-liquid-specular', shine);
      scope.targets.set('.page', backdrop);
      const config: GlassConfiguration = { radius: 24, tone: 'navigation', backdrop: '.page', ...initial };
      const controller = mountLiquidGlass(host as unknown as HTMLElement, config);
      cleanups.push(() => controller.destroy());
      return { host, optics, shine, backdrop, config, controller,
        update(blur?: number) { controller.update({ ...config, blur }); },
        svg: () => host.children.find(child => child.tag === 'svg') };
    },
  };
}
type Material = ReturnType<ReturnType<typeof environment>['mount']>;
function svgAttribute(material: Material, tag: string, attribute: string): string {
  expect(material.svg()).toBeDefined();
  // Parse the actual runtime-generated filter, not the renderer's source text.
  const elements = (node: RootNode | ElementNode): ElementNode[] => node.children.flatMap(child =>
    child.type === 1 ? [child, ...elements(child)] : []);
  const node = elements(baseParse(material.svg()!.innerHTML)).find(child => child.tag === tag);
  expect(node, tag).toBeDefined();
  const value = node!.props.find(prop => prop.type === 6 && prop.name === attribute);
  if (!value || value.type !== 6 || !value.value) throw new Error('Missing SVG attribute: ' + tag + '.' + attribute);
  return value.value.content;
}
function expectPaint(engine: Engine, material: Material, expected: ReturnType<typeof asset>, blur: number) {
  expect(material.host.dataset.glassStrategy).toBe(engine);
  expect(material.shine.style.backgroundImage).toBe(`url("${expected.specularUrl}")`);
  if (engine === 'svg') {
    expect(Number(svgAttribute(material, 'feGaussianBlur', 'stdDeviation'))).toBe(blur);
    expect(svgAttribute(material, 'feImage', 'href')).toBe(expected.displacementUrl);
    expect(material.host.style.backdropFilter).toBe(`url("#${svgAttribute(material, 'filter', 'id')}")`);
  } else expect(runtime.surface.mock.calls.at(-1)?.[3]).toMatchObject({ map: expected.displacementUrl, blur });
}

describe('liquid glass blur rendering', () => {
  it('redraws a blur-only change, deduplicates an unchanged blur and restores the default material', async () => {
    const h = environment(), first = asset('default'), second = asset('composer'), third = asset('restored');
    runtime.assets.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(third);
    const m = h.mount(); await h.frame();
    expectPaint('svg', m, first, .35); expect(svgAttribute(m, 'feColorMatrix', 'values')).toBe('1.05');
    const previous = m.svg();
    m.update(24); await h.frame();
    expectPaint('svg', m, second, 24); expect(svgAttribute(m, 'feColorMatrix', 'values')).toBe('1.35');
    expect(first.dispose).toHaveBeenCalledOnce(); expect(previous?.parent).toBeUndefined();
    m.update(24); await h.frame(); expect(runtime.assets).toHaveBeenCalledTimes(2);
    m.update(); await h.frame();
    expectPaint('svg', m, third, .35); expect(svgAttribute(m, 'feColorMatrix', 'values')).toBe('1.05');
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it('leaves a separate default navigation lens unchanged when the composer blur changes', async () => {
    const h = environment(), navigation = asset('nav'), composer = asset('compose'), changed = asset('changed');
    runtime.assets.mockResolvedValueOnce(navigation).mockResolvedValueOnce(composer).mockResolvedValueOnce(changed);
    const nav = h.mount(), input = h.mount({ tone: 'control', blur: 24 }); await h.frame();
    const navFilter = nav.svg(); input.update(8); await h.frame();
    expectPaint('svg', input, changed, 8); expectPaint('svg', nav, navigation, .35);
    expect(svgAttribute(nav, 'feColorMatrix', 'values')).toBe('1.05');
    expect(nav.svg()).toBe(navFilter); expect(navigation.dispose).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'negative', input: -8, equivalent: -1, expected: 0 },
    { name: 'zero', input: 0, equivalent: -2, expected: 0 },
    { name: 'over maximum', input: 100, equivalent: 33, expected: 32 },
    { name: 'NaN', input: NaN, equivalent: Infinity, expected: .35 },
    { name: 'positive infinity', input: Infinity, equivalent: NaN, expected: .35 },
    { name: 'negative infinity', input: -Infinity, equivalent: NaN, expected: .35 },
  ])('bounds $name blur and reuses the material for identical and equivalent values', async ({ input, equivalent, expected }) => {
    const h = environment(), rendered = asset('bounded'); runtime.assets.mockResolvedValueOnce(rendered);
    const m = h.mount({ blur: input }); await h.frame(); expectPaint('svg', m, rendered, expected);
    const current = m.svg(); m.update(input); await h.frame();
    expect(runtime.assets).toHaveBeenCalledOnce(); expect(m.svg()).toBe(current);
    expect(rendered.dispose).not.toHaveBeenCalled();
    m.update(equivalent); await h.frame(); expectPaint('svg', m, rendered, expected);
    expect(runtime.assets).toHaveBeenCalledOnce(); expect(m.svg()).toBe(current);
    expect(rendered.dispose).not.toHaveBeenCalled();
  });

  it.each([
    { engine: 'svg' as const, timing: 'before-frame' }, { engine: 'svg' as const, timing: 'after-frame' },
    { engine: 'webgl' as const, timing: 'before-frame' }, { engine: 'webgl' as const, timing: 'after-frame' },
  ])('keeps the same $engine configuration pending when its assets arrive $timing', async ({ engine, timing }) => {
    const h = environment(engine), pending = deferred<ReturnType<typeof asset>>(), rendered = asset('same-config-pending');
    runtime.assets.mockReturnValueOnce(pending.promise);
    const m = h.mount({ blur: 24 }); const pendingFrame = h.frame();
    // A new config object from the view adapter does not imply new optical intent.
    m.controller.update({ ...m.config });
    if (timing === 'after-frame') await h.frame();
    pending.resolve(rendered); await pendingFrame;
    expectPaint(engine, m, rendered, 24); expect(rendered.dispose).not.toHaveBeenCalled();
    if (timing === 'before-frame') await h.frame();
    m.controller.update({ ...m.config }); await h.frame();
    expect(runtime.assets).toHaveBeenCalledOnce(); expect(rendered.dispose).not.toHaveBeenCalled();
    expectPaint(engine, m, rendered, 24);
    if (engine === 'webgl') expect(runtime.surface).toHaveBeenCalledOnce();
  });

  it.each([
    { engine: 'svg' as const, timing: 'before-frame' }, { engine: 'svg' as const, timing: 'after-frame' },
    { engine: 'webgl' as const, timing: 'before-frame' }, { engine: 'webgl' as const, timing: 'after-frame' },
  ])('keeps equivalent $engine blur assets pending across -8 to -1 with completion $timing', async ({ engine, timing }) => {
    const h = environment(engine), pending = deferred<ReturnType<typeof asset>>(), rendered = asset('equivalent-pending');
    runtime.assets.mockReturnValueOnce(pending.promise);
    const m = h.mount({ blur: -8 }); const pendingFrame = h.frame();
    m.update(-1); if (timing === 'after-frame') await h.frame();
    pending.resolve(rendered); await pendingFrame;
    expectPaint(engine, m, rendered, 0); expect(rendered.dispose).not.toHaveBeenCalled();
    if (timing === 'before-frame') await h.frame();
    expectPaint(engine, m, rendered, 0); expect(runtime.assets).toHaveBeenCalledOnce();
    if (engine === 'webgl') expect(runtime.surface).toHaveBeenCalledOnce();
  });

  it('normalizes omitted backdrop and rendering without cancelling or recreating the material', async () => {
    const h = environment(), pending = deferred<ReturnType<typeof asset>>(), rendered = asset('normalized-config');
    runtime.assets.mockReturnValueOnce(pending.promise);
    const m = h.mount({ backdrop: undefined }); const pendingFrame = h.frame();
    m.controller.update({ ...m.config, backdrop: '', rendering: 'refractive' }); await h.frame();
    pending.resolve(rendered); await pendingFrame; expectPaint('svg', m, rendered, .35);
    m.controller.update({ ...m.config, backdrop: undefined, rendering: undefined }); await h.frame();
    expect(runtime.assets).toHaveBeenCalledOnce(); expect(rendered.dispose).not.toHaveBeenCalled();
    expect(h.createElementNS).toHaveBeenCalledOnce();
  });

  it.each(['svg', 'webgl'] as const)('distinguishes an explicit .35 blur from the omitted %s navigation defaults', async engine => {
    const h = environment(engine), first = asset('omitted'), explicit = asset('explicit'), restored = asset('omitted-again');
    runtime.assets.mockResolvedValueOnce(first).mockResolvedValueOnce(explicit).mockResolvedValueOnce(restored);
    const m = h.mount(); await h.frame(); expectPaint(engine, m, first, engine === 'svg' ? .35 : 0);
    m.update(.35); await h.frame(); expectPaint(engine, m, explicit, .35);
    if (engine === 'svg') expect(svgAttribute(m, 'feColorMatrix', 'values')).toBe('1.35');
    else expect(runtime.surface.mock.calls.at(-1)?.[3].saturation).toBe(135);
    expect(first.dispose).toHaveBeenCalledOnce();
    m.update(); await h.frame(); expectPaint(engine, m, restored, engine === 'svg' ? .35 : 0);
    if (engine === 'svg') expect(svgAttribute(m, 'feColorMatrix', 'values')).toBe('1.05');
    else expect(runtime.surface.mock.calls.at(-1)?.[3].saturation).toBe(105);
    expect(explicit.dispose).toHaveBeenCalledOnce(); expect(runtime.assets).toHaveBeenCalledTimes(3);
  });

  it.each(['svg', 'webgl'] as const)('invalidates pending %s assets immediately when reduced transparency changes before RAF', async engine => {
    const h = environment(engine), pending = deferred<ReturnType<typeof asset>>();
    const obsolete = asset('before-preference'), restored = asset('preference-restored');
    runtime.assets.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(restored);
    const m = h.mount(); const pendingFrame = h.frame();
    h.preference(0, true); pending.resolve(obsolete); await pendingFrame;
    expect(obsolete.dispose).toHaveBeenCalledOnce(); expect(m.svg()).toBeUndefined();
    expect(m.shine.style.backgroundImage).toBe(''); expect(runtime.surface).not.toHaveBeenCalled();
    expect(h.createElementNS).not.toHaveBeenCalled();
    await h.frame(); expect(m.host.dataset).toMatchObject({ glassStrategy: 'solid', glassReason: 'system-preference' });
    expect(runtime.assets).toHaveBeenCalledOnce();
    h.preference(0, false); await h.frame();
    expectPaint(engine, m, restored, engine === 'svg' ? .35 : 0);
    expect(runtime.assets).toHaveBeenCalledTimes(2);
  });

  it.each(['svg', 'webgl'] as const)('keeps newer %s blur when older assets finish last', async engine => {
    const h = environment(engine), old = deferred<ReturnType<typeof asset>>(), next = deferred<ReturnType<typeof asset>>();
    const oldAsset = asset('old'), newAsset = asset('new');
    runtime.assets.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const m = h.mount(); const oldFrame = h.frame();
    m.update(24); const newFrame = h.frame();
    next.resolve(newAsset); await newFrame; expectPaint(engine, m, newAsset, 24);
    old.resolve(oldAsset); await oldFrame;
    expectPaint(engine, m, newAsset, 24); expect(oldAsset.dispose).toHaveBeenCalledOnce();
    expect(newAsset.dispose).not.toHaveBeenCalled();
    if (engine === 'webgl') expect(runtime.surface).toHaveBeenCalledOnce();
  });

  it.each(['svg', 'webgl'] as const)('rejects old %s assets after update even before the replacement RAF runs', async engine => {
    const h = environment(engine), old = deferred<ReturnType<typeof asset>>(), next = deferred<ReturnType<typeof asset>>();
    const oldAsset = asset('old-before-frame'), newAsset = asset('new-after-frame');
    runtime.assets.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const m = h.mount(); const oldFrame = h.frame();
    m.update(24); // The new intent exists before its coalesced render frame.
    old.resolve(oldAsset); await oldFrame;
    expect.soft(oldAsset.dispose).toHaveBeenCalledOnce();
    expect.soft(m.shine.style.backgroundImage).toBe('');
    expect.soft(m.svg()).toBeUndefined();
    expect.soft(runtime.surface).not.toHaveBeenCalled();
    const newFrame = h.frame(); next.resolve(newAsset); await newFrame;
    expectPaint(engine, m, newAsset, 24);
  });

  it('passes blur changes to WebGL and restores the unchanged navigation defaults', async () => {
    const h = environment('webgl'), first = asset('webgl-default'), second = asset('webgl-blur'), third = asset('webgl-restored');
    runtime.assets.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(third);
    const m = h.mount(); await h.frame(); expectPaint('webgl', m, first, 0);
    expect(runtime.surface.mock.calls.at(-1)?.[3].saturation).toBe(105);
    m.update(24); await h.frame(); expectPaint('webgl', m, second, 24);
    expect(runtime.surface.mock.calls.at(-1)?.[3].saturation).toBe(135);
    expect(h.surfaces[0].destroy).toHaveBeenCalledOnce();
    m.update(); await h.frame(); expectPaint('webgl', m, third, 0);
    expect(runtime.surface.mock.calls.at(-1)?.[3].saturation).toBe(105);
    expect(h.surfaces[1].destroy).toHaveBeenCalledOnce();
  });

  it('clears an obsolete SVG when new blur assets fail and leaves the live frosted fallback available', async () => {
    const h = environment(), first = asset('before-failure');
    runtime.assets.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('asset creation failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = h.mount(); await h.frame(); m.update(24); await h.frame();
    expect(first.dispose).toHaveBeenCalledOnce(); expect(m.svg()).toBeUndefined();
    expect(m.host.dataset).toMatchObject({ glassStrategy: 'frosted', glassReason: 'renderer-unavailable' });
    expect(m.host.style.backdropFilter).toBe(''); expect(m.shine.style.backgroundImage).toBe('');
    expect(m.optics.style.visibility).toBe('hidden'); expect(warn).toHaveBeenCalledOnce();
  });

  it.each(['svg', 'webgl'] as const)('disposes a pending %s blur asset without painting or recreating observers', async engine => {
    const h = environment(engine), pending = deferred<ReturnType<typeof asset>>(), late = asset('late');
    runtime.assets.mockReturnValueOnce(pending.promise);
    const m = h.mount({ blur: 24 }); const frame = h.frame();
    m.controller.destroy(); pending.resolve(late); await frame;
    m.update(8); await h.frame();
    expect(late.dispose).toHaveBeenCalledOnce(); expect(runtime.assets).toHaveBeenCalledOnce();
    expect(m.svg()).toBeUndefined(); expect(runtime.surface).not.toHaveBeenCalled();
    expect(m.shine.style.backgroundImage).toBe(''); expect(h.frames.size).toBe(0);
    expect(h.observers.every(observer => observer.disconnect.mock.calls.length === 1)).toBe(true);
    expect(h.documentEvents.listeners.size).toBe(0);
    for (const media of h.media) expect(media.removeEventListener).toHaveBeenCalledOnce();
  });

  it.each(['svg', 'webgl'] as const)('releases active %s resources and cancels a queued blur redraw on dispose', async engine => {
    const h = environment(engine), rendered = asset('active'); runtime.assets.mockResolvedValue(rendered);
    const m = h.mount({ blur: 24 }); await h.frame();
    m.update(8); expect(h.frames.size).toBe(1); m.controller.destroy(); await h.frame();
    expect(rendered.dispose).toHaveBeenCalledOnce(); expect(runtime.assets).toHaveBeenCalledOnce();
    expect(m.svg()).toBeUndefined(); expect(m.host.style.backdropFilter).toBe('');
    expect(m.shine.style.backgroundImage).toBe(''); expect(m.optics.children).toHaveLength(0);
    expect(m.backdrop.listeners.size).toBe(0); expect(h.frames.size).toBe(0);
    if (engine === 'webgl') expect(h.surfaces[0].destroy).toHaveBeenCalledOnce();
  });
});

function expectFrosted(material: Material, blur = 18) {
  expect(material.host.dataset).toMatchObject({ glassStrategy: 'frosted', glassReason: 'scrolling-surface' });
  expect(material.host.style.backdropFilter).toBe(`blur(${blur}px) saturate(135%)`);
  expect(material.host.style.values.get('-webkit-backdrop-filter')).toBe(`blur(${blur}px) saturate(135%)`);
  expect(material.svg()).toBeUndefined(); expect(material.optics.children).toHaveLength(0);
  expect(material.optics.style.visibility).toBe('hidden');
  expect(material.shine.style.backgroundImage).toBe('');
}

describe('opt-in frosted rendering lifecycle', () => {
  it('distinguishes the omitted 18px frost from explicit .35px and restores the default', async () => {
    const h = environment(), m = h.mount({ rendering: 'frosted' }); await h.frame(); expectFrosted(m, 18);
    m.update(.35); await h.frame(); expectFrosted(m, .35);
    m.update(); await h.frame(); expectFrosted(m, 18);
    expect(runtime.assets).not.toHaveBeenCalled(); expect(runtime.surface).not.toHaveBeenCalled();
    expect(h.createElementNS).not.toHaveBeenCalled();
  });

  it.each(['svg', 'webgl'] as const)('uses only native CSS on a %s-capable host, including blur updates', async engine => {
    const h = environment(engine), m = h.mount({ rendering: 'frosted' });
    await h.frame(); expectFrosted(m);
    for (const { blur, expected } of [{ blur: 24, expected: 24 }, { blur: 100, expected: 32 },
      { blur: 0, expected: 0 }, { blur: undefined, expected: 18 }]) {
      m.update(blur); await h.frame(); expectFrosted(m, expected);
    }
    expect(runtime.assets).not.toHaveBeenCalled(); expect(runtime.surface).not.toHaveBeenCalled();
    expect(h.createElementNS).not.toHaveBeenCalled(); expect(m.backdrop.listeners.size).toBe(0);
  });

  it('keeps the default navigation refraction while an independent frosted composer changes blur', async () => {
    const h = environment(), navigation = asset('navigation-with-frosted-composer');
    runtime.assets.mockResolvedValue(navigation);
    const nav = h.mount(), input = h.mount({ tone: 'control', rendering: 'frosted', blur: 24 });
    await h.frame(); const navFilter = nav.svg();
    expectFrosted(input, 24); input.update(8); await h.frame(); expectFrosted(input, 8);
    expectPaint('svg', nav, navigation, .35); expect(svgAttribute(nav, 'feColorMatrix', 'values')).toBe('1.05');
    expect(nav.svg()).toBe(navFilter); expect(navigation.dispose).not.toHaveBeenCalled();
    expect(runtime.assets).toHaveBeenCalledOnce(); expect(h.createElementNS).toHaveBeenCalledOnce();
    expect(runtime.surface).not.toHaveBeenCalled();
  });

  it.each(['svg', 'webgl'] as const)('releases active %s resources on frosted opt-in and restores refraction on opt-out', async engine => {
    const h = environment(engine), first = asset('before-frosted'), restored = asset('after-frosted');
    runtime.assets.mockResolvedValueOnce(first).mockResolvedValueOnce(restored);
    const m = h.mount(); await h.frame(); const previousSvg = m.svg();
    const sourceObservers = h.observers.filter(observer => observer.observe.mock.calls.some(([node]) => node === m.backdrop));
    m.controller.update({ ...m.config, rendering: 'frosted', blur: 24 }); await h.frame();
    expectFrosted(m, 24); expect(first.dispose).toHaveBeenCalledOnce();
    expect(previousSvg?.parent).toBeUndefined(); expect(runtime.assets).toHaveBeenCalledOnce();
    expect(m.backdrop.listeners.size).toBe(0);
    for (const observer of sourceObservers) expect(observer.disconnect).toHaveBeenCalledOnce();
    if (engine === 'webgl') {
      expect(h.surfaces[0].destroy).toHaveBeenCalledOnce();
      h.surfaces[0].status('active'); expectFrosted(m, 24);
    }
    m.controller.update({ ...m.config, rendering: 'refractive' }); await h.frame();
    expectPaint(engine, m, restored, engine === 'svg' ? .35 : 0);
    expect(runtime.assets).toHaveBeenCalledTimes(2); expect(first.dispose).toHaveBeenCalledOnce();
    if (engine === 'svg') expect(svgAttribute(m, 'feColorMatrix', 'values')).toBe('1.05');
    else expect(runtime.surface.mock.calls.at(-1)?.[3].saturation).toBe(105);
  });

  it.each([
    { engine: 'svg' as const, timing: 'before-frame' }, { engine: 'svg' as const, timing: 'after-frame' },
    { engine: 'webgl' as const, timing: 'before-frame' }, { engine: 'webgl' as const, timing: 'after-frame' },
  ])('rejects pending $engine assets arriving $timing after switching to frosted', async ({ engine, timing }) => {
    const h = environment(engine), pending = deferred<ReturnType<typeof asset>>(), late = asset('obsolete-refraction');
    runtime.assets.mockReturnValueOnce(pending.promise);
    const m = h.mount(); const refractiveFrame = h.frame();
    m.controller.update({ ...m.config, rendering: 'frosted', blur: 24 });
    if (timing === 'after-frame') { await h.frame(); expectFrosted(m, 24); }
    pending.resolve(late); await refractiveFrame;
    expect.soft(late.dispose).toHaveBeenCalledOnce();
    expect.soft(m.shine.style.backgroundImage).toBe('');
    expect.soft(m.svg()).toBeUndefined(); expect.soft(h.createElementNS).not.toHaveBeenCalled();
    expect.soft(runtime.surface).not.toHaveBeenCalled();
    if (timing === 'before-frame') await h.frame();
    expectFrosted(m, 24); expect(runtime.assets).toHaveBeenCalledOnce();
  });

  it('gives reduced transparency precedence and restores frosted CSS when the preference clears', async () => {
    const h = environment(); h.media[0].matches = true;
    const m = h.mount({ rendering: 'frosted', blur: 24 }); await h.frame();
    expect(m.host.dataset).toMatchObject({ glassStrategy: 'solid', glassReason: 'system-preference' });
    expect(m.host.style.backdropFilter).toBe(''); expect(m.optics.style.visibility).toBe('visible');
    h.preference(0, false); await h.frame(); expectFrosted(m, 24);
    h.preference(0, true); await h.frame();
    expect(m.host.dataset.glassStrategy).toBe('solid'); expect(m.host.style.backdropFilter).toBe('');
    expect(m.host.style.values.has('-webkit-backdrop-filter')).toBe(false);
    expect(runtime.assets).not.toHaveBeenCalled(); expect(runtime.surface).not.toHaveBeenCalled();
    expect(h.createElementNS).not.toHaveBeenCalled();
  });

  it('clears frosted CSS and cancels queued blur work on dispose without creating optical resources', async () => {
    const h = environment(), m = h.mount({ rendering: 'frosted' }); await h.frame(); expectFrosted(m);
    m.update(24); m.controller.destroy(); await h.frame(); m.update(8); await h.frame();
    expect(m.host.style.backdropFilter).toBe(''); expect(m.host.style.values.has('-webkit-backdrop-filter')).toBe(false);
    expect(h.frames.size).toBe(0); expect(h.documentEvents.listeners.size).toBe(0);
    expect(h.observers.every(observer => observer.disconnect.mock.calls.length === 1)).toBe(true);
    expect(runtime.assets).not.toHaveBeenCalled(); expect(runtime.surface).not.toHaveBeenCalled();
    expect(h.createElementNS).not.toHaveBeenCalled();
  });
});

// Run the real setup and template; the renderjs transport is a separate view-layer module.
const descriptor = parse(componentSource).descriptor;
const componentCode = ts.transpileModule(compileScript({ ...descriptor, script: null }, { id: 'glass-blur-test' }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const componentRender = new Function('Vue', compile(descriptor.template!.content, { mode: 'function', prefixIdentifiers: true,
  isCustomElement: tag => tag === 'view' }).code)(Vue);
function component(blur?: number, rendering?: GlassConfiguration['rendering']) {
  const exports: Record<string, any> = {};
  new Function('require', 'exports', componentCode)((id: string) => {
    if (id !== 'vue') throw new Error(id);
    return { ...Vue, getCurrentInstance: () => ({ uid: 7 }) };
  }, exports);
  const props = Vue.reactive({ radius: 24, tone: 'navigation', backdrop: '.page', blur,
    rendering: (rendering ?? exports.default.props.rendering.default) as GlassConfiguration['rendering'] });
  const scope = Vue.effectScope();
  const view = scope.run(() => exports.default.setup(props, { expose() {} })); cleanups.push(() => scope.stop());
  return { props, view, node: (): Vue.VNode => componentRender(Vue.proxyRefs({ ...Vue.toRefs(props), ...view, glassView: { update() {} } }), []) };
}

describe('liquid glass component blur handoff', () => {
  it('defaults to refraction and forwards frosted opt-in with its bounded material class', () => {
    const glass = component(24);
    expect(glass.node().props?.['glass-config'].rendering).toBe('refractive');
    expect(String(glass.node().props?.class).split(/\s+/)).not.toContain('nx-liquid-glass--frosted');
    glass.props.rendering = 'frosted';
    expect(glass.node().props?.['glass-config']).toMatchObject({ rendering: 'frosted', blur: 24 });
    expect(String(glass.node().props?.class).split(/\s+/)).toContain('nx-liquid-glass--frosted');
    glass.props.rendering = 'refractive';
    expect(String(glass.node().props?.class).split(/\s+/)).not.toContain('nx-liquid-glass--frosted');
  });

  it('keeps the default CSS variable unset, forwards composer blur and removes the override when omitted again', () => {
    const glass = component();
    expect(glass.node().props?.style['--nx-material-blur']).toBeUndefined();
    expect(glass.view.configuration.value.blur).toBeUndefined();
    glass.props.blur = 24;
    expect(glass.node().props?.style['--nx-material-blur']).toBe('24px');
    expect(glass.node().props?.['glass-config'].blur).toBe(24);
    glass.props.blur = undefined;
    expect(glass.node().props?.style['--nx-material-blur']).toBeUndefined();
    expect(glass.node().props?.['glass-config'].blur).toBeUndefined();
  });

  it.each([{ blur: -1, css: '0px' }, { blur: 99, css: '32px' }, { blur: NaN, css: '0.75px' },
    { blur: Infinity, css: '0.75px' }])('bounds the actual fallback style for blur $blur', ({ blur, css }) => {
    const glass = component(blur);
    expect(glass.node().props?.style['--nx-material-blur']).toBe(css);
  });
});
