// ⚠️ DEV/DEMO-ONLY — SPEC-7 演示桥。
// mock 双端不真打通(DR-7),后台 K1/D2 的处置结论无法真实下发到前端;
// 本桥在 DEV 构建把「模拟服务端下发」的钩子挂到 window,供:
//   - P3/P6 运行时验收(Playwright 调用)
//   - 演示脚本 S4(配置失败)/ S5(解除误判 + 人工放行)
// PROD 构建不挂载;所有钩子只调 _dev 前缀函数,不引入新业务路径。
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { _devSetClusterStatus, evaluateAccountCluster, type ClusterStatus } from "@/store/risk-cluster";
import { recordAttestation, getRiskRecord } from "@/store/risk-identity";
import { listLedgerEntries } from "@/store/earning-release";
import { _devSetEligibilityTimeout } from "@/store/withdrawal-eligibility";

export function mountSpec7DevBridge(): void {
  if (!import.meta.env.DEV) return;
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>).__nexgridSpec7Dev = {
    /** 模拟 K1 处置下发: status=frozen/released/flagged,null 清除。 */
    setClusterStatus(accountKey: string, status: ClusterStatus | null) {
      _devSetClusterStatus(accountKey, status);
    },
    /** 模拟 D2 人工放行当前账户全部待审收益。 */
    grantManualRelease() {
      useApp()._devGrantManualRelease();
    },
    /** 模拟配置拉取失败/恢复(FEAT-RISK02 异常3)。 */
    setConfigSyncFailed(value: boolean) {
      useConfig()._devSetConfigSyncFailed(value);
    },
    /** 模拟提现前置评估超时(FEAT-RISK03 异常3)。 */
    setEligibilityTimeout(value: boolean) {
      _devSetEligibilityTimeout(value);
    },
    /** 模拟 App 在线证明累计(小时)。 */
    grantAttestation(accountKey: string, hours: number) {
      recordAttestation(accountKey, hours * 3600 * 1000);
    },
    /** 观测口: 当前账户实时簇评估 / 身份记录 / 台账(只读)。 */
    inspect(accountKey: string) {
      return {
        cluster: evaluateAccountCluster(accountKey),
        record: getRiskRecord(accountKey),
        ledger: listLedgerEntries(accountKey),
      };
    },
  };
}
