export type CapacityDecision = "CAPACITY_AVAILABLE" | "NO_ACTIVE_DEVICE" | "REPLACE_REQUIRED";

export interface NoActiveDeviceDecisionSteps {
  notify(): void;
  refreshFleet(): Promise<void>;
}

/**
 * NO_ACTIVE_DEVICE is an authoritative business result, not a request error.
 * A best-effort fleet refresh may repair stale UI state, but its failure must
 * never replace that actionable result with a generic retry notice.
 */
export async function handleNoActiveDeviceDecision(steps: NoActiveDeviceDecisionSteps): Promise<void> {
  steps.notify();
  try {
    await steps.refreshFleet();
  } catch {
    // Preserve the authoritative business reason already shown to the user.
  }
}

export class RemoteCapacityGate {
  pending = false;
  blocked = false;

  async resolve<T extends { decision: CapacityDecision }>(
    load: () => Promise<T>,
    consume: (quote: T) => Promise<void> | void,
    isCurrent: () => boolean = () => true,
  ): Promise<T> {
    this.pending = true;
    this.blocked = true;
    try {
      const quote = await load();
      if (!isCurrent()) return quote;
      this.blocked = quote.decision !== "CAPACITY_AVAILABLE";
      await consume(quote);
      return quote;
    } catch (error) {
      if (isCurrent()) this.blocked = true;
      throw error;
    } finally {
      if (isCurrent()) this.pending = false;
    }
  }

  reset(): void {
    this.pending = false;
    this.blocked = false;
  }

  canConfirm(hasCanonicalReplacement: boolean): boolean {
    return !this.pending && (!this.blocked || hasCanonicalReplacement);
  }
}

export class StableCommandKey {
  private value: string | null = null;

  get(create: () => string): string {
    this.value ??= create();
    return this.value;
  }

  clear(): void {
    this.value = null;
  }
}

export interface VerifiedMutation<T, R> {
  submit(): Promise<T>;
  readback(result: T): Promise<R>;
  verifyOrder(result: T, order: R): void;
  refreshOrders(): Promise<void>;
  refreshFleet(): Promise<void>;
  verifyFleet(result: T): void;
  commit(result: T): Promise<void> | void;
}

export async function completeVerifiedMutation<T, R>(steps: VerifiedMutation<T, R>): Promise<T> {
  const result = await steps.submit();
  const order = await steps.readback(result);
  steps.verifyOrder(result, order);
  await steps.refreshOrders();
  await steps.refreshFleet();
  steps.verifyFleet(result);
  await steps.commit(result);
  return result;
}
