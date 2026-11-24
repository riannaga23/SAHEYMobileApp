import * as SecureStore from 'expo-secure-store';

export type EmergencyContact = { name: string; email: string };
export const MAX_EMERGENCY_CONTACTS = 10;

export function getEmergencyContactEmails(contacts: EmergencyContact[]): string[] {
  if (!contacts.length) throw new Error('Save at least one emergency contact before sending a distress email.');
  const emails = [...new Set(contacts.map(contact => contact.email.trim().toLowerCase()))];
  if (emails.length > MAX_EMERGENCY_CONTACTS) throw new Error(`Save at most ${MAX_EMERGENCY_CONTACTS} emergency contacts.`);
  if (emails.some(email => email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) {
    throw new Error('An emergency contact has an invalid email address. Correct it in Emergency Contacts before sending.');
  }
  if (emails.some(email => /@(?:[^@]+\.)?example\.(?:com|net|org)$/i.test(email))) {
    throw new Error('Replace placeholder email addresses in Emergency Contacts with real recipient addresses.');
  }
  return emails;
}

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
