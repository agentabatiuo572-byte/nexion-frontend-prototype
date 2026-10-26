import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountConversationGlassSample } from './conversation-glass-sample';
import { mountLiquidGlass, type GlassConfiguration } from './liquid-glass-renderer';

vi.mock('@lollipopkit/liquid-glass', () => ({ createLiquidGlassRuntimeAssets: vi.fn() }));
vi.mock('simple-liquid-glass/webgl', () => ({ createWebGLSurface: vi.fn() }));

// Deliberately small DOM boundary: production sampler/renderer execute unchanged.
// No layout engine, compositor or native accessibility behavior is claimed here.
type Callback = (...args: any[]) => any;
class Events {
  listeners = new Map<string, Set<Callback>>();
  addEventListener(name: string, fn: Callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
  }
  removeEventListener(name: string, fn: Callback) { this.listeners.get(name)?.delete(fn); }
  emit(name: string, event: any = {}) {
    for (const fn of [...(this.listeners.get(name) ?? [])]) {
      if (this.listeners.get(name)?.has(fn)) fn({ type: name, ...event });
    }
  }
}
class Style {
  [key: string]: any;
  cssText = '';
  setProperty(key: string, value: string) { this[key] = value; }
  removeProperty(key: string) { delete this[key]; }
}
const rect = (left = 0, top = 0, width = 320, height = 800) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
class Node extends Events {
  readonly nodeType = 1;
  attrs = new Map<string, string>();
  style = new Style(); dataset: Record<string, string> = {};
  children: Node[] = []; parentElement: Node | null = null; textContent = '';
  box = rect(); offsetWidth = 320; offsetHeight = 64;
  constructor(readonly tagName: string, readonly ownerDocument: Doc) { super(); }
  get className() { return this.attrs.get('class') ?? ''; }
  set className(value: string) { this.attrs.set('class', value); }
  classList = {
    contains: (value: string) => this.className.split(/\s+/).includes(value),
    add: (value: string) => { if (!this.classList.contains(value)) this.className = `${this.className} ${value}`.trim(); },
    remove: (value: string) => { this.className = this.className.split(/\s+/).filter(c => c !== value).join(' '); },
  };
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  get isConnected(): boolean { return this === this.ownerDocument.documentElement || Boolean(this.parentElement?.isConnected); }
  getBoundingClientRect = vi.fn(() => ({ ...this.box }));
  getClientRects() { return this.box.width && this.box.height ? [this.box] : []; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  removeAttribute(name: string) { this.attrs.delete(name); }
  matches(selector: string): boolean {
    return selector.split(',').some(part => {
      const s = part.trim();
      if (s === '*') return true;
      if (s.startsWith('.')) return this.classList.contains(s.slice(1));
      if (s.startsWith('[')) return this.attrs.has(s.slice(1, -1));
      return this.tagName.toLowerCase() === s.toLowerCase();
    });
  }
  closest(selector: string): Node | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  contains(node: Node): boolean { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector: string): Node[] {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  append(...nodes: Node[]) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  prepend(node: Node) { node.remove(); node.parentElement = this; this.children.unshift(node); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this); this.parentElement = null; }
  replaceChildren(...nodes: Node[]) { this.children.forEach(n => { n.parentElement = null; }); this.children = []; this.append(...nodes); }
  cloneNode = vi.fn((deep: boolean): Node => {
    const copy = new Node(this.tagName, this.ownerDocument);
    copy.attrs = new Map(this.attrs); copy.textContent = this.textContent;
    Object.assign(copy.style, this.style); copy.box = { ...this.box };
    if (deep) copy.append(...this.children.map(n => n.cloneNode(true)));
    return copy;
  });
}
class Doc extends Events {
  hidden = false;
  documentElement = new Node('html', this);
  defaultView = Object.assign(new Events(), {
    getComputedStyle: (node: Node) => ({
      backgroundColor: node.style.backgroundColor ?? 'rgb(20, 30, 40)', color: 'rgb(220, 220, 220)',
      borderRadius: '16px', fontFamily: 'sans-serif', fontSize: '14px', lineHeight: '20px',
      display: 'block', padding: '10px 12px', border: '0px none', overflowWrap: 'anywhere',
    }),
  });
  createElement = (tag: string) => new Node(tag, this);
  createElementNS = (_ns: string, tag: string) => new Node(tag, this);
}
const cleanups: Callback[] = [];
afterEach(() => {
  cleanups.splice(0).forEach(fn => fn()); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
function environment() {
  const doc = new Doc(), frames = new Map<number, Callback>(); let nextFrame = 0;
  const observers: Array<{ kind: string; callback: Callback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const observerClass = (kind: string) => class {
    observe = vi.fn(); disconnect = vi.fn();
    constructor(readonly callback: Callback) { observers.push({ kind, callback, observe: this.observe, disconnect: this.disconnect }); }
  };
  const media = [false, false].map(matches => Object.assign(new Events(), { matches }));
  vi.stubGlobal('document', doc); vi.stubGlobal('window', doc.defaultView);
  vi.stubGlobal('Element', Node); vi.stubGlobal('HTMLElement', Node);
  vi.stubGlobal('navigator', { userAgent: 'Chrome/130.0' });
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('matchMedia', (query: string) => media[query.includes('transparency') ? 0 : 1]);
  vi.stubGlobal('requestAnimationFrame', (fn: Callback) => { frames.set(++nextFrame, fn); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('MutationObserver', observerClass('mutation'));
  vi.stubGlobal('ResizeObserver', observerClass('resize'));
  vi.stubGlobal('IntersectionObserver', observerClass('intersection'));
  const root = doc.createElement('div'); root.className = 'cp-root'; doc.documentElement.append(root);
  const source = doc.createElement('div'); source.className = 'nx-conv-list'; root.append(source);
  const host = doc.createElement('div'); host.className = 'nx-liquid-glass nx-liquid-glass--sampled';
  host.box = rect(50, 500, 240, 64); host.offsetWidth = 240; root.append(host);
  for (const cls of ['nx-liquid-optics', 'nx-liquid-specular']) { const n = doc.createElement('div'); n.className = cls; host.append(n); }
  function bubble(text: string, box = rect(10, 480, 150, 40), parent = source) {
    const row = doc.createElement('div'); row.className = 'nx-conv-right'; parent.append(row);
    const node = doc.createElement('div'); node.className = 'nx-conv-bubble'; node.textContent = text; node.box = box; row.append(node); return node;
  }
  const asHost = (node: Node) => node as unknown as HTMLElement;
  const config: GlassConfiguration = { radius: 25, tone: 'control', rendering: 'sampled', backdrop: '.nx-conv-list', blur: 24 };
  return { doc, frames, observers, root, source, host, bubble, config,
    samples: () => host.querySelectorAll('.nx-liquid-sample-bubble'),
    sample() { const stop = mountConversationGlassSample(asHost(host), asHost(source), 24); cleanups.push(stop); return stop; },
    renderer() { const controller = mountLiquidGlass(asHost(host), config); cleanups.push(() => controller.destroy()); return controller; },
    async frame() { const callbacks = [...frames.values()]; frames.clear(); await Promise.all(callbacks.map(fn => fn(16))); },
    visibility(hidden: boolean) { doc.hidden = hidden; doc.emit('visibilitychange'); },
    preference(index: number, matches: boolean) { media[index].matches = matches; media[index].emit('change'); },
  };
}

describe('conversation sampled glass boundaries', () => {
  it('sanitizes cloned IDs, live regions, controls and measurement classes without changing the source', () => {
    const h = environment(), original = h.bubble('Private body'); original.setAttribute('id', 'message-1');
    const label = h.doc.createElement('span'); label.setAttribute('id', 'label'); label.setAttribute('aria-live', 'polite');
    label.setAttribute('onclick', 'send()'); label.setAttribute('autofocus', ''); original.append(label);
    for (const tag of ['input', 'textarea', 'select', 'button', 'iframe', 'video', 'audio', 'object']) original.append(h.doc.createElement(tag));
    const optics = h.doc.createElement('div'); optics.className = 'nx-liquid-glass'; original.append(optics);
    h.sample(); const copy = h.samples()[0];
    expect(h.host.querySelector('.nx-liquid-sample')?.getAttribute('aria-hidden')).toBe('true');
    expect(h.host.querySelector('.nx-liquid-sample')?.getAttribute('inert')).toBe('');
    expect(h.doc.documentElement.querySelectorAll('.nx-conv-bubble')).toEqual([original]);
    expect(copy.getAttribute('id')).toBeNull(); expect(copy.querySelectorAll('[id],[aria-live],[autofocus],[onclick]')).toEqual([]);
    expect([copy, ...copy.querySelectorAll('*')].every(n => n.getAttribute('tabindex') === '-1')).toBe(true);
    expect(copy.querySelectorAll('input,textarea,select,button,iframe,video,audio,object,.nx-liquid-glass')).toEqual([]);
    expect(original.getAttribute('id')).toBe('message-1'); expect(original.querySelector('input')).not.toBeNull();
  });

  it('bounds sampled membership to the source viewport and the field plus 72px, coalescing scrolls', async () => {
    const h = environment(), inside = h.bubble('inside');
    h.bubble('above', rect(50, 387, 100, 40)); h.bubble('below', rect(50, 637, 100, 40));
    h.bubble('left', rect(-100, 500, 77, 40)); h.bubble('right', rect(363, 500, 100, 40));
    h.sample(); expect(h.samples().map(n => n.textContent)).toEqual(['inside']);
    for (let n = 0; n < 30; n++) h.source.emit('scroll');
    expect(h.frames.size).toBe(1); await h.frame(); expect(inside.cloneNode).toHaveBeenCalledOnce();
    expect(h.host.querySelector('.nx-liquid-sample-plane')?.style.cssText).toContain('inset:-72px;filter:blur(24px)');
    inside.box = rect(50, 700, 100, 40); h.source.emit('scroll'); await h.frame(); expect(h.samples()).toEqual([]);
  });

  it('drops detached or moved source/host content when an already queued paint arrives', async () => {
    for (const target of ['source', 'host'] as const) {
      const h = environment(); h.bubble('private'); h.sample(); h.source.emit('scroll');
      const old = [...h.frames.values()][0]; h[target].remove(); old(16);
      expect(h.samples()).toEqual([]);
    }
  });

  it('cannot resurrect private clones from queued RAF, mutation, resize or theme callbacks after cleanup', () => {
    const h = environment(), original = h.bubble('private'), stop = h.sample(); h.source.emit('scroll');
    const queued = [...h.frames.values()], callbacks = [...h.observers]; stop();
    const reads = original.getBoundingClientRect.mock.calls.length;
    queued.forEach(fn => fn(16)); callbacks.forEach(o => o.callback([{ type: 'childList' }]));
    h.source.emit('animationstart', { animationName: 'nx-conv-enter-right' }); h.doc.defaultView.emit('resize');
    expect(h.host.querySelector('.nx-liquid-sample')).toBeNull(); expect(h.frames.size).toBe(0);
    expect(original.getBoundingClientRect).toHaveBeenCalledTimes(reads);
    callbacks.forEach(o => expect(o.disconnect).toHaveBeenCalled());
  });

  it('clears synchronously on document hide and reconstructs current content on return', async () => {
    const h = environment(), original = h.bubble('before'); h.sample(); h.source.emit('scroll');
    const old = [...h.frames.values()][0]; h.visibility(true); expect(h.samples()).toEqual([]); old(16);
    original.textContent = 'after'; h.visibility(false); await h.frame();
    expect(h.samples().map(n => n.textContent)).toEqual(['after']);
  });

  it('does not let disposed host/source callbacks erase a newly mounted sampler', () => {
    const h = environment(); h.bubble('old'); const stop = h.sample(); h.source.emit('scroll');
    const queued = [...h.frames.values()], observers = [...h.observers]; stop();
    h.host.remove(); h.source.remove();
    const source = h.doc.createElement('div'); source.className = 'nx-conv-list'; h.root.append(source);
    h.bubble('new owner', rect(10, 480, 150, 40), source);
    const host = h.doc.createElement('div'); host.box = rect(50, 500, 240, 64); host.offsetWidth = 240; h.root.append(host);
    cleanups.push(mountConversationGlassSample(host as unknown as HTMLElement, source as unknown as HTMLElement, 24));
    queued.forEach(fn => fn(16)); observers.forEach(o => o.callback([{ type: 'childList' }]));
    expect(host.querySelectorAll('.nx-liquid-sample-bubble').map(n => n.textContent)).toEqual(['new owner']);
    expect(h.host.querySelector('.nx-liquid-sample')).toBeNull();
  });

  it('clears changed text before recapture and does not sample itself', async () => {
    const h = environment(), original = h.bubble('before'); h.sample(); original.textContent = 'after';
    const mutation = h.observers.find(o => o.kind === 'mutation' && o.observe.mock.calls[0][0] === h.source)!;
    mutation.callback([{ type: 'characterData' }]); expect(h.samples()).toEqual([]); await h.frame();
    expect(h.samples().map(n => n.textContent)).toEqual(['after']);
    expect(h.source.querySelectorAll('.nx-conv-bubble')).toEqual([original]);
    expect(h.host.querySelectorAll('.nx-liquid-sample')).toHaveLength(1);
  });

  it('[SAMPLE-R18-P2-03] refreshes descendant-only styles after a widthFix image changes height', async () => {
    const h = environment(), original = h.bubble('image');
    const image = h.doc.createElement('uni-image'); image.style.height = '20px'; original.append(image); h.sample();
    const mutation = h.observers.find(o => o.kind === 'mutation' && o.observe.mock.calls[0][0] === h.source)!;
    image.style.height = '80px'; mutation.callback([{ type: 'attributes', attributeName: 'style', target: image }]);
    await h.frame();
    expect(h.samples()[0]?.querySelector('uni-image')?.style.height).toBe('80px');
  });

  it('[SAMPLE-R18-P2-03] refreshes image content on load even without a delivered mutation', async () => {
    const h = environment(), original = h.bubble('image');
    const image = h.doc.createElement('uni-image'); image.style.height = '20px'; original.append(image); h.sample();
    image.style.height = '80px'; h.source.emit('load', { target: image }); await h.frame();
    expect(h.samples()[0]?.querySelector('uni-image')?.style.height).toBe('80px');
  });

  it('copies bubble-root style changes without unnecessarily cloning the entire bubble', async () => {
    const h = environment(), original = h.bubble('text'); h.sample();
    const mutation = h.observers.find(o => o.kind === 'mutation' && o.observe.mock.calls[0][0] === h.source)!;
    original.style.backgroundColor = 'rgb(60, 80, 100)';
    mutation.callback([{ type: 'attributes', attributeName: 'style', target: original }]); await h.frame();
    expect(h.samples()[0]?.style.background).toBe('rgb(60, 80, 100)');
    expect(original.cloneNode).toHaveBeenCalledOnce();
  });

  it.each([0, 1])('honors opaque system preference %s and resumes a single fresh sampler', async preference => {
    const h = environment(); h.bubble('private'); const controller = h.renderer(); await h.frame();
    expect(h.samples()).toHaveLength(1); h.preference(preference, true); await h.frame();
    expect(h.host.dataset.glassStrategy).toBe('solid'); expect(h.samples()).toEqual([]);
    h.source.emit('scroll'); expect(h.frames.size).toBe(0);
    h.preference(preference, false); await h.frame(); controller.update({ ...h.config }); await h.frame();
    expect(h.host.dataset.glassStrategy).toBe('sampled'); expect(h.host.querySelectorAll('.nx-liquid-sample')).toHaveLength(1);
  });

  it('[SAMPLE-R18-P2-01] rebinds a same-size replacement source instead of retaining the old conversation', async () => {
    const h = environment(); h.bubble('Old private body'); const controller = h.renderer(); await h.frame();
    h.source.remove(); const replacement = h.doc.createElement('div'); replacement.className = 'nx-conv-list'; h.root.append(replacement);
    h.bubble('New body', rect(10, 480, 150, 40), replacement);
    controller.update({ ...h.config }); await h.frame();
    expect(h.samples().map(n => n.textContent)).toEqual(['New body']);
  });

  it('[SAMPLE-R18-P2-01] recovers an initially absent source without a geometry or preference change', async () => {
    const h = environment(); h.source.remove(); const controller = h.renderer(); await h.frame();
    expect(h.host.dataset.glassReason).toBe('source-unavailable');
    h.root.append(h.source); h.bubble('Now available'); controller.update({ ...h.config }); await h.frame();
    expect(h.samples().map(n => n.textContent)).toEqual(['Now available']);
  });

  it('[SAMPLE-R18-P2-01] scope observer alone clears and rebinds, ignoring old-owner callbacks after replacement', async () => {
    const h = environment(); h.bubble('old owner'); h.renderer(); await h.frame();
    const owner = h.observers.find(o => o.kind === 'mutation' && o.observe.mock.calls[0][0] === h.root)!;
    const oldSource = h.observers.find(o => o.kind === 'mutation' && o.observe.mock.calls[0][0] === h.source)!;
    h.source.emit('scroll'); const queued = [...h.frames.values()];
    h.source.remove(); const next = h.doc.createElement('div'); next.className = 'nx-conv-list'; h.root.append(next);
    h.bubble('new owner', rect(10, 480, 150, 40), next);
    owner.callback([{ type: 'childList', target: h.root }]);
    expect(h.samples().length).toBe(0); expect(owner.disconnect).toHaveBeenCalled();
    await h.frame(); const current = h.samples()[0]; expect(current.textContent).toBe('new owner');
    owner.callback([{ type: 'childList', target: h.root }]);
    oldSource.callback([{ type: 'childList', target: h.source }]); queued.forEach(fn => fn(16));
    expect(h.samples()).toHaveLength(1); expect(h.samples()[0]).toBe(current); expect(h.frames.size).toBe(0);
  });

  it('[SAMPLE-R18-P2-01] scope observer recovers a missing source without controller.update', async () => {
    const h = environment(); h.source.remove(); h.renderer(); await h.frame();
    const owner = h.observers.find(o => o.kind === 'mutation' && o.observe.mock.calls[0][0] === h.root)!;
    h.root.append(h.source); h.bubble('available later'); owner.callback([{ type: 'childList', target: h.root }]);
    await h.frame(); expect(h.samples().map(n => n.textContent)).toEqual(['available later']);
  });

  it('[SAMPLE-R18-P2-01] samples only the latest source after two replacements before the pending frame', async () => {
    const h = environment(); h.bubble('A'); h.renderer(); await h.frame();
    const owner = h.observers.find(o => o.kind === 'mutation' && o.observe.mock.calls[0][0] === h.root)!;
    h.source.remove(); const b = h.doc.createElement('div'); b.className = 'nx-conv-list'; h.root.append(b);
    const bubbleB = h.bubble('B', rect(10, 480, 150, 40), b); owner.callback([{ type: 'childList', target: h.root }]);
    b.remove(); const c = h.doc.createElement('div'); c.className = 'nx-conv-list'; h.root.append(c);
    h.bubble('C', rect(10, 480, 150, 40), c); owner.callback([{ type: 'childList', target: h.root }]);
    await h.frame(); expect(h.samples().map(n => n.textContent)).toEqual(['C']); expect(bubbleB.cloneNode).not.toHaveBeenCalled();
  });

  it('[SAMPLE-R18-P2-02] stops Chrome sampled copies when the page is hidden but the document stays visible', async () => {
    const h = environment(); const original = h.bubble('Private cached page'); h.renderer(); await h.frame();
    const intersection = h.observers.find(o => o.kind === 'intersection')!;
    intersection.callback([{ isIntersecting: false }]);
    expect.soft(h.samples().length).toBe(0);
    const reads = original.getBoundingClientRect.mock.calls.length;
    h.source.emit('scroll'); await h.frame(); expect.soft(original.getBoundingClientRect).toHaveBeenCalledTimes(reads);
    intersection.callback([{ isIntersecting: true }]); await h.frame(); expect(h.samples()).toHaveLength(1);
  });
});
