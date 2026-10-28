import { expect, it, vi, afterEach } from "vitest";
import { createPageReadController } from "./passive-page-activation";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("triggers only on a third effective Tab change within the inclusive one-second boundary", () => {
  let now = 0; const c = createPageReadController(() => now);
  c.notifyPageActivation("home", {tabSwitch:true});
  c.notifyPageActivation("home", {tabSwitch:true}); expect(c.snapshot().visit).toBe(1);
  c.notifyPageActivation("earn", {tabSwitch:true}); now=500; c.notifyPageActivation("team", {tabSwitch:true});
  expect(c.snapshot().protected).toBe(false); now=1_000; c.notifyPageActivation("store", {tabSwitch:true});
  expect(c.snapshot()).toMatchObject({protected:true,remainingMs:3_000});
});
it("a change just outside one second is slow; ordinary routes never count", () => {
  let now=0; const c=createPageReadController(()=>now); c.notifyPageActivation("home");c.notifyPageActivation("earn",{tabSwitch:true});
  now=500;c.notifyPageActivation("detail");c.notifyPageActivation("team",{tabSwitch:true});now=1001;c.notifyPageActivation("store",{tabSwitch:true});
  expect(c.snapshot().protected).toBe(false);
});
it("renews only a qualifying burst, not an isolated slow switch, and expires without a timer", () => {
  let now=0;const c=createPageReadController(()=>now); c.notifyPageActivation("home");
  for(const route of ["earn","team","store"]){now+=100;c.notifyPageActivation(route,{tabSwitch:true});}
  now=900;c.notifyPageActivation("me",{tabSwitch:true});expect(c.snapshot().remainingMs).toBe(3000);
  now=2000;c.notifyPageActivation("home",{tabSwitch:true});expect(c.snapshot().remainingMs).toBe(1900);
  now=3900;expect(c.snapshot().protected).toBe(false);
});
it("force starts another same-route instance without counting a Tab change",()=>{
  const c=createPageReadController(); c.notifyPageActivation("home");c.notifyPageActivation("home",{force:true,tabSwitch:true});
  expect(c.snapshot()).toMatchObject({visit:2,protected:false});
});
it("failed navigation rolls back burst history and cannot roll back a newer transaction",()=>{
  let now=0;const c=createPageReadController(()=>now);c.notifyPageActivation("home");
  now=100;c.notifyPageActivation("earn",{tabSwitch:true});now=200;c.notifyPageActivation("team",{tabSwitch:true});
  now=300;const rollback=c.notifyPageActivation("store",{tabSwitch:true});expect(c.snapshot().protected).toBe(true);rollback();expect(c.snapshot().protected).toBe(false);
  now=400;const old=c.notifyPageActivation("store",{tabSwitch:true});c.notifyPageActivation("detail");const before=c.snapshot();old();expect(c.snapshot()).toEqual(before);
});
it("clock rollback drops burst timing but does not recycle visit identities",()=>{
  let now=1000;const c=createPageReadController(()=>now);c.notifyPageActivation("home");
  for(const route of ["earn","team","store"]){now+=100;c.notifyPageActivation(route,{tabSwitch:true});}
  now=500;expect(c.snapshot()).toMatchObject({visit:4,protected:false});
});
it("identity invalidation revokes protection and prevents a failed navigation rollback restoring it",()=>{
  const c=createPageReadController(()=>0);c.notifyPageActivation("home");
  c.notifyPageActivation("earn",{tabSwitch:true});c.notifyPageActivation("team",{tabSwitch:true});
  const rollback=c.notifyPageActivation("store",{tabSwitch:true});expect(c.snapshot().protected).toBe(true);
  c.resetProtection();rollback();expect(c.snapshot().protected).toBe(false);
});
it("opt-in trace exposes only a safe tab name and activation state",()=>{
  vi.stubEnv("MODE","development");vi.stubEnv("VITE_NEXGRID_TAB_READ_TRACE","1");const log=vi.spyOn(console,"info").mockImplementation(()=>{});
  const c=createPageReadController();c.notifyPageActivation("/pages/index/index?secret=account");c.notifyPageActivation("/pages/security/index?token=hidden");
  expect(log).toHaveBeenCalledTimes(2);expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|account|token|hidden|security/);
  vi.stubEnv("MODE","production");c.notifyPageActivation("home");expect(log).toHaveBeenCalledTimes(2);
});
