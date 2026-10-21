import { expect, test, vi } from "vitest";
import html from "../../index.html?raw";

const script = html.match(/<script id="nx-referral-entry">([\s\S]*?)<\/script>/)![1];

test.each(["/", "/app/"])("public invitation short links enter the deployed %s App route with the code intact", base => {
  for (const pathname of ["/ref/NXFA9066CFACA9", "/ref/nx-fa9066-cfaca9/"]) {
    const replace = vi.fn();
    new Function("window", script.replace("%BASE_URL%", base))({ location: { pathname, replace } });
    expect(replace).toHaveBeenCalledWith(`${base}#/pages/ref/code?code=${pathname.split("/")[2]}`);
  }
});

test.each(["/app/", "/", "/ref/", "/ref/ABC", "/ref/NX%2FOTHER", "/ref/NX1234/other", "/ref/https://evil.test"])
  ("does not redirect non-invitation or malformed path %s", pathname => {
    const replace = vi.fn();
    new Function("window", script)({ location: { pathname, replace } });
    expect(replace).not.toHaveBeenCalled();
  });
