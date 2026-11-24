import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { legacyStorageKeys, readMigratedSecureItem } from './legacyStorage';

const TAP_COUNT_KEY = 'halo.tapping-pattern-count';

function isTapCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export async function loadTapCount(): Promise<number | null> {
  let raw: string | null;
  if (Platform.OS === 'web') {
    raw = localStorage.getItem(TAP_COUNT_KEY);
    if (raw === null) {
      raw = localStorage.getItem(legacyStorageKeys.tapCount);
      if (raw !== null) localStorage.setItem(TAP_COUNT_KEY, raw);
    }
  } else {
    raw = await readMigratedSecureItem(TAP_COUNT_KEY, legacyStorageKeys.tapCount);
  }
  if (raw === null) return null;
  const count: unknown = JSON.parse(raw);
  // Do not silently overwrite unreadable or invalid saved data.
  if (!isTapCount(count)) throw new Error('Invalid saved tap count.');
  return count;
}

export async function saveTapCount(count: number): Promise<void> {
  if (!isTapCount(count)) throw new Error('Tap count must be a positive safe integer.');
  const value = JSON.stringify(count);
  if (Platform.OS === 'web') localStorage.setItem(TAP_COUNT_KEY, value);
  else await SecureStore.setItemAsync(TAP_COUNT_KEY, value);
}
