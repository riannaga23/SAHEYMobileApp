import { StyleSheet, Text, View } from 'react-native';

export default function TappingPatternScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Set Tapping Pattern</Text>
      <Text style={styles.description}>
        Pattern setup will be added here later.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#FFFFFF' },
  heading: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
  description: { fontSize: 16, color: '#555555' },
});