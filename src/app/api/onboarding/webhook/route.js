import { createAdminClient } from '@/lib/supabase-admin'
import { notifySysadmin } from '@/lib/n8n'

export async function POST(req) {
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== process.env.ONBOARDING_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    clientId,
    name,
    domain,
    plan,
    modules,
    escalationEmail,
    chatbotTitle,
    systemPrompt,
    openingHours,
    webhookUrl,
  } = await req.json()

  if (!clientId || !name || !systemPrompt) {
    return Response.json({ error: 'Missing required fields: clientId, name, systemPrompt' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error: clientError } = await admin.from('clients').upsert({
    id: clientId,
    name,
    domain,
    plan: plan || 'standard',
    modules: modules || [],
    escalation_email: escalationEmail,
    chatbot_title: chatbotTitle || 'Kundeservice',
    opening_hours: openingHours || null,
    webhook_url: webhookUrl || null,
  })

  if (clientError) {
    notifySysadmin({
      type: 'onboarding_error',
      title: 'Onboarding webhook: klient-upsert feilet',
      details: clientError.message,
      clientId,
      clientName: name,
      severity: 'error',
    }).catch(() => {});
    return Response.json({ error: clientError.message }, { status: 500 })
  }

  const { error: promptError } = await admin.from('system_prompts').insert({
    client_id: clientId,
    content: systemPrompt,
    active: true,
  })

  if (promptError) {
    notifySysadmin({
      type: 'onboarding_error',
      title: 'Onboarding webhook: systemprompt-insert feilet',
      details: promptError.message,
      clientId,
      clientName: name,
      severity: 'error',
    }).catch(() => {});
  }

  await admin.from('onboarding_log').insert({
    client_id: clientId,
    step: 'webhook_complete',
    status: promptError ? 'partial' : 'success',
  })

  return Response.json({ ok: true, clientId })
}
