/** Read the native GL renderer in a one-pixel offscreen context; no DOM is needed. */
export function readAndroidGpu(android: Pick<PlusAndroid, "importClass" | "invoke">): string {
  const egl = "android.opengl.EGL14";
  const invoke = (object: Parameters<PlusAndroid["invoke"]>[0], method: string, ...args: unknown[]) => android.invoke(object, method, ...args);
  const call = (method: string, ...args: unknown[]) => invoke(egl, method, ...args);
  let display: ReturnType<PlusAndroid["invoke"]>;
  let context: ReturnType<PlusAndroid["invoke"]>;
  let surface: ReturnType<PlusAndroid["invoke"]>;
  let previous: { display: unknown; context: unknown; draw: unknown; read: unknown } | null = null;
  let current = false;
  try {
    const constants = android.importClass(egl) as PlusAndroidClassObject & {
      EGL_NO_CONTEXT?: unknown; EGL_NO_SURFACE?: unknown;
    };
    if (!constants?.EGL_NO_CONTEXT || !constants.EGL_NO_SURFACE) return "";
    previous = { display: call("eglGetCurrentDisplay"), context: call("eglGetCurrentContext"),
      draw: call("eglGetCurrentSurface", 0x3059), read: call("eglGetCurrentSurface", 0x305A) };
    display = call("eglGetDisplay", 0);
    if (!display || call("eglInitialize", display, [0], 0, [0], 0) !== true) return "";
    const configClass = android.invoke("java.lang.Class", "forName", "android.opengl.EGLConfig");
    const configs = invoke("java.lang.reflect.Array", "newInstance", configClass, 1);
    // EGL_SURFACE_TYPE=PBUFFER_BIT; EGL_RENDERABLE_TYPE=OPENGL_ES2_BIT.
    if (call("eglChooseConfig", display, [0x3033, 1, 0x3040, 4, 0x3038], 0, configs, 0, 1, [0], 0) !== true) return "";
    const config = invoke("java.lang.reflect.Array", "get", configs, 0);
    if (!config) return "";
    context = call("eglCreateContext", display, config, constants.EGL_NO_CONTEXT, [0x3098, 2, 0x3038], 0);
    surface = call("eglCreatePbufferSurface", display, config, [0x3057, 1, 0x3056, 1, 0x3038], 0);
    if (!context || !surface || call("eglMakeCurrent", display, surface, surface, context) !== true) return "";
    current = true;
    const renderer = android.invoke("android.opengl.GLES20", "glGetString", 0x1F01);
    return typeof renderer === "string" ? renderer.trim().slice(0, 256) : "";
  } catch { return ""; }
  finally {
    // Never terminate the process-wide display used by the APP renderer.
    try {
      if (current) {
        const constants = android.importClass(egl) as PlusAndroidClassObject & { EGL_NO_CONTEXT: unknown; EGL_NO_SURFACE: unknown };
        const hadContext = previous?.context && android.invoke(previous.context as PlusAndroidInstanceObject, "equals", constants.EGL_NO_CONTEXT) === false;
        if (hadContext && previous) call("eglMakeCurrent", previous.display, previous.draw, previous.read, previous.context);
        else call("eglMakeCurrent", display, constants.EGL_NO_SURFACE, constants.EGL_NO_SURFACE, constants.EGL_NO_CONTEXT);
      }
    } finally {
      try { if (surface) call("eglDestroySurface", display, surface); }
      finally { if (context) call("eglDestroyContext", display, context); }
    }
  }
}
