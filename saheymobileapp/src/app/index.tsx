import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ui } from '../components/ui/app-layout';
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
  if (checkingSetup) return <View style={[ui.screen, styles.loading]}><ActivityIndicator accessibilityLabel="Loading Halo setup" /></View>;
  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <View style={styles.intro}>
        <Text style={styles.brand}>HALO</Text>
        <Text style={ui.heading}>Your Halo</Text>
        <Text style={ui.body}>Manage your wearable and the people who receive your alerts.</Text>
      </View>
      <View style={ui.card}>
        <View style={ui.row}>
          <Text style={ui.title}>Your wearable</Text>
          <Text style={[styles.badge, wearable.connected && styles.connected]}>{wearable.connected ? 'Connected' : 'Not connected'}</Text>
        </View>
        <Text style={ui.body}>{wearable.connected ? 'Keep your wearable nearby and powered on.' : 'Connect your wearable to receive distress signals.'}</Text>
        <Link href="/wearable-setup" style={ui.link}>Manage connection</Link>
      </View>
      <WearableMessage />
      <View style={styles.navigation}>
        {[
          { href: '/tapping-pattern', title: 'Tapping pattern', detail: 'Choose the taps that signal you need help.' },
          { href: '/emergency-contact', title: 'Emergency contacts', detail: 'Choose who receives your distress emails.' },
          { href: '/location-sharing', title: 'Location sharing', detail: 'Share your location with a Google Maps link.' },
        ].map(item => <Link key={item.href} href={item.href as '/tapping-pattern' | '/emergency-contact' | '/location-sharing'} asChild>
          <Pressable accessibilityRole="link" style={({ pressed }) => [ui.card, styles.navigationCard, pressed && ui.pressed]}>
            <View style={styles.navigationText}><Text style={ui.title}>{item.title}</Text><Text style={ui.body}>{item.detail}</Text></View>
            <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">›</Text>
          </Pressable>
        </Link>)}
      </View>
      <Text style={styles.mode}>Email alerts are currently in test mode.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center' },
  intro: { gap: 10, paddingVertical: 8 },
  brand: { color: '#173B70', fontSize: 12, fontWeight: '700', letterSpacing: 3 },
  badge: { color: '#57657B', backgroundColor: '#EDF1F6', fontSize: 12, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  connected: { color: '#176144', backgroundColor: '#E5F4EC' },
  navigation: { gap: 12 },
  navigationCard: { flexDirection: 'row', alignItems: 'center' },
  navigationText: { flex: 1, gap: 6 },
  chevron: { fontSize: 30, color: '#8A99AE' },
  mode: { color: '#69788D', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
