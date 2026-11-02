"use client";

/**
 * K6 操作员身份 → K6 角色映射(PRD §15)。
 * 单源 = admin 全域「身份」切换器(useActingOperator,backend-replaceable 到 session.role);
 * 切身份即改 K6 可执行流转,演示权限门控。
 */
import { useActingOperator, type ActingOperator } from "@/lib/store/admin/acting-operator-store";
import type { Role } from "@/lib/mock/admin/janus-c2/types";

export function mapRole(a: ActingOperator): Role {
  if (a.role === "super") return "admin";
  if (a.role === "risk") return a.tier === "lead" ? "senior_operator" : "operator";
  // 财务、增长、内容、客服与审计等身份默认只读;只有超级管理员可发布策略。
  return "viewer";
}

export function useK6Operator(): { id: string; role: Role } {
  const acting = useActingOperator((s) => s.acting);
  return { id: acting.name, role: mapRole(acting) };
}
