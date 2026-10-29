export interface NativePushResult {
  available?: boolean
  provider?: 'FCM' | 'APNS'
  token?: string
  notificationId?: string
  code?: string
  type?: 'token' | 'received' | 'click' | 'error'
  permission?: 'granted' | 'denied' | 'prompt' | 'unknown'
}
export function initializeNativePush(config: Record<string, unknown>): void
export function getNativePushToken(callback: (result: NativePushResult) => void): void
export function getNativePushPermission(callback: (result: NativePushResult) => void): void
export function requestNativePushPermission(callback: (result: NativePushResult) => void): void
export function addNativePushListener(callback: (event: NativePushResult) => void): number
export function removeNativePushListener(id: number): void
export function getInitialNotification(callback: (result: NativePushResult) => void): void
export function shutdownNativePush(): void
