import { describe, expect, it } from "vitest";
import { Fragment, createVNode, h } from "vue";
import { svgMarkup } from "./native-svg-markup";

describe("native SVG view markup", () => {
  it("preserves reactive icon paths and CSS token strokes", () => {
    const path = "M1 2 & 3";
    const markup = svgMarkup({ width: "22", height: "22", stroke: "var(--v5-brand)" }, [
      h(Fragment, null, [h("path", { d: path }), h("circle", { cx: 11, cy: 11, r: 8 })]),
    ]);
    expect(markup).toContain('stroke="var(--v5-brand)"');
    expect(markup).toContain('<path d="M1 2 &amp; 3"></path>');
    expect(markup).toContain('<circle cx="11" cy="11" r="8"></circle>');
  });

  it("escapes attributes and ignores event props and non-SVG elements", () => {
    const markup = svgMarkup({ width: "16", onClick: () => {}, title: 'a"<b' }, [
      createVNode("path", { d: 'M"<', onClick: () => {} }),
      h("view", { innerHTML: "ignored" }),
    ]);
    expect(markup).toContain('title="a&quot;&lt;b"');
    expect(markup).toContain('d="M&quot;&lt;"');
    expect(markup).not.toContain("onClick");
    expect(markup).not.toContain("ignored");
  });

  it("rejects inline event handlers and external SVG links while retaining fragment references", () => {
    const markup = svgMarkup({ onload: "alert(1)", "on:click": "alert(1)" }, [
      h("use", { href: "javascript:alert(1)", "xlink:href": "https://example.com/icon.svg", xlinkHref: "data:image/svg+xml;base64,abc" }),
      h("use", { href: "#safe-icon", "xlink:href": "#safe-icon" }),
    ]);
    expect(markup).not.toMatch(/onload|on:click|javascript:|https:\/\/|data:image/);
    expect(markup).toContain('<use href="#safe-icon" xlink:href="#safe-icon"></use>');
  });
});
