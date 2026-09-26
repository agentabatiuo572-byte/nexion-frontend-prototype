/** Display old catalog labels with the current brand; never rewrite stored records or custom names. */
export function brandProductName(name: string): string {
  return /^NexGrid(?:Box (?:S1|Pro(?: v2)?)|Rack P[12])$/.test(name)
    ? name.replace(/^NexGrid/, "UVEL")
    : name;
}

export function brandOrderNote(note: string | undefined): string | undefined {
  return note === "Device live · joined NexGrid network" ? "Device live · joined UVEL network" : note;
}

/** Mask the legacy mock invite prefix for display; keep the real code for sharing. */
export function displayReferralCode(code: string): string {
  const legacy = /^NEXGRID-([A-Z0-9]{4})$/i.exec(code);
  return legacy ? `••••-${legacy[1]}` : code;
}

export function containsLegacyBrand(text: string): boolean {
  return /nexgrid/i.test(text);
}

export function isLegacyBrandUrl(value: string): boolean {
  if (containsLegacyBrand(value)) return true;
  try {
    return /(^|\.)nexgrid\.(ai|io)$/i.test(new URL(value).hostname.replace(/\.+$/, ""));
  } catch {
    return false;
  }
}

/** Resolve the bundled image before painting so a failed asset cannot produce a successful blank logo. */
export function loadPosterBrand(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.getImageInfo({
      src: "/static/img/brand/header-logo-dark.png",
      success: ({ path }) => resolve(path),
      fail: reject,
    });
  });
}
