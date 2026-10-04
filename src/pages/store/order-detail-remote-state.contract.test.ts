import { describe, expect, it } from "vitest";
import detailSource from "./order-detail.vue?raw";

describe("remote order detail presentation", () => {
  it("keeps an activated order's earn entry without repeating its activation hint", () => {
    expect(detailSource).toContain('v-if="order.status === \'provisioning\'"');
    expect(detailSource).toContain('v-if="order.status === \'activated\'"');
    expect(detailSource).toContain("{{ activatedHint }}");
    expect(detailSource).toContain('@click.stop="goEarn"');
  });

  it("does not call a valid remote deep link missing while its scoped read is pending or failed", () => {
    expect(detailSource).toContain("const remoteOrderAttempted = ref(false);");
    expect(detailSource).toContain("const showRemoteOrderLoading = computed");
    expect(detailSource).toContain("const showOrderNotFound = computed");
    expect(detailSource).toContain('v-if="showRemoteOrderLoading"');
    expect(detailSource).toContain('v-else-if="showOrderNotFound"');
    expect(detailSource).toContain('v-else-if="order"');
    expect(detailSource).toContain("remoteOrderBoundAccount.value && remoteOrderAttempted.value");
    expect(detailSource).toContain("!remoteOrderRefreshing.value && !remoteOrderError.value");
    expect(detailSource).toContain("orders.ensureRemoteOrder(id.value)");
    expect(detailSource).toContain("isCurrentDetailScope(scope)");
  });

  it("waits for cold-start session restoration to bind the remote account, then rereads the deep link", () => {
    expect(detailSource).toContain('import { ref, computed, watch, onUnmounted');
    expect(detailSource).toContain('import { useAuth } from "@/store/auth"');
    expect(detailSource).toContain("const remoteOrderBinding = computed");
    expect(detailSource).toContain("const remoteOrderBoundAccount = computed");
    expect(detailSource).toContain("boundAccountKey === accountKey");
    expect(detailSource).toContain("orders.currentAccountBindingRevision()");
    expect(detailSource).toContain("watch(remoteOrderBinding, (binding, previousBinding) => {");
    expect(detailSource).toContain("binding.revision === previousBinding.revision");
    expect(detailSource).toContain("void refreshOrder();");
    expect(detailSource).toContain("!remoteOrderBoundAccount.value");
    expect(detailSource).toContain("remoteOrderBoundAccount.value && remoteOrderAttempted.value");
  });
});
