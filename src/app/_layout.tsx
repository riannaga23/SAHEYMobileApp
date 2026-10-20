import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'SAHEY' }} />
      <Stack.Screen name="tapping-pattern" options={{ title: 'Tapping Pattern' }} />
      <Stack.Screen name="emergency-contact" options={{ title: 'Emergency Contact' }} />
      <Stack.Screen name="location-sharing" options={{ title: 'Location Sharing' }} />
    </Stack>
  );
}