import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const WEBHOOK_SECRET = process.env.ONBOARDING_WEBHOOK_SECRET;

export async function POST(request) {
  const secret = request.headers.get('x-webhook-secret');
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 });
  }

  const { clientId, content, source } = await request.json();

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: content,
  });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  await supabase.from('knowledge_base').insert({
    client_id: clientId,
    content,
    source,
    embedding: embedding.data[0].embedding,
  });

  return NextResponse.json({ success: true });
}
