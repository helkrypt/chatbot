import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { notifyClientWebhook } from '@/lib/webhook';

// Rate limiting (in-memory, per IP)
const rateLimitMap = new Map()

function isRateLimited(ip) {
    const now = Date.now()
    const windowMs = 60 * 1000 // 1 minutt
    const maxRequests = 20

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, start: now })
        return false
    }

    const data = rateLimitMap.get(ip)
    if (now - data.start > windowMs) {
        rateLimitMap.set(ip, { count: 1, start: now })
        return false
    }

    data.count++
    return data.count > maxRequests
}

// Initialization
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper: Send Admin Notification
async function sendAdminNotification(inquiry, webhookUrl) {
    try {
        console.log('Attempting to send admin notification for inquiry:', inquiry.id);

        const n8nWebhookUrl = webhookUrl || process.env.N8N_NOTIFICATION_WEBHOOK_URL;
        if (!n8nWebhookUrl) {
            console.warn('Ingen webhook_url konfigurert for klient — admin-varsling deaktivert');
            return;
        }

        try {
            const n8nResponse = await fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: inquiry.id,
                    customer_name: inquiry.customer_name,
                    customer_email: inquiry.customer_email,
                    customer_phone: inquiry.customer_phone,
                    customer_address: inquiry.customer_address,
                    subject: inquiry.subject,
                    message: inquiry.message,
                    app_url: process.env.NEXT_PUBLIC_APP_URL || 'https://elesco-trondheim.vercel.app',
                    from: process.env.SMTP_FROM || 'Elesco System <chatbot@cityrtv.no>',
                    to: process.env.ADMIN_EMAIL || 'marius@helkrypt.no',
                    html: `
                        <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                            <div style="background: #0284c7; padding: 20px 24px; border-radius: 8px 8px 0 0;">
                                <h1 style="color: white; margin: 0; font-size: 20px;">Ny henvendelse fra chat</h1>
                            </div>
                            <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                                <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                                    <tr><td style="padding: 8px 0; color: #6b7280;">Kunde:</td><td style="padding: 8px 0;">${inquiry.customer_name} (<a href="mailto:${inquiry.customer_email}">${inquiry.customer_email || 'Ingen e-post'}</a>)</td></tr>
                                    <tr><td style="padding: 8px 0; color: #6b7280;">Telefon:</td><td style="padding: 8px 0;">${inquiry.customer_phone || 'Ikke oppgitt'}</td></tr>
                                    <tr><td style="padding: 8px 0; color: #6b7280;">Emne:</td><td style="padding: 8px 0; font-weight: 600;">${inquiry.subject}</td></tr>
                                </table>
                                <div style="border-top: 1px solid #e5e7eb; padding-top: 16px;">
                                    <h3 style="margin-top: 0; color: #374151;">Beskrivelse:</h3>
                                    <p style="white-space: pre-wrap; color: #4b5563;">${inquiry.message}</p>
                                </div>
                                <br>
                                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://elesco-trondheim.vercel.app'}/inquiries/${inquiry.id}" style="background: #0284c7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">Gå til sak i dashboard</a>
                            </div>
                        </div>
                    `
                })
            });

            if (n8nResponse.ok) {
                console.log('Admin notification sent via n8n webhook');
                return;
            } else {
                throw new Error(`n8n webhook failed with status: ${n8nResponse.status}`);
            }
        } catch (n8nError) {
            console.error('n8n webhook error:', n8nError);
        }
    } catch (error) {
        console.error('Failed to send admin notification:', error);
    }
}

// Helper: Extract customer info from user messages
function extractCustomerInfoFromMessages(userMessages) {
    const info = {};

    for (const text of userMessages) {
        if (typeof text !== 'string') continue;

        // Email (very reliable pattern)
        if (!info.email) {
            const emailMatch = text.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) info.email = emailMatch[0];
        }

        // Norwegian phone number (8 digits, standalone)
        if (!info.phone) {
            const phoneMatch = text.match(/(?:^|\s)(?:\+?47\s?)?(\d{8})(?:\s|$)/);
            if (phoneMatch) info.phone = phoneMatch[1];
        }

        // Name patterns: "Name X", "Navn: X", "Mitt navn er X", "Jeg heter X"
        if (!info.name) {
            const nameMatch = text.match(/^(?:name|navn|mitt navn er|jeg heter)[:\s]+(.+)/i);
            if (nameMatch) {
                const cleaned = nameMatch[1].trim();
                // Only accept if it looks like a real name (2-50 chars, no digits)
                if (cleaned.length >= 2 && cleaned.length <= 50 && !/\d/.test(cleaned)) {
                    info.name = cleaned;
                }
            }
        }
    }

    return info;
}

export async function POST(request) {
    try {
        const ip = request.headers.get('x-forwarded-for') || 'unknown'
        if (isRateLimited(ip)) {
            return NextResponse.json({ error: 'For mange forespørsler' }, { status: 429 })
        }

        // ── Multi-tenant: les client_id fra header eller query param ──
        const { searchParams } = new URL(request.url)
        const clientId = request.headers.get('x-client-id') || searchParams.get('client')

        if (!clientId) {
            return NextResponse.json({ error: 'Missing client' }, { status: 400 })
        }

        // Hent klientkonfig
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, active, webhook_url, chatbot_title')
            .eq('id', clientId)
            .single()

        if (clientError || !client) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 })
        }

        if (!client.active) {
            return NextResponse.json({ error: 'Client inactive' }, { status: 403 })
        }

        // Hent system prompt fra DB
        const { data: promptRow, error: promptError } = await supabase
            .from('system_prompts')
            .select('content')
            .eq('client_id', clientId)
            .eq('active', true)
            .single()

        if (promptError || !promptRow) {
            return NextResponse.json({ error: 'System prompt not found for client' }, { status: 500 })
        }

        const { message, conversationId, fileUrl } = await request.json();

        if (!message && !fileUrl) {
            return NextResponse.json(
                { error: 'Message or fileUrl is required' },
                { status: 400 }
            );
        }

        // Fetch History — load ALL messages for this conversation so the agent
        // never "forgets" earlier info (previous limit of 20 caused memory loss
        // in longer conversations like the Elkjøp Tillertorget case with 35+ msgs).
        let history = [];
        if (conversationId) {
            const { data: previousMessages, error } = await supabase
                .from('messages')
                .select('role, content')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true })
                .limit(50);

            if (!error && previousMessages) {
                history = previousMessages.map(msg => ({
                    role: msg.role === 'agent' ? 'assistant' : (msg.role === 'assistant' ? 'assistant' : 'user'),
                    content: msg.content
                }));
            }
        }

        // Trim history to avoid exceeding token limits
        const MAX_HISTORY_CHARS = 12000
        let totalChars = 0
        const trimmedHistory = []
        for (const msg of [...history].reverse()) {
            const len = typeof msg.content === 'string' ? msg.content.length : 500
            if (totalChars + len > MAX_HISTORY_CHARS) break
            trimmedHistory.unshift(msg)
            totalChars += len
        }
        history = trimmedHistory

        // Prepare current message
        const currentContent = [];
        if (message) currentContent.push({ type: 'text', text: message });
        if (fileUrl) currentContent.push({ type: 'image_url', image_url: { url: fileUrl } });

        // Fetch Opening Hours for the prompt (filtrert på klient)
        const { data: hoursData } = await supabase
            .from('opening_hours')
            .select('*')
            .eq('client_id', clientId)
            .order('category', { ascending: true })
            .order('sort_order', { ascending: true });

        let hoursText = '';
        if (hoursData && hoursData.length > 0) {
            const categories = {
                regular: 'Vanlige åpningstider',
                phone: 'Telefontid',
                holiday: 'Helligdager / Ferie',
                special: 'Spesielle datoer'
            };

            const grouped = hoursData.reduce((acc, hour) => {
                if (!acc[hour.category]) acc[hour.category] = [];
                acc[hour.category].push(hour);
                return acc;
            }, {});

            hoursText = Object.entries(categories).map(([catId, catLabel]) => {
                const items = grouped[catId];
                if (!items || items.length === 0) return '';

                const itemsList = items.map(item => {
                    const dateStr = item.specific_date ? ` (${new Date(item.specific_date).toLocaleDateString('no-NO')})` : '';
                    return `- ${item.label}${dateStr}: ${item.hours}`;
                }).join('\n');

                return `### ${catLabel}\n${itemsList}`;
            }).filter(t => t !== '').join('\n\n');
        } else {
            hoursText = "Se nettsiden for oppdaterte åpningstider.";
        }

        const dynamicSystemPrompt = promptRow.content.replace('[[OPENING_HOURS]]', hoursText);

        // Construct Messages for OpenAI
        const apiMessages = [
            { role: 'system', content: dynamicSystemPrompt },
            ...history,
            {
                role: 'user',
                content: fileUrl ? currentContent : (message || "")
            }
        ];

        // Call OpenAI
        const completion = await openai.chat.completions.create({
            model: 'gpt-5-mini-2025-08-07',
            messages: apiMessages,
            max_completion_tokens: 10000,
        });

        const firstChoice = completion.choices[0];
        let response = firstChoice?.message?.content;

        console.log('OpenAI Choice details:', {
            finish_reason: firstChoice?.finish_reason,
            has_content: !!response,
            has_tool_calls: !!firstChoice?.message?.tool_calls,
            refusal: firstChoice?.message?.refusal
        });

        // If content is null but tool_calls exist, it's likely a hallucinated tool call
        if (!response && firstChoice?.message?.tool_calls) {
            response = "Jeg beklager, jeg prøvde å utføre en teknisk handling jeg ikke har tilgang til. Kan du prøve å beskrive hva du trenger hjelp med på nytt, eller gi meg din kontaktinfo slik at en saksbehandler kan ta kontakt?";
        }

        if (!response) {
            if (firstChoice?.message?.refusal) {
                response = "Jeg beklager, men jeg har ikke lov til å svare på dette spørsmålet basert på mine instruksjoner.";
            } else {
                response = 'Beklager, jeg klarte ikke å generere et svar for øyeblikket. Vennligst prøv igjen litt senere.';
            }
        }

        let escalationData = null;
        let visibleResponse = response;

        // Parse JSON Escalation Block
        // Strategy 1: Markdown code block
        const jsonBlockRegex = /```json\s*([\s\S]*?)```/i;
        let match = response.match(jsonBlockRegex);

        if (match) {
            try {
                const parsed = JSON.parse(match[1].trim());
                if (parsed.escalation) {
                    escalationData = parsed;
                    visibleResponse = response.replace(match[0], '').trim();
                }
            } catch (e) { console.error('JSON parse error (block):', e, 'Raw:', match[1]); }
        } else {
            // Strategy 2: Raw JSON at end
            const lastBrace = response.lastIndexOf('}');
            const firstBrace = response.indexOf('{', Math.max(0, response.length - 800)); // Search last 800 chars
            if (lastBrace > firstBrace && firstBrace !== -1) {
                try {
                    const potentialJson = response.substring(firstBrace, lastBrace + 1);
                    const parsed = JSON.parse(potentialJson);
                    if (parsed.escalation) {
                        escalationData = parsed;
                        visibleResponse = response.substring(0, firstBrace).trim();
                    }
                } catch (e) { }
            }
        }

        // Handle Escalation
        if (escalationData && conversationId) {
            const { customer, summary, full_description } = escalationData;

            if (customer) {
                // Update Conversation with visitor info AND set status to escalated
                const updates = { status: 'escalated' };
                if (customer.name) updates.visitor_name = customer.name;
                if (customer.email) updates.visitor_email = customer.email;
                if (customer.phone) updates.visitor_phone = customer.phone;
                if (customer.address) updates.visitor_address = customer.address;

                const { error: convUpdateError } = await supabase
                    .from('conversations')
                    .update(updates)
                    .eq('id', conversationId);

                if (convUpdateError) {
                    console.error('Failed to update conversation status:', convUpdateError);
                }

                // Create Ticket
                const { data: inquiryData, error: inquiryError } = await supabase
                    .from('inquiries')
                    .insert({
                        conversation_id: conversationId,
                        client_id: clientId,
                        customer_name: customer.name || 'Ukjent',
                        customer_email: customer.email,
                        customer_phone: customer.phone,
                        customer_address: customer.address,
                        subject: summary || 'Eskalering fra chat',
                        message: full_description || 'Ingen beskrivelse.',
                        status: 'new',
                        priority: 'normal'
                    })
                    .select()
                    .single();

                // Notify Admin
                if (inquiryError) {
                    console.error('Failed to create inquiry:', inquiryError);
                } else if (inquiryData) {
                    console.log('Inquiry created successfully:', inquiryData.id);
                    await sendAdminNotification(inquiryData, client.webhook_url);
                    await notifyClientWebhook(client, 'ticket.created', {
                        ticketId: inquiryData.id,
                        summary: inquiryData.subject,
                        customerEmail: inquiryData.customer_email,
                        conversationId,
                    });
                }
            }
        }

        // Auto-extract customer info from user messages and update conversation
        // This ensures customer info is saved even without escalation
        if (conversationId) {
            try {
                // Collect all user messages (history + current)
                const allUserTexts = history
                    .filter(m => m.role === 'user' && typeof m.content === 'string')
                    .map(m => m.content);
                if (message) allUserTexts.push(message);

                const extracted = extractCustomerInfoFromMessages(allUserTexts);

                if (extracted.name || extracted.email || extracted.phone) {
                    // Only update fields that are currently empty
                    const { data: currentConv } = await supabase
                        .from('conversations')
                        .select('visitor_name, visitor_email, visitor_phone')
                        .eq('id', conversationId)
                        .single();

                    if (currentConv) {
                        const updates = {};
                        if (extracted.name && (!currentConv.visitor_name || currentConv.visitor_name === 'Gjest')) {
                            updates.visitor_name = extracted.name;
                        }
                        if (extracted.email && !currentConv.visitor_email) {
                            updates.visitor_email = extracted.email;
                        }
                        if (extracted.phone && !currentConv.visitor_phone) {
                            updates.visitor_phone = extracted.phone;
                        }

                        if (Object.keys(updates).length > 0) {
                            await supabase
                                .from('conversations')
                                .update(updates)
                                .eq('id', conversationId);
                            console.log('Auto-updated conversation customer info:', updates);
                        }
                    }
                }
            } catch (extractErr) {
                console.error('Error extracting customer info:', extractErr);
            }
        }

        return NextResponse.json({
            response: visibleResponse,
            conversationId
        });

    } catch (error) {
        console.error('Chat API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}
