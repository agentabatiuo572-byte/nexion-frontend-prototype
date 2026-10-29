import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import ts from "typescript";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Device } from "@/store/types";
import baySource from "@/components/home/device-slot.vue?raw";
import inventorySource from "@/components/me/device-inventory-row.vue?raw";
import { en } from "@/i18n/messages/en";

const f = vi.hoisted(() => ({ products: [] as any[], validProof: true, cachedProductImage: vi.fn(), revalidateProductCatalog: vi.fn() }));
vi.mock("@/mock/products", () => ({ getProduct: (id: string) => f.products.find(product => product.id === id) }));
vi.mock("@/store/product-catalog", async () => {
  const { reactive, shallowRef } = await import("vue");
  return { productCatalogState: reactive({ status: "ready" }), productCatalogPresentation: shallowRef(null),
    isProductCatalogDisplayCurrent: () => f.validProof, revalidateProductCatalog: f.revalidateProductCatalog };
});
vi.mock("@/composables/use-tab-page-lifecycle", () => ({ onShow: (show: () => void) => show() }));
vi.mock("@/lib/product-image-cache", () => ({ cachedProductImage: f.cachedProductImage, invalidateProductImage: vi.fn(), productImageCacheKey: (url: string) => url.split("?")[0] }));
import { productCatalogPresentation, productCatalogState } from "@/store/product-catalog";
import { useDeviceProductImage } from "./use-device-product-image";
import { useProductImage } from "./use-product-image";

const scopes: Vue.EffectScope[] = [];
beforeEach(() => {
  vi.clearAllMocks(); f.validProof = true; f.cachedProductImage.mockImplementation(async url => url);
  f.products = [
    { id: "stellarbox-pro", imageUrl: "https://catalog.example/pro" },
    { id: "stellarbox-pro-v2", imageUrl: "https://catalog.example/pro-v2" },
    { id: "cloud-share", imageUrl: "https://catalog.example/cloud-unlimited" },
    { id: "cloud-finite-600", imageUrl: "https://catalog.example/cloud-finite-600" },
  ];
  productCatalogState.status = "ready";
  (productCatalogPresentation as any).value = { products: f.products };
});
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()));
function scoped<T>(run: () => T): T { const scope = Vue.effectScope(); scopes.push(scope); return scope.run(run)!; }
const nodes = (node: Vue.VNode): Vue.VNode[] => [node, ...(Array.isArray(node.children) ? node.children.flatMap(child => Vue.isVNode(child) ? nodes(child) : []) : [])];

function mount(raw: string, device: Device) {
  const descriptor = parse(raw).descriptor;
  const code = ts.transpileModule(compileScript(descriptor, { id: "exact-sku-image" }).content,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const render = new Function("Vue", compile(descriptor.template!.content, { mode: "function", prefixIdentifiers: true, isCustomElement: () => true }).code)(Vue);
  const modules: Record<string, unknown> = { vue: Vue, "@/composables/use-device-product-image": { useDeviceProductImage },
    "@/i18n/use-t": { useT: () => Vue.ref(en) }, "@/lib/amount-display": { formatAmount: String },
    "@/lib/device-copy": { deviceName: () => device.name, deviceGpuLabel: () => "GPU" },
    "@/lib/hashpower": { deviceOnlineState: () => "online" }, "@/i18n/format": { fmtMoney: String },
    "@/store/data-visibility": { useDataVisibility: () => ({ hidden: false, mask: String }) } };
  const exports: Record<string, any> = {};
  new Function("require", "exports", code)((id: string) => modules[id], exports);
  const props = Vue.reactive({ device, online: true, active: true, runtimeConfirmed: true, showAction: false });
  const view = scoped(() => exports.default.setup(props, { expose() {}, emit() {} }));
  const image = () => nodes(render(Vue.proxyRefs({ ...props, ...view }), [])).find(node => node.type === "image");
  return { image };
}

it.each([
  ["stellarbox-pro-v2", "stellarbox-pro-v2", "https://catalog.example/pro-v2"],
  ["cloud-share", "CLOUD-FINITE-600", "https://catalog.example/cloud-finite-600"],
] as const)("Home/Earn bay and warehouse use the same storefront asset for %s/%s", async (kind, productCode, expected) => {
  const device = Vue.reactive({ id: "owned", kind, productCode, name: productCode, capacitySource: "server", activatedAt: 1 } as Device);
  const bay = mount(baySource, device), inventory = mount(inventorySource, device);
  const store = scoped(() => useProductImage(() => f.products.find(product => product.imageUrl === expected)?.imageUrl));
  await Vue.nextTick();
  expect(bay.image()!.props!.src).toBe(expected); expect(inventory.image()!.props!.src).toBe(store.imageSrc.value);
  expect(f.cachedProductImage).toHaveBeenCalledWith(expected);
  bay.image()!.props!.onError(); inventory.image()!.props!.onError(); await Vue.nextTick();
  expect(bay.image()).toBeUndefined(); expect(inventory.image()).toBeUndefined();
  expect(device.productCode).toBe(productCode);
});

it("does not substitute a family image for an unavailable or missing server SKU", async () => {
  for (const productCode of ["unknown-cloud", undefined]) {
    const bay = mount(baySource, { id: "unknown", kind: "cloud-share", productCode, capacitySource: "server" } as Device);
    await Vue.nextTick(); expect(bay.image()).toBeUndefined();
  }
});

it("retains only a proved warm catalog image and clears it when display proof is invalidated", async () => {
  const bay = mount(baySource, { id: "owned", kind: "stellarbox-pro-v2", productCode: "stellarbox-pro-v2", capacitySource: "server" } as Device);
  await Vue.nextTick(); expect(bay.image()!.props!.src).toBe("https://catalog.example/pro-v2");
  f.products = []; productCatalogState.status = "error"; await Vue.nextTick();
  expect(bay.image()!.props!.src).toBe("https://catalog.example/pro-v2");
  f.validProof = false; (productCatalogPresentation as any).value = null; await Vue.nextTick();
  expect(bay.image()).toBeUndefined();
});

it("keeps the non-catalog phone artwork and requires no catalog read for it", async () => {
  const bay = mount(baySource, { id: "phone", kind: "phone", capacitySource: "server" } as Device);
  await Vue.nextTick(); expect(bay.image()!.props!.src).toBe("/static/img/home-glass-20260928/phone.webp");
  expect(f.revalidateProductCatalog).not.toHaveBeenCalled();
});
