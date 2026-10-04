export type CheckoutRouteIdentity = Readonly<{
  accountKey: string;
  accountEpoch: number;
  productNo: string;
}>;

export type CheckoutRouteScope = CheckoutRouteIdentity & Readonly<{ generation: number }>;

/**
 * Makes late checkout reads harmless when an account, product, or page instance
 * changes. The page still owns visibility/alive checks; this helper owns only
 * the identity generation that survives an async boundary.
 */
export class CheckoutRouteFence {
  private generation = 0;

  begin(identity: CheckoutRouteIdentity): CheckoutRouteScope {
    this.generation += 1;
    return { ...identity, generation: this.generation };
  }

  capture(identity: CheckoutRouteIdentity): CheckoutRouteScope {
    return { ...identity, generation: this.generation };
  }

  invalidate(): void {
    this.generation += 1;
  }

  isCurrent(scope: CheckoutRouteScope, identity: CheckoutRouteIdentity): boolean {
    return scope.generation === this.generation
      && scope.accountKey === identity.accountKey
      && scope.accountEpoch === identity.accountEpoch
      && scope.productNo === identity.productNo;
  }
}
