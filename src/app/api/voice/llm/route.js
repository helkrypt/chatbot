import { anthropic, MODELS } from '@/lib/anthropic'
import { embed } from '@/lib/voyage'
import { createAdminClient } from '@/lib/supabase-admin'

export const runtime = 'edge'

export async function GET(request) {
  const upgrade = request.headers.get('Upgrade')
  if (!upgrade || upgrade !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 })
  }

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')

  if (!clientId) {
    return new Response('Missing client_id', { status: 400 })
  }

  // @ts-expect-error - WebSocketPair available in Edge Runtime (Cloudflare/Vercel)
  const { 0: clientSocket, 1: serverSocket } = new WebSocketPair()
  serverSocket.accept()

  serverSocket.addEventListener('message', async (event) => {
    let data
    try {
      data = JSON.parse(event.data)
    } catch {
      return
    }

    if (data.interaction_type !== 'response_required') return

    try {
      const admin = createAdminClient()

      const { data: promptRow } = await admin
        .from('system_prompts')
        .select('content')
        .eq('client_id', clientId)
        .eq('active', true)
        .single()

      let ragContext = ''
      const lastUserMsg = data.transcript?.at(-1)?.content || ''
      if (lastUserMsg && process.env.VOYAGE_API_KEY) {
        try {
          const [queryEmbedding] = await embed(lastUserMsg, 'query')
          const { data: chunks } = await admin.rpc('match_chunks', {
            query_embedding: queryEmbedding,
            match_client_id: clientId,
            match_count: 3,
            match_threshold: 0.72,
          })
          if (chunks?.length > 0) {
            ragContext = '\n\n### Relevant info:\n' + chunks.map(c => c.content).join('\n\n')
          }
        } catch { /* fortsett uten RAG */ }
      }

      const voiceSystemPrompt = (promptRow?.content || '')
        .replace('[[OPENING_HOURS]]', '')
        + ragContext
        + `\n\n### VIKTIG FOR TELEFON:
- Svar kort og naturlig — dette er en telefonsamtale, ikke chat
- Aldri bruk punktlister, markdown eller lenker
- Maks 2-3 setninger per svar
- Si alltid "Kan du si det igjen?" hvis du ikke forstår
- Avslutt med: "Er det noe annet jeg kan hjelpe med?"
- Hvis du ikke kan hjelpe: be om navn og telefonnummer for tilbakeringing`

      const messages = (data.transcript || []).map(t => ({
        role: t.role === 'agent' ? 'assistant' : 'user',
        content: t.content,
      }))

      const claudeRes = await anthropic.messages.create({
        model: MODELS.chatbot,
        system: voiceSystemPrompt,
        messages,
        max_tokens: 150,
      })

      const responseText = claudeRes.content[0]?.text
        || 'Beklager, jeg forstod ikke det. Kan du si det igjen?'

      serverSocket.send(JSON.stringify({
        response_id: data.response_id,
        content: responseText,
        content_complete: true,
        end_call: false,
      }))
    } catch (err) {
      console.error('Voice LLM error:', err)
      serverSocket.send(JSON.stringify({
        response_id: data.response_id,
        content: 'Beklager, det oppstod en teknisk feil. Vennligst prøv igjen.',
        content_complete: true,
        end_call: false,
      }))
    }
  })

  return new Response(null, {
    status: 101,
    // @ts-expect-error - webSocket property available in Edge Runtime
    webSocket: clientSocket,
  })
}
