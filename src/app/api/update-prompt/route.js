import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { anthropic, MODELS } from '@/lib/anthropic'

export async function POST(request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles').select('role, client_id').eq('id', user.id).single()

    if (!['admin', 'sysadmin'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { clientId, instruction, autoApprove } = await request.json()

    if (!instruction?.trim()) {
      return NextResponse.json({ error: 'instruction er påkrevd' }, { status: 400 })
    }

    // Hent nåværende aktiv prompt
    const { data: currentPrompt } = await admin
      .from('system_prompts')
      .select('content, version')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .single()

    // Hent siste 30 samtaler for kontekst
    const { data: recentConvs } = await admin
      .from('conversations')
      .select('id, visitor_name, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(30)

    const { data: recentMessages } = await admin
      .from('messages')
      .select('role, content, created_at')
      .in('conversation_id', (recentConvs || []).slice(0, 5).map(c => c.id))
      .order('created_at', { ascending: true })
      .limit(100)

    const convSummary = (recentConvs || []).map(c =>
      `- Samtale ${c.id.slice(0, 8)}: ${c.visitor_name || 'Gjest'}, status: ${c.status}`
    ).join('\n')

    const msgSample = (recentMessages || [])
      .slice(-20)
      .map(m => `[${m.role}]: ${m.content.slice(0, 200)}`)
      .join('\n')

    const metaPrompt = `Du er en ekspert på prompt-engineering for AI-kundeserviceagenter på norsk.

Din oppgave er å oppdatere en eksisterende systemprompt basert på brukerens instruksjon.

REGLER:
1. Returner KUN den oppdaterte systemprompten. Ingen forklaring, ingen markdown-innpakning.
2. Behold struktur og tone fra original prompt, med mindre instruksjonen sier noe annet.
3. Integrer den nye instruksjonen naturlig på riktig sted i prompten.
4. Hvis instruksjonen er motstridende med eksisterende regler, la den nye instruksjonen overstyre.
5. Bevar alle sikkerhetsbegrensninger og eskaleringsregler.
6. Sørg for at språket er konsistent (norsk).
7. Bevar [[OPENING_HOURS]]-plassholder hvis den finnes i original prompt.`

    const userMessage = `EKSISTERENDE PROMPT:
${currentPrompt?.content || '(Ingen eksisterende prompt — lag en ny fra bunnen av)'}

NYLIG SAMTALEKONTEKST (siste 30 samtaler):
${convSummary || 'Ingen samtaler ennå'}

UTVALG AV MELDINGER:
${msgSample || 'Ingen meldinger'}

INSTRUKSJON FOR ENDRING:
${instruction}`

    const message = await anthropic.messages.create({
      model: MODELS.promptGen,
      max_tokens: 8000,
      system: metaPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const newPromptContent = message.content[0]?.text
    if (!newPromptContent) {
      return NextResponse.json({ error: 'Klarte ikke generere prompt' }, { status: 500 })
    }

    const newVersion = (currentPrompt?.version || 0) + 1
    const newStatus = autoApprove ? 'active' : 'pending_review'

    if (currentPrompt) {
      await admin
        .from('system_prompts')
        .update({ is_active: false, status: 'archived' })
        .eq('client_id', clientId)
        .eq('is_active', true)
    }

    const { data: newPromptRow, error: insertError } = await admin
      .from('system_prompts')
      .insert({
        client_id: clientId,
        version: newVersion,
        content: newPromptContent,
        is_active: newStatus === 'active',
        status: newStatus,
        change_reason: instruction,
        created_by: user.id,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      newPrompt: newPromptContent,
      version: newVersion,
      status: newStatus,
    })

  } catch (error) {
    console.error('update-prompt error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
