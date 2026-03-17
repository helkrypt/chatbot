import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { embed } from '@/lib/voyage';

const WEBHOOK_SECRET = process.env.ONBOARDING_WEBHOOK_SECRET;

export async function POST(request) {
  const secret = request.headers.get('x-webhook-secret');
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 });
  }

  const { clientId, content, source } = await request.json();

  const [embedding] = await embed(content, 'document');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { count: existingCount } = await supabase
    .from('knowledge_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId);

  await supabase.from('knowledge_chunks').insert({
    client_id: clientId,
    content,
    source_url: source || null,
    embedding,
    chunk_index: existingCount || 0,
  });

  return NextResponse.json({ success: true });
}
