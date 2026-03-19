import { createClient } from '@/lib/supabase-server'

/**
 * Sjekker kvotestatus for en klient denne måneden.
 * Returnerer { allowed, usageCount, included, isOverage, overagePrice }
 */
export async function checkPromptQuota(clientId) {
    const supabase = await createClient()
    const period = new Date().toISOString().slice(0, 7) // '2026-03'

    const [{ data: client }, { data: usage }] = await Promise.all([
        supabase
            .from('clients')
            .select('prompt_changes_included, prompt_change_overage_price')
            .eq('id', clientId)
            .single(),
        supabase
            .from('prompt_change_usage')
            .select('usage_count')
            .eq('client_id', clientId)
            .eq('period', period)
            .maybeSingle(),
    ])

    const usageCount = usage?.usage_count ?? 0
    const included = client?.prompt_changes_included ?? 1
    const overagePrice = client?.prompt_change_overage_price ?? 14900

    return {
        allowed: true, // Vi tillater alltid — overage faktureres i etterkant
        usageCount,
        included,
        isOverage: usageCount >= included,
        overagePrice,
    }
}

/**
 * Inkrementerer prompt-bruksteller atomisk.
 * Returnerer oppdatert usage_count.
 */
export async function incrementPromptUsage(clientId) {
    const supabase = await createClient()
    const period = new Date().toISOString().slice(0, 7)

    const { data, error } = await supabase.rpc('increment_prompt_usage', {
        p_client_id: clientId,
        p_period: period,
    })

    if (error) throw error
    return data
}
