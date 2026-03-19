import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')

  if (!sessionId) {
    return Response.json({ error: 'session_id er påkrevd' }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status !== 'paid') {
      return Response.json({ error: 'Betaling ikke fullført' }, { status: 402 })
    }

    const companyName = session.metadata?.company_name || null
    const plan = session.metadata?.helkrypt_plan || 'standard'

    // Check if client is active
    const supabase = createAdminClient()
    const { data: client } = await supabase
      .from('clients')
      .select('id, active, status')
      .eq('config->>stripe_checkout_id', sessionId)
      .single()

    return Response.json({
      companyName,
      plan,
      active: client?.active || client?.status === 'active' || false,
      clientId: client?.id || null,
    })
  } catch (error) {
    console.error('[Stripe] checkout-status feil:', error.message)
    return Response.json({ error: 'Kunne ikke hente checkout-status' }, { status: 500 })
  }
}
