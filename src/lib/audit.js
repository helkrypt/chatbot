import { createAdminClient } from '@/lib/supabase-admin'

/**
 * Logg en handling i audit_log-tabellen.
 * Bruk service-role key — kallet skjer alltid server-side.
 */
export async function logAudit({ clientId, userId, action, entityType, entityId, details, ipAddress }) {
  try {
    const admin = createAdminClient()
    await admin.from('audit_log').insert({
      client_id: clientId || null,
      user_id: userId || null,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      details: details || null,
      ip_address: ipAddress || null,
    })
  } catch (err) {
    console.error('[audit] Feil ved logging:', err.message)
  }
}
