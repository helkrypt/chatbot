import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/n8n';

export async function POST(request) {
    try {
        const { to, toAdmin, subject, html, text, inquiryId, replyTo, attachments, client_id } = await request.json();

        const recipient = toAdmin ? process.env.ADMIN_EMAIL : to;

        if (!recipient || !subject || (!html && !text)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Hent klientens fra-adresse hvis client_id er oppgitt
        let from;
        if (client_id) {
            const admin = createAdminClient();
            const { data: client } = await admin
                .from('clients')
                .select('name, escalation_email, config')
                .eq('id', client_id)
                .single();
            if (client) {
                const fromEmail = client.config?.fromEmail || client.escalation_email;
                if (fromEmail) from = `"${client.name}" <${fromEmail}>`;
            }
        }

        await sendEmail({
            to: recipient,
            subject,
            html: html || text,
            from,
            replyTo: replyTo || '',
            clientId: client_id,
            attachments,
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Email sending error:', error);
        return NextResponse.json({ error: 'Failed to send email', details: error.message }, { status: 500 });
    }
}
