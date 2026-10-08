export type CheckoutLeaveGuard = () => Promise<boolean>;
let active: { owner: symbol; guard: CheckoutLeaveGuard } | null = null;
let pending: Promise<boolean> | null = null;
/** Page-owned only: forced auth resets deliberately do not call this hook. */
export function registerCheckoutLeaveGuard(guard: CheckoutLeaveGuard): () => void {
  const owner = Symbol('checkout');
  active = { owner, guard };
  return () => { if (active?.owner === owner) active = null; };
}
export function requestCheckoutLeave(): Promise<boolean> {
  if (!active) return Promise.resolve(true);
  if (!pending) {
    const owner=active.owner;
    pending = active.guard().then(allowed=>active?.owner===owner&&allowed).finally(() => { pending = null; });
  }
  return pending;
}
export function hasCheckoutLeaveGuard(): boolean { return active !== null; }
export function clearCheckoutLeaveForReset(): void { active=null; }
