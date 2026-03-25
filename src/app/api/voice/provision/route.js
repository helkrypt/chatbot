import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

const RETELL_API_URL = 'https://api.retellai.com'

async function getAuthorizedUser(clientId) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  if (!profile) return null
  if (profile.role === 'sysadmin') return user
  if (profile.role === 'admin' && profile.client_id === clientId) return user
  return null
}

export async function POST(req) {
  const { clientId, numberType } = await req.json()

  if (!clientId) {
    return Response.json({ error: 'Missing clientId' }, { status: 400 })
  }

  const user = await getAuthorizedUser(clientId)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const retellKey = process.env.RETELL_API_KEY
  if (!retellKey) {
    return Response.json({ error: 'RETELL_API_KEY er ikke konfigurert' }, { status: 500 })
  }

  const admin = createAdminClient()

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('name, config')
    .eq('id', clientId)
    .single()

  if (clientError || !client) {
    return Response.json({ error: 'Client not found' }, { status: 404 })
  }

  // Opprett Retell AI-agent
  const agentRes = await fetch(`${RETELL_API_URL}/create-agent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${retellKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_name: `${client.name} — Helkrypt`,
      response_engine: {
        type: 'custom_llm',
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/llm?client_id=${clientId}`,
        version: 'v2',
      },
      voice_id: process.env.ELEVENLABS_VOICE_NO || 'retell-default-no',
      language: 'no-NO',
      end_call_after_silence_ms: 8000,
      webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook`,
    }),
  })

  if (!agentRes.ok) {
    const err = await agentRes.text()
    return Response.json({ error: `Retell agent feilet: ${err}` }, { status: 502 })
  }

  const agent = await agentRes.json()

  // Koble telefonnummer til agent
  const phonePayload = {
    area_code: 47,
    inbound_agent_id: agent.agent_id,
  }

  const phoneRes = await fetch(`${RETELL_API_URL}/create-phone-number`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${retellKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(phonePayload),
  })

  if (!phoneRes.ok) {
    const err = await phoneRes.text()
    return Response.json({ error: `Retell telefonnummer feilet: ${err}` }, { status: 502 })
  }

  const phone = await phoneRes.json()

  // Lagre i klientens config (merge, ikke overskriv)
  await admin.from('clients').update({
    config: {
      ...(client.config || {}),
      retell_agent_id: agent.agent_id,
      voice_phone_number: phone.phone_number,
      voice_enabled: true,
      voice_number_type: numberType || 'new',
    },
  }).eq('id', clientId)

  return Response.json({
    ok: true,
    phoneNumber: phone.phone_number,
    agentId: agent.agent_id,
  })
}
