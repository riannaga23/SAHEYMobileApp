import * as SecureStore from 'expo-secure-store';

const KEY = 'halo.wearable-setup.v1';
export type SavedWearable = { id: string; name: string; services: string[] };
export type WearableSetup = { completed: boolean; device: SavedWearable | null };

export async function loadWearableSetup(): Promise<WearableSetup> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return { completed: false, device: null };
  const value = JSON.parse(raw) as WearableSetup;
  if (typeof value.completed !== 'boolean' || (value.device !== null &&
    (!value.device || typeof value.device.id !== 'string' || typeof value.device.name !== 'string'
      || !Array.isArray(value.device.services) || !value.device.services.every(s => typeof s === 'string')))) {
    throw new Error('Saved wearable settings could not be read. Choose Set up later to reset setup.');
  }
  return value;
}

export async function saveWearableSetup(device: SavedWearable | null) {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ completed: true, device }));
}
