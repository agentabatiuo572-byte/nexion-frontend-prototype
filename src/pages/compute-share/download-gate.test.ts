import { describe, expect, it } from "vitest";
import { createComputeShareDownloadGate, type ComputeShareConfigStatus } from "./download-gate";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function fixture(initial: ComputeShareConfigStatus, initiallyEnabled = false) {
  let status = initial;
  let enabled = initiallyEnabled;
  const phases: string[] = [];
  let redirects = 0;
  let resumes = 0;
  let suspends = 0;
  const flights: Array<ReturnType<typeof deferred<void>>> = [];
  const gate = createComputeShareDownloadGate({
    status: () => status,
    enabled: () => enabled,
    settle: () => {
      const flight = deferred<void>();
      flights.push(flight);
      return flight.promise;
    },
    setPhase: (phase) => phases.push(phase),
    suspend: () => { suspends += 1; },
    redirectDisabled: () => { redirects += 1; },
    resume: () => { resumes += 1; },
  });
  return {
    gate, phases, flights,
    setStatus: (next: ComputeShareConfigStatus) => { status = next; },
    setEnabled: (next: boolean) => { enabled = next; },
    redirects: () => redirects, suspends: () => suspends,
    resumes: () => resumes,
  };
}

describe("compute-share download cold gate", () => {
  it("keeps the cold route pending, then renders an enabled projection and resumes once", async () => {
    const f = fixture("loading");
    const mounting = f.gate.mount();
    expect(f.phases).toEqual(["pending"]);
    expect(f.redirects()).toBe(0);
    expect(f.resumes()).toBe(0);

    f.setStatus("ready");
    f.setEnabled(true);
    f.flights[0].resolve();
    await mounting;
    expect(f.phases.at(-1)).toBe("ready");
    expect(f.redirects()).toBe(0);
    expect(f.resumes()).toBe(1);

    f.setStatus("loading");
    f.gate.reconcile();
    expect(f.phases.at(-1)).toBe("pending");
    expect(f.suspends()).toBe(1);
    f.setStatus("ready");
    f.gate.reconcile();
    expect(f.resumes()).toBe(2);
  });

  it("redirects only after a settled explicitly disabled projection", async () => {
    const f = fixture("ready", false);
    await f.gate.mount();
    expect(f.phases).toEqual(["pending", "disabled"]);
    expect(f.redirects()).toBe(1);
  });

  it("shows a retryable failure rather than treating a failed fetch as disabled", async () => {
    const f = fixture("loading");
    const mounting = f.gate.mount();
    f.setStatus("failed");
    f.flights[0].resolve();
    await mounting;
    expect(f.phases.at(-1)).toBe("failed");
    expect(f.redirects()).toBe(0);

    const retrying = f.gate.retry();
    expect(f.phases.at(-1)).toBe("pending");
    f.setStatus("ready");
    f.setEnabled(true);
    f.flights[1].resolve();
    await retrying;
    expect(f.phases.at(-1)).toBe("ready");
    expect(f.resumes()).toBe(1);
  });

  it("does not redirect or resume when an unmounted page receives a late result", async () => {
    const f = fixture("loading");
    const mounting = f.gate.mount();
    f.gate.unmount();
    f.setStatus("ready");
    f.setEnabled(false);
    f.flights[0].resolve();
    await mounting;
    expect(f.redirects()).toBe(0);
    expect(f.resumes()).toBe(0);
  });
});
