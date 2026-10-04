/** Static instructional copy is reserved for explicit local/mock runtime only. */
export function howContentMode(remote: boolean): "published" | "local" {
  return remote ? "published" : "local";
}
