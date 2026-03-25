import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const rawState = searchParams.get('state')

  if (!code || !rawState) {
    return Response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?channels=error`)
  }

  let state
  try {
    state = JSON.parse(rawState)
  } catch {
    return Response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?channels=error`)
  }

  const { clientId, channel } = state
  if (!clientId) {
    return Response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?channels=error`)
  }

  // Exchange code for access token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `client_id=${process.env.META_APP_ID}` +
      `&client_secret=${process.env.META_APP_SECRET}` +
      `&code=${code}` +
      `&redirect_uri=${encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL}/api/channels/callback`)}`
  )
  const tokenData = await tokenRes.json()

  if (tokenData.error || !tokenData.access_token) {
    return Response.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?channels=error`)
  }

  // Fetch pages the user manages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${tokenData.access_token}`
  )
  const pagesData = await pagesRes.json()

  if (!pagesData.data?.length) {
    return Response.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/settings?channels=no_pages&clientId=${clientId}`
    )
  }

  const admin = createAdminClient()

  for (const page of pagesData.data) {
    await admin.from('channel_configs').upsert(
      {
        client_id: clientId,
        channel: channel || 'messenger',
        external_id: page.id,
        page_name: page.name,
        access_token: page.access_token,
        active: false,
      },
      { onConflict: 'client_id,channel,external_id' }
    )
  }

  return Response.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/settings?channels=connected&clientId=${clientId}`
  )
}
