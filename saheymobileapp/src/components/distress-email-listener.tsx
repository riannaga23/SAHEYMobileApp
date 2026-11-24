
import { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { sendConfirmedDistressEmail } from '../lib/distressEmail';
import type { ConfirmedDistressSignal } from '../lib/distressSignal';

export default function DistressEmailListener() {
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'halo.distress.confirmed',
      (signal: ConfirmedDistressSignal | undefined) => {
        // Only validated wearable events can initiate email requests.
        if (
          !signal ||
          typeof signal.deviceId !== 'string' ||
          !signal.deviceId.trim() ||
          !Number.isFinite(signal.receivedAt)
        ) {
          return;
        }

        return sendConfirmedDistressEmail(signal);
      }
    );

    return () => subscription.remove();
  }, []);

  return null;
}
