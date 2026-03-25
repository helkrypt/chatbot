import { google } from 'googleapis'

function getGoogleClient(config) {
    const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${process.env.NEXT_PUBLIC_APP_URL}/api/booking/google/callback`
    )
    oauth2.setCredentials({
        access_token: config.access_token,
        refresh_token: config.refresh_token,
    })
    return google.calendar({ version: 'v3', auth: oauth2 })
}

export async function checkGoogleAvailability(config, date, serviceType) {
    const calendar = getGoogleClient(config)
    const service = config.services?.find(s =>
        s.name.toLowerCase().includes((serviceType || '').toLowerCase())
    )
    const durationMinutes = service?.duration_minutes || 60

    const startOfDay = new Date(`${date}T00:00:00`)
    const endOfDay = new Date(`${date}T23:59:59`)

    const busyRes = await calendar.freebusy.query({
        requestBody: {
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            items: [{ id: config.calendar_id || 'primary' }],
            timeZone: 'Europe/Oslo',
        },
    })

    const busy = busyRes.data.calendars?.[config.calendar_id || 'primary']?.busy || []
    const slots = generateSlots(startOfDay, busy, durationMinutes, config.business_hours)
    return { slots: slots.slice(0, 6), durationMinutes }
}

export async function bookGoogleAppointment(config, { date, time, serviceType, customerName, customerPhone, customerEmail }) {
    const calendar = getGoogleClient(config)
    const service = config.services?.find(s =>
        s.name.toLowerCase().includes((serviceType || '').toLowerCase())
    )
    const durationMinutes = service?.duration_minutes || 60

    const startTime = new Date(`${date}T${time}:00`)
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000)

    const event = await calendar.events.insert({
        calendarId: config.calendar_id || 'primary',
        requestBody: {
            summary: `${serviceType || 'Time'} — ${customerName}`,
            description: [
                'Bookingforespørsel fra Helkrypt AI chatbot',
                `Navn: ${customerName}`,
                `Tlf: ${customerPhone || '—'}`,
                `E-post: ${customerEmail || '—'}`,
            ].join('\n'),
            start: { dateTime: startTime.toISOString(), timeZone: 'Europe/Oslo' },
            end: { dateTime: endTime.toISOString(), timeZone: 'Europe/Oslo' },
        },
    })

    return { success: true, bookingId: event.data.id, eventLink: event.data.htmlLink }
}

function generateSlots(dayStart, busy, durationMinutes, businessHours) {
    const slots = []

    // Bestem start og slutt ut fra åpningstider i config
    const openHour = businessHours?.open ? parseInt(businessHours.open.split(':')[0]) : 8
    const openMin = businessHours?.open ? parseInt(businessHours.open.split(':')[1]) : 0
    const closeHour = businessHours?.close ? parseInt(businessHours.close.split(':')[0]) : 17
    const closeMin = businessHours?.close ? parseInt(businessHours.close.split(':')[1]) : 0

    const start = new Date(dayStart)
    start.setHours(openHour, openMin, 0, 0)

    const end = new Date(dayStart)
    end.setHours(closeHour, closeMin, 0, 0)

    let current = new Date(start)
    while (current < end) {
        const slotEnd = new Date(current.getTime() + durationMinutes * 60000)
        if (slotEnd > end) break

        const isAvailable = !busy.some(b =>
            new Date(b.start) < slotEnd && new Date(b.end) > current
        )
        if (isAvailable) {
            slots.push(current.toTimeString().slice(0, 5)) // 'HH:MM'
        }
        current = new Date(current.getTime() + 30 * 60000) // 30-min intervall
    }

    return slots
}
