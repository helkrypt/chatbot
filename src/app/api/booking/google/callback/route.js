import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export async function GET(req) {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const clientId = searchParams.get('state')
    const error = searchParams.get('error')

    if (error || !code || !clientId) {
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL}/settings?booking=error`
        )
    }

    const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_APP_URL}/api/booking/google/callback`
    )

    try {
        const { tokens } = await oauth2.getToken(code)
        const admin = createAdminClient()

        await admin.from('booking_configs').upsert(
            {
                client_id: clientId,
                provider: 'google_calendar',
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                active: true,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'client_id,provider' }
        )

        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL}/settings?booking=connected`
        )
    } catch (err) {
        console.error('Google OAuth callback feilet:', err)
        return NextResponse.redirect(
            `${process.env.NEXT_PUBLIC_APP_URL}/settings?booking=error`
        )
    }
}
