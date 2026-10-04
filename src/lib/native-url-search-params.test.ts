// @ts-expect-error App TypeScript excludes Node declarations; this runs in Vitest's Node process.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("App Plus URL compatibility", () => {
  it("parses and encodes URLs when both native constructors are absent", () => {
    const nodeProcess = (globalThis as unknown as { process: { execPath: string } }).process;
    const result = execFileSync(nodeProcess.execPath, ["-e", `
      globalThis.URL = undefined;
      globalThis.URLSearchParams = undefined;
      require("core-js/modules/web.url");
      require("core-js/modules/web.url-search-params");
      const params = new URLSearchParams({ hash: "a+b &?", net: "TRC20" });
      params.set("age", "1");
      const query = params.toString();
      const roundTrip = new URLSearchParams(query);
      if (roundTrip.get("hash") !== "a+b &?" || roundTrip.get("net") !== "TRC20") process.exit(1);
      process.stdout.write(query);
    `], { encoding: "utf8" });
    expect(result).toBe("hash=a%2Bb+%26%3F&net=TRC20&age=1");
  });

  it("preserves hosted-payment restrictions and pairing handoff encoding", () => {
    const nodeProcess = (globalThis as unknown as { process: { execPath: string } }).process;
    const result = execFileSync(nodeProcess.execPath, ["--experimental-strip-types", "-e", `
      globalThis.URL = undefined;
      globalThis.URLSearchParams = undefined;
      require("core-js/modules/web.url");
      require("core-js/modules/web.url-search-params");
      Promise.all([
        import("./src/lib/hosted-payment.ts"),
        import("./src/pages/compute-share/pairing-handoff.ts"),
      ]).then(([payment, pairing]) => {
        const safe = payment.validateHostedPaymentUrl("https://api.hdpayadmin.com/pay?id=1");
        const unsafe = [
          "http://api.hdpayadmin.com/pay",
          "https://api.hdpayadmin.com.evil.example/pay",
          "https://user@api.hdpayadmin.com/pay",
          "https://api.hdpayadmin.com/pay#fragment",
        ];
        if (safe !== "https://api.hdpayadmin.com/pay?id=1"
            || unsafe.some((url) => payment.validateHostedPaymentUrl(url) !== null)) process.exit(1);
        const handoff = pairing.createComputeSharePairingHandoff({
          enrollmentNo: "CSE-ABC",
          pairingCode: "123456",
          requestedGpuModel: "NVIDIA RTX 4070",
          expiresAt: "2026-09-01T12:30:00Z",
        });
        process.stdout.write(handoff);
      }).catch(() => process.exit(1));
    `], { encoding: "utf8" });
    expect(result).toBe("nexgrid://compute-share/pair?v=1&enrollmentNo=CSE-ABC&pairingCode=123456&requestedGpuModel=NVIDIA+RTX+4070&expiresAt=2026-09-01T12%3A30%3A00.000Z");
  });
});
