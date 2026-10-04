import type { Messages } from "@/i18n/messages/en";

type PhoneActivationCopy = Pick<Messages["myDevices"],
  | "phoneActivationTitle" | "phoneActivationBody"
  | "phoneActivationAppOnlyTitle" | "phoneActivationAppOnlyBody"
  | "phoneActivationNativeUnavailableTitle" | "phoneActivationNativeUnavailableBody">;

export function resolvePhoneActivationGuidance(nativeAvailable: boolean, copy: PhoneActivationCopy): { title: string; body: string } {
  // #ifdef H5
  return { title: copy.phoneActivationAppOnlyTitle, body: copy.phoneActivationAppOnlyBody };
  // #endif
  // #ifndef H5
  return nativeAvailable
    ? { title: copy.phoneActivationTitle, body: copy.phoneActivationBody }
    : { title: copy.phoneActivationNativeUnavailableTitle, body: copy.phoneActivationNativeUnavailableBody };
  // #endif
}
