import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { embed } from '@/lib/voyage';
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
    const { content, source } = body;

    const [embedding] = await embed(content, 'document');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { count: existingCount } = await supabase
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId);

    const { error } = await supabase.from('knowledge_chunks').insert({
      client_id: clientId,
      content,
      source_url: source || null,
      embedding,
      chunk_index: existingCount || 0,
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Embeddings API error:', error);
    notifySysadmin({
      type: 'internal_api_error',
      title: 'Embedding-generering feilet',
      details: error.message,
      clientId: clientId || 'ukjent',
      severity: 'error',
    }).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
