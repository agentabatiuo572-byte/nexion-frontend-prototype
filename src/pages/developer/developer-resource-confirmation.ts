export type ConfirmedDeveloperMutation<T> =
  | { confirmed: false }
  | { confirmed: true; value: T };

/** Keeps irreversible developer-resource requests behind the shared UI confirmation. */
export async function runConfirmedDeveloperMutation<T>(
  askForConfirmation: () => Promise<boolean>,
  isCurrent: () => boolean,
  request: () => Promise<T>,
): Promise<ConfirmedDeveloperMutation<T>> {
  if (!await askForConfirmation()) return { confirmed: false };
  // A confirmation can remain open while its account, runtime RunID, or page
  // generation changes. Re-check immediately before the first side effect.
  if (!isCurrent()) return { confirmed: false };
  return { confirmed: true, value: await request() };
}
