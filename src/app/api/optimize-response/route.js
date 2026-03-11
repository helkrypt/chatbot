import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
    try {
        const { text, conversationMessages, customerName, agentName, agentEmail, inquirySubject } = await request.json();

        if (!text) {
            return NextResponse.json({ error: 'Text is required' }, { status: 400 });
        }

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

        const systemPrompt = `Du er en ekspert på kundeservice-kommunikasjon for Elesco Trondheim (City Radio & TV-Service AS).

Din oppgave er å omskrive kundebehandlerens utkast til en profesjonell, varm og tydelig e-post til kunden.

Viktige regler:
- Start med "Hei ${customerName || '[kundenavn]'}!" (bruk kundens faktiske fornavn)
- Henvis naturlig til kundens opprinnelige henvendelse basert på samtalehistorikken
- Behold kjernebudskapet fra utkastet, men gjør det mer profesjonelt og tydelig
- Bruk en vennlig og imøtekommende tone
- Inkluder alltid "Vennligst svar på denne e-posten om du har spørsmål." eller lignende oppfordring
- Avslutt ALLTID med denne eksakte signaturen (ikke endre den):

Med vennlig hilsen,
${agentName || '[Kundebehandler]'}
Elesco Trondheim
City Radio & TV-Service AS
Industriveien 5
7072 Heimdal
Tlf. 72 88 01 55
${agentEmail || ''}
www.elescotrondheim.no

- Returner KUN e-postteksten, ingen ekstra kommentarer
- Skriv på norsk`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: `${conversationContext}

Emne for henvendelsen: ${inquirySubject || 'Kundehenvendelse'}

Kundebehandlerens utkast som skal optimaliseres:
${text}`
                }
            ],
        });

        const optimizedText = completion.choices[0].message.content;

        return NextResponse.json({ optimizedText });

    } catch (error) {
        console.error('Error optimizing text:', error);
        return NextResponse.json({ error: 'Failed to optimize text' }, { status: 500 });
    }
}
