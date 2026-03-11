import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req) {
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== process.env.ONBOARDING_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { clientId, chunks } = await req.json()
  // chunks: [{ content: string, embedding: number[], sourceUrl?: string }]

  if (!clientId || !Array.isArray(chunks)) {
    return Response.json({ error: 'Missing required fields: clientId, chunks' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Delete existing chunks for re-onboarding
  await admin.from('knowledge_chunks').delete().eq('client_id', clientId)

  const rows = chunks.map((c, i) => ({
    client_id: clientId,
    content: c.content,
    embedding: c.embedding,
    source_url: c.sourceUrl || null,
    chunk_index: i,
  }))

  const { error } = await admin.from('knowledge_chunks').insert(rows)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true, inserted: rows.length })
}
