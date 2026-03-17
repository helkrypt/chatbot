import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

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
  if (profile.role === 'sysadmin') return { user, profile, admin }
  if (profile.role === 'admin' && profile.client_id === clientId) return { user, profile, admin }
  return null
}

// GET /api/clients/[clientId]/users — list users for client
export async function GET(req, { params }) {
  const { clientId } = await params
  const auth = await getAuthorizedUser(clientId)
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { admin } = auth
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, role, notify_on_escalation, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Hent e-post fra auth.users for hvert profil-ID
  const usersWithEmail = await Promise.all(
    (profiles || []).map(async (p) => {
      try {
        const { data: { user } } = await admin.auth.admin.getUserById(p.id)
        return { ...p, email: user?.email || null }
      } catch {
        return { ...p, email: null }
      }
    })
  )

  return Response.json({ users: usersWithEmail })
}

// POST /api/clients/[clientId]/users — invite new user
export async function POST(req, { params }) {
  const { clientId } = await params
  const auth = await getAuthorizedUser(clientId)
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, role = 'agent', notify_on_escalation = false } = await req.json()
  if (!email) return Response.json({ error: 'E-post er påkrevd' }, { status: 400 })
  if (!['admin', 'agent'].includes(role)) {
    return Response.json({ error: 'Ugyldig rolle' }, { status: 400 })
  }

  const { admin } = auth
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role, client_id: clientId },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${clientId}`,
  })

  if (inviteErr) return Response.json({ error: inviteErr.message }, { status: 400 })

  const { error: profileErr } = await admin.from('profiles').insert({
    id: inviteData.user.id,
    role,
    client_id: clientId,
    notify_on_escalation,
  })

  if (profileErr) return Response.json({ error: profileErr.message }, { status: 500 })
  return Response.json({ ok: true, userId: inviteData.user.id }, { status: 201 })
}

// PATCH /api/clients/[clientId]/users — update user (notify_on_escalation, role)
export async function PATCH(req, { params }) {
  const { clientId } = await params
  const auth = await getAuthorizedUser(clientId)
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, notify_on_escalation, role } = await req.json()
  if (!userId) return Response.json({ error: 'userId er påkrevd' }, { status: 400 })

  const updates = {}
  if (notify_on_escalation !== undefined) updates.notify_on_escalation = notify_on_escalation
  if (role && ['admin', 'agent'].includes(role)) updates.role = role

  const { admin } = auth
  const { error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .eq('client_id', clientId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

// DELETE /api/clients/[clientId]/users — remove user from client
export async function DELETE(req, { params }) {
  const { clientId } = await params
  const auth = await getAuthorizedUser(clientId)
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = await req.json()
  if (!userId) return Response.json({ error: 'userId er påkrevd' }, { status: 400 })

  const { admin } = auth

  // Slett profil — bevarer Supabase auth-bruker (kan inviteres til annen klient)
  const { error } = await admin
    .from('profiles')
    .delete()
    .eq('id', userId)
    .eq('client_id', clientId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
