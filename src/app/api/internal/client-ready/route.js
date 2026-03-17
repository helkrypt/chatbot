import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const WEBHOOK_SECRET = process.env.ONBOARDING_WEBHOOK_SECRET;

export async function POST(request) {
  const secret = request.headers.get('x-webhook-secret');
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 });
  }

  const { clientId, systemPrompt } = await request.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  await supabase.from('clients').update({
    active: true,
    status: 'active',
    onboarding_completed_at: new Date().toISOString(),
  }).eq('id', clientId);

  await supabase.from('system_prompts').insert({
    client_id: clientId,
    content: systemPrompt,
    version: 1,
    active: true,
  });

  return NextResponse.json({ success: true });
}
