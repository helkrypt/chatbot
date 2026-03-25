import { createAdminClient } from '@/lib/supabase-admin'
import { createHmac } from 'crypto'

export async function POST(req) {
  // Valider Retell-signatur
  const signature = req.headers.get('x-retell-signature')
  if (signature && process.env.RETELL_WEBHOOK_SECRET) {
    const body = await req.text()
    const expected = createHmac('sha256', process.env.RETELL_WEBHOOK_SECRET)
      .update(body)
      .digest('hex')
    if (signature !== expected) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 })
    }
    var bodyData = JSON.parse(body)
  } else {
    var bodyData = await req.json()
  }

  const admin = createAdminClient()

  if (bodyData.event === 'call_started') {
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .filter('config->>retell_agent_id', 'eq', bodyData.data?.agent_id)
      .single()

    if (client) {
      await admin.from('conversations').insert({
        client_id: client.id,
        visitor_name: 'Telefonanrop',
        status: 'active',
        channel: 'phone',
        external_conversation_id: bodyData.data?.call_id,
      })
    }
  }

  if (bodyData.event === 'call_ended') {
    const { data: conv } = await admin
      .from('conversations')
      .select('id, client_id')
      .eq('external_conversation_id', bodyData.data?.call_id)
      .single()

    if (conv) {
      const durationMs = bodyData.data?.duration_ms || 0
      await admin.from('conversations').update({
        status: 'completed',
        call_duration_seconds: durationMs ? Math.round(durationMs / 1000) : null,
        call_transcript: bodyData.data?.transcript || null,
        updated_at: new Date().toISOString(),
      }).eq('id', conv.id)

      await updateVoiceUsage(admin, conv.client_id, durationMs)
    }
  }

  if (bodyData.event === 'call_analyzed') {
    const { data: conv } = await admin
      .from('conversations')
      .select('id')
      .eq('external_conversation_id', bodyData.data?.call_id)
      .single()

    if (conv) {
      await admin.from('conversations').update({
        call_summary: bodyData.data?.call_summary || null,
      }).eq('id', conv.id)
    }
  }

  return Response.json({ ok: true })
}

async function updateVoiceUsage(admin, clientId, durationMs) {
  const minutes = Math.ceil(durationMs / 60000)
  const period = new Date().toISOString().slice(0, 7)

  await admin.rpc('increment_voice_minutes', {
    p_client_id: clientId,
    p_period: period,
    p_minutes: minutes,
  })
}
