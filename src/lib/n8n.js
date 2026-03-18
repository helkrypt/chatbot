// src/lib/n8n.js

const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

/**
 * Workflow ID-referanse (for debugging og n8n MCP-kall):
 *
 * send-email                → GS8K2edUoevOI7pI
 * client-onboarding         → IWF5Dee6ZXV6m3qz
 * welcome-email             → BLbKhLi9ucZCXenV
 * admin-notification        → 2uyAhk7AHE8RphsY
 * password-reset            → FprQ1NFgbPMUHRdK
 * agent-feedback            → HFAc5DVGLFNETph5
 * website-scraper           → AcikisvbOXmKC03M
 */

/**
 * Intern hjelpefunksjon – kaller n8n webhook
 * Autentisering: header "x-helkrypt-secret" (Header Auth i n8n)
 */
async function callN8nWebhook(path, payload) {
  const url = `${N8N_BASE_URL}/${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-helkrypt-secret': N8N_WEBHOOK_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error(`[n8n] Feil ved kall til ${path}:`, error);
    throw new Error(`n8n webhook feilet: ${path}`);
  }

  return res.json();
}

/**
 * Send e-post via n8n
 * Workflow: helkrypt-send-email (GS8K2edUoevOI7pI)
 */
export async function sendEmail({ to, subject, body, html, from, replyTo, clientId, attachments }) {
  return callN8nWebhook('send-email', { to, subject, body, html, from, replyTo, clientId, attachments });
}

/**
 * Trigger klient-onboarding workflow
 * Workflow: helkrypt-client-onboarding (IWF5Dee6ZXV6m3qz)
 */
export async function triggerClientOnboarding({
  clientId, companyName, orgnr, websiteUrl, adminEmail, adminName,
}) {
  return callN8nWebhook('client-onboarding', {
    clientId, companyName, orgnr, websiteUrl, adminEmail, adminName,
  });
}

/**
 * Send velkomst-e-post til ny bruker
 * Workflow: helkrypt-welcome-email (BLbKhLi9ucZCXenV)
 */
export async function sendWelcomeEmail({ to, name, role, clientId, clientName }) {
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/${clientId}`;
  return callN8nWebhook('welcome-email', {
    to, name, role, clientId, clientName, loginUrl,
  });
}

/**
 * Send intern sysadmin-notifikasjon til Marius
 * Workflow: helkrypt-admin-notification (2uyAhk7AHE8RphsY)
 */
export async function notifySysadmin({ type, title, details, clientId, clientName, severity = 'info' }) {
  return callN8nWebhook('admin-notification', {
    type, title, details, clientId, clientName, severity,
  });
}

/**
 * Send tilbakestillings-e-post for passord
 * Workflow: helkrypt-password-reset (FprQ1NFgbPMUHRdK)
 */
export async function sendPasswordResetEmail({ to, name, resetUrl, expiresInMinutes = 60 }) {
  return callN8nWebhook('password-reset', { to, name, resetUrl, expiresInMinutes });
}

/**
 * Trigger nettside-scraper for å hente brand-farger og auto-generere widget-tema
 * Workflow: helkrypt-website-scraper (AcikisvbOXmKC03M)
 */
export async function triggerWebsiteScraper({ clientId, websiteUrl }) {
  return callN8nWebhook('website-scraper', { clientId, websiteUrl });
}

/**
 * Send agent-feedback fra kundedashboard til Marius
 * Workflow: helkrypt-agent-feedback (HFAc5DVGLFNETph5)
 */
export async function sendAgentFeedback({
  recipient, replyTo, subject, html,
  feedback, conversationId, chatlogMarkdown, attachments,
}) {
  return callN8nWebhook('agent-feedback', {
    type: 'agent_feedback',
    recipient, replyTo, subject, html,
    feedback, conversationId, chatlogMarkdown, attachments,
  });
}
