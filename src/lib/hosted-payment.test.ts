import { expect, test, vi } from "vitest";
import {
  findResumablePaymentIntent,
  openHostedPaymentPage,
  validateHostedPaymentUrl,
} from "./hosted-payment";

test("accepts a public HTTPS hosted payment URL", () => {
  expect(validateHostedPaymentUrl(
    "https://api.hdpayadmin.com/placeAnOrder?orderId=1826145351742570496",
  )).toBe("https://api.hdpayadmin.com/placeAnOrder?orderId=1826145351742570496");
});

test.each([
  "http://api.hdpayadmin.com/placeAnOrder?orderId=1",
  "https://user:pass@api.hdpayadmin.com/placeAnOrder?orderId=1",
  "https://127.0.0.1/pay",
  "https://192.168.1.2/pay",
  "https://evil.example/pay",
  "https://api.hdpayadmin.com.evil.example/pay",
  "https://api.hdpayadmin.com/pay#secret",
])("rejects an unsafe hosted payment URL: %s", (url) => {
  expect(validateHostedPaymentUrl(url)).toBeNull();
});

test("opens the validated page with the injected platform adapter", () => {
  const open = vi.fn();

  expect(openHostedPaymentPage("https://api.hdpayadmin.com/pay?id=1", { open })).toBe(true);
  expect(open).toHaveBeenCalledWith("https://api.hdpayadmin.com/pay?id=1");
});

test("does not call the platform adapter for an unsafe URL", () => {
  const open = vi.fn();

  expect(openHostedPaymentPage("javascript:alert(1)", { open })).toBe(false);
  expect(open).not.toHaveBeenCalled();
});

test("selects an awaiting hosted order after a cold server refresh", () => {
  const resumable = findResumablePaymentIntent([
    { intentId: "old", status: "credited" },
    { intentId: "hosted", status: "awaiting_payment", paymentMode: "hosted" },
  ]);

  expect(resumable).toMatchObject({ intentId: "hosted" });
});
