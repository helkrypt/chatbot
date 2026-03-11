import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
    try {
        const { currentPrompt, instruction } = await request.json();

        if (!instruction) {
            return NextResponse.json({ error: 'Instruction is required' }, { status: 400 });
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Du er en ekspert på "Prompt Engineering" for AI-kundeserviceagenter. 
Din oppgave er å oppdatere en eksisterende SYSTEM PROMPT basert på brukerens instruksjon.

REGLER:
1. Du skal KUN returnere den oppdaterte systemprompten. Ingen forklaring, ingen chat.
2. Behold strukturen og tonen i den originale prompten så langt det lar seg gjøre, med mindre instruksjonen sier noe annet.
3. Integrer den nye instruksjonen på en logisk plass (f.eks. under en passende overskrift som "REGLER" eller "KUNNSKAP").
4. Hvis instruksjonen er motstridende med eksisterende regler, la den nye instruksjonen overstyre.
5. Sørg for at språket i prompten er konsistent (norsk).`
                },
                {
                    role: "user",
                    content: `EKSISTERENDE PROMPT:\n${currentPrompt || '(Ingen eksisterende prompt, start fra bunnen av)'}\n\nINSTRUKSJON FOR ENDRING:\n${instruction}`
                }
            ],
            temperature: 0.3, // Low temp for precision
        });

        const newPrompt = completion.choices[0].message.content;

        return NextResponse.json({ newPrompt });

    } catch (error) {
        console.error('Error updating prompt:', error);
        return NextResponse.json({ error: 'Failed to update prompt' }, { status: 500 });
    }
}
