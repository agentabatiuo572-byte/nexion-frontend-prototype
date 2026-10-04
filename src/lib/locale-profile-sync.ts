export interface LocaleProfileScope {
  accountId: string;
  revision: number;
}

interface LocaleProfileSyncDependencies {
  currentScope(): LocaleProfileScope | null;
  write(language: string): Promise<unknown>;
  onState?(state: "idle" | "syncing" | "failed"): void;
}

interface LocaleProfileSyncJob {
  language: string;
  scope: LocaleProfileScope;
}

/**
 * The account id fences the subject; the vault revision is only a bearer
 * epoch. A token refresh during the write advances that epoch without changing
 * who the language belongs to, so requiring revision equality orphaned a write
 * that actually landed and left the picker on "syncing" forever.
 */
function sameScope(left: LocaleProfileScope | null, right: LocaleProfileScope): boolean {
  return left !== null && left.accountId === right.accountId;
}

/**
 * Keeps locale writes ordered for one browser runtime. A job captures both the
 * authenticated subject and its vault epoch, so queued work from a former
 * session is discarded before it reaches the transport.
 */
export function createLocaleProfileSync(dependencies: LocaleProfileSyncDependencies) {
  let queued: LocaleProfileSyncJob | null = null;
  let retry: LocaleProfileSyncJob | null = null;
  let inFlight: Promise<void> | null = null;

  function current(job: LocaleProfileSyncJob): boolean {
    return sameScope(dependencies.currentScope(), job.scope);
  }

  async function drain(): Promise<void> {
    while (queued) {
      const job = queued;
      queued = null;
      if (!current(job)) continue;
      dependencies.onState?.("syncing");
      try {
        await dependencies.write(job.language);
        if (current(job)) dependencies.onState?.("idle");
      } catch {
        // Preserve only a failure for the still-current session. The next
        // locale change or accepted sign-in is a deliberate retry trigger.
        if (current(job) && queued === null) {
          retry = job;
          dependencies.onState?.("failed");
        }
      }
    }
  }

  function start(): void {
    if (inFlight) return;
    inFlight = drain().finally(() => {
      inFlight = null;
      if (queued) start();
    });
  }

  return {
    request(language: string): void {
      const scope = dependencies.currentScope();
      if (!scope) {
        queued = null;
        retry = null;
        return;
      }
      queued = { language, scope };
      retry = null;
      start();
    },
    flush(): Promise<void> {
      return inFlight ?? Promise.resolve();
    },
    pending(): Readonly<LocaleProfileSyncJob> | null {
      return queued ?? retry;
    },
    discardInactive(): void {
      if (queued && !current(queued)) queued = null;
      if (retry && !current(retry)) retry = null;
    },
  };
}
