import { NextResponse } from 'next/server';
import { anthropic, MODELS } from '@/lib/anthropic';
import { embed } from '@/lib/voyage';
import { createClient } from '@supabase/supabase-js';
import { notifyClientWebhook } from '@/lib/webhook';
import { sendEmail } from '@/lib/n8n';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate limiting via Upstash Redis (fungerer på Vercel serverless)
const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(20, '60 s'),
    analytics: false,
})

async function isRateLimited(ip) {
    try {
        const { success } = await ratelimit.limit(ip)
        return !success
    } catch {
        // Fail open hvis Redis ikke er tilgjengelig
        return false
    }
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);


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
        if (await isRateLimited(ip)) {
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

        const { message, conversationId: incomingConvId, fileUrl } = await request.json();

        if (!message && !fileUrl) {
            return NextResponse.json(
                { error: 'Message or fileUrl is required' },
                { status: 400 }
            );
        }

        // Lazy conversation creation — if no conversationId, create one now
        let conversationId = incomingConvId;
        if (!conversationId) {
            const { data: newConv, error: convError } = await supabase
                .from('conversations')
                .insert({ visitor_name: 'Gjest', client_id: clientId, status: 'active' })
                .select('id')
                .single();
            if (!convError && newConv) {
                conversationId = newConv.id;
            }
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
        const MAX_HISTORY_CHARS = 40000
        let totalChars = 0
        const trimmedHistory = []
        for (const msg of [...history].reverse()) {
            const len = typeof msg.content === 'string' ? msg.content.length : 500
            if (totalChars + len > MAX_HISTORY_CHARS) break
            trimmedHistory.unshift(msg)
            totalChars += len
        }
        history = trimmedHistory

        // Save user message atomically (after history fetch to avoid double-send)
        if (conversationId && (message || fileUrl)) {
            await supabase.from('messages').insert({
                conversation_id: conversationId,
                role: 'user',
                content: message || '[Vedlegg]',
                file_url: fileUrl || null,
                client_id: clientId,
            });
        }

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

        // RAG: hent relevante knowledge_chunks basert på brukerens melding
        let ragContext = '';
        if (message && process.env.VOYAGE_API_KEY) {
            try {
                const [queryEmbedding] = await embed(message, 'query');
                const { data: chunks } = await supabase.rpc('match_chunks', {
                    query_embedding: queryEmbedding,
                    match_client_id: clientId,
                    match_count: 5,
                    match_threshold: 0.7,
                });
                if (chunks && chunks.length > 0) {
                    ragContext = '\n\n### Relevant informasjon fra kunnskapsbase:\n' +
                        chunks.map(c => c.content).join('\n\n');
                }
            } catch (ragErr) {
                console.warn('RAG lookup feilet (ikke-kritisk):', ragErr.message);
            }
        }

        const dynamicSystemPrompt = promptRow.content
            .replace('[[OPENING_HOURS]]', hoursText)
            + ragContext;

        // Bygg meldingsarray for Anthropic (system-prompt er separat parameter)
        const apiMessages = [
            ...history,
            {
                role: 'user',
                content: fileUrl
                    ? [
                        ...(message ? [{ type: 'text', text: message }] : []),
                        { type: 'image', source: { type: 'url', url: fileUrl } },
                    ]
                    : (message || "")
            }
        ];

        // Kall Claude Haiku
        const claudeResponse = await anthropic.messages.create({
            model: MODELS.chatbot,
            system: dynamicSystemPrompt,
            messages: apiMessages,
            max_tokens: 2048,
        });

        console.log('Claude response details:', {
            stop_reason: claudeResponse.stop_reason,
            has_content: claudeResponse.content?.length > 0,
            model: claudeResponse.model,
        });

        let response = claudeResponse.content?.[0]?.type === 'text'
            ? claudeResponse.content[0].text
            : null;

        if (!response) {
            response = 'Beklager, jeg klarte ikke å generere et svar for øyeblikket. Vennligst prøv igjen litt senere.';
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

                    // Hent alle brukere i klienten med notify_on_escalation = true
                    const { data: notifyProfiles } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('client_id', clientId)
                        .eq('notify_on_escalation', true)

                    // Hent e-postadresser for disse brukerne via auth-tabellen
                    let notifyEmails = []
                    if (notifyProfiles && notifyProfiles.length > 0) {
                        const emailResults = await Promise.all(
                            notifyProfiles.map(async (p) => {
                                try {
                                    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(p.id)
                                    return authUser?.email || null
                                } catch { return null }
                            })
                        )
                        notifyEmails = emailResults.filter(Boolean)
                    }

                    // Legg alltid til sysadmin-e-post
                    const allRecipients = [...new Set([process.env.ADMIN_EMAIL || 'marius@helkrypt.no', ...notifyEmails])]

                    const timestamp = new Date().toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })
                    const inquiryUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${clientId}/conversations`
                    const escalationHtml = `<div style="font-family:-apple-system,sans-serif;max-width:600px">
                        <div style="background:#dc2626;padding:20px 32px;border-radius:8px 8px 0 0">
                          <h2 style="margin:0;color:#fff;font-size:17px">🔔 Ny henvendelse fra chat</h2>
                          <p style="margin:4px 0 0;color:#fca5a5;font-size:13px">${client.chatbot_title || 'Kundeservice'} · ${timestamp}</p>
                        </div>
                        <div style="padding:24px 32px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:20px">
                            <tr><td style="padding:9px 14px;font-size:13px;font-weight:600;color:#6b7280;background:#f9fafb;width:120px">Navn</td><td style="padding:9px 14px;font-size:14px">${inquiryData.customer_name}</td></tr>
                            <tr><td style="padding:9px 14px;font-size:13px;font-weight:600;color:#6b7280;background:#f9fafb;border-top:1px solid #e5e7eb">E-post</td><td style="padding:9px 14px;font-size:14px;border-top:1px solid #e5e7eb">${inquiryData.customer_email || '—'}</td></tr>
                            <tr><td style="padding:9px 14px;font-size:13px;font-weight:600;color:#6b7280;background:#f9fafb;border-top:1px solid #e5e7eb">Telefon</td><td style="padding:9px 14px;font-size:14px;border-top:1px solid #e5e7eb">${inquiryData.customer_phone || '—'}</td></tr>
                          </table>
                          <p style="font-size:15px;font-weight:600;margin:0 0 8px;color:#111827">${inquiryData.subject}</p>
                          <div style="background:#f9fafb;border-radius:6px;padding:14px;color:#374151;font-size:14px;line-height:1.7;margin-bottom:20px">${inquiryData.message}</div>
                          <a href="${inquiryUrl}" style="background:#111827;color:#fff;padding:12px 22px;text-decoration:none;border-radius:6px;display:inline-block;font-size:14px;font-weight:600">Åpne i dashboard →</a>
                        </div>
                    </div>`

                    await Promise.all(allRecipients.map(to =>
                        sendEmail({
                            to,
                            subject: `Ny henvendelse: ${inquiryData.subject}`,
                            html: escalationHtml,
                            clientId,
                        }).catch(err => console.error(`Escalation email feilet for ${to}:`, err))
                    ));
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

        // Save AI response atomically
        if (conversationId) {
            await supabase.from('messages').insert({
                conversation_id: conversationId,
                role: 'assistant',
                content: visibleResponse,
                client_id: clientId,
            });
            await supabase.from('conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', conversationId);
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
