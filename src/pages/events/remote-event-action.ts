import type { createRemotePageCommandFence } from "@/lib/remote-page-command-fence";

type RemoteEventCommandFence = ReturnType<typeof createRemotePageCommandFence>;

export interface RemoteEventActionOptions {
  fence: RemoteEventCommandFence;
  command(): Promise<boolean>;
  refresh(): Promise<void> | void;
  onSuccess(): void;
  onFailure(): void;
}

/** Applies a remote event mutation without surfacing another account's result. */
export async function runRemoteEventAction({
  fence,
  command,
  refresh,
  onSuccess,
  onFailure,
}: RemoteEventActionOptions): Promise<void> {
  const scope = fence.capture();
  if (!fence.isCurrent(scope)) return;

  const succeeded = await command();
  if (!fence.isCurrent(scope)) return;
  if (!succeeded) {
    onFailure();
    return;
  }

  if (!fence.isCurrent(scope)) return;
  onSuccess();
  try { await refresh(); } catch { /* The command receipt remains successful; refresh owns its recovery UI. */ }
}
