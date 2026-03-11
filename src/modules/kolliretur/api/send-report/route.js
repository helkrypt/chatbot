import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
    try {
        const { data: activeKollis, error: kError } = await supabase
            .from('kollis')
            .select('*, kolli_items(*)')
            .eq('status', 'active')

        if (kError) throw kError

        if (!activeKollis || activeKollis.length === 0) {
            return Response.json({ error: 'Ingen aktive kolli å sende.' }, { status: 400 })
        }

        const payload = {
            recipient: process.env.KOLLIRETUR_EMAIL || 'peders1@cityrtv.no',
            kollis: activeKollis.map(k => ({
                name: k.name,
                item_count: k.kolli_items.length,
                items: k.kolli_items.map(i => ({
                    delenummer: (i.delenummer || '').replace(/[^0-9]/g, ''),
                    ordrenummer: i.ordrenummer,
                    antall: i.antall || 1
                }))
            }))
        }

        const n8nUrl = process.env.N8N_NOTIFICATION_WEBHOOK_URL
        if (n8nUrl) {
            const webhookRes = await fetch(n8nUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            if (!webhookRes.ok) {
                const text = await webhookRes.text()
                throw new Error(`Feil fra webhook: ${webhookRes.status} ${text}`)
            }
        }

        const ids = activeKollis.map(k => k.id)
        const { error: uError } = await supabase.from('kollis').update({ status: 'sent' }).in('id', ids)
        if (uError) throw uError

        return Response.json({ success: true, count: activeKollis.length })
    } catch (error) {
        console.error('Report error:', error)
        return Response.json({ error: error.message }, { status: 500 })
    }
}
