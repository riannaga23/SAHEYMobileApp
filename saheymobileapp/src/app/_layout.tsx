import { Stack } from 'expo-router';
import DistressEmailListener from '../components/distress-email-listener';

export default function RootLayout() {
  return (
    <>
      <DistressEmailListener />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#FFFFFF' }, headerTintColor: '#172B4D', headerTitleStyle: { fontWeight: '600' }, headerShadowVisible: false, contentStyle: { backgroundColor: '#F5F7FB' } }}>
        <Stack.Screen name="index" options={{ title: 'Halo' }} />
        <Stack.Screen name="wearable-setup" options={{ title: 'Wearable Connection', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="tapping-pattern" options={{ title: 'Tapping Pattern' }} />
        <Stack.Screen name="emergency-contact" options={{ title: 'Emergency Contacts' }} />
        <Stack.Screen name="location-sharing" options={{ title: 'Location Sharing' }} />
      </Stack>
    </>
  );
}
