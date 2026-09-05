type AccountBindableStore = {
  bindAccount?: (accountKey: string) => void;
  $dispose?: () => void;
};

export function bindAccountStore(
  useStore: () => AccountBindableStore,
  accountKey: string,
  storeName: string,
): void {
  let store = useStore();
  if (typeof store.bindAccount !== "function" && typeof store.$dispose === "function") {
    store.$dispose();
    store = useStore();
  }
  if (typeof store.bindAccount !== "function") {
    throw new Error(`${storeName} store did not expose bindAccount after recreation`);
  }
  store.bindAccount(accountKey);
}
