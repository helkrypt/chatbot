import { NextResponse } from 'next/server';
import { anthropic, MODELS } from '@/lib/anthropic';

const WEBHOOK_SECRET = process.env.ONBOARDING_WEBHOOK_SECRET;

export async function POST(request) {
  const secret = request.headers.get('x-webhook-secret');
  if (secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 403 });
  }

  const { clientId, companyName, websiteContent, brreg } = await request.json();

  const message = await anthropic.messages.create({
    model: MODELS.promptGen,
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Generer en profesjonell system-prompt for en AI kundeservice-chatbot for ${companyName}.

Firmainformasjon fra Brønnøysund:
${JSON.stringify(brreg, null, 2)}

Nettside-innhold:
${(websiteContent || '').substring(0, 3000)}

Systempromptet skal:
- Være på norsk
- Presentere chatboten med firmaets navn
- Fokusere på kundeservice
- Inkludere firmaets kjernevirksomhet
- Ha en profesjonell og hjelpsom tone`,
    }],
  });

  return NextResponse.json({
    success: true,
    systemPrompt: message.content[0].text,
  });
}
