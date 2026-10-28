import * as Vue from "vue";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { flush, mountEntry } from "@/lib/entry-review.test-support";
import { zh } from "@/i18n/messages/zh";
import { validateDeveloperAccess } from "./developer-form-validation";
import source from "./developer.vue?raw";

function execute(block: string, bindings: Record<string, unknown>, result: string) {
  const js = ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return ${result};`)(...Object.values(bindings));
}

it("keeps the branded primary action keyboard-operable and suppresses duplicate pending requests", async () => {
  const submitting = Vue.ref(false), canSubmitAccessRequest = Vue.ref(true), accessIssue = Vue.ref(null);
  const toast = { warn: vi.fn(), info: vi.fn() }, api = { submit: vi.fn() };
  const handlerBlock = source.slice(source.indexOf("async function submitRequest()"), source.indexOf("function loadLatestRequest()"));
  const submitRequest = execute(handlerBlock, { submitting, canSubmitAccessRequest, accessIssue, company: Vue.ref(""), email: Vue.ref(""), useCase: Vue.ref(""),
    validateDeveloperAccess, toast, t: Vue.ref(zh), remoteApiEnabled: true, developerAccessApi: api }, "submitRequest");
  const styleBlock = source.match(/const submitBtnStyle: CSSProperties = \{[\s\S]*?\n\};/)![0];
  const submitBtnStyle = execute(styleBlock, {}, "submitBtnStyle");
  const latestLoadFailed=Vue.ref(false),requestState=Vue.ref<{canReapply:boolean}|null>(null);
  const context = { t: zh, submitting, canSubmitAccessRequest, submitRequest, submitBtnStyle, latestLoadFailed, requestState };
  const button = source.match(/<view\b[^>]*:aria-label="t\.developer\.formSubmit"[^>]*>[\s\S]*?<\/view>/)![0];
  const page = mountEntry(`<template>${button}</template><script setup lang="ts">
    import { useContext } from "test:context";
    const {t, submitting, canSubmitAccessRequest, submitRequest, submitBtnStyle, latestLoadFailed, requestState} = useContext();
  </script>`, { "test:context": { useContext: () => context } });
  const control = () => page.nodes("mt-3")[0];
  expect(control().props.role).toBe("button"); expect(control().props.tabindex).toBe(0);
  expect(control().props.style).toMatchObject({ background: "var(--v5-brand)", borderRadius: "999px", minHeight: "48px" });
  const key = async (name: string) => {
    const handlers = control().props.onKeydown;
    for (const handler of Array.isArray(handlers) ? handlers : [handlers]) await handler({ key: name, preventDefault() {} });
  };
  await key("Enter"); await key(" "); expect(toast.warn).toHaveBeenCalledTimes(2);
  expect(api.submit).not.toHaveBeenCalled();
  submitting.value = true; await flush();
  expect(control().props.tabindex).toBe(-1); expect(control().props["aria-disabled"]).toBe("true"); expect(control().props["aria-busy"]).toBe("true");
  await key("Enter"); await control().props.onClick(); expect(toast.warn).toHaveBeenCalledTimes(2); expect(api.submit).not.toHaveBeenCalled();
  canSubmitAccessRequest.value = false; await flush(); expect(control().props["aria-disabled"]).toBe("true");
  requestState.value={canReapply:false}; await flush(); expect(page.nodes("mt-3")).toHaveLength(0);
  page.unmount();
});

it("retains distinct capability icon colors", () => {
  const block = source.slice(source.indexOf("const apiCards ="), source.indexOf("function newRequestKey"));
  const cards = execute(block, { computed: Vue.computed, t: Vue.ref(zh) }, "apiCards.value") as Array<{ color: string }>;
  expect(new Set(cards.map(card => card.color)).size).toBeGreaterThanOrEqual(3);
  expect(source).toContain(':stroke="c.color"');
});
