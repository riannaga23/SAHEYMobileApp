import * as SecureStore from 'expo-secure-store';

export type EmergencyContact = { name: string; email: string };

const CONTACTS_KEY = 'sahey.emergency-contacts-email';
const OLD_CONTACT_KEY = 'sahey.emergency-contact-email';

function isContact(value: unknown): value is EmergencyContact {
  return !!value && typeof value === 'object' && 'name' in value && 'email' in value
    && typeof value.name === 'string' && typeof value.email === 'string';
}

export async function loadEmergencyContacts(): Promise<EmergencyContact[]> {
  const saved = await SecureStore.getItemAsync(CONTACTS_KEY);
  if (saved !== null) {
    const contacts: unknown = JSON.parse(saved);
    return Array.isArray(contacts) ? contacts.filter(isContact) : [];
  }
  // Show a contact saved by the earlier single-contact version.
  const old = await SecureStore.getItemAsync(OLD_CONTACT_KEY);
  if (!old) return [];
  const contact: unknown = JSON.parse(old);
  return isContact(contact) ? [contact] : [];
}

export async function saveEmergencyContacts(contacts: EmergencyContact[]): Promise<void> {
  // Store an empty list too, so a removed legacy contact does not reappear.
  await SecureStore.setItemAsync(CONTACTS_KEY, JSON.stringify(contacts));
}
