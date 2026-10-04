/** Only used by the async page error boundary, never by API request handling. */
export function classifyPageLoadError(error: unknown): "module" | "timeout" | "unknown" {
  const message = error instanceof Error ? error.message : "";
  if (/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(message)) return "module";
  if (/^Async component timed out after \d+ms\.$/.test(message)) return "timeout";
  return "unknown";
}

/** Manual recovery only. Keep the current URL and existing session storage intact. */
export function createPageReload(reload: () => void): () => boolean {
  let requested = false;
  return () => {
    if (requested) return false;
    requested = true;
    try {
      reload();
      return true;
    } catch {
      requested = false;
      return false;
    }
  };
}
