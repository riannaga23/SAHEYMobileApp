import { StyleSheet, Text, View } from 'react-native';
import { useSyncExternalStore } from 'react';
import { getDistressEmailStatus, subscribeDistressEmail } from '../lib/distressEmail';
import { alertStatusMessage } from '../lib/alertPresentation';

export function WearableMessage() {
  const email = useSyncExternalStore(subscribeDistressEmail, getDistressEmailStatus, getDistressEmailStatus);
  if (email.phase === 'idle') return null;
  return <View style={[styles.card, email.phase === 'failed' && styles.distress]} accessibilityLiveRegion="polite">
    <Text style={styles.heading}>{email.phase === 'sending' ? 'Alert in progress' : email.phase === 'accepted' ? 'Latest alert submitted' : 'Alert needs attention'}</Text>
    <Text style={styles.status}>{alertStatusMessage(email)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 10, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E7F0' },
  distress: { backgroundColor: '#FFF1F0', borderColor: '#B00020' },
  heading: { fontSize: 16, fontWeight: '600', color: '#173B70' },
  status: { fontSize: 14, color: '#555555' },
});
