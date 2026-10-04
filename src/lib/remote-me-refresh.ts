export type RemoteMeLoader = readonly [key: string, load: () => unknown | Promise<unknown>];

/**
 * Runs every authenticated "Me" projection independently. A failed wallet,
 * device, or optional growth authority must never prevent the other modules
 * from reaching their own ready/error state.
 */
export async function settleRemoteMeLoaders(
  loaders: readonly RemoteMeLoader[],
): Promise<Record<string, "fulfilled" | "rejected">> {
  const results = await Promise.allSettled(
    loaders.map(([, load]) => Promise.resolve().then(load)),
  );
  return Object.fromEntries(
    loaders.map(([key], index) => [key, results[index].status]),
  );
}
