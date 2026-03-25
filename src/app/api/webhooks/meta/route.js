import { createAdminClient } from '@/lib/supabase-admin'
import crypto from 'crypto'

function verifyMetaSignature(rawBody, signature) {
  const expected = crypto
    .createHmac('sha256', process.env.META_APP_SECRET)
    .update(rawBody)
    .digest('hex')
  return `sha256=${expected}` === signature
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  if (
    searchParams.get('hub.mode') === 'subscribe' &&
    searchParams.get('hub.verify_token') === process.env.META_WEBHOOK_VERIFY_TOKEN
  ) {
    return new Response(searchParams.get('hub.challenge'), { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(req) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  if (!verifyMetaSignature(rawBody, signature)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const body = JSON.parse(rawBody)
  const admin = createAdminClient()

  for (const entry of body.entry || []) {
    for (const messaging of entry.messaging || []) {
      if (!messaging.message?.text) continue

      // Determine channel by looking up config
      let channel = null
      let config = null

      const { data: messengerConfig } = await admin
        .from('channel_configs')
        .select('client_id, access_token')
        .eq('external_id', entry.id)
        .eq('channel', 'messenger')
        .eq('active', true)
        .single()

      if (messengerConfig) {
        channel = 'messenger'
        config = messengerConfig
      } else {
        const { data: igConfig } = await admin
          .from('channel_configs')
          .select('client_id, access_token')
          .eq('external_id', entry.id)
          .eq('channel', 'instagram')
          .eq('active', true)
          .single()

        if (igConfig) {
          channel = 'instagram'
          config = igConfig
        }
      }

      if (!config) continue

      await handleMetaMessage({
        admin,
        channel,
        config,
        senderId: messaging.sender.id,
        text: messaging.message.text,
      })
    }
  }

  return Response.json({ ok: true })
}

async function handleMetaMessage({ admin, channel, config, senderId, text }) {
  const convKey = `${channel}:${senderId}`

  let { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('client_id', config.client_id)
    .eq('external_conversation_id', convKey)
    .eq('status', 'active')
    .single()

  if (!conv) {
    const { data: newConv } = await admin
      .from('conversations')
      .insert({
        client_id: config.client_id,
        visitor_name: 'Gjest',
        status: 'active',
        channel,
        external_conversation_id: convKey,
      })
      .select('id')
      .single()
    conv = newConv
  }

  const chatRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': config.client_id,
    },
    body: JSON.stringify({
      message: text,
      conversationId: conv.id,
    }),
  })

  const { response } = await chatRes.json()
  if (!response) return

  await sendMetaReply({
    recipientId: senderId,
    text: response,
    accessToken: config.access_token,
  })
}

async function sendMetaReply({ recipientId, text, accessToken }) {
  await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: text.substring(0, 2000) },
      }),
    }
  )
}
