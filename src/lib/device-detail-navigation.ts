export function deviceDetailBackHref(source: unknown): string {
  return source === "home" ? "/pages/index/index" : "/pages/earn/earn";
}
