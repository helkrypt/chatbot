import { createAdminClient } from '@/lib/supabase-admin'
import { generateSystemPrompt } from '@/lib/generateSystemPrompt'
import { embed } from '@/lib/embeddings'
import { sendWelcomeEmail } from '@/lib/email'

export const maxDuration = 60

function generateSlug(name) {
  return (name || '')
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function chunkText(text, wordsPerChunk = 500) {
  const words = text.split(/\s+/)
  const chunks = []
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '))
  }
  return chunks.filter(c => c.trim().length > 0)
}

export async function POST(req) {
  const { companyName, orgnr, websiteUrl, adminEmail, adminName, tone } = await req.json()

  if (!companyName || !adminEmail) {
    return Response.json({ error: 'companyName og adminEmail er påkrevd' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Hent firmadata fra Brønnøysund
  let brregData = {}
  if (orgnr) {
    try {
      const brregRes = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr.replace(/\s/g, '')}`)
      if (brregRes.ok) brregData = await brregRes.json()
    } catch { /* fortsett uten brreg-data */ }
  }

  // 2. Scrape nettside via Jina Reader (gratis, ingen API-nøkkel)
  let websiteContent = ''
  if (websiteUrl) {
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${websiteUrl}`, {
        headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
        signal: AbortSignal.timeout(8000),
      })
      if (jinaRes.ok) websiteContent = (await jinaRes.text()).substring(0, 4000)
    } catch { /* fortsett uten nettside-innhold */ }
  }

  // 3. Generer systemprompt med Claude
  const systemPrompt = await generateSystemPrompt({
    companyName,
    brregData,
    websiteContent,
    tone: tone || 'friendly',
  })

  // 4. Generer klient-ID
  const baseSlug = generateSlug(companyName)
  // Sjekk om slug allerede finnes og legg til suffix om nødvendig
  const { data: existing } = await admin.from('clients').select('id').eq('id', baseSlug).single()
  const clientId = existing ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug

  // 5. Lagre klient
  const { error: clientErr } = await admin.from('clients').insert({
    id: clientId,
    name: companyName,
    domain: websiteUrl ? new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`).hostname : null,
    active: true,
    status: 'active',
    plan: 'starter',
    escalation_email: adminEmail,
    chatbot_title: 'Kundeservice',
    chatbot_tone: tone || 'friendly',
    onboarding_completed_at: new Date().toISOString(),
    config: {
      orgnr: brregData.organisasjonsnummer || orgnr || null,
      contact_email: adminEmail,
      contact_name: adminName || null,
    },
  })
  if (clientErr) {
    console.error('[Onboarding] Feil ved opprettelse av klient:', clientErr.message)
    return Response.json({ error: 'Kunne ikke opprette klient' }, { status: 500 })
  }

  // 6. Lagre systemprompt
  await admin.from('system_prompts').insert({
    client_id: clientId,
    content: systemPrompt,
    active: true,
    version: 1,
  })

  // 7. Generer og lagre embeddings (ikke-blokkerende ved feil)
  if (websiteContent && process.env.VOYAGE_API_KEY) {
    try {
      const chunks = chunkText(websiteContent, 500)
      const embeddings = await embed(chunks, 'document')
      await admin.from('knowledge_chunks').insert(
        chunks.map((c, i) => ({
          client_id: clientId,
          content: c,
          embedding: embeddings[i],
          source_url: websiteUrl,
          chunk_index: i,
        }))
      )
    } catch (err) {
      console.error('[Onboarding] Embedding feilet:', err.message)
      // Fortsetter selv om embeddings feiler
    }
  }

  // 8. Inviter admin-bruker
  try {
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(adminEmail, {
      data: { role: 'admin', client_id: clientId },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${clientId}`,
    })
    if (inviteErr) {
      console.error('[Onboarding] Invite feilet:', inviteErr.message)
    } else if (inviteData?.user?.id) {
      await admin.from('profiles').insert({
        id: inviteData.user.id,
        role: 'admin',
        client_id: clientId,
      }).catch(err => console.error('[Onboarding] Profil feilet:', err.message))
    }
  } catch (err) {
    console.error('[Onboarding] Uventet invite-feil:', err.message)
  }

  // 9. Send velkomst-e-post
  if (process.env.RESEND_API_KEY) {
    try {
      await sendWelcomeEmail({ adminEmail, adminName, companyName, clientId })
    } catch (err) {
      console.error('[Onboarding] E-post feilet:', err.message)
      // Ikke kritisk — fortsett
    }
  }

  // 10. Logg onboarding
  await admin.from('onboarding_log').insert({
    client_id: clientId,
    step: 'onboarding_complete',
    status: 'success',
    details: {
      companyName,
      websiteUrl,
      tone,
      hadBrreg: !!brregData.organisasjonsnummer,
      hadWebsite: !!websiteContent,
    },
  }).catch(() => {})

  return Response.json({ ok: true, clientId })
}
