import type { PurchaseEligibilitySnapshot } from "@/api/purchase-eligibility-api";

// Sanitized TEST response captured for C24; thresholds are server facts, not PRD defaults.
export const rackPurchaseEligibility = {
  "productNo": "stellarrack-p1",
  "eligible": false,
  "decisionCode": "F4B_REQUIREMENTS_NOT_MET",
  "policies": [
    {
      "policy": "E1",
      "eligible": true,
      "decisionCode": "ELIGIBLE",
      "mode": "ALL",
      "conditions": []
    },
    {
      "policy": "F4B",
      "eligible": false,
      "decisionCode": "F4B_REQUIREMENTS_NOT_MET",
      "mode": "ALL",
      "conditions": [
        {
          "kind": "activeDirect",
          "required": 8,
          "current": 10,
          "gap": 0,
          "met": true
        },
        {
          "kind": "teamComputePoints",
          "required": 800000,
          "current": 118526,
          "gap": 681474,
          "met": false
        },
        {
          "kind": "monthlyQuota",
          "required": 80,
          "current": 1,
          "gap": 79,
          "met": true
        }
      ]
    }
  ],
  "evaluatedAt": 1793359044856,
  "source": "nx_product + nx_admin_device_sku + nx_user",
  "sourceEnvironment": "PRODUCTION",
  "runId": null,
  "serverCanonical": true
} satisfies PurchaseEligibilitySnapshot;
