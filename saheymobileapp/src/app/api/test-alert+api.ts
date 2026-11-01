// Development-only test route. A production alert route needs user/device authentication.
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'Test sending is available during local development only.' }, { status: 403 });
  }

  const key = process.env.RESEND_API_KEY;
  const from = process.env.SAHEY_FROM_EMAIL;
  if (!key || !from) {
    const missing = [!key && 'email API key', !from && 'sender email address'].filter(Boolean);
    return Response.json({ error: `Email server is missing: ${missing.join(', ')}. Check saheymobileapp/.env.local and fully restart Expo.` }, { status: 503 });
  }

  let to: unknown;
  let location: unknown;
  try {
    ({ to, location } = await request.json());
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!Array.isArray(to) || !to.length || to.length > 10 || !to.every((email) =>
    typeof email === 'string' && email.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    || new Set(to.map((email: string) => email.trim().toLowerCase())).size !== to.length) {
    return Response.json({ error: 'Save between 1 and 10 contacts with valid, unique email addresses.' }, { status: 400 });
  }
  // Contacts are saved on the phone, not in a separate server-side recipient list.
  const recipients = (to as string[]).map(email => email.trim().toLowerCase());

  let message = 'This is a test of Halo. No assistance is needed.';
  if (location !== undefined) {
    if (!location || typeof location !== 'object') {
      return Response.json({ error: 'Invalid location.' }, { status: 400 });
    }
    const { latitude, longitude, acquiredAt } = location as Record<string, unknown>;
    const timestamp = typeof acquiredAt === 'string' ? Date.parse(acquiredAt) : NaN;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180
      || !Number.isFinite(timestamp) || Date.now() - timestamp > 60_000 || timestamp > Date.now() + 10_000) {
      return Response.json({ error: 'Location is invalid or older than one minute. Acquire a fresh GPS location and try again.' }, { status: 400 });
    }
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    message += `\n\nHere is my current location:\nLatitude: ${latitude}\nLongitude: ${longitude}\nGoogle Maps: ${mapsUrl}\nGPS acquired: ${new Date(timestamp).toISOString()}\nShared at: ${new Date().toISOString()}`;
  }

  // Separate messages keep each contact's email address private from the others.
  let accepted = 0;
  let failureReason = 'Email delivery was not confirmed. Check the backend connection and Resend dashboard.';
  for (const email of recipients) {
    try {
      const result = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'TEST — Halo alert',
          text: message,
        }),
      });
      const body = await result.json();
      if (result.ok && typeof body.id === 'string' && body.id) accepted++;
      else if (typeof body.message === 'string' && /only send testing|verify a domain|domain.*not verified/i.test(body.message)) {
        failureReason = 'Resend requires a verified sender domain to email other people. Verify a domain in Resend and update the configured sender address to use that domain. The resend.dev test sender can only email your Resend account address.';
      } else {
        failureReason = `Resend did not confirm the email (HTTP ${result.status}). Check your sender address, API key permissions, and Resend dashboard.`;
      }
    } catch (cause) {
      const code = (cause as { cause?: { code?: string } })?.cause?.code;
      failureReason = code === 'EACCES' || code === 'EPERM'
        ? 'The Expo server is blocked from accessing Resend by its execution environment. Restart npm run android:email in your own PowerShell terminal.'
        : 'The email server could not connect to Resend or read its response. Delivery is unconfirmed; check your connection and provider dashboard before retrying.';
    }
  }
  if (!accepted) return Response.json({ error: failureReason, accepted: 0, failed: recipients.length }, { status: 502 });
  return Response.json({ accepted, failed: recipients.length - accepted });
}
