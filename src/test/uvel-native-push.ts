// Test-only stand-in for the native push uni_module, which ships no JS entry for Node.
// Every call reports push as unavailable; nothing is registered.
import type { NativePushResult } from "@/uni_modules/uvel-native-push";

const unavailable: NativePushResult = { available: false };

export function initializeNativePush(_config: Record<string, unknown>): void {}
export function getNativePushToken(callback: (result: NativePushResult) => void): void { callback(unavailable); }
export function getNativePushPermission(callback: (result: NativePushResult) => void): void { callback(unavailable); }
export function requestNativePushPermission(callback: (result: NativePushResult) => void): void { callback(unavailable); }
export function addNativePushListener(_callback: (event: NativePushResult) => void): number { return 0; }
export function removeNativePushListener(_id: number): void {}
export function getInitialNotification(callback: (result: NativePushResult) => void): void { callback(unavailable); }
export function shutdownNativePush(): void {}
