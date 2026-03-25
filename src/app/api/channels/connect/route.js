export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const channel = searchParams.get('channel') || 'messenger'

  if (!clientId) {
    return new Response('Missing clientId', { status: 400 })
  }

  const scope =
    channel === 'instagram'
      ? 'pages_manage_metadata,instagram_basic,instagram_manage_messages'
      : 'pages_manage_metadata,pages_messaging'

  const fbLoginUrl =
    `https://www.facebook.com/v19.0/dialog/oauth?` +
    `client_id=${process.env.META_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL}/api/channels/callback`)}` +
    `&scope=${scope}` +
    `&state=${encodeURIComponent(JSON.stringify({ clientId, channel }))}`

  return Response.redirect(fbLoginUrl)
}
