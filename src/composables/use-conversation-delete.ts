import { computed, getCurrentInstance, onUnmounted, ref, watch } from 'vue';
import { onHide } from '@dcloudio/uni-app';
import { useApp } from '@/store/app';
import { useConversations } from '@/store/conversations';
import { confirm, toast, useUI } from '@/store/ui';
import { useLocaleStore } from '@/store/locale';
import { conversationActionsCopy } from '@/i18n/conversation-actions';

/** Both inbox surfaces use the same destructive action and confirmation. */
export function useConversationDelete() {
  const store = useConversations(), app = useApp(), ui = useUI(), locale = useLocaleStore();
  const copy = computed(() => conversationActionsCopy[locale.code === 'zh' || locale.code === 'vi' ? locale.code : 'en']);
  const openedId = ref(''), pending = ref(false);
  const owner = `conversation-delete:${getCurrentInstance()!.uid}`;
  let revision = 0;
  function close() { revision++; openedId.value = ''; pending.value = false; ui.clearConfirmsBy(owner); }
  onHide(close);
  onUnmounted(close);
  watch(() => app.accountBindingEpoch, close);

  async function remove(id: string) {
    if (pending.value || !store.deletionAvailable || store.deletingIds[id]) return;
    const epoch = app.accountBindingEpoch, intent = revision;
    pending.value = true;
    try {
      const accepted = await confirm({ owner, title: copy.value.title, message: copy.value.message,
        confirmLabel: copy.value.confirm, cancelLabel: copy.value.cancel, icon: 'warn', danger: true });
      if (!accepted || epoch !== app.accountBindingEpoch || intent !== revision) return;
      await store.deleteConversation(id);
      if (epoch === app.accountBindingEpoch && intent === revision) openedId.value = '';
    } catch {
      if (epoch === app.accountBindingEpoch && intent === revision) toast.error(copy.value.failed);
    } finally {
      if (epoch === app.accountBindingEpoch && intent === revision) pending.value = false;
    }
  }
  return { copy, openedId, pending, remove };
}
