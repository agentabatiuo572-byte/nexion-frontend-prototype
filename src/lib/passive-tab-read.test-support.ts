import { createPassiveReadWindow } from './passive-read-window';

/** Raw-SFC harnesses supply their actual account/runtime fixtures without importing the application singleton. */
export function createPassiveTabReadFixture(scope: () => string) {
  const window = createPassiveReadWindow();
  return { runPassiveTabRead: <T>(resource: string, read: () => Promise<T>, query?: unknown, hasCache?: () => boolean) => window.run(scope(), resource, read, query, hasCache),
    notifyPageActivation: window.notifyPageActivation,
    invalidatePassiveTabRead: window.invalidate, invalidateBeforePassiveTabRead: (resource: string) => window.invalidate(resource, true), passiveTabReadScope: scope };
}
