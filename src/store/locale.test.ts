import { beforeEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useLocaleStore } from "./locale";
import { LOCALES } from "@/i18n";
beforeEach(() => {
 vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn() });
 setActivePinia(createPinia());
});
test("Chinese, English and Vietnamese are offered",()=>expect(LOCALES.map(x=>x.code)).toEqual(["zh","en","vi"]));
test.each(["zh-CN","vi-VN","en-US"])("fresh %s device defaults to Chinese",language=>{
 vi.stubGlobal("uni",{getStorageSync:()=>"",setStorageSync:vi.fn(),getSystemInfoSync:()=>({language})});
 expect(useLocaleStore().code).toBe("zh");
});
test("unsupported server and explicit locale fall back to Chinese",()=>{
 const store=useLocaleStore();store.applyServerLocale("ja");expect(store.code).toBe("zh");
 expect(store.explicitRevision).toBe(0);store.setLocale("ja");expect(store.code).toBe("zh");
});
test.each([{code:"ja",userSet:true},{code:"en",userSet:false},{code:"vi",userSet:false}])("migrates unsupported or automatic preferences to Chinese: %j",saved=>{
 const setStorageSync=vi.fn();vi.stubGlobal("uni",{getStorageSync:()=>saved,setStorageSync});
 expect(useLocaleStore().code).toBe("zh");expect(setStorageSync).toHaveBeenCalledWith("nexgrid-locale-v1",{code:"zh",userSet:false});
});
test.each(["zh","en","vi"] as const)("keeps an explicit %s choice across startup",code=>{
 vi.stubGlobal("uni",{getStorageSync:()=>({code,userSet:true}),setStorageSync:vi.fn()});
 const store=useLocaleStore();expect(store.code).toBe(code);store.ensureSystemDetected();expect(store.code).toBe(code);
 store.applyServerLocale("zh");expect(store.code).toBe("zh");expect(store.explicitRevision).toBe(0);
});
