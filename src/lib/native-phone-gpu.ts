/** Observed in the App WebView, not the Native.js logic thread. Never infer a GPU from model/SoC. */
export type GpuObservation = { status: "observed" | "context-unavailable" | "renderer-masked" | "renderer-empty" | "read-failed"; renderer: string };

export function observeAppWebglGpu(document: Pick<Document, "createElement">): GpuObservation {
  let gl: WebGLRenderingContext | null = null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1; canvas.height = 1;
    gl = (canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true })
      || canvas.getContext("experimental-webgl", { failIfMajorPerformanceCaveat: true })) as WebGLRenderingContext | null;
    if (!gl) return { status: "context-unavailable", renderer: "" };
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    if (!extension) return { status: "renderer-masked", renderer: "" };
    const value: unknown = gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    const renderer = typeof value === "string" ? value.trim().slice(0, 256) : "";
    if (/^(?:WebKit WebGL|WebKit WebGL Renderer|WebGL Renderer|ANGLE|unknown)$/i.test(renderer)
        || /SwiftShader|llvmpipe|softpipe|software rasterizer/i.test(renderer)) return { status: "renderer-masked", renderer: "" };
    return { status: renderer ? "observed" : "renderer-empty", renderer };
  } catch {
    return { status: "read-failed", renderer: "" };
  } finally {
    // Only our own context. Never touch an existing WebView/EGL context.
    try { gl?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* Release failure must not escape the observation. */ }
  }
}
