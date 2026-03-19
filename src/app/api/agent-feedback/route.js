import { createClient } from '@/lib/supabase-server'
import { anthropic, MODELS } from '@/lib/anthropic'
import { incrementPromptUsage } from '@/lib/promptQuota'

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

        // Ask Claude to suggest prompt changes using tool_use for reliable JSON
        const message = await anthropic.messages.create({
            model: MODELS.promptGen,
            max_tokens: 8000,
            tools: [{
                name: 'suggest_prompt_changes',
                description: 'Foreslå endringer i systemprompten basert på operatørens tilbakemelding',
                input_schema: {
                    type: 'object',
                    properties: {
                        summary: { type: 'string', description: 'Kort oppsummering av hva som ble endret (1-3 setninger, på norsk)' },
                        changes: { type: 'array', items: { type: 'string' }, description: 'Liste over spesifikke endringer som ble gjort' },
                        updatedPrompt: { type: 'string', description: 'Den fullstendige oppdaterte systemprompten' }
                    },
                    required: ['summary', 'changes', 'updatedPrompt']
                }
            }],
            tool_choice: { type: 'tool', name: 'suggest_prompt_changes' },
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

Bruk suggest_prompt_changes-verktøyet til å returnere resultatet.`
            }]
        })

        const toolUse = message.content.find(b => b.type === 'tool_use')
        if (!toolUse) {
            console.error('No tool_use in Claude response:', JSON.stringify(message.content))
            return Response.json({ error: 'AI-en returnerte ikke et gyldig forslag' }, { status: 500 })
        }
        const parsed = toolUse.input

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
        let { clientId, currentPromptId, currentVersion, updatedPrompt, changeReason } = await request.json()

        // Fallback: resolve clientId from the current prompt if not provided
        if (!clientId && currentPromptId) {
            const { data: prompt } = await supabase
                .from('system_prompts')
                .select('client_id')
                .eq('id', currentPromptId)
                .single()
            clientId = prompt?.client_id
        }

        if (!clientId || !updatedPrompt) {
            return Response.json({ error: 'Mangler påkrevde felt' }, { status: 400 })
        }

        // Deactivate current prompt
        if (currentPromptId) {
            await supabase
                .from('system_prompts')
                .update({ is_active: false, active: false })
                .eq('id', currentPromptId)
        }

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

        // Registrer bruk for kvotesporing (best-effort)
        try {
            await incrementPromptUsage(clientId)
        } catch (quotaErr) {
            console.error('Quota tracking failed (non-fatal):', quotaErr)
        }

        return Response.json({ success: true, newPromptId: newPrompt.id, newVersion: newPrompt.version })
    } catch (error) {
        console.error('Apply prompt error:', error)
        return Response.json({ error: error.message }, { status: 500 })
    }
}
