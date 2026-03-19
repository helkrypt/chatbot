import { createClient } from '@/lib/supabase-server'
import { checkPromptQuota } from '@/lib/promptQuota'

export async function GET(request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) return Response.json({ error: 'clientId er påkrevd' }, { status: 400 })

    try {
        const quota = await checkPromptQuota(clientId)
        return Response.json(quota)
    } catch (error) {
        console.error('Quota status error:', error)
        return Response.json({ error: error.message }, { status: 500 })
    }
}
