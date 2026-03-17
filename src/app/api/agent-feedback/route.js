import { createClient } from '@/lib/supabase-server'

export async function POST(request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { feedback, chatLog, conversationId, replyTo } = await request.json()

        if (!feedback || !chatLog) {
            return Response.json({ error: 'Feedback og chatlog er påkrevd' }, { status: 400 })
        }

        // Format HTML email
        const chatHtml = chatLog.map(msg => `
            <div style="margin-bottom: 12px; padding: 10px; background: ${msg.role === 'user' ? '#f0f0f0' : '#e0f2fe'}; border-radius: 8px;">
                <div style="font-size: 11px; font-weight: bold; color: #666; margin-bottom: 4px;">
                    ${msg.role === 'user' ? 'Kunde' : 'AI-Assistent'}
                </div>
                <div style="font-size: 14px; white-space: pre-wrap;">${msg.content}</div>
                <div style="font-size: 10px; color: #999; margin-top: 4px;">
                    ${new Date(msg.created_at).toLocaleString('no-NO')}
                </div>
            </div>
        `).join('')

        const htmlBody = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto;">
                <div style="background: #1a1b2e; color: white; padding: 20px 24px; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; font-size: 20px;">🔄 Tilbakemelding: Endre agentsvar</h1>
                    <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.7;">Samtale-ID: ${conversationId || 'Ukjent'}</p>
                </div>
                
                <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
                    <h2 style="font-size: 16px; color: #1a1b2e; margin: 0 0 12px;">💬 Ønsket endring:</h2>
                    <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 16px; border-radius: 8px; margin-bottom: 24px; white-space: pre-wrap;">
                        ${feedback}
                    </div>
                    
                    <h2 style="font-size: 16px; color: #1a1b2e; margin: 0 0 12px;">📋 Samtalelogg:</h2>
                    <div style="max-height: 600px; overflow-y: auto;">
                        ${chatHtml}
                    </div>
                </div>

                <div style="background: #f8f9fc; padding: 16px 24px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
                    <p style="margin: 0; font-size: 12px; color: #6b7280;">
                        Sendt fra Helkrypt AI dashbordet.
                    </p>
                </div>
            </div>
        `

        // Format Markdown attachment
        const chatMarkdown = chatLog.map(msg => 
            `### ${msg.role === 'user' ? 'Kunde' : 'AI-Assistent'} (${new Date(msg.created_at).toLocaleString('no-NO')}):\n${msg.content}\n`
        ).join('\n---\n\n')

        // Base64 encode the markdown content (useful for n8n binary file creation)
        const chatMarkdownBase64 = Buffer.from(chatMarkdown).toString('base64')

        // Send via n8n webhook (Dedicated webhook for feedback)
        const n8nUrl = process.env.N8N_FEEDBACK_WEBHOOK_URL
        if (n8nUrl) {
            await fetch(n8nUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'agent_feedback',
                    recipient: 'marius@helkrypt.no',
                    replyTo: replyTo || '',
                    subject: `🔄 Tilbakemelding: Endre agentsvar - Samtale ${conversationId ? conversationId.slice(0, 8) : 'Ukjent'}`,
                    html: htmlBody,
                    feedback,
                    conversationId,
                    chatlogMarkdown: chatMarkdown,
                    attachments: [
                        {
                            filename: `chathistorikk_${conversationId || 'ukjent'}.md`,
                            content: chatMarkdownBase64,
                            encoding: 'base64',
                            mimeType: 'text/markdown'
                        }
                    ]
                })
            })
        } else {
            // Fallback: Send via the existing email API
            await fetch(new URL('/api/send-email', request.url).toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: 'marius@helkrypt.no',
                    subject: `🔄 Tilbakemelding: Endre agentsvar - Samtale ${conversationId ? conversationId.slice(0, 8) : 'Ukjent'}`,
                    html: htmlBody,
                    attachments: [
                        {
                            filename: `chathistorikk_${conversationId || 'ukjent'}.md`,
                            content: chatMarkdownBase64,
                            encoding: 'base64',
                            mimeType: 'text/markdown'
                        }
                    ]
                })
            })
        }

        return Response.json({ success: true })
    } catch (error) {
        console.error('Agent feedback error:', error)
        return Response.json({ error: error.message }, { status: 500 })
    }
}
