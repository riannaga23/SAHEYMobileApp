import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TAP_COUNT_KEY = 'sahey.tapping-pattern-count';

function isTapCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export async function loadTapCount(): Promise<number | null> {
  const raw = Platform.OS === 'web'
    ? localStorage.getItem(TAP_COUNT_KEY)
    : await SecureStore.getItemAsync(TAP_COUNT_KEY);
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
