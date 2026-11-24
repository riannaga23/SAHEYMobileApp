
import { useEffect } from 'react';
import { Alert, DeviceEventEmitter } from 'react-native';
import { sendConfirmedDistressEmail } from '../lib/distressEmail';
import type { ConfirmedDistressSignal } from '../lib/distressSignal';

export default function DistressEmailListener() {
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'sahey.distress.confirmed',
      (signal: ConfirmedDistressSignal | undefined) => {
        console.log('[SAHEY] Distress event received');

        Alert.alert(
          'SAHEY Emergency Alert',
          'A confirmed distress signal has been detected.',
          [{ text: 'OK' }]
        );

        // Only validated wearable events can initiate email requests.
        if (
          !signal ||
          typeof signal.deviceId !== 'string' ||
          !signal.deviceId.trim() ||
          !Number.isFinite(signal.receivedAt)
        ) {
          console.log('[SAHEY] No valid signal payload; skipping email.');
          return;
        }

        return sendConfirmedDistressEmail(signal).catch((error) => {
  console.error('[SAHEY] Distress email request failed:', error);
});
      }
    );

    return () => subscription.remove();
  }, []);

  return null;
}
