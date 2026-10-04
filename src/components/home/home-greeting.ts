export function homeGreetingName(displayName: string, fallback: string): string {
  return displayName.trim() || fallback;
}
