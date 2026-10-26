import { createLiquidGlassRuntimeAssets, type LiquidGlassRuntimeAssets } from "@lollipopkit/liquid-glass";
import { glassGeometry, type GlassTone } from "./liquid-glass-core";
import type { WebGLSurface } from "simple-liquid-glass/webgl";
import { mountConversationGlassSample } from "./conversation-glass-sample";

export interface GlassConfiguration { hostId?: string; radius: number; tone: GlassTone; backdrop?: string; blur?: number; rendering?: "refractive" | "frosted" | "sampled"; }
let serial = 0;
const svgNS = "http://www.w3.org/2000/svg";
const effectiveBlur = (value?: number) => Number.isFinite(value) ? Math.max(0, Math.min(32, value!)) : .35;

/** View-layer adapter, shared by H5 and App renderjs. Never called in App logic. */
export function mountLiquidGlass(host: HTMLElement, initial: GlassConfiguration) {
  const filterId = `nx-liquid-${++serial}`;
  const optics = host.querySelector<HTMLElement>(".nx-liquid-optics")!;
  const shine = host.querySelector<HTMLElement>(".nx-liquid-specular")!;
  let config = initial, disposed = false, generation = 0, raf = 0, intersecting = true;
  let assets: LiquidGlassRuntimeAssets | undefined, webgl: WebGLSurface | undefined;
  let geometryKey = "", svg: SVGSVGElement | undefined;
  let sampledSource: HTMLElement | null = null;
  let stopWatchingSource = () => {};
  const transparency = matchMedia("(prefers-reduced-transparency: reduce)");
  const contrast = matchMedia("(prefers-contrast: more)");
  const ua = navigator.userAgent;
  const svgBackdrop = /(?:Chrome|Chromium|Edg|OPR)\//.test(ua) && !/iPhone|iPad|iPod/.test(ua);

  function release() {
    stopWatchingSource(); stopWatchingSource = () => {};
    sampledSource = null;
    webgl?.destroy(); webgl = undefined;
    svg?.remove(); svg = undefined;
    assets?.dispose(); assets = undefined;
    optics.replaceChildren(); host.style.removeProperty("backdrop-filter");
    host.style.removeProperty("-webkit-backdrop-filter"); shine.style.removeProperty("background-image");
  }

  function mark(strategy: string, reason = "") {
    host.dataset.glassStrategy = strategy;
    host.dataset.glassReason = reason;
    // A failed capture must never leave an old texture covering the live fallback.
    optics.style.visibility = strategy === "webgl" || strategy === "solid" ? "visible" : "hidden";
  }

  async function render() {
    raf = 0;
    if (disposed || document.hidden || !intersecting) return;
    const width = host.offsetWidth, height = host.offsetHeight;
    if (!width || !height || !host.getClientRects().length) return;
    const opaque = transparency.matches || contrast.matches;
    const blur = effectiveBlur(config.blur);
    const saturation = config.blur === undefined ? 1.05 : 1.35;
    const sampleScope = config.rendering === "sampled" ? host.closest<HTMLElement>(".cp-root") : null;
    const nextSampleSource = sampleScope && config.backdrop ? sampleScope.querySelector<HTMLElement>(config.backdrop) : null;
    const nextKey = [Math.round(width), Math.round(height), config.radius, config.tone, config.backdrop || "", blur, saturation, config.rendering || "refractive", opaque].join(":");
    if (nextKey === geometryKey && nextSampleSource === sampledSource) return;
    geometryKey = nextKey;
    const ownGeneration = ++generation;
    release();
    if (opaque) { mark("solid", "system-preference"); return; }
    if (config.rendering === "sampled") {
      const scope = sampleScope, source = nextSampleSource;
      sampledSource = source;
      let stopSample = () => {};
      // Page reuse can replace the list without resizing the composer. Observe
      // identity, not message mutations, and discard the old scene immediately.
      const ownerChanges = new MutationObserver(() => {
        if (disposed || ownGeneration !== generation) return;
        const currentScope = host.closest<HTMLElement>(".cp-root");
        const currentSource = currentScope && config.backdrop ? currentScope.querySelector<HTMLElement>(config.backdrop) : null;
        if (currentScope === scope && currentSource === source) return;
        generation++; stopSample(); ownerChanges.disconnect(); geometryKey = ""; schedule();
      });
      if (scope) ownerChanges.observe(scope, { childList: true, subtree: true });
      stopWatchingSource = () => { stopSample(); ownerChanges.disconnect(); };
      // This mode is deliberately limited to the independent conversation list.
      // Missing source keeps neutral glass; never fall back to the failing blur.
      if (!scope || !source || source.contains(host) || host.contains(source)) {
        mark("sampled", "source-unavailable"); return;
      }
      stopSample = mountConversationGlassSample(host, source, config.blur === undefined ? 24 : blur);
      mark("sampled", "explicit-conversation-sample"); return;
    }
    // Rapidly scrolling chat surfaces use the browser's bounded CSS blur path.
    // Avoid SVG backdrop/displacement filters spanning separately composited
    // message, header and composer layers. Navigation keeps the optical path.
    if (config.rendering === "frosted") {
      const material = `blur(${config.blur === undefined ? 18 : blur}px) saturate(135%)`;
      host.style.backdropFilter = material;
      host.style.setProperty("-webkit-backdrop-filter", material);
      mark("frosted", "scrolling-surface");
      return;
    }
    mark("frosted", "preparing");
    try {
      const next = await createLiquidGlassRuntimeAssets(glassGeometry(width, height, config.radius, config.tone), {
        // Supersample 1x screens too: these curved bitmap maps are stretched
        // during gestures, so one source pixel per CSS pixel leaves hard steps.
        backend: "ts", dpr: Math.max(2, Math.min(Math.ceil(devicePixelRatio || 1), 3)), useCache: true,
      });
      if (disposed || ownGeneration !== generation) { next.dispose(); return; }
      assets = next;
      shine.style.backgroundImage = `url("${next.specularUrl}")`;
      if (svgBackdrop) {
        svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
        svg.style.cssText = "position:absolute;pointer-events:none";
        // Only generated blob URLs and numeric optical parameters enter this SVG.
        // Frost and refraction share one backdrop sample. Consumers must not
        // blur an ancestor as well: nested sampling can produce clipped tiles.
        svg.innerHTML = `<filter id="${filterId}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="soft"/><feImage href="${next.displacementUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="lens"/><feDisplacementMap in="soft" in2="lens" scale="${next.maxDisplacement}" xChannelSelector="R" yChannelSelector="G" result="refracted"/><feColorMatrix in="refracted" type="saturate" values="${saturation}"/></filter>`;
        host.append(svg);
        // Apply at the material root. A filtered child under specular compositing
        // can lose access to the page backdrop (covered by the pixel-difference test).
        host.style.backdropFilter = `url("#${filterId}")`;
        host.style.setProperty("-webkit-backdrop-filter", `url("#${filterId}")`);
        mark("svg");
        return;
      }
      // WebGL is reserved for the exterior navigation. Capturing an ancestor of
      // an in-content selector would recursively capture the glass itself.
      const scope = host.closest(".nx-chassis") ?? host.closest(".cp-root");
      const source = config.backdrop ? scope?.querySelector<HTMLElement>(config.backdrop) : null;
      if (!source || source.contains(host) || host.contains(source)) {
        mark("frosted", "no-independent-backdrop"); return;
      }
      const { createWebGLSurface } = await import("simple-liquid-glass/webgl");
      if (disposed || ownGeneration !== generation) return;
      let refreshing = false, dirty = false, refreshFrame = 0, refreshTimer = 0, watching = true;
      let engineStatus = "preparing", captureFailed = false;
      webgl = createWebGLSurface(host, optics, source, {
        map: next.displacementUrl, scale: next.maxDisplacement, dispersion: .16,
        // This displacement map has no blue-channel highlights; the generated
        // specular image above supplies the same optical rim on both engines.
        specular: 0, classic: false, neutralPoint: 128 / 255,
        radius: next.params.radius, blur: config.blur === undefined ? 0 : blur, saturation: saturation * 100,
      }, status => {
        if (disposed || ownGeneration !== generation) return;
        engineStatus = status;
        if (status === "active" && captureFailed) return;
        mark(status === "active" ? "webgl" : "frosted", status === "active" ? "" : status);
      });
      // The dependency retains its previous texture after a failed recapture.
      // Its public refresh promise rejects even when its status callback stays
      // "active", so observe that promise before showing another captured frame.
      const refresh = () => {
        if (!watching) return;
        dirty = true;
        if (refreshing || refreshFrame) return;
        refreshFrame = requestAnimationFrame(async () => {
          refreshFrame = 0; dirty = false; refreshing = true;
          const current = webgl;
          const live = () => watching && !disposed && ownGeneration === generation && current === webgl;
          if (!current || !live()) { refreshing = false; return; }
          try {
            await current.refresh();
            // Capture completion precedes the engine's next GPU draw.
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            // Keep the last valid frame while a dynamic source is recaptured.
            // A successful capture cannot restore a lost GPU context.
            if (live()) {
              captureFailed = false;
              mark(engineStatus === "active" ? "webgl" : "frosted", engineStatus === "active" ? "" : engineStatus);
            }
          } catch {
            if (live()) { captureFailed = true; mark("frosted", "capture-failed"); }
          } finally {
            refreshing = false;
            if (live() && dirty) refresh();
          }
        });
      };
      const queueRefresh = () => {
        if (!watching || refreshTimer) return;
        refreshTimer = window.setTimeout(() => { refreshTimer = 0; refresh(); }, 120);
      };
      const changes = new MutationObserver(records => {
        // Lens transforms/maps are generated optics, not a changing backdrop.
        // Recapturing them at spring-frame frequency stalls the view thread.
        const contentChanged = records.some(record => {
          const target = record.target instanceof Element ? record.target : record.target.parentElement;
          if (target?.closest(".nx-liquid-glass")) return false;
          if (record.type === "attributes" && target?.classList.contains("nx-glass-segments")
            && ["data-glass-moving", "data-glass-dragging"].includes(record.attributeName ?? "")) return false;
          if (record.type === "childList") {
            const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
            if (nodes.length && nodes.every(node => node instanceof Element && node.matches(".nx-liquid-glass"))) return false;
          }
          return true;
        });
        if (contentChanged) queueRefresh();
      }), size = new ResizeObserver(queueRefresh);
      changes.observe(source, { subtree: true, childList: true, attributes: true, characterData: true });
      size.observe(source); source.addEventListener("load", queueRefresh, true);
      stopWatchingSource = () => { watching = false; clearTimeout(refreshTimer); cancelAnimationFrame(refreshFrame); changes.disconnect(); size.disconnect(); source.removeEventListener("load", queueRefresh, true); };
    } catch (error) {
      if (disposed || ownGeneration !== generation) return;
      release(); mark("frosted", "renderer-unavailable");
      // Keep a diagnosable fallback without interrupting navigation or reading.
      console.warn("Liquid glass material unavailable", error);
    }
  }

  function schedule() { if (!disposed && !raf) raf = requestAnimationFrame(render); }
  const observer = new ResizeObserver(schedule);
  observer.observe(host);
  const visibilityObserver = new IntersectionObserver(entries => {
    intersecting = entries.some(entry => entry.isIntersecting);
    if (intersecting) schedule();
    else if (!svgBackdrop || config.rendering === "sampled") { generation++; stopWatchingSource(); webgl?.destroy(); webgl = undefined; geometryKey = ""; mark("frosted", "offscreen"); }
  });
  visibilityObserver.observe(host);
  function preferenceChanged() { generation++; geometryKey = ""; schedule(); }
  transparency.addEventListener("change", preferenceChanged);
  contrast.addEventListener("change", preferenceChanged);
  // Rebuild on theme changes, including recovery after a rejected capture.
  const themeObserver = new MutationObserver(() => { if (!svgBackdrop && config.backdrop) { geometryKey = ""; schedule(); } });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  const visibility = () => {
    if (document.hidden) { generation++; stopWatchingSource(); webgl?.destroy(); webgl = undefined; geometryKey = ""; if (!svgBackdrop) mark("frosted", "hidden"); }
    else schedule();
  };
  document.addEventListener("visibilitychange", visibility);
  schedule();
  return {
    update(next: GlassConfiguration) {
      if (disposed) return;
      const changed = config.radius !== next.radius || config.tone !== next.tone
        || (config.backdrop || "") !== (next.backdrop || "")
        || effectiveBlur(config.blur) !== effectiveBlur(next.blur)
        || (config.blur === undefined) !== (next.blur === undefined)
        || (config.rendering || "refractive") !== (next.rendering || "refractive");
      config = next;
      // Invalidate at the intent change, before the next frame. Otherwise an
      // earlier pending asset can briefly install its SVG after choosing frost.
      // Reset the key as well so that cancelling a pending render is recoverable.
      if (changed) { generation++; geometryKey = ""; }
      schedule();
    },
    destroy() {
      disposed = true; generation++; cancelAnimationFrame(raf); observer.disconnect(); visibilityObserver.disconnect(); themeObserver.disconnect();
      transparency.removeEventListener("change", preferenceChanged); contrast.removeEventListener("change", preferenceChanged);
      document.removeEventListener("visibilitychange", visibility); release();
    },
  };
}
