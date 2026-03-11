/**
 * Sends an event to a client's configured webhook URL.
 * Failures are logged but never propagate — webhook errors must not break main flow.
 */
export async function notifyClientWebhook(client, event, payload) {
  if (!client?.webhook_url) return

  try {
    await fetch(client.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-helkrypt-event': event,
        'x-helkrypt-client': client.id,
      },
      body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
    })
  } catch (err) {
    console.error(`Webhook failed for ${client.id}:`, err.message)
  }
}
