import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Pressable, StyleSheet, Text, View } from 'react-native';
import { WearableMessage } from '../components/wearable-message';
import { useWearable } from '../hooks/use-wearable';
import { loadWearableSetup } from '../lib/wearableStorage';

export default function MenuScreen() {
  const router = useRouter();
  const wearable = useWearable();
  const [checkingSetup, setCheckingSetup] = useState(true);
  useEffect(() => {
    let active = true;
    loadWearableSetup().then(setup => {
      if (!active) return;
      if (!setup.completed) router.replace('/wearable-setup');
      else setCheckingSetup(false);
    }).catch(() => { if (active) router.replace('/wearable-setup'); });
    return () => { active = false; };
  }, [router]);
  if (checkingSetup) return <View style={styles.container}><ActivityIndicator accessibilityLabel="Loading Halo setup" /></View>;
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Halo Setup</Text>
      <Text style={styles.description}>
        Choose what you would like to set up.
      </Text>

      <Link href="/tapping-pattern" style={styles.link}>
        Set Tapping Pattern
      </Link>
      <Link href="/emergency-contact" style={styles.link}>
        Emergency Contact
      </Link>
      <Link href="/location-sharing" style={styles.link}>
        Location Sharing
      </Link>
      <Link href="/wearable-setup" style={styles.link}>Wearable Connection</Link>
      <Text style={styles.description}>{wearable.connected ? `Connected to ${wearable.connected.name}` : 'Wearable not connected'}</Text>

      {__DEV__ && (
        <Pressable
          onPress={() => {
            console.log('[SAHEY TEST] Simulating distress');

             DeviceEventEmitter.emit('sahey.distress.confirmed');
          }}
          style={{
              backgroundColor: '#B00020',
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              marginTop: 20,
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontWeight: '700',
              fontSize: 16,
          }}
          >
      Simulate Distress (DEV ONLY)
    </Text>
  </Pressable>
)}

      <WearableMessage />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, backgroundColor: '#FFFFFF' },
  heading: { fontSize: 28, fontWeight: 'bold', marginTop: 24 },
  description: { fontSize: 16, color: '#555555', marginBottom: 12 },
  link: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: '#EAF2FF',
    color: '#173B70',
    fontSize: 17,
    fontWeight: '600',
  },
});
