import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function MenuScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>SAHEY Setup</Text>
      <Text style={styles.description}>
        Choose what you would like to set up.
      </Text>

      <Link href="/tapping-pattern" style={styles.link}>
        Set Tapping Pattern →
      </Link>
      <Link href="/emergency-contact" style={styles.link}>
        Emergency Contact →
      </Link>
      <Link href="/location-sharing" style={styles.link}>
        Location Sharing →
      </Link>
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