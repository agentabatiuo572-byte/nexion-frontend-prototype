import { describe, expect, it } from "vitest";
import { createSessionVault } from "./session-vault";
const snapshot=(token:string,userId=7)=>({accessToken:token,refreshToken:`r-${token}`,tokenType:"Bearer",user:{userId,countryCode:"+86",phone:"13800000007",nickname:"Fixture",onboardingComplete:true}});
describe("authentication continuity only through a refresh",()=>{
 it("preserves the existing CAS revision while recording refresh-only continuation",()=>{
  const vault=createSessionVault();vault.save(snapshot("a"));const before=vault.revision();
  expect(vault.refreshIfUnchanged(snapshot("b"),before)).toBe(true);
  expect(vault.revision()).toBe(before+1);expect(vault.isRefreshContinuation(before)).toBe(true);
  expect(vault.refreshIfUnchanged(snapshot("stale"),before)).toBe(false);
  expect(vault.read()?.accessToken).toBe("b");
 });
 it("does not bridge logout, same-user login, direct replacement or cross-user refresh",()=>{
  const vault=createSessionVault();vault.save(snapshot("a"));const before=vault.revision();
  vault.clear();vault.save(snapshot("b"));vault.refreshIfUnchanged(snapshot("c"),vault.revision());
  expect(vault.isRefreshContinuation(before)).toBe(false);
  const current=vault.revision();vault.saveIfUnchanged(snapshot("same-user-login"),current);
  expect(vault.isRefreshContinuation(current)).toBe(false);
  expect(vault.refreshIfUnchanged(snapshot("other",8),vault.revision())).toBe(false);
 });
 it("a cold cookie restore establishes identity rather than inheriting an old one",()=>{
  const vault=createSessionVault();expect(vault.refreshIfUnchanged(snapshot("boot"),0)).toBe(true);
  expect(vault.isRefreshContinuation(0)).toBe(false);
 });
});
