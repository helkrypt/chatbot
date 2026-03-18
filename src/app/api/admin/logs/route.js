import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

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

export async function GET(request) {
  const user = await getSysadminUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const action = searchParams.get('action')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const offset = parseInt(searchParams.get('offset') || '0')

  const admin = createAdminClient()
  let query = admin
    .from('audit_log')
    .select('*, profiles!audit_log_user_id_fkey(role, client_id)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (clientId) query = query.eq('client_id', clientId)
  if (action) query = query.eq('action', action)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)

  const { data, count, error } = await query

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ logs: data, total: count })
}
