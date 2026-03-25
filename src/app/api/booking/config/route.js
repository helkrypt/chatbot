import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

// GET /api/booking/config?clientId=xxx
export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
        return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: config } = await admin
        .from('booking_configs')
        .select('id, provider, calendar_id, active, services, business_hours')
        .eq('client_id', clientId)
        .eq('active', true)
        .single()

    return NextResponse.json({ config: config || null })
}

// PATCH /api/booking/config — oppdater tjenester og åpningstider
export async function PATCH(req) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { clientId, services, business_hours, calendar_id } = body

    if (!clientId) {
        return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    }

    const updates = { updated_at: new Date().toISOString() }
    if (services !== undefined) updates.services = services
    if (business_hours !== undefined) updates.business_hours = business_hours
    if (calendar_id !== undefined) updates.calendar_id = calendar_id

    const admin = createAdminClient()
    const { data, error } = await admin
        .from('booking_configs')
        .update(updates)
        .eq('client_id', clientId)
        .eq('active', true)
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ config: data })
}

// DELETE /api/booking/config — koble fra
export async function DELETE(req) {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
        return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    await admin
        .from('booking_configs')
        .update({ active: false, access_token: null, refresh_token: null, updated_at: new Date().toISOString() })
        .eq('client_id', clientId)

    return NextResponse.json({ success: true })
}
