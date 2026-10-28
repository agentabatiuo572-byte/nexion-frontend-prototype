import { expect, it, vi } from "vitest";
import { ApiError } from "@/api/errors";
import { createPassiveReadWindow } from "./passive-read-window";
import { createPageReadController } from "./passive-page-activation";

function setup() {
  let time = 0;
  const now = () => time;
  const controller = createPageReadController(now), window = createPassiveReadWindow(now, controller);
  const visit = (route: string, tabSwitch = false) => controller.notifyPageActivation(route, { tabSwitch });
  const burst = () => { visit("home"); time += 100; visit("earn", true); time += 100; visit("team", true); time += 100; visit("store", true); };
  return { window, controller, visit, burst, setTime: (value: number) => { time = value; } };
}

it("normal visits read immediately, while recursive reads share one visit without a time TTL", async () => {
  const s = setup(), read = vi.fn(async () => 1);
  s.visit("home"); await s.window.run("A", "read", read);
  s.setTime(100_000); await s.window.run("A", "read", read); expect(read).toHaveBeenCalledTimes(1);
  s.visit("earn"); await s.window.run("A", "read", read); expect(read).toHaveBeenCalledTimes(2);
  s.visit("home"); await s.window.run("A", "read", read); expect(read).toHaveBeenCalledTimes(3);
});

it("shares pending reads across visits and consumes completion in the latest visit", async () => {
  const s = setup(); let finish!: (value: number) => void;
  const read = vi.fn(() => new Promise<number>(done => { finish = done; }));
  s.visit("home"); const first = s.window.run("A", "read", read, { page: 1, limit: 20 });
  s.visit("earn"); expect(s.window.run("A", "read", read, { limit: 20, page: 1 })).toBe(first);
  finish(7); await first; expect(await s.window.run("A", "read", read, { page: 1, limit: 20 })).toBe(7);
  expect(read).toHaveBeenCalledTimes(1);
});

it("reuses warm success only during protection and reads cold resources immediately", async () => {
  const s = setup(), read = vi.fn(async () => 1);
  s.visit("home"); await s.window.run("A", "warm", read); s.burst();
  s.visit("me", true); await s.window.run("A", "warm", read); await s.window.run("A", "cold", read);
  expect(read).toHaveBeenCalledTimes(2);
  s.setTime(3_300); // last qualifying change was at 300ms
  expect(s.controller.snapshot().protected).toBe(false);
  expect(read).toHaveBeenCalledTimes(2); // expiration never schedules work
  s.visit("home"); await s.window.run("A", "warm", read); expect(read).toHaveBeenCalledTimes(3);
});

it.each([false, undefined, null, "reject"])("does not mistake cold result %s for display cache", async result => {
  const s = setup(), read = vi.fn(async () => { if (result === "reject") throw new Error("offline"); return result; });
  s.visit("home"); await s.window.run("A", "cold", read).catch(() => {});
  await s.window.run("A", "cold", read).catch(() => {}); expect(read).toHaveBeenCalledTimes(1);
  s.burst(); await s.window.run("A", "cold", read).catch(() => {}); expect(read).toHaveBeenCalledTimes(2);
});

it("void owners prove a live cache at settlement and again at reuse", async () => {
  const s = setup(); let ready = false;
  const read = vi.fn(async () => { ready = true; });
  s.visit("home"); await s.window.run("A", "void", read, undefined, () => ready);
  s.burst(); await s.window.run("A", "void", read); expect(read).toHaveBeenCalledTimes(1);
  ready = false; s.visit("me", true); await s.window.run("A", "void", read); expect(read).toHaveBeenCalledTimes(2);
});

it("manual fresh failure supersedes success, and a later current visit can recover", async () => {
  const s = setup(), read = vi.fn(async () => 1);
  s.visit("home"); await s.window.run("A", "read", read); s.burst();
  s.window.invalidate("read"); const manual = Promise.reject(new ApiError({ kind: "http", status: 401, message: "expired" }));
  await expect(s.window.remember("A", "read", manual)).rejects.toMatchObject({status:401});
  s.visit("me", true); await s.window.run("A", "read", read); expect(read).toHaveBeenCalledTimes(2);
});

it.each([0, 2_000, undefined])("uses HTTP429 deadline without a fixed cache floor (%s)", async retryAfterMs => {
  const s = setup(), read = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new ApiError({ kind: "http", status:429, message:"limited", retryAfterMs })).mockResolvedValue(1);
  s.visit("home"); await expect(s.window.run("A", "read", read)).rejects.toMatchObject({status:429});
  const deadline = retryAfterMs ?? 30_000;
  if (deadline > 0) { s.setTime(deadline - 1); s.visit("earn"); await expect(s.window.run("A", "read", read)).rejects.toMatchObject({status:429}); expect(read).toHaveBeenCalledTimes(1); }
  s.setTime(deadline); s.visit("team"); expect(await s.window.run("A", "read", read)).toBe(1); expect(read).toHaveBeenCalledTimes(2);
});

it("a new identity never reuses protected old results or revives a superseded ABA attempt", async () => {
  const s=setup(); let finish!:(value:string)=>void;
  const old=s.window.run("A:1","read",()=>new Promise<string>(done=>{finish=done})); s.burst();
  await s.window.run("B:2","read",async()=>"B"); await s.window.run("A:3","read",async()=>"new");
  finish("old"); await old; expect(await s.window.run("A:3","read",async()=>"wrong")).toBe("new");
});

it("shares a preinstalled real promise during synchronous same-key reentry", async () => {
  const window=createPassiveReadWindow(); let nested!:Promise<number>; const redundant=vi.fn(async()=>99);
  const first=window.run("A","read",()=>{nested=window.run("A","read",redundant);return Promise.resolve(1)});
  expect(nested).toBe(first); expect(await nested).toBe(1); expect(redundant).not.toHaveBeenCalled();
});

it.each(["scope-ABA","invalidate","manual-supersede"])("cannot revive an old attempt after synchronous %s",async boundary=>{
  const window=createPassiveReadWindow();let finish!:(value:string)=>void,current!:Promise<string>;
  const first=window.run("A","read",()=>{
    if(boundary==="scope-ABA") {void window.run("B","read",async()=>"B");current=window.run("A","read",async()=>"current");}
    else {window.invalidate("read");if(boundary==="manual-supersede")current=window.remember("A","read",Promise.resolve("current"));}
    return new Promise<string>(done=>{finish=done});
  });
  if(boundary==="invalidate")current=window.run("A","read",async()=>"current");
  expect(await current).toBe("current");finish("old");expect(await first).toBe("old");
  expect(await window.run("A","read",async()=>"wrong")).toBe("current");
});
