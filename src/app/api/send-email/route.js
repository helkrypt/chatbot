import { NextResponse } from 'next/server';

const N8N_WEBHOOK_URL = 'https://n8n.helkrypt.no/webhook/elesco-trondheim'; // Hardkodet URL for sikkerhets skyld

export async function POST(request) {
    try {
        const { to, toAdmin, subject, html, text, inquiryId, replyTo, attachments } = await request.json();

        // Determine recipient: if toAdmin is true, use ADMIN_EMAIL from server env
        const recipient = toAdmin ? process.env.ADMIN_EMAIL : to;

        if (!recipient || !subject || (!html && !text)) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Send via n8n webhook
        const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: recipient,
                from: '"Elesco Trondheim" <chatbot@cityrtv.no>',
                subject,
                html: html || text,
                replyTo: replyTo || '',
                inquiryId,
                attachments
            })
        });

        if (!n8nResponse.ok) {
            throw new Error(`n8n webhook failed with status: ${n8nResponse.status}`);
        }

        console.log('Email sent via n8n webhook to:', recipient, replyTo ? `(reply-to: ${replyTo})` : '');
        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Email sending error:', error);
        return NextResponse.json(
            { error: 'Failed to send email', details: error.message },
            { status: 500 }
        );
    }
}
