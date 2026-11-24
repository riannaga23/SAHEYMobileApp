import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ui } from '../components/ui/app-layout';
import { type EmergencyContact, getEmergencyContactEmails, loadEmergencyContacts, saveEmergencyContacts } from '../lib/emergencyContact';

export default function EmergencyContactScreen() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    loadEmergencyContacts()
      .then((saved) => {
        if (!active) return;
        setContacts(saved);
        setFormVisible(saved.length === 0);
      })
      .catch(() => active && setError('Could not load the saved contacts.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  function startAdd() {
    setName('');
    setEmail('');
    setEditingIndex(null);
    setFormVisible(true);
    setError('');
  }

  function startEdit(index: number) {
    setName(contacts[index].name);
    setEmail(contacts[index].email);
    setEditingIndex(index);
    setFormVisible(true);
    setError('');
  }

  async function save() {
    const next = { name: name.trim(), email: email.trim().toLowerCase() };
    if (!next.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) {
      setError('Enter a name and a valid email address.');
      return;
    }
    if (contacts.some((contact, index) => index !== editingIndex && contact.email === next.email)) {
      setError('That email address is already saved.');
      return;
    }
    const updated = [...contacts];
    if (editingIndex === null) updated.push(next);
    else updated[editingIndex] = next;
    try { getEmergencyContactEmails(updated); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check your contact email addresses.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await saveEmergencyContacts(updated);
      setContacts(updated);
      setFormVisible(false);
      setEditingIndex(null);
      setName('');
      setEmail('');
    } catch {
      setError('Could not save the contacts. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(index: number) {
    Alert.alert('Remove emergency contact?', `Remove ${contacts[index].name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const updated = contacts.filter((_, i) => i !== index);
          setBusy(true);
          setError('');
          try {
            await saveEmergencyContacts(updated);
            setContacts(updated);
            setFormVisible(updated.length === 0);
            setEditingIndex(null);
            setName('');
            setEmail('');
          } catch {
            setError('Could not remove the contact. Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <Text style={ui.heading}>Emergency contacts</Text>
      <Text style={ui.body}>Distress emails go to these contacts and include your phone’s location when available. Save up to 10 people you trust.</Text>
      {loading ? <Text>Loading contacts…</Text> : (
        <>
          {contacts.map((contact, index) => (
            <View key={contact.email} style={styles.contact}>
              <Text style={ui.title}>{contact.name}</Text>
              <Text style={ui.body}>{contact.email}</Text>
              <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${contact.name}`} style={styles.textAction} onPress={() => startEdit(index)} disabled={busy} hitSlop={8}>
                <Text style={styles.link}>Edit</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${contact.name}`} style={styles.textAction} onPress={() => confirmRemove(index)} disabled={busy} hitSlop={8}>
                <Text style={[styles.link, styles.remove]}>Remove</Text>
              </Pressable>
              </View>
            </View>
          ))}
          {formVisible ? (
            <View style={ui.card}>
              <Text style={styles.label}>{editingIndex === null ? 'Add contact' : 'Edit contact'}</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName}
                accessibilityLabel="Contact name" placeholder="Contact name" autoCapitalize="words" editable={!busy} />
              <TextInput style={styles.input} value={email} onChangeText={setEmail}
                accessibilityLabel="Email address" placeholder="Email address" keyboardType="email-address"
                autoCapitalize="none" autoCorrect={false} editable={!busy} />
              <Pressable accessibilityRole="button" style={[styles.button, busy && ui.disabled]} onPress={save} disabled={busy}>
                <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save contact'}</Text>
              </Pressable>
              {contacts.length > 0 && (
                <Pressable accessibilityRole="button" style={styles.textAction} onPress={() => { setFormVisible(false); setError(''); }} disabled={busy}>
                  <Text style={styles.link}>Cancel</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Pressable accessibilityRole="button" style={[styles.button, (busy || contacts.length >= 10) && ui.disabled]} onPress={startAdd} disabled={busy || contacts.length >= 10}>
              <Text style={styles.buttonText}>{contacts.length >= 10 ? 'All 10 contact slots are filled' : 'Add a contact'}</Text>
            </Pressable>
          )}
          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, fontWeight: '600', color: '#172B4D' },
  input: { borderWidth: 1, borderColor: '#CCD7E6', borderRadius: 12, padding: 14, minHeight: 52, fontSize: 16, backgroundColor: '#FFFFFF', color: '#172B4D' },
  contact: { padding: 20, borderWidth: 1, borderColor: '#E1E7F0', borderRadius: 16, backgroundColor: '#FFFFFF', gap: 6 },
  actions: { flexDirection: 'row', gap: 28 },
  textAction: { minHeight: 44, justifyContent: 'center' },
  remove: { color: '#A4262C' },
  button: { backgroundColor: '#173B70', padding: 16, minHeight: 50, borderRadius: 12, marginTop: 8 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  link: { color: '#173B70', fontSize: 15, fontWeight: '600' },
  error: { color: '#B00020', marginTop: 16 },
});
