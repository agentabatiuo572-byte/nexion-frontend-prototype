import { describe, expect, it } from "vitest";
import { isPublicAuthRoute } from "./auth-route-visibility";

describe("public auth route boundary", () => {
  it("keeps registration entry and public legal pages reachable without a session", () => {
    expect(isPublicAuthRoute("#/pages/register/register?invite=Q1")).toBe(true);
    expect(isPublicAuthRoute("pages/onboarding/intro")).toBe(true);
    expect(isPublicAuthRoute("/pages/onboarding/privacy?return=%2Fpages%2Fonboarding%2Fintro")).toBe(true);
  });

  /**
   * zentao #226:服务条款页里的「另见:平台风险披露」是**未登录也要能读**的公开法律文本。
   * 它此前不在白名单里,守卫把用户送回引导页 —— 等于要求先登录才能读一份强制阅读的披露。
   */
  it("lets an unauthenticated reader open the risk disclosure linked from the public terms page", () => {
    expect(isPublicAuthRoute("/pages/me/risk-disclosure?return=%2Fpages%2Fonboarding%2Fterms")).toBe(true);
    expect(isPublicAuthRoute("pages/me/risk-disclosure")).toBe(true);
    // 同目录下的其它 me 页仍必须登录:白名单是按整条路由,不是按目录。
    expect(isPublicAuthRoute("pages/me/wallet")).toBe(false);
    expect(isPublicAuthRoute("pages/me/security")).toBe(false);
  });

  it("does not treat prototype keys as allowlisted routes", () => {
    // 判定走 `=== true`,所以路由串恰好是原型链上的键时不能被当成白名单命中。
    for (const key of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(isPublicAuthRoute(key)).toBe(false);
    }
  });

  it("requires a session before calibration or success confirmation can render", () => {
    expect(isPublicAuthRoute("pages/onboarding/estimator")).toBe(false);
    expect(isPublicAuthRoute("pages/onboarding/connect")).toBe(false);
    expect(isPublicAuthRoute("pages/register/success")).toBe(false);
  });

  it("does not grant new routes access merely because they share a public directory", () => {
    for (const folder of ["login", "session", "ref", "tx"]) {
      expect(isPublicAuthRoute(`pages/${folder}/future-private-page`)).toBe(false);
    }
    for (const route of ["login/login", "session/kicked", "ref/code", "tx/hash"]) {
      expect(isPublicAuthRoute(`pages/${route}`)).toBe(true);
    }
  });
});
