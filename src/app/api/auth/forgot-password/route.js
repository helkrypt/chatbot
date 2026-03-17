import { sendPasswordResetEmail } from '@/lib/n8n';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { email } = await request.json();

  const admin = createAdminClient();

  // Finn bruker
  const { data: { users }, error } = await admin.auth.admin.listUsers();
  const user = users?.find(u => u.email === email);

  if (!user) {
    // Returner alltid 200 for sikkerhet (ikke avslør om e-post finnes)
    return NextResponse.json({ success: true });
  }

  // Bruk Supabase innebygd passord-reset link
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
  });

  if (linkError) {
    console.error('[PasswordReset] Kunne ikke generere reset-link:', linkError);
    return NextResponse.json({ error: 'Kunne ikke sende e-post' }, { status: 500 });
  }

  const resetUrl = linkData.properties?.action_link;
  const name = user.user_metadata?.full_name || email;

  try {
    await sendPasswordResetEmail({
      to: email,
      name,
      resetUrl,
      expiresInMinutes: 60,
    });
  } catch (err) {
    console.error('[PasswordReset] n8n e-post feilet:', err);
    return NextResponse.json({ error: 'Kunne ikke sende e-post' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
