import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { decodePaymentEvents } from './paymentCapture';

type InboxModule = {
  getStatus(): string; list(): string; start(): void; stop(): void; clear(): void;
  acknowledge(ids: string[]): void; openSettings(): void; requestReminderPermission(): void;
  openOverlaySettings(): void; setOverlayEnabled(enabled: boolean): void;
  previewOverlay(): void;
};
export type CaptureDiagnostics = { listenerConnected: boolean; paymentNoticeAt: number; candidateAt: number; overlayAttemptAt: number; overlayResult: string; previewScheduled: boolean; noticeAppState: string };
export type InboxStatus = { allowed: boolean; active: boolean; remainingSeconds: number; events: number; skipped: number; queued: number; reminders: boolean; overlayAllowed: boolean; overlayEnabled: boolean; diagnostics?: CaptureDiagnostics };
const inboxModule = Platform.OS === 'android' && Number(Platform.Version) >= 28 ? requireOptionalNativeModule<InboxModule>('SavePiggyPaymentInbox') : null;

export const paymentInbox = {
  supported: inboxModule !== null,
  status: (): InboxStatus | null => inboxModule ? JSON.parse(inboxModule.getStatus()) : null,
  list: () => inboxModule ? decodePaymentEvents(inboxModule.list()) : [],
  start: () => inboxModule?.start(),
  stop: () => inboxModule?.stop(),
  clear: () => inboxModule?.clear(),
  acknowledge: (ids: string[]) => inboxModule?.acknowledge(ids),
  openSettings: () => inboxModule?.openSettings(),
  requestReminders: () => inboxModule?.requestReminderPermission(),
  openOverlaySettings: () => inboxModule?.openOverlaySettings(),
  setOverlayEnabled: (enabled: boolean) => inboxModule?.setOverlayEnabled(enabled),
  previewOverlay: () => inboxModule?.previewOverlay(),
};
