const COURSE_PATH = "/pages/learn/course";
const REWARDS_SOURCE = "rewards-uvt";

export function courseRewardHref(id: string): string {
  return `${COURSE_PATH}?id=${encodeURIComponent(id)}&source=${REWARDS_SOURCE}`;
}

function courseBackTarget(source: string | null | undefined): string {
  if (source === "home") return "/pages/index/index";
  if (source === "missions") return "/pages/missions/missions";
  return source === REWARDS_SOURCE ? "/pages/me/rewards-list?cat=uvt" : "/pages/learn/courses";
}

export function resolveCourseNavigation(options: Record<string, string> | undefined, queryString: string) {
  const query = new URLSearchParams(queryString);
  const id = typeof options?.id === "string" ? options.id : (query.get("id") ?? "");
  const storedSource = typeof options?.source === "string" ? options.source : query.get("source");
  const source = storedSource === "rewards-nex" ? REWARDS_SOURCE : storedSource;
  return { id, source: source === REWARDS_SOURCE || source === "home" || source === "missions" ? source : null, back: courseBackTarget(source) };
}

export function preserveCourseSourceInH5(id: string, source: string | null): void {
  if (!id || (source !== REWARDS_SOURCE && source !== "home" && source !== "missions") || typeof window === "undefined" || typeof window.history?.replaceState !== "function") return;
  const hash = window.location.hash.replace(/^#/, "");
  const question = hash.indexOf("?");
  if ((question < 0 ? hash : hash.slice(0, question)) !== COURSE_PATH) return;
  const query = new URLSearchParams(question < 0 ? "" : hash.slice(question + 1));
  if (query.get("id") && query.get("id") !== id) return;
  if (query.get("id") === id && query.get("source") === source) return;
  query.set("id", id);
  query.set("source", source);
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${COURSE_PATH}?${query}`);
}
