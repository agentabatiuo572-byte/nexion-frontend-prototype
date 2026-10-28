import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPinia, disposePinia, getActivePinia, setActivePinia } from "pinia";
import { createSessionVault } from "@/api/session-vault";
const fixture=vi.hoisted(()=>({vault:null as any,config:{baseUrl:"https://test.invalid",environment:"dev"}}));
vi.mock("@/api/runtime",()=>({get sessionVault(){return fixture.vault},apiRuntimeConfig:fixture.config}));
const session=()=>({accessToken:"access",refreshToken:"refresh",tokenType:"Bearer",user:{userId:1,countryCode:"+84",phone:"12345678",nickname:"Fixture",onboardingComplete:true}});
beforeEach(()=>{vi.resetModules();setActivePinia(createPinia());fixture.vault=createSessionVault();fixture.vault.save(session());fixture.config.baseUrl="https://test.invalid";});
afterEach(()=>{const pinia=getActivePinia();if(pinia)disposePinia(pinia);});
it("does not reuse a subject's cached result after session loss or a same-user logout/login ABA",async()=>{
  const {runPassiveTabRead}=await import("./passive-tab-read");const read=vi.fn(async()=>fixture.vault.read()?.user.userId??null);
  expect(await runPassiveTabRead("security-overview",read)).toBe(1);
  fixture.vault.clear();expect(await runPassiveTabRead("security-overview",read)).toBeNull();
  fixture.vault.save(session());expect(await runPassiveTabRead("security-overview",read)).toBe(1);
  // No intermediate helper read observes the next logout; the vault chain still changes.
  fixture.vault.clear();fixture.vault.save(session());await runPassiveTabRead("security-overview",read);
  expect(read).toHaveBeenCalledTimes(4);
});
it("keeps ordinary refresh-token rotation in the same read window while business writes invalidate it",async()=>{
  const {runPassiveTabRead}=await import("./passive-tab-read"),{invalidatePassiveTabReads}=await import("./passive-read-window");
  const read=vi.fn(async()=>1);await runPassiveTabRead("orders",read);
  fixture.vault.refreshIfUnchanged({...session(),accessToken:"rotated"},fixture.vault.revision());await runPassiveTabRead("orders",read);
  expect(read).toHaveBeenCalledTimes(1);invalidatePassiveTabReads();await runPassiveTabRead("orders",read);expect(read).toHaveBeenCalledTimes(2);
});
