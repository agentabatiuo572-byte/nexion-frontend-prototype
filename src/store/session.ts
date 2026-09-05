import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { getDeviceIdentity, _devResetDeviceIdentity } from "@/lib/device-id";
import { getEntrySurface, type EntrySurface } from "@/lib/entry-surface";
import { normalizeAccountKey } from "@/store/account-cloud";
import { mockServerUuid } from "./mock-id";

/**
 * SPEC-4 account session store.
 *
 * The old mock used one shared "active session" record and kicked any different
 * device that signed in later. PC compute + phone app + H5 account viewing need
 * the opposite: sessions coexist under one account, while explicit sign-out and
 * ops revoke still end the affected session.
 *
 * Backend-replaceable contract:
 *   POST /api/auth/signin  → { token, sessionId, deviceId, requiresRecalibration }
 *   GET  /api/auth/session → { sessionId, status, killedAt, entrySurface }
 *   GET  /api/account/sessions → active session list for security settings
 *   POST /api/auth/logout  → ends the current session only
 *   POST /api/account/sessions/:id/revoke → kills the selected session
 */

const SESSION_REGISTRY_KEY = "nexgrid-account-sessions-v1";
const LEGACY_ACTIVE_KEY = "nexgrid-active-session-v1";
const CALIBRATED_KEY = "nexgrid-calibrated-device-v1"; // { [accountKey]: deviceId }

export type SessionStatus = "active" | "kicked" | "logged-out";
export type KickReason = "kicked" | "logged-out" | null;

export interface AccountSessionRecord {
  sessionId: string;
  accountKey: string;
  deviceId: string;
  deviceName: string;
  entrySurface: EntrySurface;
  loginAt: number;
  lastSeenAt: number;
  killedAt?: number | null;
  endedAt?: number | null;
}

interface SessionRegistry {
  schema: 1;
  sessions: Record<string, AccountSessionRecord>;
}

export interface SessionListItem {
  id: string;
  deviceName: string;
  device: string;
  location: string;
  ip: string;
  lastActiveMs: number;
  current: boolean;
  entrySurface: EntrySurface;
}

function readRegistry(): SessionRegistry {
  try {
    const r = uni.getStorageSync(SESSION_REGISTRY_KEY) as SessionRegistry | "";
    if (r && typeof r === "object" && r.schema === 1 && r.sessions) return r;
  } catch {
    // first run
  }
  return { schema: 1, sessions: {} };
}

function writeRegistry(registry: SessionRegistry): void {
  try {
    uni.setStorageSync(SESSION_REGISTRY_KEY, registry);
  } catch {
    // storage unavailable
  }
}

function forgetLegacyActiveRecord(): void {
  try {
    uni.removeStorageSync(LEGACY_ACTIVE_KEY);
  } catch {
    // ignore
  }
}

function readCalibratedMap(): Record<string, string> {
  try {
    const m = uni.getStorageSync(CALIBRATED_KEY) as Record<string, string> | "";
    if (m && typeof m === "object") return m;
  } catch {
    // ignore
  }
  return {};
}

function writeCalibratedMap(m: Record<string, string>): void {
  try {
    uni.setStorageSync(CALIBRATED_KEY, m);
  } catch {
    // ignore
  }
}

export function readAccountSessionRecords(accountKey: string): AccountSessionRecord[] {
  const key = normalizeAccountKey(accountKey);
  return Object.values(readRegistry().sessions)
    .filter((s) => s.accountKey === key && !s.endedAt && !s.killedAt)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

function sessionSeenAt(rec: AccountSessionRecord): number {
  return rec.lastSeenAt || rec.loginAt || 0;
}

function endSameDeviceSessions(
  registry: SessionRegistry,
  accountKey: string,
  deviceId: string,
  entrySurface: EntrySurface,
  exceptSessionId: string,
  now: number,
): boolean {
  let changed = false;
  Object.entries(registry.sessions).forEach(([id, rec]) => {
    if (
      id !== exceptSessionId &&
      rec.accountKey === accountKey &&
      rec.deviceId === deviceId &&
      rec.entrySurface === entrySurface &&
      !rec.endedAt &&
      !rec.killedAt
    ) {
      registry.sessions[id] = { ...rec, endedAt: now };
      changed = true;
    }
  });
  return changed;
}

export const useSession = defineStore("session", () => {
  const identity = getDeviceIdentity();
  const sessionId = ref("");
  const accountKey = ref("default");
  const deviceId = ref(identity.deviceId);
  const deviceName = ref(identity.deviceName);
  const entrySurface = ref<EntrySurface>(getEntrySurface());
  const status = ref<SessionStatus>("active");
  const kickedReason = ref<KickReason>(null);
  const requiresRecalibration = ref(false);
  const sessionRevision = ref(0);

  const activeSessions = computed<SessionListItem[]>(() => {
    // Touch the revision so computed refreshes after registry writes.
    void sessionRevision.value;
    return readAccountSessionRecords(accountKey.value).map((s) => ({
      id: s.sessionId,
      deviceName: s.deviceName,
      device: s.deviceName,
      location: "",
      ip: "",
      lastActiveMs: s.lastSeenAt,
      current: s.sessionId === sessionId.value,
      entrySurface: s.entrySurface,
    }));
  });

  function bump() {
    sessionRevision.value += 1;
  }

  function writeSession(rec: AccountSessionRecord): void {
    const registry = readRegistry();
    registry.sessions[rec.sessionId] = rec;
    writeRegistry(registry);
    bump();
  }

  function claim(rawAccountKey: string, surface: EntrySurface = getEntrySurface()): { requiresRecalibration: boolean } {
    forgetLegacyActiveRecord();
    const id = getDeviceIdentity();
    const key = normalizeAccountKey(rawAccountKey);
    const sid = mockServerUuid();
    const now = Date.now();

    accountKey.value = key;
    deviceId.value = id.deviceId;
    deviceName.value = id.deviceName;
    entrySurface.value = surface;
    sessionId.value = sid;
    status.value = "active";
    kickedReason.value = null;

    const registry = readRegistry();
    endSameDeviceSessions(registry, key, id.deviceId, surface, sid, now);
    registry.sessions[sid] = {
      sessionId: sid,
      accountKey: key,
      deviceId: id.deviceId,
      deviceName: id.deviceName,
      entrySurface: surface,
      loginAt: now,
      lastSeenAt: now,
      killedAt: null,
      endedAt: null,
    };
    writeRegistry(registry);
    bump();

    const calibrated = readCalibratedMap()[key];
    requiresRecalibration.value = !!calibrated && calibrated !== id.deviceId;
    return { requiresRecalibration: requiresRecalibration.value };
  }

  function resumeOrClaim(rawAccountKey: string, surface: EntrySurface = getEntrySurface()): {
    requiresRecalibration: boolean;
    status: SessionStatus;
  } {
    forgetLegacyActiveRecord();
    const id = getDeviceIdentity();
    const key = normalizeAccountKey(rawAccountKey);
    const registry = readRegistry();
    const matches = Object.values(registry.sessions)
      .filter((s) => s.accountKey === key && s.deviceId === id.deviceId && s.entrySurface === surface)
      .sort((a, b) => sessionSeenAt(b) - sessionSeenAt(a));

    const rec = matches[0];
    if (!rec) {
      const result = claim(key, surface);
      return { ...result, status: "active" };
    }

    accountKey.value = key;
    deviceId.value = id.deviceId;
    deviceName.value = id.deviceName;
    entrySurface.value = surface;
    sessionId.value = rec.sessionId;

    const now = Date.now();
    const changed = endSameDeviceSessions(registry, key, id.deviceId, surface, rec.sessionId, now);
    if (rec.killedAt || rec.endedAt) {
      status.value = rec.killedAt ? "kicked" : "logged-out";
      kickedReason.value = rec.killedAt ? "kicked" : "logged-out";
      requiresRecalibration.value = false;
      if (changed) writeRegistry(registry);
      bump();
      return { requiresRecalibration: false, status: status.value };
    }

    registry.sessions[rec.sessionId] = { ...rec, deviceName: id.deviceName, lastSeenAt: now };
    writeRegistry(registry);
    status.value = "active";
    kickedReason.value = null;
    const calibrated = readCalibratedMap()[key];
    requiresRecalibration.value = !!calibrated && calibrated !== id.deviceId;
    bump();
    return { requiresRecalibration: requiresRecalibration.value, status: "active" };
  }

  function validate(): SessionStatus {
    if (!sessionId.value) {
      status.value = "active";
      return "active";
    }
    const registry = readRegistry();
    const rec = registry.sessions[sessionId.value];
    if (!rec) {
      status.value = "logged-out";
      kickedReason.value = "logged-out";
      return "logged-out";
    }
    if (rec.killedAt) {
      status.value = "kicked";
      kickedReason.value = "kicked";
      return "kicked";
    }
    if (rec.endedAt) {
      status.value = "logged-out";
      kickedReason.value = "logged-out";
      return "logged-out";
    }
    registry.sessions[sessionId.value] = { ...rec, lastSeenAt: Date.now() };
    writeRegistry(registry);
    status.value = "active";
    bump();
    return "active";
  }

  function markCalibrated(rawAccountKey: string): void {
    const key = normalizeAccountKey(rawAccountKey);
    const map = readCalibratedMap();
    map[key] = deviceId.value;
    writeCalibratedMap(map);
    requiresRecalibration.value = false;
  }

  function signOutSession(): void {
    const registry = readRegistry();
    const rec = registry.sessions[sessionId.value];
    if (rec) {
      registry.sessions[sessionId.value] = { ...rec, endedAt: Date.now() };
      writeRegistry(registry);
    }
    sessionId.value = "";
    status.value = "logged-out";
    kickedReason.value = "logged-out";
    bump();
  }

  function revokeSession(id: string): void {
    const registry = readRegistry();
    const rec = registry.sessions[id];
    if (!rec || rec.accountKey !== accountKey.value) return;
    registry.sessions[id] = { ...rec, killedAt: Date.now() };
    writeRegistry(registry);
    bump();
  }

  function revokeAllOtherSessions(): void {
    const registry = readRegistry();
    Object.entries(registry.sessions).forEach(([id, rec]) => {
      if (rec.accountKey === accountKey.value && id !== sessionId.value && !rec.endedAt && !rec.killedAt) {
        registry.sessions[id] = { ...rec, killedAt: Date.now() };
      }
    });
    writeRegistry(registry);
    bump();
  }

  function kick(reason: Exclude<KickReason, null>): void {
    status.value = "kicked";
    kickedReason.value = reason;
  }

  function _devSimulateOtherDeviceLogin(): void {
    if (import.meta.env.PROD) return; // 异地登录模拟入口,store 层二层 guard(硬规则5)
    const sid = mockServerUuid();
    writeSession({
      sessionId: sid,
      accountKey: accountKey.value,
      deviceId: mockServerUuid(),
      deviceName: "Another device",
      entrySurface: "h5",
      loginAt: Date.now(),
      lastSeenAt: Date.now(),
      killedAt: null,
      endedAt: null,
    });
  }

  function _devRevokeCurrentSession(): void {
    if (import.meta.env.PROD) return; // 会话撤销入口,store 层二层 guard(硬规则5)
    if (sessionId.value) revokeSession(sessionId.value);
  }

  function _devForgetDevice(): void {
    if (import.meta.env.PROD) return; // 设备身份重置入口,store 层二层 guard(硬规则5)
    _devResetDeviceIdentity();
  }

  return {
    sessionId, accountKey, deviceId, deviceName, entrySurface, status, kickedReason,
    requiresRecalibration, activeSessions,
    claim, resumeOrClaim, validate, markCalibrated, signOutSession, revokeSession, revokeAllOtherSessions, kick,
    _devSimulateOtherDeviceLogin, _devRevokeCurrentSession, _devForgetDevice,
  };
});
