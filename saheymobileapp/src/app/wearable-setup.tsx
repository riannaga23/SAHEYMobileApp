import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWearable } from '../hooks/use-wearable';
import { WearableMessage } from '../components/wearable-message';
import { bluetoothUnavailableReason, connectWearable, disconnectWearable, refreshRememberedWearable,
  scanForWearables, skipWearableSetup, stopWearableScan, WEARABLE_NAME, matchesWearableName } from '../lib/wearable';

const labels = {
  idle: 'Ready to search', permission: 'Checking permissions...', scanning: 'Searching nearby...',
  connecting: 'Connecting and discovering services...', connected: 'Wearable connected',
  disconnected: 'Wearable disconnected', error: 'Connection needs attention',
};

export default function WearableSetupScreen() {
  const router = useRouter();
  const state = useWearable();
  const [pageError, setPageError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const unavailable = bluetoothUnavailableReason();
  const busy = leaving || state.phase === 'permission' || state.phase === 'connecting';
  useEffect(() => {
    void refreshRememberedWearable();
    return () => { void stopWearableScan().catch(() => undefined); };
  }, []);

  async function continueSetup() {
    setLeaving(true); setPageError('');
    try { await skipWearableSetup(); router.replace('/'); }
    catch (error) { setPageError(error instanceof Error ? error.message : 'Could not save setup. Please try again.'); }
    finally { setLeaving(false); }
  }

  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.brand}>HALO WEARABLE</Text>
    <Text style={styles.heading}>Connect your TinyS3</Text>
    <Text style={styles.description}>Power on your wearable and keep it close to your phone. Search for nearby devices, then select {WEARABLE_NAME}.</Text>
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Text style={styles.title}>{labels[state.phase]}</Text>
      {(busy || state.phase === 'scanning') && <ActivityIndicator color="#173B70" />}
      {!!unavailable && <Text style={styles.description}>{unavailable}</Text>}
      {!!(state.error || pageError) && <Text style={styles.error}>{pageError || state.error}</Text>}
      {state.connected && <>
        <Text style={styles.title}>{state.connected.name}</Text>
        <Text style={styles.description}>Connection confirmed. {state.connected.services.length} BLE service(s) discovered.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void disconnectWearable()}>
          <Text style={styles.link}>Disconnect</Text>
        </Pressable>
      </>}
    </View>
    <WearableMessage />
    {!unavailable && !state.connected && <>
      <Pressable accessibilityRole="button" disabled={busy}
        onPress={() => void (state.phase === 'scanning' ? stopWearableScan().catch(() => setPageError('Could not stop scanning. Try again.')) : scanForWearables())}
        style={[styles.button, busy && styles.disabled]}>
        <Text style={styles.buttonText}>{state.phase === 'scanning' ? 'Stop searching' : 'Search for my wearable'}</Text>
      </Pressable>
      {state.remembered && <View style={styles.card}>
        <Text style={styles.title}>Saved wearable: {state.remembered.name}</Text>
        <Text style={styles.description}>Remembered on this phone. A saved device is not necessarily connected.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void connectWearable(state.remembered!)}>
          <Text style={styles.link}>Reconnect saved wearable</Text>
        </Pressable>
      </View>}
      <Text style={styles.title}>Nearby BLE devices</Text>
      <Text style={styles.description}>Looking for {WEARABLE_NAME}. Matching names appear first. Select your board to connect.</Text>
      {!state.devices.length && <Text style={styles.description}>{state.phase === 'scanning' ? 'Waiting for devices...' : 'No devices listed yet. Search with the board powered on and advertising BLE.'}</Text>}
      {state.devices.map(device => <Pressable key={device.id} accessibilityRole="button"
        accessibilityLabel={`Connect to ${device.name}`} disabled={busy || !device.connectable}
        onPress={() => void connectWearable(device)} style={[styles.card, matchesWearableName(device.name) && styles.match, (busy || !device.connectable) && styles.disabled]}>
        <Text style={styles.title}>{device.name}</Text>
        {matchesWearableName(device.name) && <Text style={styles.link}>Name matches your Halo wearable</Text>}
        <Text style={styles.description}>{device.id} · {device.rssi} dBm</Text>
        <Text style={styles.link}>{device.connectable ? 'Connect' : 'Not connectable'}</Text>
      </Pressable>)}
    </>}
    {!unavailable && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void Linking.openSettings().catch(() => setPageError('Open Android Settings manually to check permissions.'))}>
      <Text style={styles.link}>Open app permission settings</Text>
    </Pressable>}
    {state.remembered && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void disconnectWearable(true)}>
      <Text style={styles.link}>Forget saved wearable</Text>
    </Pressable>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void continueSetup()}
      style={[state.connected ? styles.button : styles.secondary, busy && styles.disabled]}>
      <Text style={state.connected ? styles.buttonText : styles.link}>{state.connected ? 'Continue to Halo' : 'Set up later'}</Text>
    </Pressable>
    <Text style={styles.description}>You can return to Wearable Connection from the home screen. Connecting does not send an alert.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingBottom: 48, gap: 16, backgroundColor: '#FFFFFF' },
  brand: { color: '#173B70', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  heading: { color: '#17233C', fontSize: 28, fontWeight: 'bold' },
  description: { color: '#555555', fontSize: 15, lineHeight: 22 },
  card: { padding: 18, borderWidth: 1, borderColor: '#DCE4F0', borderRadius: 12, gap: 10, backgroundColor: '#F7F9FC' },
  match: { borderColor: '#173B70', borderWidth: 2, backgroundColor: '#EAF2FF' },
  title: { fontSize: 17, color: '#173B70', fontWeight: '600' },
  button: { padding: 18, backgroundColor: '#173B70', borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondary: { alignItems: 'center', padding: 10 },
  link: { color: '#173B70', fontSize: 16, fontWeight: '600', paddingVertical: 6 },
  disabled: { opacity: 0.5 }, error: { color: '#B00020', fontSize: 15, lineHeight: 22 },
});
