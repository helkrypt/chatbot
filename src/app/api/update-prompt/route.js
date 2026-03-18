import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { anthropic, MODELS } from '@/lib/anthropic'
import { logAudit } from '@/lib/audit'
import { notifySysadmin } from '@/lib/n8n'

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role, client_id').eq('id', user.id).single()

  if (!['admin', 'sysadmin'].includes(profile?.role)) return null
  return { ...user, role: profile.role, client_id: profile.client_id }
}

export async function POST(request) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
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

    // Kun deaktiver eksisterende prompt ved autoApprove
    if (autoApprove && currentPrompt) {
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

    await logAudit({
      clientId,
      userId: user.id,
      action: 'prompt.generate',
      entityType: 'system_prompt',
      entityId: newPromptRow.id,
      details: { instruction, version: newVersion, status: newStatus },
    })

    return NextResponse.json({
      ok: true,
      promptId: newPromptRow.id,
      newPrompt: newPromptContent,
      version: newVersion,
      status: newStatus,
    })

  } catch (error) {
    console.error('update-prompt error:', error)
    notifySysadmin({
      type: 'prompt_generation_error',
      title: 'Prompt-generering feilet',
      details: error.message,
      severity: 'error',
    }).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const user = await getAuthUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { promptId, action } = await request.json()

    if (!promptId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'promptId og action (approve/reject) er påkrevd' }, { status: 400 })
    }

    // Hent prompt-forslaget
    const { data: proposal } = await admin
      .from('system_prompts')
      .select('*')
      .eq('id', promptId)
      .single()

    if (!proposal) {
      return NextResponse.json({ error: 'Prompt ikke funnet' }, { status: 404 })
    }

    if (action === 'approve') {
      // Deaktiver alle eksisterende aktive prompts for klienten
      await admin
        .from('system_prompts')
        .update({ is_active: false, status: 'archived' })
        .eq('client_id', proposal.client_id)
        .eq('is_active', true)

      // Aktiver den nye
      await admin
        .from('system_prompts')
        .update({ is_active: true, status: 'active' })
        .eq('id', promptId)

      await logAudit({
        clientId: proposal.client_id,
        userId: user.id,
        action: 'prompt.approve',
        entityType: 'system_prompt',
        entityId: promptId,
        details: { version: proposal.version, change_reason: proposal.change_reason },
      })
    }

    if (action === 'reject') {
      await admin
        .from('system_prompts')
        .update({ status: 'rejected' })
        .eq('id', promptId)

      await logAudit({
        clientId: proposal.client_id,
        userId: user.id,
        action: 'prompt.reject',
        entityType: 'system_prompt',
        entityId: promptId,
        details: { version: proposal.version, change_reason: proposal.change_reason },
      })
    }

    return NextResponse.json({ ok: true, action })

  } catch (error) {
    console.error('update-prompt PATCH error:', error)
    notifySysadmin({
      type: 'prompt_action_error',
      title: 'Prompt godkjenning/avvisning feilet',
      details: error.message,
      severity: 'error',
    }).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
