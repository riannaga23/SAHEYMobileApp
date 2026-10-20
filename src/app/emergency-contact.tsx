import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { previewTestAlert, sendTestAlert } from '../lib/alert';
import { type EmergencyContact, loadEmergencyContacts, saveEmergencyContacts } from '../lib/emergencyContact';

type Preview = Awaited<ReturnType<typeof previewTestAlert>>;

export default function EmergencyContactScreen() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview>(null);

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
    setBusy(true);
    setError('');
    try {
      await saveEmergencyContacts(updated);
      setContacts(updated);
      setFormVisible(false);
      setEditingIndex(null);
      setName('');
      setEmail('');
      setPreview(null);
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
            setPreview(null);
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

  async function showPreview() {
    setBusy(true);
    setError('');
    try {
      setPreview(await previewTestAlert());
    } catch {
      setError('Could not load the contacts for the preview.');
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail() {
    setBusy(true);
    setError('');
    try {
      const { accepted, failed } = await sendTestAlert();
      Alert.alert('Test email results', `${accepted} accepted by Resend; ${failed} failed. Check the recipients' inboxes.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send test emails.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Emergency Contacts</Text>
      {loading ? <Text>Loading contacts…</Text> : (
        <>
          {contacts.map((contact, index) => (
            <View key={contact.email} style={styles.contact}>
              <Text style={styles.detail}>{contact.name}</Text>
              <Text style={styles.detail}>{contact.email}</Text>
              <Pressable onPress={() => startEdit(index)} disabled={busy}>
                <Text style={styles.link}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => confirmRemove(index)} disabled={busy}>
                <Text style={styles.link}>Remove</Text>
              </Pressable>
            </View>
          ))}
          {formVisible ? (
            <>
              <Text style={styles.label}>{editingIndex === null ? 'Add contact' : 'Edit contact'}</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName}
                placeholder="Contact name" autoCapitalize="words" editable={!busy} />
              <TextInput style={styles.input} value={email} onChangeText={setEmail}
                placeholder="contact@example.com" keyboardType="email-address"
                autoCapitalize="none" autoCorrect={false} editable={!busy} />
              <Pressable style={styles.button} onPress={save} disabled={busy}>
                <Text style={styles.buttonText}>Save contact</Text>
              </Pressable>
              {contacts.length > 0 && (
                <Pressable onPress={() => { setFormVisible(false); setError(''); }} disabled={busy}>
                  <Text style={styles.link}>Cancel</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Pressable style={styles.button} onPress={startAdd} disabled={busy}>
              <Text style={styles.buttonText}>Add another contact</Text>
            </Pressable>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {contacts.length > 0 && (
            <>
              <Pressable style={styles.testButton} onPress={showPreview} disabled={busy}>
                <Text style={styles.testButtonText}>Preview test alert</Text>
              </Pressable>
              {preview && (
                <View style={styles.preview}>
                  <Text style={styles.label}>Preview only — no email sent</Text>
                  <Text>To: {preview.to.join(', ')}</Text>
                  <Text>Subject: {preview.subject}</Text>
                  <Text>Message: {preview.message}</Text>
                </View>
              )}
              <Pressable style={styles.testButton} onPress={sendEmail} disabled={busy}>
                <Text style={styles.testButtonText}>Send test email to all (development only)</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: '#FFFFFF' },
  heading: { fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#CCCCCC', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 20 },
  contact: { padding: 16, borderWidth: 1, borderColor: '#CCCCCC', borderRadius: 10, marginBottom: 12 },
  detail: { fontSize: 17, marginBottom: 6 },
  button: { backgroundColor: '#173B70', padding: 16, borderRadius: 10, marginTop: 8 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  testButton: { padding: 16, borderWidth: 1, borderColor: '#173B70', borderRadius: 10, marginTop: 28 },
  testButtonText: { color: '#173B70', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  link: { color: '#173B70', marginTop: 12, fontSize: 16 },
  error: { color: '#B00020', marginTop: 16 },
  preview: { backgroundColor: '#EAF2FF', padding: 16, borderRadius: 10, gap: 8, marginTop: 16 },
});
