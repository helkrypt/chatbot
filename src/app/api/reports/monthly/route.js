import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
const N8N_WEBHOOK_URL = process.env.N8N_NOTIFICATION_WEBHOOK_URL || 'https://n8n.helkrypt.no/webhook/elesco-trondheim';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    // Security: Check CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

    if (!authHeader || authHeader !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Calculate last month (1st to last day)
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const startStr = lastMonth.toISOString();
    const endStr = lastMonthEnd.toISOString();

    // 1. Fetch statistics
    const { count: totalConversations } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startStr)
      .lte('created_at', endStr);

    const { count: totalMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startStr)
      .lte('created_at', endStr);

    const { count: newEscalations } = await supabase
      .from('inquiries')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startStr)
      .lte('created_at', endStr);

    const { count: resolvedEscalations } = await supabase
      .from('inquiries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved')
      .gte('updated_at', startStr)
      .lte('updated_at', endStr);

    // 2. Fetch all open inquiries and their latest notes
    const { data: openInquiries } = await supabase
      .from('inquiries')
      .select('id, customer_name, subject, status')
      .neq('status', 'resolved');

    const inquiriesWithStatus = [];
    if (openInquiries && openInquiries.length > 0) {
      for (const inq of openInquiries) {
        const { data: latestNote } = await supabase
          .from('inquiry_notes')
          .select('content')
          .eq('inquiry_id', inq.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        inquiriesWithStatus.push({
          ...inq,
          latestStatus: latestNote ? latestNote.content : 'Ingen logg ført'
        });
      }
    }

    const monthName = lastMonth.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' });
    const periodeTekst = `${lastMonth.toLocaleDateString('nb-NO')} - ${lastMonthEnd.toLocaleDateString('nb-NO')}`;
    const subject = `Elesco Trondheim Chatbot - Månedlig rapport (${monthName})`;

    // Build HTML email (LIGHT THEME)
    const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;font-family:Arial,Helvetica,sans-serif;color:#111827;padding:20px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        
        <tr><td style="font-size:22px;font-weight:700;padding-bottom:6px;color:#111827;">📊 Elesco Trondheim Chatbot</td></tr>
        <tr><td style="font-size:16px;font-weight:600;padding-bottom:4px;color:#374151;">Månedlig sammendrag</td></tr>
        <tr><td style="font-size:12px;color:#6b7280;padding-bottom:20px;">Generert: ${now.toLocaleString('nb-NO')}</td></tr>

        <tr><td style="padding-bottom:16px;">
          <div style="font-size:14px;font-weight:700;margin-bottom:4px;color:#4b5563;text-transform:uppercase;letter-spacing:0.05em;">📅 Rapportperiode</div>
          <div style="font-size:16px;color:#111827;">${monthName}: ${periodeTekst}</div>
        </td></tr>

        <tr><td style="padding:20px 0;border-top:1px solid #e5e7eb;">
          <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#111827;">📈 Statistikk</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;color:#4b5563;width:240px;">Totale samtaler</td>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:700;color:#111827;">${totalConversations || 0}</td>
            </tr>
            <tr>
              <td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;color:#4b5563;">Totale meldinger</td>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:700;color:#111827;">${totalMessages || 0}</td>
            </tr>
            <tr>
              <td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;color:#4b5563;">Nye eskaleringer</td>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:700;color:#ef4444;">${newEscalations || 0}</td>
            </tr>
            <tr>
              <td style="padding:10px;background:#f9fafb;border:1px solid #e5e7eb;color:#4b5563;">Løste eskaleringer</td>
              <td style="padding:10px;border:1px solid #e5e7eb;font-weight:700;color:#10b981;">${resolvedEscalations || 0}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:20px 0;border-top:1px solid #e5e7eb;">
          <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:#111827;">📝 Åpne henvendelser og status (${inquiriesWithStatus.length})</div>
          ${inquiriesWithStatus.length > 0 ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;color:#4b5563;">Kunde / Emne</th>
                <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;color:#4b5563;">Siste logg/status</th>
              </tr>
            </thead>
            <tbody>
              ${inquiriesWithStatus.map(inq => `
              <tr>
                <td style="padding:10px;border:1px solid #e5e7eb;vertical-align:top;">
                  <div style="font-weight:700;color:#111827;">${inq.customer_name || 'Ukjent'}</div>
                  <div style="font-size:12px;color:#6b7280;margin-top:2px;">${inq.subject}</div>
                </td>
                <td style="padding:10px;border:1px solid #e5e7eb;vertical-align:top;color:#374151;font-style:italic;">
                  ${inq.latestStatus}
                </td>
              </tr>
              `).join('')}
            </tbody>
          </table>
          ` : '<div style="color:#6b7280;font-style:italic;">Ingen åpne henvendelser for øyeblikket.</div>'}
        </td></tr>

        <tr><td style="padding-top:24px;border-top:1px solid #e5e7eb;">
          <div style="font-size:12px;color:#9ca3af;">Tjenesten er levert av Helkrypt AI AS</div>
        </td></tr>

      </table>
    </td>
  </tr>
</table>
        `.trim();

    // Send email via n8n webhook
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: process.env.ADMIN_EMAIL || 'kundeservice@elesco.no',
        from: process.env.SMTP_FROM || '"Elesco System" <chatbot@cityrtv.no>',
        subject,
        html,
      })
    });

    if (!n8nResponse.ok) {
      throw new Error(`n8n webhook failed with status: ${n8nResponse.status}`);
    }

    console.log('Monthly report sent via n8n webhook');

    return NextResponse.json({
      success: true,
      period: periodeTekst,
      stats: {
        totalConversations: totalConversations || 0,
        totalMessages: totalMessages || 0,
        newEscalations: newEscalations || 0,
        resolvedEscalations: resolvedEscalations || 0,
        openInquiries: inquiriesWithStatus.length
      }
    });

  } catch (error) {
    console.error('Monthly report error:', error);
    return NextResponse.json(
      { error: 'Failed to generate monthly report', details: error.message },
      { status: 500 }
    );
  }
}
