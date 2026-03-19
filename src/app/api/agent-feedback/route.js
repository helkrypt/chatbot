import { createClient } from '@/lib/supabase-server'
import { anthropic, MODELS } from '@/lib/anthropic'

export async function POST(request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { feedback, chatLog, conversationId, clientId } = await request.json()

        if (!feedback || !chatLog) {
            return Response.json({ error: 'Feedback og chatlog er påkrevd' }, { status: 400 })
        }

        // Find client_id from conversation if not provided
        let resolvedClientId = clientId
        if (!resolvedClientId && conversationId) {
            const { data: conv } = await supabase
                .from('conversations')
                .select('client_id')
                .eq('id', conversationId)
                .single()
            resolvedClientId = conv?.client_id
        }

        if (!resolvedClientId) {
            return Response.json({ error: 'Kunne ikke finne klient-ID' }, { status: 400 })
        }

        // Get current active system prompt
        const { data: promptData } = await supabase
            .from('system_prompts')
            .select('id, content, version')
            .eq('client_id', resolvedClientId)
            .eq('is_active', true)
            .single()

        if (!promptData) {
            return Response.json({ error: 'Ingen aktiv systemprompt funnet' }, { status: 404 })
        }

        // Format chat log for Claude
        const chatContext = chatLog.map(msg =>
            `${msg.role === 'user' ? 'KUNDE' : 'AI-ASSISTENT'}: ${msg.content}`
        ).join('\n\n')

        // Ask Claude to suggest prompt changes
        const message = await anthropic.messages.create({
            model: MODELS.promptGen,
            max_tokens: 4000,
            messages: [{
                role: 'user',
                content: `Du er en ekspert på å forbedre AI-systemprompts for kundeservice-chatboter.

En operatør har gitt følgende tilbakemelding om at chatboten svarte feil:

**Tilbakemelding fra operatør:**
${feedback}

**Samtaleloggen der feilen oppstod:**
${chatContext}

**Gjeldende systemprompt:**
${promptData.content}

---

Basert på tilbakemeldingen, oppdater systemprompten slik at chatboten håndterer denne typen henvendelser riktig i fremtiden.

VIKTIG:
- Returner HELE den oppdaterte systemprompten (ikke bare endringene)
- Behold alt som fungerer bra i den eksisterende prompten
- Legg til eller endre kun det som er nødvendig for å adressere tilbakemeldingen
- Hold samme format, språk og tone som originalen
- Vær presis og konkret i endringene

Svar i følgende JSON-format (og BARE JSON, ingen annen tekst):
{
  "summary": "Kort oppsummering av hva som ble endret (1-3 setninger, på norsk)",
  "changes": ["Endring 1", "Endring 2"],
  "updatedPrompt": "Den fullstendige oppdaterte systemprompten her"
}`
            }]
        })

        const responseText = message.content[0].text

        // Parse JSON from Claude's response
        let parsed
        try {
            // Try to extract JSON if wrapped in code blocks
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText]
            parsed = JSON.parse(jsonMatch[1].trim())
        } catch (e) {
            console.error('Failed to parse Claude response:', responseText)
            return Response.json({ error: 'Kunne ikke tolke AI-forslaget' }, { status: 500 })
        }

        return Response.json({
            success: true,
            currentPromptId: promptData.id,
            currentVersion: promptData.version,
            clientId: resolvedClientId,
            summary: parsed.summary,
            changes: parsed.changes,
            updatedPrompt: parsed.updatedPrompt
        })
    } catch (error) {
        console.error('Agent feedback error:', error)
        return Response.json({ error: error.message }, { status: 500 })
    }
}

// Apply the approved prompt change
export async function PUT(request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { clientId, currentPromptId, currentVersion, updatedPrompt, changeReason } = await request.json()

        if (!clientId || !updatedPrompt) {
            return Response.json({ error: 'Mangler påkrevde felt' }, { status: 400 })
        }

        // Deactivate current prompt
        await supabase
            .from('system_prompts')
            .update({ is_active: false, active: false })
            .eq('id', currentPromptId)

        // Insert new version
        const { data: newPrompt, error } = await supabase
            .from('system_prompts')
            .insert({
                client_id: clientId,
                content: updatedPrompt,
                version: (currentVersion || 1) + 1,
                is_active: true,
                active: true,
                status: 'active',
                change_reason: changeReason || 'Oppdatert via agent-tilbakemelding',
                created_by: user.id
            })
            .select()
            .single()

        if (error) {
            console.error('Failed to save prompt:', error)
            return Response.json({ error: 'Kunne ikke lagre ny prompt' }, { status: 500 })
        }

        return Response.json({ success: true, newPromptId: newPrompt.id, newVersion: newPrompt.version })
    } catch (error) {
        console.error('Apply prompt error:', error)
        return Response.json({ error: error.message }, { status: 500 })
    }
}
