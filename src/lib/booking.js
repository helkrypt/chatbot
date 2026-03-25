import { createAdminClient } from '@/lib/supabase-admin'
import {
    checkGoogleAvailability,
    bookGoogleAppointment,
} from '@/lib/booking-google'

export async function getBookingConfig(clientId) {
    const admin = createAdminClient()
    const { data } = await admin
        .from('booking_configs')
        .select('*')
        .eq('client_id', clientId)
        .eq('active', true)
        .single()
    return data || null
}

export async function checkAvailability({ clientId, date, serviceType }) {
    const config = await getBookingConfig(clientId)
    if (!config) return { slots: [], error: 'Booking ikke konfigurert' }

    switch (config.provider) {
        case 'google_calendar':
            return checkGoogleAvailability(config, date, serviceType)
        default:
            return { slots: [], error: 'Ukjent booking-leverandør' }
    }
}

export async function bookAppointment({ clientId, date, time, serviceType, customerName, customerPhone, customerEmail }) {
    const config = await getBookingConfig(clientId)
    if (!config) return { success: false, error: 'Booking ikke konfigurert' }

    switch (config.provider) {
        case 'google_calendar':
            return bookGoogleAppointment(config, { date, time, serviceType, customerName, customerPhone, customerEmail })
        default:
            return { success: false, error: 'Ukjent booking-leverandør' }
    }
}
