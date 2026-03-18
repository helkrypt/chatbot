import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifySysadmin } from '@/lib/n8n';

const WEBHOOK_SECRET = process.env.ONBOARDING_WEBHOOK_SECRET;

export async function POST(request) {
  const secret = request.headers.get('x-webhook-secret');
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 });
  }

  let clientId;
  try {
    const body = await request.json();
    clientId = body.clientId;
    const { systemPrompt } = body;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error: updateError } = await supabase.from('clients').update({
      active: true,
      status: 'active',
      onboarding_completed_at: new Date().toISOString(),
    }).eq('id', clientId);

    if (updateError) throw updateError;

    const { error: promptError } = await supabase.from('system_prompts').insert({
      client_id: clientId,
      content: systemPrompt,
      version: 1,
      active: true,
    });

    if (promptError) throw promptError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Client-ready API error:', error);
    notifySysadmin({
      type: 'internal_api_error',
      title: 'Client-ready feilet',
      details: error.message,
      clientId: clientId || 'ukjent',
      severity: 'error',
    }).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
