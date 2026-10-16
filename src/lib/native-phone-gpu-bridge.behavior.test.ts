import { describe, expect, it, vi } from "vitest";
import { observeAppWebglGpu } from "./native-phone-gpu";

function fixture(renderer: unknown = "ANGLE (Samsung Xclipse 550 on Vulkan)") {
  const loseContext = vi.fn();
  const getParameter = vi.fn(() => renderer);
  const getExtension = vi.fn((name: string) => name === "WEBGL_debug_renderer_info"
    ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
    : name === "WEBGL_lose_context" ? { loseContext } : null);
  const gl = { getExtension, getParameter };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => gl) };
  const document = { createElement: vi.fn(() => canvas) } as unknown as Document;
  return { document, canvas, gl, getExtension, getParameter, loseContext };
}

describe("App-owned GPU renderer observation", () => {
  it("returns the actual unmasked string and releases only its own one-pixel context", () => {
    const own = fixture("  ANGLE (Samsung Xclipse 550 on Vulkan)  ");
    expect(observeAppWebglGpu(own.document)).toEqual({ status: "observed", renderer: "ANGLE (Samsung Xclipse 550 on Vulkan)" });
    expect(own.document.createElement).toHaveBeenCalledWith("canvas");
    expect(own.document.createElement).toHaveBeenCalledTimes(1);
    expect(own.canvas.width).toBe(1);
    expect(own.canvas.height).toBe(1);
    expect(own.getParameter).toHaveBeenCalledWith(0x9246);
    expect(own.loseContext).toHaveBeenCalledTimes(1);
  });

  it("keeps missing contexts unknown without asking for a renderer", () => {
    const own = fixture();
    own.canvas.getContext.mockReturnValue(null as never);
    expect(observeAppWebglGpu(own.document)).toEqual({ status: "context-unavailable", renderer: "" });
    expect(own.getParameter).not.toHaveBeenCalled();
    expect(own.loseContext).not.toHaveBeenCalled();
  });

  it("does not substitute the masked GL_RENDERER when debug renderer information is absent", () => {
    const own = fixture();
    own.getExtension.mockImplementation(name => name === "WEBGL_lose_context" ? { loseContext: own.loseContext } : null);
    expect(observeAppWebglGpu(own.document)).toEqual({ status: "renderer-masked", renderer: "" });
    expect(own.getParameter).not.toHaveBeenCalled();
    expect(own.loseContext).toHaveBeenCalledTimes(1);
  });

  it.each(["", "   ", null, 123])("keeps empty or non-string renderer %s unknown", value => {
    const own = fixture(value);
    expect(observeAppWebglGpu(own.document)).toEqual({ status: "renderer-empty", renderer: "" });
    expect(own.loseContext).toHaveBeenCalledTimes(1);
  });

  it.each(["ANGLE (Google, Vulkan SwiftShader Device)", "llvmpipe (LLVM 18.0)", "Software Rasterizer", "WebKit WebGL"])(
    "does not treat software or masked renderer %s as phone GPU hardware", value => {
      const own = fixture(value);
      expect(observeAppWebglGpu(own.document)).toEqual({ status: "renderer-masked", renderer: "" });
      expect(own.loseContext).toHaveBeenCalledTimes(1);
    },
  );

  it("releases the context after native-backed getParameter throws", () => {
    const own = fixture();
    own.getParameter.mockImplementation(() => { throw new Error("context lost during query"); });
    expect(observeAppWebglGpu(own.document)).toEqual({ status: "read-failed", renderer: "" });
    expect(own.loseContext).toHaveBeenCalledTimes(1);
  });

  it("contains canvas allocation failure without inventing a hardware model", () => {
    const document = { createElement: () => { throw new Error("no render document"); } } as unknown as Document;
    expect(observeAppWebglGpu(document)).toEqual({ status: "read-failed", renderer: "" });
  });

  it("does not let cleanup exceptions overwrite a successful observation", () => {
    const own = fixture();
    own.loseContext.mockImplementation(() => { throw new Error("already lost"); });
    expect(observeAppWebglGpu(own.document)).toEqual({ status: "observed", renderer: "ANGLE (Samsung Xclipse 550 on Vulkan)" });
  });
});
