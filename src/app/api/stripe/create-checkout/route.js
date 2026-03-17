import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  analytics: false,
})

const PRICE_IDS = {
  standard: process.env.STRIPE_PRICE_STANDARD,
  profesjonell: process.env.STRIPE_PRICE_PROFESJONELL,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
}

export async function POST(request) {
  // Dobbelt auth-modus: sysadmin trenger ikke rate limiting, anonym får rate limit
  let isSysadmin = false
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const admin = createAdminClient()
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role === 'sysadmin') isSysadmin = true
    }
  } catch {
    // Ingen innlogget bruker — tillatt for anonym tilgang
  }

  // Rate limit for anonyme brukere
  if (!isSysadmin) {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    try {
      const { success } = await ratelimit.limit(`checkout:${ip}`)
      if (!success) {
        return Response.json({ error: 'For mange forespørsler' }, { status: 429 })
      }
    } catch {
      // Fail open
    }
  }

  try {
    const { plan, companyName, orgnr, websiteUrl, customerEmail } = await request.json()

    if (!plan || !companyName || !customerEmail) {
      return Response.json({ error: 'plan, companyName og customerEmail er påkrevd' }, { status: 400 })
    }

    const priceId = PRICE_IDS[plan]
    if (!priceId) {
      return Response.json({ error: `Ugyldig plan: ${plan}. Gyldige planer: standard, profesjonell, enterprise` }, { status: 400 })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: customerEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        helkrypt_plan: plan,
        company_name: companyName,
        orgnr: orgnr || '',
        website_url: websiteUrl || '',
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/cancel`,
    })

    return Response.json({ url: session.url })

  } catch (error) {
    console.error('[Stripe] Checkout feil:', error.message)
    return Response.json({ error: 'Kunne ikke opprette checkout-session' }, { status: 500 })
  }
}
