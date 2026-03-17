import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { triggerClientOnboarding } from '@/lib/n8n'

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

export async function GET(req, { params }) {
  const { clientId } = await params
  const user = await getAuthorizedUser(clientId)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (error) return Response.json({ error: error.message }, { status: 404 })
  return Response.json({ client: data })
}

export async function PATCH(req, { params }) {
  const { clientId } = await params
  const user = await getAuthorizedUser(clientId)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Spesialhåndtering: re-trigger onboarding
  if (body.retrigger_onboarding) {
    const admin = createAdminClient()
    const { data: client } = await admin.from('clients').select('*').eq('id', clientId).single()
    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 })

    await admin.from('clients').update({ status: 'onboarding_pending' }).eq('id', clientId)
    await triggerClientOnboarding({
      clientId,
      companyName: client.name,
      orgnr: client.config?.orgnr || '',
      websiteUrl: client.domain || '',
      adminEmail: client.config?.contact_email || client.escalation_email || '',
      adminName: client.config?.contact_name || '',
    })
    return Response.json({ ok: true })
  }

  const allowed = ['name', 'domain', 'plan', 'modules', 'escalation_email', 'chatbot_title', 'webhook_url', 'opening_hours', 'active', 'config']
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))

  const admin = createAdminClient()

  // Merge config JSONB i stedet for å overskrive hele feltet
  if (updates.config) {
    const { data: existing } = await admin
      .from('clients')
      .select('config')
      .eq('id', clientId)
      .single()
    updates.config = { ...(existing?.config || {}), ...updates.config }
  }

  const { data, error } = await admin
    .from('clients')
    .update(updates)
    .eq('id', clientId)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ client: data })
}

export async function DELETE(req, { params }) {
  const { clientId } = await params

  // Only sysadmin can delete clients
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'sysadmin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await admin.from('clients').update({
    active: false,
    status: 'deleted',
    deleted_at: new Date().toISOString(),
  }).eq('id', clientId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
