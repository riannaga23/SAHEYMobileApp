import { StyleSheet, Text, View } from 'react-native';
import { useWearable } from '../hooks/use-wearable';

export function WearableMessage() {
  const { message, messageStatus } = useWearable();
  const distress = message?.text === 'CONFIRMEDDISTRESS' || message?.text === 'Confirmed distress';
  return <View style={[styles.card, distress && styles.distress]} accessibilityLiveRegion="polite">
    <Text style={styles.heading}>Latest wearable message</Text>
    <Text style={styles.status}>{messageStatus}</Text>
    {message && <>
      <Text style={[styles.message, distress && styles.distressText]}>{distress ? 'Confirmed distress' : message.text}</Text>
      <Text style={styles.status}>Received {new Date(message.receivedAt).toLocaleTimeString()}</Text>
      {distress && <Text style={styles.status}>Message received from the board. No emergency email has been sent by this message.</Text>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8, borderRadius: 12, backgroundColor: '#F7F9FC', borderWidth: 1, borderColor: '#DCE4F0' },
  distress: { backgroundColor: '#FFF1F0', borderColor: '#B00020' },
  heading: { fontSize: 16, fontWeight: '600', color: '#173B70' },
  status: { fontSize: 14, color: '#555555' },
  message: { fontSize: 20, fontWeight: 'bold', color: '#173B70' },
  distressText: { color: '#B00020' },
});
