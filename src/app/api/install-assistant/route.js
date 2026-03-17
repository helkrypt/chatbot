import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Du er en vennlig teknisk installasjonsassistent for Helkrypt AI sitt chat-widget.
Din jobb er å hjelpe kunden med å legge til chat-widgeten på sin nettside.

Widgeten installeres ved å lime inn denne kodelinjen rett før </body>-taggen:
<script src="https://app.helkrypt.no/widget.js" data-client="KLIENT_ID" defer></script>

Viktige detaljer du kan forklare:
- WordPress: Gå til Utseende → Tema-editor → footer.php og lim inn rett før </body>. Alternativt bruk plugin "Insert Headers and Footers" (WPCode).
- Wix: Gå til Innstillinger → Avansert → Egendefinert kode → Legg til ved bunnen av body.
- Squarespace: Gå til Innstillinger → Avansert → Kodinjeksjon → Lim inn i "Footer".
- Shopify: Gå til Online Store → Themes → Edit code → theme.liquid, lim inn før </body>.
- Egendefinert HTML: Lim inn rett før </body>-taggen på alle sider.
- Cloudflare / caching: Ekskluder widget.js fra minification og delay JS.
- Widgeten auto-åpner etter 5 sekunder på desktop. På mobil vises en boble brukeren kan trykke på.
- Etter installasjon: tøm nettleser-cache og test på en privat/inkognito-fane.

Svar alltid kort, vennlig og på norsk. Gi ett steg om gangen. Avslutt alltid med å spørre om kunden trenger mer hjelp.
Ikke svar på spørsmål som ikke handler om installasjonen av chat-widgeten.`;

export async function POST(request) {
    try {
        const { messages } = await request.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Missing messages' }, { status: 400 });
        }

        const claudeResponse = await anthropic.messages.create({
            model: process.env.CLAUDE_CHAT_MODEL || 'claude-haiku-4-5-20251001',
            system: SYSTEM_PROMPT,
            messages: messages.slice(-10), // keep last 10 messages for context
            max_tokens: 400,
        });

        const reply = claudeResponse.content?.[0]?.text || 'Beklager, prøv igjen.';
        return NextResponse.json({ reply });

    } catch (error) {
        console.error('Install assistant error:', error);
        return NextResponse.json({ error: 'Feil ved henting av svar.' }, { status: 500 });
    }
}
