import type { GpuObservation } from "./native-phone-gpu";

/** One page-local observation request. No cache or persistent hardware guesses. */
export function createNativeGpuRequest(send: (id: number) => void) {
  let sequence = 0;
  let disposed = false;
  let pending: { id: number; resolve: (value: GpuObservation) => void; reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>; promise: Promise<GpuObservation> } | null = null;
  const fail = (code: string) => {
    const request = pending; pending = null;
    if (request) { clearTimeout(request.timer); request.reject(new Error(code)); }
  };
  return {
    read(): Promise<GpuObservation> {
      if (disposed) return Promise.reject(new Error("PHONE_GPU_VIEW_DISPOSED"));
      if (pending) return pending.promise;
      const id = ++sequence;
      let resolve!: (value: GpuObservation) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<GpuObservation>((done, failed) => { resolve = done; reject = failed; });
      pending = { id, resolve, reject, promise, timer: setTimeout(() => fail("PHONE_GPU_VIEW_TIMEOUT"), 2_000) };
      try { send(id); } catch { fail("PHONE_GPU_VIEW_UNAVAILABLE"); }
      return promise;
    },
    receive(value: unknown) {
      if (!pending || !value || typeof value !== "object") return;
      const row = value as Record<string, unknown>;
      if (row.id !== pending.id || typeof row.renderer !== "string") return;
      if (!["observed", "context-unavailable", "renderer-masked", "renderer-empty", "read-failed"].includes(String(row.status))) return;
      const renderer = row.status === "observed" ? row.renderer.trim().slice(0, 256) : "";
      if (row.status === "observed" && !renderer) return;
      const request = pending; pending = null; clearTimeout(request.timer);
      request.resolve({ status: row.status as GpuObservation["status"], renderer });
    },
    dispose() { disposed = true; fail("PHONE_GPU_VIEW_DISPOSED"); },
  };
}
