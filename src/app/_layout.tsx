import { Stack } from 'expo-router';

export default function RootLayout() {
  // TODO BLE: Start one shared bracelet service at app level, outside the tapping
  // screen. Subscribe to notifications before sending any setup command.
  // Forward normalized setup notifications through "sahey.bracelet.setup".
  // Keep the shared connection and distress listener active after leaving setup;
  // screen cleanup must remove only the screen's UI subscription.
  // TODO BLE: Handle "CONFIRMED DISTRESS" in that shared app-level listener.
  // Route the event to the REAL emergency-alert workflow using saved contacts and
  // location preferences. Do not call sendTestAlert(): it sends a test notification.
  // TODO ALERTS: Deduplicate using the event ID agreed with firmware.
  // Track alert delivery and expose failures to the user.
  // TODO BLE: Handle disconnections and command failures, and synchronize with
  // the bracelet before resuming on reconnection.
  // TODO BACKGROUND: Suspended/closed-app operation needs separate implementation.
  // These markers do not implement real distress handling or emergency alerts.
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Halo' }} />
      <Stack.Screen name="tapping-pattern" options={{ title: 'Tapping Pattern' }} />
      <Stack.Screen name="emergency-contact" options={{ title: 'Emergency Contact' }} />
      <Stack.Screen name="location-sharing" options={{ title: 'Location Sharing' }} />
    </Stack>
  );
}
