import { describe, expect, it } from "vitest";
import { escapeSvgText } from "./svg-text";

describe("escapeSvgText", () => {
  it("escapes every character that can break out of an SVG text node", () => {
    expect(escapeSvgText(`<img src=x onerror="alert('x')"> & reward`))
      .toBe("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; reward");
  });
});
