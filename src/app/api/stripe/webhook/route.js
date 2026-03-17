import { constructWebhookEvent, mapStripePlanToHelkrypt, generateClientSlug } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase-admin'
import { triggerClientOnboarding, notifyAdmin, sendEmail } from '@/lib/n8n'

export async function POST(req) {
  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return Response.json({ error: 'Mangler stripe-signature header' }, { status: 400 })
  }

  let event
  try {
    event = constructWebhookEvent(rawBody, signature)
  } catch (err) {
    console.error('[Stripe] Ugyldig webhook-signatur:', err.message)
    return Response.json({ error: 'Ugyldig signatur' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    switch (event.type) {

      // ── Nytt kjøp / abonnement aktivert ────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        await handleCheckoutCompleted(session, admin)
        break
      }

      // ── Abonnement oppdatert (plan-endring, betaling feilet/gjenopptatt) ───
      case 'customer.subscription.updated': {
        const sub = event.data.object
        await handleSubscriptionUpdated(sub, admin)
        break
      }

      // ── Abonnement kansellert ───────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await handleSubscriptionDeleted(sub, admin)
        break
      }

      default:
        console.log(`[Stripe] Ubehandlet event: ${event.type}`)
    }
  } catch (err) {
    console.error(`[Stripe] Feil ved håndtering av ${event.type}:`, err.message)
    await notifyAdmin({
      type: 'stripe_error',
      title: `Stripe webhook feilet: ${event.type}`,
      details: err.message,
      severity: 'error',
    }).catch(() => {})
    return Response.json({ error: 'Intern feil' }, { status: 500 })
  }

  return Response.json({ received: true })
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session, admin) {
  // Idempotency: sjekk om denne checkout-sessionen allerede er prosessert
  const { data: alreadyProcessed } = await admin.from('clients')
    .select('id')
    .filter('config->>stripe_checkout_id', 'eq', session.id)
    .maybeSingle()
  if (alreadyProcessed) {
    console.log(`[Stripe] Session allerede prosessert: ${session.id} (klient: ${alreadyProcessed.id})`)
    return
  }

  const customerEmail = session.customer_details?.email
  const customerName = session.customer_details?.name || ''
  const companyName = session.metadata?.company_name || customerName || 'Ny kunde'
  const orgnr = session.metadata?.orgnr || ''
  const websiteUrl = session.metadata?.website_url || ''
  const plan = mapStripePlanToHelkrypt(session)
  const stripeCustomerId = session.customer
  const stripeSubscriptionId = session.subscription

  // Generer unik klient-ID (slug)
  let clientId = generateClientSlug(companyName)

  // Sjekk at ID ikke allerede er i bruk — legg til suffix ved kollisjon
  const { data: existing } = await admin.from('clients').select('id').eq('id', clientId).single()
  if (existing) {
    clientId = `${clientId}-${Date.now().toString(36)}`
  }

  // Opprett klient
  const { data: client, error: clientErr } = await admin.from('clients').insert({
    id: clientId,
    name: companyName,
    plan,
    modules: [],
    escalation_email: customerEmail || '',
    chatbot_title: 'Kundeservice',
    active: false, // Aktiveres av n8n etter onboarding
    status: 'onboarding_pending',
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    config: {
      contact_email: customerEmail,
      contact_name: customerName,
      orgnr,
      stripe_checkout_id: session.id,
    },
  }).select().single()

  if (clientErr) throw new Error(`Klarte ikke opprette klient: ${clientErr.message}`)

  // Inviter admin-bruker
  if (customerEmail) {
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(customerEmail, {
      data: { role: 'admin', client_id: clientId },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${clientId}`,
    })
    if (!inviteErr && inviteData?.user?.id) {
      await admin.from('profiles').insert({
        id: inviteData.user.id,
        role: 'admin',
        client_id: clientId,
        notify_on_escalation: true,
      }).catch(err => console.error('[Stripe] Profil-opprettelse feilet:', err.message))
    }
  }

  // Send kjøpsbekreftelse via n8n
  const amount = session.amount_total ? Math.round(session.amount_total / 100) : 0
  const planLabel = { standard: 'Standard', profesjonell: 'Profesjonell', enterprise: 'Enterprise' }[plan] || plan
  await sendEmail({
    to: customerEmail,
    subject: 'Takk for kjøpet – din AI-chatbot settes opp nå!',
    html: `<div style="font-family:sans-serif;max-width:600px">
      <h2>🎉 Takk for kjøpet!</h2>
      <p>Hei ${customerName || 'der'},</p>
      <p>Betalingen for <strong>${planLabel}-pakken</strong> er bekreftet. Vi setter nå opp din AI-chatbot for <strong>${companyName}</strong>.</p>
      <p>Du vil motta en ny e-post med innloggingslenke til admin-dashboardet når chatboten er klar.</p>
      <p style="color:#6b7280;font-size:13px">Ordrenummer: ${session.id}<br>Beløp: ${amount} kr/mnd</p>
    </div>`,
    clientId,
  }).catch(err => console.warn('[Stripe] Kjøpsbekreftelse feilet:', err.message))

  // Trigger onboarding workflow
  try {
    await triggerClientOnboarding({
      clientId,
      companyName,
      orgnr,
      websiteUrl: websiteUrl || (client.domain ? `https://${client.domain}` : ''),
      adminEmail: customerEmail || '',
      adminName: customerName,
    })
  } catch (onboardErr) {
    console.error(`[Stripe] Onboarding feilet for ${clientId}:`, onboardErr.message)
    await admin.from('clients').update({ status: 'onboarding_failed' }).eq('id', clientId)
    await notifyAdmin({
      type: 'onboarding_failed',
      title: `Onboarding feilet: ${companyName}`,
      details: `Klient ${clientId} ble opprettet, men onboarding-workflow feilet: ${onboardErr.message}. Re-trigger fra admin-panelet.`,
      clientId,
      severity: 'error',
    }).catch(() => {})
    throw onboardErr // La webhook returnere 500 slik at Stripe prøver igjen
  }

  console.log(`[Stripe] Ny klient opprettet: ${clientId} (${companyName}, plan: ${plan})`)
}

async function handleSubscriptionUpdated(sub, admin) {
  const stripeCustomerId = sub.customer
  const { data: client } = await admin
    .from('clients')
    .select('id, plan')
    .eq('stripe_customer_id', stripeCustomerId)
    .single()

  if (!client) {
    console.warn(`[Stripe] Klient ikke funnet for customer: ${stripeCustomerId}`)
    return
  }

  // Bestem ny status basert på sub.status
  const updates = {
    stripe_subscription_id: sub.id,
  }

  if (sub.status === 'active' || sub.status === 'trialing') {
    updates.active = true
    updates.status = 'active'
  } else if (sub.status === 'past_due' || sub.status === 'unpaid') {
    // Behold aktiv men flagg som problematisk — ikke deaktiver umiddelbart
    console.warn(`[Stripe] Betalingsproblem for klient ${client.id}: ${sub.status}`)
  }

  // Oppdater plan hvis metadata er satt
  const newPlan = sub.metadata?.helkrypt_plan
  if (newPlan && ['standard', 'profesjonell', 'enterprise'].includes(newPlan)) {
    updates.plan = newPlan
  }

  await admin.from('clients').update(updates).eq('id', client.id)
  console.log(`[Stripe] Klient ${client.id} oppdatert:`, updates)
}

async function handleSubscriptionDeleted(sub, admin) {
  const stripeCustomerId = sub.customer
  const { data: client } = await admin
    .from('clients')
    .select('id, name')
    .eq('stripe_customer_id', stripeCustomerId)
    .single()

  if (!client) return

  await admin.from('clients').update({
    active: false,
    status: 'inactive',
  }).eq('id', client.id)

  await notifyAdmin({
    type: 'subscription_cancelled',
    title: `Abonnement kansellert: ${client.name}`,
    details: `Stripe subscription ${sub.id} er slettet. Klient ${client.id} er deaktivert.`,
    clientId: client.id,
    clientName: client.name,
    severity: 'warning',
  }).catch(() => {})

  console.log(`[Stripe] Klient ${client.id} deaktivert — abonnement kansellert`)
}
