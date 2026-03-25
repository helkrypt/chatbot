import { anthropic, MODELS } from '@/lib/anthropic'

const TONE_MAP = {
  formal:   'høflig og formell, bruker "De" og "Dem"',
  friendly: 'vennlig og imøtekommende, bruker "du" og "dere"',
  casual:   'uformell og hverdagslig, som en god kollega',
}

export async function generateSystemPrompt({ companyName, brregData = {}, websiteContent = '', tone = 'friendly' }) {
  const prompt = `
Du er en ekspert på norsk kundeservice-AI. Lag en komplett systemprompt for en chatbot.

FIRMAINFORMASJON:
- Navn: ${companyName}
- Bransje: ${brregData.naeringskode1?.beskrivelse || 'ikke oppgitt'}
- Adresse: ${brregData.forretningsadresse?.adresse?.join(', ') || 'ikke oppgitt'}
- Org.nr: ${brregData.organisasjonsnummer || 'ikke oppgitt'}

NETTSIDEINNHOLD (bruk dette til å forstå hva bedriften gjør):
${websiteContent || 'Ikke tilgjengelig'}

ØNSKET TONE: ${TONE_MAP[tone] || TONE_MAP.friendly}

Systempromptet skal inneholde:
1. Hvem chatboten er (navn på bedrift, hva den hjelper med)
2. Hvilke temaer den skal svare på (kun bedriftsrelevant)
3. Hva den ALDRI skal si (personalsaker, sensitive opplysninger)
4. Eskaleringsregel: Etter maks 3 forsøk uten svar → be om kontaktinfo (navn, telefon, e-post)
5. Eskaleringsformat: JSON-blokk som beskrevet under
6. Tone-regler basert på valgt tone
7. Åpningstider: [[OPENING_HOURS]] (placeholder — erstattes dynamisk av systemet)
8. Avslutningsfrase

JSON-eskaleringsformat (legg inn i prompten):
\`\`\`json
{
  "escalation": true,
  "customer": { "name": "...", "phone": "...", "email": "..." },
  "summary": "Kort tittel",
  "full_description": "Hva kunden trenger hjelp med"
}
\`\`\`

Skriv KUN systemprompten — ingen introduksjon eller forklaring.
`

  const msg = await anthropic.messages.create({
    model: MODELS.promptGen,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  return msg.content[0].text
}
