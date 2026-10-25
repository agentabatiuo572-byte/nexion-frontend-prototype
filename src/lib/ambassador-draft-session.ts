import { reactive } from 'vue';
import type { AmbassadorApplicationInput } from '@/api/ambassador-application-api';

interface Scope { accountKey: string; accountEpoch: number }
export interface AmbassadorDraftForm {
  date: string; city: string; budgetText: string;
  bucketId: AmbassadorApplicationInput['bucket'] | ''; bucketTitle: string;
}
const emptyForm = (): AmbassadorDraftForm => ({ date: '', city: '', budgetText: '3000', bucketId: '', bucketTitle: '' });
export interface AmbassadorDraftSession extends Scope {
  form: AmbassadorDraftForm;
  touched: boolean;
  pending: symbol | null;
}
export function clearAmbassadorDraft(session: AmbassadorDraftSession, defaultBudget = '3000') {
  Object.assign(session.form, emptyForm(), { budgetText: defaultBudget });
  session.touched = false;
}
export function createAmbassadorDraftCache() {
  let active: AmbassadorDraftSession | undefined;
  return {
    forAccount(scope: Scope): AmbassadorDraftSession {
      if (!active || active.accountKey !== scope.accountKey || active.accountEpoch !== scope.accountEpoch) {
        if (active) { clearAmbassadorDraft(active); active.pending = null; }
        active = reactive({ ...scope, form: emptyForm(), touched: false, pending: null });
      }
      return active;
    },
  };
}
// One live account slot, never a per-account archive or persisted personal data.
export const ambassadorDraftCache = createAmbassadorDraftCache();
export function beginAmbassadorDraftSubmit(session: AmbassadorDraftSession): symbol | null {
  if (session.pending) return null;
  return session.pending = Symbol('ambassador-submit');
}
export function endAmbassadorDraftSubmit(session: AmbassadorDraftSession, token: symbol, succeeded = false) {
  if (session.pending !== token) return;
  if (succeeded) clearAmbassadorDraft(session);
  session.pending = null;
}
