import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { AppButton, ui } from '../components/ui/app-layout';
import { useWearable } from '../hooks/use-wearable';
import { WearableMessage } from '../components/wearable-message';
import { bluetoothUnavailableReason, connectWearable, disconnectWearable, refreshRememberedWearable,
  scanForWearables, skipWearableSetup, stopWearableScan, matchesWearableName } from '../lib/wearable';

const labels = {
  idle: 'Ready to connect', permission: 'Checking Bluetooth access…', scanning: 'Searching for your wearable…',
  connecting: 'Connecting…', connected: 'Wearable connected', disconnected: 'Wearable disconnected', error: 'Connection needs attention',
};
function connectionError(message: string | null) {
  if (!message) return '';
  if (/permission|Nearby devices/i.test(message)) return 'Allow Bluetooth access in your phone’s app settings, then try again.';
  if (/Turn on Bluetooth|Bluetooth is unavailable/i.test(message)) return 'Turn on Bluetooth and try again.';
  if (/disconnected/i.test(message)) return 'Keep your wearable powered on and nearby, then reconnect.';
  if (/timed out/i.test(message)) return 'The connection timed out. Keep your wearable nearby and try again.';
  return 'Unable to connect to your wearable. Keep it nearby and try again.';
}

export default function WearableSetupScreen() {
  const router = useRouter();
  const state = useWearable();
  const [pageError, setPageError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const unavailable = bluetoothUnavailableReason();
  const busy = leaving || state.phase === 'permission' || state.phase === 'connecting';
  const devices = state.devices.filter(device => matchesWearableName(device.name) || device.id === state.remembered?.id);
  const error = pageError || connectionError(state.error);
  const messagesUnavailable = !!state.connected && /No message notifications|Could not enable messages/.test(state.messageStatus);
  useEffect(() => {
    void refreshRememberedWearable();
    return () => { void stopWearableScan().catch(() => undefined); };
  }, []);

  async function continueSetup() {
    setLeaving(true); setPageError('');
    try { await skipWearableSetup(); router.replace('/'); }
    catch { setPageError('Could not finish setup. Please try again.'); }
    finally { setLeaving(false); }
  }
  async function search() {
    setPageError('');
    try { if (state.phase === 'scanning') await stopWearableScan(); else await scanForWearables(); }
    catch { setPageError('Unable to search right now. Please try again.'); }
  }

  return <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
    <Text style={ui.heading}>Connect your wearable</Text>
    <Text style={ui.body}>Power on your Halo wearable and keep it close to your phone.</Text>
    <View style={ui.card} accessibilityLiveRegion="polite">
      <Text style={ui.title}>{labels[state.phase]}</Text>
      {(busy || state.phase === 'scanning') && <ActivityIndicator color="#173B70" />}
      {!!unavailable && <Text style={ui.body}>Wearable connection is available in the Halo Android app on a physical phone.</Text>}
      {!!error && <Text style={ui.error} accessibilityRole="alert">{error}</Text>}
      {state.connected && <>
        <Text style={ui.body}>{state.connected.name}</Text>
        {messagesUnavailable && <Text style={ui.error}>Wearable alerts are unavailable. Disconnect and reconnect to try again.</Text>}
        <AppButton secondary title="Disconnect" disabled={busy} onPress={() => { void disconnectWearable(); }} />
      </>}
    </View>
    <WearableMessage />
    {!unavailable && !state.connected && <>
      <AppButton title={state.phase === 'scanning' ? 'Stop searching' : 'Find my wearable'} disabled={busy} onPress={() => void search()} />
      {state.remembered && <View style={ui.card}>
        <Text style={ui.title}>Saved wearable</Text>
        <Text style={ui.body}>{state.remembered.name}</Text>
        <AppButton secondary title="Reconnect" disabled={busy} onPress={() => { void connectWearable(state.remembered!); }} />
      </View>}
      <Text style={ui.title}>Nearby wearables</Text>
      {!devices.length && <Text style={ui.body}>{state.phase === 'scanning' ? 'Keep your wearable nearby while we look for it.' : 'Tap Find my wearable to search.'}</Text>}
      {devices.map(device => <Pressable key={device.id} accessibilityRole="button"
        accessibilityLabel={`Connect to ${device.name}`} accessibilityState={{ disabled: busy || !device.connectable }} disabled={busy || !device.connectable}
        onPress={() => { void connectWearable(device); }} style={({ pressed }) => [ui.card, (busy || !device.connectable) && ui.disabled, pressed && ui.pressed]}>
        <Text style={ui.title}>{device.name}</Text>
        <Text style={ui.link}>{device.connectable ? 'Connect' : 'Currently unavailable'}</Text>
      </Pressable>)}
    </>}
    {!unavailable && <AppButton secondary title="Bluetooth permissions" disabled={busy} onPress={() => { void Linking.openSettings().catch(() => setPageError('Open your phone’s app settings to allow Bluetooth access.')); }} />}
    {state.remembered && <AppButton secondary title="Forget wearable" disabled={busy} onPress={() => { void disconnectWearable(true); }} />}
    <AppButton title={state.connected ? 'Done' : 'Set up later'} disabled={busy} onPress={() => void continueSetup()} />
  </ScrollView>;
}