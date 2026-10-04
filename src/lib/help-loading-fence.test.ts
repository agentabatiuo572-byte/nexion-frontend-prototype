import { describe, it, expect } from "vitest";
import source from "../pages/me/help.vue?raw";

describe("Help account request finalization", () => {
  it("only releases the loading state owned by the current request", () => {
    const send = source.slice(source.indexOf("async function sendToBot"));
    expect(send).toMatch(/finally\s*\{\s*if\s*\(helpScope\.isCurrent\(request\)\s*&&\s*botRequestControl\.isCurrent\(control\.epoch\)\)\s*\{\s*thinking\.value\s*=\s*false/);
  });
});
