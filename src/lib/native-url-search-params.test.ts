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

  it("preserves hosted-payment restrictions without native URL constructors", () => {
    const nodeProcess = (globalThis as unknown as { process: { execPath: string } }).process;
    const result = execFileSync(nodeProcess.execPath, ["--experimental-strip-types", "-e", `
      globalThis.URL = undefined;
      globalThis.URLSearchParams = undefined;
      require("core-js/modules/web.url");
      require("core-js/modules/web.url-search-params");
      import("./src/lib/hosted-payment.ts").then((payment) => {
        const safe = payment.validateHostedPaymentUrl("https://api.hdpayadmin.com/pay?id=1");
        const unsafe = [
          "http://api.hdpayadmin.com/pay",
          "https://api.hdpayadmin.com.evil.example/pay",
          "https://user@api.hdpayadmin.com/pay",
          "https://api.hdpayadmin.com/pay#fragment",
        ];
        if (safe !== "https://api.hdpayadmin.com/pay?id=1"
            || unsafe.some((url) => payment.validateHostedPaymentUrl(url) !== null)) process.exit(1);
        process.stdout.write(safe);
      }).catch(() => process.exit(1));
    `], { encoding: "utf8" });
    expect(result).toBe("https://api.hdpayadmin.com/pay?id=1");
  });
});
