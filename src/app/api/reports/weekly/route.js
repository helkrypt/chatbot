import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/n8n';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isoWeekNumber(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((dt - firstThursday) / 86400000 - 3) / 7);
}

async function buildClientReport(clientId, clientName, startStr, endStr, weekNumber, periodeTekst, now) {
  const [convResult, msgResult, newEscResult, resolvedEscResult, openInqResult] = await Promise.all([
    supabase.from('conversations').select('*', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('created_at', startStr).lte('created_at', endStr),
    supabase.from('messages').select('*', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('created_at', startStr).lte('created_at', endStr),
    supabase.from('inquiries').select('*', { count: 'exact', head: true })
      .eq('client_id', clientId).gte('created_at', startStr).lte('created_at', endStr),
    supabase.from('inquiries').select('*', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('status', 'resolved').gte('updated_at', startStr).lte('updated_at', endStr),
    supabase.from('inquiries').select('id, customer_name, subject, status')
      .eq('client_id', clientId).neq('status', 'resolved'),
  ]);

  const inquiriesWithStatus = [];
  if (openInqResult.data?.length > 0) {
    for (const inq of openInqResult.data) {
      const { data: latestNote } = await supabase.from('inquiry_notes')
        .select('content').eq('inquiry_id', inq.id)
        .order('created_at', { ascending: false }).limit(1).single();
      inquiriesWithStatus.push({ ...inq, latestStatus: latestNote ? latestNote.content : 'Ingen logg ført' });
    }
  }

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;font-family:Arial,Helvetica,sans-serif;color:#111827;padding:20px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
      <tr><td style="font-size:22px;font-weight:700;padding-bottom:6px;color:#111827;">📊 ${clientName} Chatbot</td></tr>
      <tr><td style="font-size:16px;font-weight:600;padding-bottom:4px;color:#374151;">Ukentlig sammendrag</td></tr>
      <tr><td style="font-size:12px;color:#6b7280;padding-bottom:20px;">Generert: ${now.toLocaleString('nb-NO')}</td></tr>
      <tr><td style="padding-bottom:16px;">
        <div style="font-size:14px;font-weight:700;margin-bottom:4px;color:#4b5563;text-transform:uppercase;letter-spacing:0.05em;">📅 Rapportperiode</div>
        <div style="font-size:16px;color:#111827;">Uke ${weekNumber}: ${periodeTekst}</div>
      </td></tr>
      <tr><td style="padding:20px 0;border-top:1px solid #e5e7eb;">
        <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#111827;">📈 Statistikk</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;color:#4b5563;width:240px;">Totale samtaler</td><td style="padding:10px;border:1px solid #e5e7eb;font-weight:700;color:#111827;">${convResult.count || 0}</td></tr>
          <tr><td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;color:#4b5563;">Totale meldinger</td><td style="padding:10px;border:1px solid #e5e7eb;font-weight:700;color:#111827;">${msgResult.count || 0}</td></tr>
          <tr><td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;color:#4b5563;">Nye eskaleringer</td><td style="padding:10px;border:1px solid #e5e7eb;font-weight:700;color:#ef4444;">${newEscResult.count || 0}</td></tr>
          <tr><td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;color:#4b5563;">Løste eskaleringer</td><td style="padding:10px;border:1px solid #e5e7eb;font-weight:700;color:#10b981;">${resolvedEscResult.count || 0}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 0;border-top:1px solid #e5e7eb;">
        <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#111827;">📝 Åpne henvendelser (${inquiriesWithStatus.length})</div>
        ${inquiriesWithStatus.length > 0 ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;">
          <thead><tr style="background:#f9fafb;">
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;color:#4b5563;">Kunde / Emne</th>
            <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;color:#4b5563;">Siste logg/status</th>
          </tr></thead>
          <tbody>${inquiriesWithStatus.map(inq => `
          <tr>
            <td style="padding:10px;border:1px solid #e5e7eb;vertical-align:top;">
              <div style="font-weight:700;color:#111827;">${inq.customer_name || 'Ukjent'}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:2px;">${inq.subject}</div>
            </td>
            <td style="padding:10px;border:1px solid #e5e7eb;vertical-align:top;color:#374151;font-style:italic;">${inq.latestStatus}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<div style="color:#6b7280;font-style:italic;">Ingen åpne henvendelser for øyeblikket.</div>'}
      </td></tr>
      <tr><td style="padding-top:24px;border-top:1px solid #e5e7eb;">
        <div style="font-size:12px;color:#9ca3af;">Tjenesten er levert av Helkrypt AI AS</div>
      </td></tr>
    </table>
  </td></tr>
</table>`.trim();

  return { html, stats: { conversations: convResult.count || 0, messages: msgResult.count || 0, newEscalations: newEscResult.count || 0 } };
}

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Idempotency: ikke kjør to ganger på samme dag
    const { data: existingLog } = await supabase.from('cron_log')
      .select('id, status').eq('job_name', 'weekly-report').eq('run_date', todayStr).single();
    if (existingLog?.status === 'running' || existingLog?.status === 'completed') {
      return NextResponse.json({ success: true, skipped: true, reason: `Already ${existingLog.status}` });
    }
    const { data: logRow } = await supabase.from('cron_log')
      .upsert({ job_name: 'weekly-report', run_date: todayStr, status: 'running' }, { onConflict: 'job_name,run_date' })
      .select('id').single();

    const dayOfWeek = now.getDay();
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek + 6;
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - daysToLastMonday);
    lastMonday.setHours(0, 0, 0, 0);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    const startStr = lastMonday.toISOString();
    const endStr = lastSunday.toISOString();
    const weekNumber = isoWeekNumber(lastMonday);
    const periodeTekst = `${lastMonday.toLocaleDateString('nb-NO')} - ${lastSunday.toLocaleDateString('nb-NO')}`;

    // Hent alle aktive klienter
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name, escalation_email, config')
      .eq('active', true);

    if (clientsError) throw clientsError;

    const results = [];
    for (const client of clients || []) {
      const recipient = client.escalation_email || client.config?.reportEmail;
      if (!recipient) continue;

      const { html, stats } = await buildClientReport(client.id, client.name, startStr, endStr, weekNumber, periodeTekst, now);

      await sendEmail({
        to: recipient,
        subject: `${client.name} Chatbot - Ukentlig rapport (uke ${weekNumber})`,
        html,
        clientId: client.id,
      }).catch(err => console.error(`[weekly-report] Feil ved sending til ${client.id}:`, err));

      results.push({ clientId: client.id, ...stats });
    }

    if (logRow?.id) {
      await supabase.from('cron_log').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', logRow.id);
    }
    return NextResponse.json({ success: true, clients: results.length, period: periodeTekst });

  } catch (error) {
    console.error('Weekly report error:', error);
    return NextResponse.json({ error: 'Failed to generate weekly report', details: error.message }, { status: 500 });
  }
}
