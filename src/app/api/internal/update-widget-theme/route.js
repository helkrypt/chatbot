import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const WEBHOOK_SECRET = process.env.ONBOARDING_WEBHOOK_SECRET;

export async function POST(request) {
  const secret = request.headers.get('x-webhook-secret');
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 });
  }

  const { clientId, widgetTheme } = await request.json();
  if (!clientId || !widgetTheme) {
    return NextResponse.json({ error: 'clientId og widgetTheme er påkrevd' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Hent eksisterende config og merge inn widget_theme
  const { data: existing } = await supabase
    .from('clients')
    .select('config')
    .eq('id', clientId)
    .single();

  const mergedConfig = {
    ...(existing?.config || {}),
    widget_theme: widgetTheme,
  };

  const { error } = await supabase
    .from('clients')
    .update({ config: mergedConfig })
    .eq('id', clientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, clientId, theme: widgetTheme });
}
