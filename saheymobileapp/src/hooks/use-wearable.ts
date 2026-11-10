import { useSyncExternalStore } from 'react';
import { getWearableSnapshot, subscribeWearable } from '../lib/wearable';

export function useWearable() {
  return useSyncExternalStore(subscribeWearable, getWearableSnapshot, getWearableSnapshot);
}
