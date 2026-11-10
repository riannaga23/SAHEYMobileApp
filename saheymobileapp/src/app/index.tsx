import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { loadWearableSetup } from '../lib/wearableStorage';
import { useWearable } from '../hooks/use-wearable';
import { WearableMessage } from '../components/wearable-message';

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
        Set Tapping Pattern ΓåÆ
      </Link>
      <Link href="/emergency-contact" style={styles.link}>
        Emergency Contact ΓåÆ
      </Link>
      <Link href="/location-sharing" style={styles.link}>
        Location Sharing ΓåÆ
      </Link>
      <Link href="/wearable-setup" style={styles.link}>Wearable Connection</Link>
      <Text style={styles.description}>{wearable.connected ? `Connected to ${wearable.connected.name}` : 'Wearable not connected'}</Text>
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
