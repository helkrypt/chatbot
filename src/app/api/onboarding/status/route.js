import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')

  if (!clientId) {
    return Response.json({ error: 'clientId er påkrevd' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('clients')
    .select('active, status, onboarding_completed_at, name')
    .eq('id', clientId)
    .single()

  return Response.json({ ready: data?.active === true, client: data })
}
