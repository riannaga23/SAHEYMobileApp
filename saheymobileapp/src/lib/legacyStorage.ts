import * as SecureStore from 'expo-secure-store';

// Read-only compatibility names from installations made before the Halo rename.
// New data is always written under halo.*; keeping these names avoids losing setup.
export const legacyStorageKeys = {
  contacts: 'sahey.emergency-contacts-email',
  contact: 'sahey.emergency-contact-email',
  tapCount: 'sahey.tapping-pattern-count',
};

export async function readMigratedSecureItem(key: string, previousKey: string): Promise<string | null> {
  const current = await SecureStore.getItemAsync(key);
  if (current !== null) return current;
  const previous = await SecureStore.getItemAsync(previousKey);
  if (previous !== null) await SecureStore.setItemAsync(key, previous);
  return previous;
}
