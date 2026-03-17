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

  // Valider widget_theme-felt
  const allowedKeys = ['primary_color', 'bubble_color', 'text_color', 'background_color', 'font_family', 'header_text', 'welcome_message', 'logo_url'];
  const unknownKeys = Object.keys(widgetTheme).filter(k => !allowedKeys.includes(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json({ error: `Ukjente felt: ${unknownKeys.join(', ')}` }, { status: 400 });
  }

  const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
  const colorFields = ['primary_color', 'bubble_color', 'text_color', 'background_color'];
  for (const field of colorFields) {
    if (widgetTheme[field] && !hexColorRegex.test(widgetTheme[field])) {
      return NextResponse.json({ error: `${field} må være en gyldig hex-farge (f.eks. #111827)` }, { status: 400 });
    }
  }
  if (widgetTheme.header_text && widgetTheme.header_text.length > 60) {
    return NextResponse.json({ error: 'header_text kan maks være 60 tegn' }, { status: 400 });
  }
  if (widgetTheme.welcome_message && widgetTheme.welcome_message.length > 200) {
    return NextResponse.json({ error: 'welcome_message kan maks være 200 tegn' }, { status: 400 });
  }
  if (widgetTheme.logo_url && !widgetTheme.logo_url.startsWith('https://')) {
    return NextResponse.json({ error: 'logo_url må starte med https://' }, { status: 400 });
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
