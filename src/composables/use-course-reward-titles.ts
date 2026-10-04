import { onShow } from "@dcloudio/uni-app";
import { computed, onScopeDispose, ref, watch } from "vue";
import { learningApi } from "@/api/learning-runtime";
import { remoteApiEnabled, sessionVault } from "@/api/runtime";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { useLocaleStore } from "@/store/locale";

/** Localized exact-version names; historical source references stay on the bill. */
export function useCourseRewardTitles() {
  const app = useApp();
  const auth = useAuth();
  const locale = useLocaleStore();
  const language = computed(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code : "zh");
  const ready = computed(() => binarySessionReady({
    remote: remoteApiEnabled,
    authenticated: auth.isAuthenticated,
    accountId: auth.accountId,
    appAccountKey: app.accountKey,
    sessionUserId: sessionVault.read()?.user.userId ?? null,
  }));
  const titles = ref<Record<string, string>>({});
  let generation = 0;
  let scope = "";

  async function refresh() {
    const current = ++generation;
    const nextScope = `${auth.accountId}|${app.accountKey}|${app.accountBindingEpoch}|${language.value}`;
    if (scope !== nextScope || !ready.value) {
      scope = nextScope;
      titles.value = {};
    }
    if (!remoteApiEnabled || !ready.value) return;
    try {
      const overview = await learningApi.courses(language.value);
      if (current === generation) {
        titles.value = {
          ...Object.fromEntries(overview.courses.map((course) => [`${course.id}@${course.version}`, course.title])),
          ...overview.rewardTitles,
        };
      }
    } catch { /* Retain verified titles for this account and language; source refs remain available. */ }
  }

  onShow(() => { refresh().catch(() => {}); });
  watch([language, ready, () => auth.accountId, () => app.accountKey, () => app.accountBindingEpoch], () => { refresh().catch(() => {}); });
  onScopeDispose(() => { generation += 1; });
  return titles;
}
