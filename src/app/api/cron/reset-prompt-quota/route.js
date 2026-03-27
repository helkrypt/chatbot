import { createAdminClient } from '@/lib/supabase-admin'
import { notifySysadmin } from '@/lib/n8n'

export async function GET(request) {
  // Verifiser Vercel cron-secret
  const secret = request.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // Kall DB-funksjonen som klargjør kvoterader for ny måned
    const { data, error } = await admin.rpc('reset_all_prompt_quotas')
    if (error) throw new Error(error.message)

    const count = data ?? 0
    console.log(`[Cron] Prompt-kvoter nullstilt — ${count} nye rader opprettet for inneværende måned`)

    await notifySysadmin({
      type: 'cron_success',
      title: 'Månedlig prompt-kvote reset',
      details: `${count} klient(er) fikk nye kvoterader for inneværende måned.`,
      severity: 'info',
    }).catch(() => {})

    return Response.json({ ok: true, rowsCreated: count })
  } catch (err) {
    console.error('[Cron] reset-prompt-quota feilet:', err.message)
    await notifySysadmin({
      type: 'cron_error',
      title: 'Prompt-kvote reset feilet',
      details: err.message,
      severity: 'error',
    }).catch(() => {})
    return Response.json({ error: err.message }, { status: 500 })
  }
}
