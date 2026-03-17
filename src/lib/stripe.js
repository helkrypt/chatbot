import Stripe from 'stripe'

let _stripe = null
export function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  }
  return _stripe
}

/**
 * Mapper Stripe product metadata til Helkrypt plan-navn
 * Sett metadata på Stripe-produktet: { helkrypt_plan: "standard" | "profesjonell" | "enterprise" }
 */
export function mapStripePlanToHelkrypt(session) {
  return session.metadata?.helkrypt_plan || 'standard'
}

/**
 * Slugifiserer bedriftsnavn til klient-ID
 * Samme logikk som i admin-klientskjemaet
 */
export function generateClientSlug(name) {
  return (name || '')
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

/**
 * Valider Stripe webhook-signatur
 * Kaster feil hvis signaturen er ugyldig
 */
export function constructWebhookEvent(rawBody, signature) {
  return getStripe().webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  )
}
