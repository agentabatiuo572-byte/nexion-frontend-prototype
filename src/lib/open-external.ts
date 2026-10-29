/** Opens an already-validated absolute URL outside the app (new tab on H5, system browser in the app). */
export function openExternalUrl(url: string): boolean {
  let opened = false;
  // #ifdef H5
  opened = !!window.open(url, "_blank");
  // #endif
  // #ifndef H5
  const runtime = (globalThis as { plus?: { runtime?: { openURL: (target: string) => void } } }).plus?.runtime;
  if (runtime) { runtime.openURL(url); opened = true; }
  // #endif
  return opened;
}
