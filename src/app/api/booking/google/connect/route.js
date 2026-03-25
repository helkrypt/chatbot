import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
        return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    }

    // Verifiser at brukeren har tilgang til denne klienten
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .single()

    if (!client) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_APP_URL}/api/booking/google/callback`
    )

    const url = oauth2.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/calendar'],
        state: clientId,
    })

    return NextResponse.redirect(url)
}
