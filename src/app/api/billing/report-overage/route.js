import { createClient } from '@/lib/supabase-server'
import { checkPromptQuota, incrementPromptUsage } from '@/lib/promptQuota'

export async function POST(request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { clientId } = await request.json()
        if (!clientId) return Response.json({ error: 'clientId er påkrevd' }, { status: 400 })

        // Sjekk kvote FØR inkrement
        const quota = await checkPromptQuota(clientId)

        // Inkrementer teller i Supabase
        const newCount = await incrementPromptUsage(clientId)

        // Rapporter til Stripe kun ved overage og hvis Stripe er konfigurert
        if (quota.isOverage) {
            const { data: client } = await supabase
                .from('clients')
                .select('stripe_overage_subscription_item_id')
                .eq('id', clientId)
                .single()

            if (client?.stripe_overage_subscription_item_id && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('PLACEHOLDER')) {
                try {
                    const Stripe = (await import('stripe')).default
                    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

                    await stripe.subscriptionItems.createUsageRecord(
                        client.stripe_overage_subscription_item_id,
                        {
                            quantity: 1,
                            timestamp: Math.floor(Date.now() / 1000),
                            action: 'increment',
                        }
                    )

                    // Marker som fakturert
                    const period = new Date().toISOString().slice(0, 7)
                    await supabase
                        .from('prompt_change_usage')
                        .update({ billed_count: newCount - (quota.included ?? 1) })
                        .eq('client_id', clientId)
                        .eq('period', period)
                } catch (stripeErr) {
                    console.error('Stripe overage reporting failed:', stripeErr)
                    // Ikke kast feil — usage er allerede telt, Stripe-rapportering er best-effort
                }
            }
        }

        return Response.json({
            success: true,
            usageCount: newCount,
            isOverage: quota.isOverage,
            included: quota.included,
        })
    } catch (error) {
        console.error('Report overage error:', error)
        return Response.json({ error: error.message }, { status: 500 })
    }
}
