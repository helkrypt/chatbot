import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendWelcomeEmail({ adminEmail, adminName, companyName, clientId }) {
  await resend.emails.send({
    from: 'Helkrypt AI <hei@helkrypt.no>',
    to: adminEmail,
    subject: `${companyName} sin chatbot er klar!`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Hei ${adminName || 'der'}!</h2>
        <p>Chatboten for <strong>${companyName}</strong> er nå satt opp og klar til bruk.</p>
        <p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${clientId}"
             style="background:#00c9b7;color:white;padding:12px 24px;
                    text-decoration:none;border-radius:6px;display:inline-block">
            Gå til dashbordet ditt →
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">
          Helkrypt AI · Din smarte kundeserviceassistent
        </p>
      </div>
    `,
  })
}

export async function sendEscalationEmail({ to, inquiryData, clientName, dashboardUrl }) {
  await resend.emails.send({
    from: `${clientName} via Helkrypt <varsler@helkrypt.no>`,
    to,
    subject: `Ny henvendelse: ${inquiryData.subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Ny henvendelse fra ${inquiryData.customer_name || 'ukjent'}</h2>
        <p><strong>Emne:</strong> ${inquiryData.subject}</p>
        <p><strong>Beskrivelse:</strong> ${inquiryData.message || ''}</p>
        ${inquiryData.customer_email ? `<p><strong>E-post:</strong> ${inquiryData.customer_email}</p>` : ''}
        ${inquiryData.customer_phone ? `<p><strong>Telefon:</strong> ${inquiryData.customer_phone}</p>` : ''}
        ${dashboardUrl ? `
        <p>
          <a href="${dashboardUrl}"
             style="background:#00c9b7;color:white;padding:12px 24px;
                    text-decoration:none;border-radius:6px;display:inline-block">
            Se henvendelsen →
          </a>
        </p>` : ''}
        <p style="color:#6b7280;font-size:13px">Helkrypt AI</p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  await resend.emails.send({
    from: 'Helkrypt AI <noreply@helkrypt.no>',
    to,
    subject: 'Tilbakestill passordet ditt',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Hei ${name || 'der'}!</h2>
        <p>Vi har mottatt en forespørsel om å tilbakestille passordet ditt.</p>
        <p>
          <a href="${resetUrl}"
             style="background:#00c9b7;color:white;padding:12px 24px;
                    text-decoration:none;border-radius:6px;display:inline-block">
            Tilbakestill passord →
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">
          Lenken er gyldig i 24 timer. Hvis du ikke ba om dette, kan du ignorere denne e-posten.
        </p>
      </div>
    `,
  })
}
