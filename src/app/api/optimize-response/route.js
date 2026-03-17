import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase-admin';
import { createClient } from '@/lib/supabase-server';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { text, conversationMessages, customerName, agentName, agentEmail, inquirySubject, client_id } = await request.json();

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

        if (!client_id) {
            return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
        }

        // Fetch client info for dynamic signature
        const admin = createAdminClient();
        const { data: client } = await admin
            .from('clients')
            .select('name, escalation_email, config, domain')
            .eq('id', client_id)
            .single();

        const clientName = client?.name || client_id;
        const clientAddress = client?.config?.address || '';
        const clientPhone = client?.config?.phone || '';
        const clientWebsite = client?.config?.website || (client?.domain ? `www.${client.domain}` : '');
        const clientFromEmail = client?.config?.fromEmail || client?.escalation_email || '';

        // Build conversation context if available
        let conversationContext = '';
        if (conversationMessages && conversationMessages.length > 0) {
            conversationContext = '\n\nHer er samtalehistorikken mellom kunden og chatboten:\n---\n';
            conversationMessages.forEach(msg => {
                const role = msg.role === 'assistant' ? 'Chatbot' : 'Kunde';
                conversationContext += `${role}: ${msg.content}\n`;
            });
            conversationContext += '---\n';
        }

        const signature = [
            `${agentName || '[Kundebehandler]'}`,
            clientName,
            clientAddress,
            clientPhone ? `Tlf. ${clientPhone}` : '',
            agentEmail || clientFromEmail || '',
            clientWebsite,
        ].filter(Boolean).join('\n');

        const systemPrompt = `Du er en ekspert på kundeservice-kommunikasjon for ${clientName}.

Din oppgave er å omskrive kundebehandlerens utkast til en profesjonell, varm og tydelig e-post til kunden.

Viktige regler:
- Start med "Hei ${customerName || '[kundenavn]'}!" (bruk kundens faktiske fornavn)
- Henvis naturlig til kundens opprinnelige henvendelse basert på samtalehistorikken
- Behold kjernebudskapet fra utkastet, men gjør det mer profesjonelt og tydelig
- Bruk en vennlig og imøtekommende tone
- Inkluder alltid "Vennligst svar på denne e-posten om du har spørsmål." eller lignende oppfordring
- Avslutt ALLTID med denne eksakte signaturen (ikke endre den):

Med vennlig hilsen,
${signature}

- Returner KUN e-postteksten, ingen ekstra kommentarer
- Skriv på norsk`;

        const claudeResponse = await anthropic.messages.create({
            model: process.env.CLAUDE_CHAT_MODEL || 'claude-haiku-4-5-20251001',
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: `${conversationContext}\n\nEmne for henvendelsen: ${inquirySubject || 'Kundehenvendelse'}\n\nKundebehandlerens utkast som skal optimaliseres:\n${text}`
                }
            ],
            max_tokens: 1024,
        });

        const optimizedText = claudeResponse.content?.[0]?.text;

        if (!optimizedText) {
            return NextResponse.json({ error: 'Failed to generate optimized text' }, { status: 500 });
        }

        return NextResponse.json({ optimizedText });

    } catch (error) {
        console.error('Error optimizing text:', error);
        return NextResponse.json({ error: 'Failed to optimize text' }, { status: 500 });
    }
}
