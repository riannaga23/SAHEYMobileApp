import { StyleSheet, Text, View } from 'react-native';

export default function LocationSharingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Location Sharing</Text>
      <Text style={styles.status}>Status: Off</Text>
      <Text style={styles.description}>
        Location permission and sharing controls will be added later.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#FFFFFF' },
  heading: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  status: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  description: { fontSize: 16, color: '#555555' },
});