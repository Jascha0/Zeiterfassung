/** The part of `navigator` this app uses, so tests can drive granted, denied and "API absent". */
export interface StorageCapableNavigator {
  storage?: { persist?: () => Promise<boolean> };
}

/** Asks the browser to exempt the data from automatic eviction (0033). Never throws; returns whether
 *  persistence is granted. `false` is a normal outcome and changes nothing about how the app behaves. */
export async function requestPersistentStorage(nav: StorageCapableNavigator | null | undefined): Promise<boolean> {
  const storage = nav?.storage;
  if (storage === undefined || typeof storage.persist !== 'function') return false;
  try {
    return (await storage.persist()) === true;
  } catch {
    return false;
  }
}
