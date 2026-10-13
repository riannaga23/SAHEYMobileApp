import { StyleSheet, Text, View } from 'react-native';

export default function EmergencyContactScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Emergency Contact</Text>
      <Text style={styles.label}>Name</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Contact name will go here</Text>
      </View>
      <Text style={styles.label}>Phone number</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Phone number will go here</Text>
      </View>
      <Text style={styles.note}>Contact editing will be added later.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#FFFFFF' },
  heading: { fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  placeholder: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 10,
    marginBottom: 20,
  },
  placeholderText: { color: '#777777' },
  note: { color: '#555555', marginTop: 8 },
});