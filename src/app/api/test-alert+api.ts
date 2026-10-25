// Development-only test route. A production alert route needs user/device authentication.
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return Response.json({ error: 'Test sending is available during local development only.' }, { status: 403 });
  }

  const key = process.env.RESEND_API_KEY;
  const from = process.env.SAHEY_FROM_EMAIL;
  const allowed = (process.env.SAHEY_TEST_RECIPIENTS ?? '')
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!key || !from || !allowed.length) {
    return Response.json({ error: 'Resend test settings are missing.' }, { status: 503 });
  }

  let to: unknown;
  try {
    ({ to } = await request.json());
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!Array.isArray(to) || !to.length || !to.every((email) =>
    typeof email === 'string' && allowed.includes(email.trim().toLowerCase()))
    || new Set(to.map((email: string) => email.trim().toLowerCase())).size !== to.length) {
    return Response.json({ error: 'Use only configured, unique test recipients.' }, { status: 403 });
  }

  // Separate messages keep each contact's email address private from the others.
  let accepted = 0;
  for (const email of to as string[]) {
    try {
      const result = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'TEST — SAHEY alert',
          text: 'This is a test of SAHEY. No assistance is needed.',
        }),
      });
      if (result.ok) accepted++;
    } catch {
      // Report failed recipients after attempting the remaining contacts.
    }
  }
  return Response.json({ accepted, failed: to.length - accepted });
}
