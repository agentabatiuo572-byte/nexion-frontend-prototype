/**
 * A bounded, non-interactive copy of the conversation behind the composer.
 * Ordinary blur paints this layer once; it does not ask the compositor to
 * recapture a backdrop spanning independently updated WebView tiles.
 */
export function mountConversationGlassSample(host: HTMLElement, source: HTMLElement, blur: number) {
  const doc = host.ownerDocument, win = doc.defaultView!;
  const scope = host.closest<HTMLElement>('.cp-root')!;
  const pad = Math.ceil(blur * 3);
  const layer = doc.createElement('div'), plane = doc.createElement('div');
  layer.className = 'nx-liquid-sample';
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('inert', '');
  plane.className = 'nx-liquid-sample-plane';
  plane.style.cssText = `position:absolute;inset:-${pad}px;filter:blur(${blur}px)`;
  layer.append(plane); host.prepend(layer);
  let disposed = false, frame = 0, dirty = true, movingUntil = 0;
  const copies = new Map<HTMLElement, { shell: HTMLElement; copy: HTMLElement }>();
  const live = () => !disposed && !doc.hidden && host.isConnected && source.isConnected
    && host.closest('.cp-root') === scope && scope.contains(source);
  function clear() { copies.clear(); plane.replaceChildren(); }
  function clone(node: HTMLElement) {
    const shell = doc.createElement('div'), copy = node.cloneNode(true) as HTMLElement;
    shell.className = node.closest('.nx-conv-right') ? 'nx-conv-right' : 'nx-conv-left';
    copy.classList.remove('nx-conv-bubble');
    copy.classList.add('nx-liquid-sample-bubble');
    // Optics and editable controls are never part of the sampled scene. Clones
    // carry no Vue listeners, IDs, focus stops, media playback or live regions.
    copy.querySelectorAll('.nx-liquid-glass,input,textarea,select,button,iframe,video,audio,object').forEach(el => el.remove());
    for (const el of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>('*'))]) {
      el.removeAttribute('id'); el.removeAttribute('autofocus'); el.removeAttribute('aria-live');
      el.setAttribute('tabindex', '-1');
      for (const attr of Array.from(el.attributes)) if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      el.style.animation = 'none'; el.style.transition = 'none';
    }
    shell.append(copy); plane.append(shell);
    const result = { shell, copy }; copies.set(node, result); return result;
  }
  function paint() {
    frame = 0;
    if (!live()) { clear(); return; }
    const r = host.getBoundingClientRect(), bounds = source.getBoundingClientRect();
    if (!r.width || !r.height || !bounds.width || !bounds.height) { clear(); return; }
    if (dirty) { clear(); dirty = false; }
    plane.style.backgroundColor = win.getComputedStyle(scope).backgroundColor;
    // Account for an ancestor's layout zoom without moving the real input.
    const sx = host.offsetWidth / r.width, sy = host.offsetHeight / r.height;
    const active = new Set<HTMLElement>();
    for (const node of Array.from(source.querySelectorAll<HTMLElement>('.nx-conv-bubble'))) {
      const q = node.getBoundingClientRect();
      if (!q.width || !q.height || q.bottom < Math.max(bounds.top, r.top - pad)
        || q.top > Math.min(bounds.bottom, r.bottom + pad) || q.right < r.left - pad || q.left > r.right + pad) continue;
      active.add(node);
      const { copy } = copies.get(node) ?? clone(node), style = win.getComputedStyle(node);
      copy.style.cssText = node.style.cssText;
      Object.assign(copy.style, {
        position: 'absolute', left: `${(q.left - r.left) * sx + pad}px`, top: `${(q.top - r.top) * sy + pad}px`,
        width: `${q.width * sx}px`, height: `${q.height * sy}px`, maxWidth: 'none', minWidth: '0',
        margin: '0', boxSizing: 'border-box', transform: 'none', animation: 'none', transition: 'none',
        display: style.display, padding: style.padding, border: style.border, overflowWrap: style.overflowWrap,
        background: style.backgroundColor, color: style.color, borderRadius: style.borderRadius,
        fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight,
      });
    }
    for (const [node, value] of copies) if (!active.has(node)) { value.shell.remove(); copies.delete(node); }
    if (performance.now() < movingUntil) schedule();
  }
  function schedule() { if (live() && !frame) frame = requestAnimationFrame(paint); }
  function changed(records: MutationRecord[]) {
    // Bubble color/geometry is copied on every paint. Descendant styles (for
    // example Uni widthFix image height) also need a fresh DOM snapshot.
    if (records.some(record => record.type !== 'attributes' || record.attributeName !== 'style'
      || !(record.target as HTMLElement)?.classList?.contains('nx-conv-bubble'))) {
      dirty = true; clear();
    }
    schedule();
  }
  const loaded = () => { dirty = true; schedule(); };
  const mutation = new MutationObserver(changed), resize = new ResizeObserver(schedule);
  mutation.observe(source, { subtree: true, childList: true, characterData: true, attributes: true });
  resize.observe(source); resize.observe(host);
  const theme = new MutationObserver(() => { dirty = true; schedule(); });
  theme.observe(doc.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  const animation = (event: AnimationEvent) => {
    if (!event.animationName.startsWith('nx-conv-enter-')) return;
    movingUntil = performance.now() + (event.type === 'animationstart' ? 240 : 0); schedule();
  };
  source.addEventListener('scroll', schedule, { capture: true, passive: true });
  source.addEventListener('load', loaded, true);
  source.addEventListener('animationstart', animation); source.addEventListener('animationend', animation);
  win.addEventListener('resize', schedule);
  const visibility = () => {
    if (doc.hidden) { cancelAnimationFrame(frame); frame = 0; movingUntil = 0; clear(); }
    else { dirty = true; schedule(); }
  };
  doc.addEventListener('visibilitychange', visibility);
  paint();
  return () => {
    disposed = true; cancelAnimationFrame(frame); clear(); layer.remove();
    mutation.disconnect(); resize.disconnect(); theme.disconnect();
    source.removeEventListener('scroll', schedule, true); source.removeEventListener('load', loaded, true);
    source.removeEventListener('animationstart', animation); source.removeEventListener('animationend', animation);
    win.removeEventListener('resize', schedule); doc.removeEventListener('visibilitychange', visibility);
  };
}
