// Kjøres én gang for å re-embedde alle knowledge_chunks med OpenAI
// Usage: node --env-file=.env.local scripts/re-embed-all.js

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536');
const BATCH_SIZE = 50;

async function embed(texts) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data.map((item) => item.embedding);
}

async function reEmbedAll() {
  console.log(`Modell: ${EMBEDDING_MODEL}, dimensjoner: ${EMBEDDING_DIMENSIONS}`);

  let offset = 0;
  let processed = 0;
  let errors = 0;

  while (true) {
    const { data: chunks, error } = await supabase
      .from('knowledge_chunks')
      .select('id, content, client_id')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (!chunks || chunks.length === 0) break;

    const embeddings = await embed(chunks.map((c) => c.content));

    for (let i = 0; i < chunks.length; i++) {
      const { error: updateError } = await supabase
        .from('knowledge_chunks')
        .update({ embedding: embeddings[i] })
        .eq('id', chunks[i].id);

      if (updateError) {
        console.error(`Feil på chunk ${chunks[i].id} (${chunks[i].client_id}):`, updateError.message);
        errors++;
      }
    }

    processed += chunks.length;
    offset += BATCH_SIZE;
    console.log(`Re-embeddet ${processed} chunks (${errors} feil)...`);
  }

  console.log(`\nFerdig. Totalt: ${processed} chunks, ${errors} feil.`);
}

reEmbedAll().catch((err) => {
  console.error('Fatal feil:', err);
  process.exit(1);
});
