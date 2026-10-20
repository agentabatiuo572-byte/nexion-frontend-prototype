import { afterEach, expect, test, vi } from "vitest";
import { acceptNativeOAuthReturn, listenForNativeOAuthReturn } from "./oauth-browser-return";

afterEach(() => vi.unstubAllGlobals());
test("native return works without URL and accepts only the exact backend URI", () => {
  vi.stubGlobal("URL", undefined);
  const receive = vi.fn(), stop = listenForNativeOAuthReturn(receive);
  const query = `flowId=OIDC-${"a".repeat(32)}&receipt=${"r".repeat(43)}`;
  for (const uri of [`https://oauth?${query}`, `uvel://other?${query}`, `uvel://oauth/path?${query}`,
    `uvel://user@oauth?${query}`, `uvel://oauth?${query}#fragment`,
    `uvel://oauth?${query}&receipt=${"x".repeat(43)}`, "uvel://oauth?receipt=bad"])
    acceptNativeOAuthReturn(uri);
  expect(receive).not.toHaveBeenCalled();
  acceptNativeOAuthReturn(`uvel://oauth?${query}`);
  expect(receive).toHaveBeenCalledOnce();
  stop();
  acceptNativeOAuthReturn(`uvel://oauth?${query}`);
  expect(receive).toHaveBeenCalledOnce();
});
