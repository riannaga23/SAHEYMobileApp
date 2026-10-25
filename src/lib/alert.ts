import { loadEmergencyContacts } from './emergencyContact';

export async function previewTestAlert() {
  const contacts = await loadEmergencyContacts();
  if (!contacts.length) return null;

  return {
    to: contacts.map((contact) => contact.email),
    subject: 'TEST — SAHEY alert',
    message: 'This is a test of SAHEY. No assistance is needed.',
  };
}

export async function sendTestAlert() {
  const alert = await previewTestAlert();
  if (!alert) throw new Error('Save an emergency contact first.');
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl) throw new Error('Set EXPO_PUBLIC_API_URL in .env.local first.');
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/test-alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: alert.to }),
  });
  if (!response.ok) throw new Error('Test email could not be sent. Check the approved recipients and server settings.');
  return response.json() as Promise<{ accepted: number; failed: number }>;
}
