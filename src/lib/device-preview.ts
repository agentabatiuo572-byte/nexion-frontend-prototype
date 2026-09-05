export const H5_DEVICE_PREVIEW_STATUS_BAR_HEIGHT = 54;

export function h5DevicePreviewStatusBarHeight(): number {
  // #ifdef H5
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("nx_device_inner") === "1" ? H5_DEVICE_PREVIEW_STATUS_BAR_HEIGHT : 0;
  } catch {
    return 0;
  }
  // #endif
  return 0;
}

export function h5StatusBarHeightCss(fallback = "env(safe-area-inset-top, 0px)"): string {
  const previewHeight = h5DevicePreviewStatusBarHeight();
  return previewHeight > 0 ? `${previewHeight}px` : fallback;
}
