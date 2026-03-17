import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { triggerClientOnboarding, notifyAdmin } from '@/lib/n8n'

async function getSysadminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'sysadmin' ? user : null
}

export async function GET() {
  const user = await getSysadminUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ clients: data })
}

export async function POST(req) {
  const user = await getSysadminUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, name, domain, plan, modules, escalationEmail, chatbotTitle, webhookUrl, config } = body

  if (!id || !name || !plan) {
    return Response.json({ error: 'Missing required fields: id, name, plan' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .insert({
      id,
      name,
      domain,
      plan,
      modules: modules || [],
      escalation_email: escalationEmail,
      chatbot_title: chatbotTitle || 'Kundeservice',
      webhook_url: webhookUrl || null,
      config: config || {},
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Trigger onboarding workflow (ikke-blokkerende)
  try {
    await triggerClientOnboarding({
      clientId: data.id,
      companyName: name,
      orgnr: body.orgnr || '',
      websiteUrl: domain ? `https://${domain}` : '',
      adminEmail: body.adminEmail || '',
      adminName: body.adminName || '',
    });
  } catch (err) {
    console.error('[Onboarding] n8n trigger feilet:', err);
    await notifyAdmin({
      type: 'onboarding_error',
      title: 'Onboarding workflow feilet',
      details: err.message,
      clientId: data.id,
      clientName: name,
      severity: 'error',
    }).catch(() => {});
  }

  return Response.json({ client: data }, { status: 201 })
}
