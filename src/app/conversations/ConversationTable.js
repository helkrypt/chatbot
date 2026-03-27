'use client'

import { useRouter } from 'next/navigation'

const CHANNEL_ICONS = {
    web:       { icon: '💬', label: 'Web' },
    messenger: { icon: '📘', label: 'Messenger' },
    instagram: { icon: '📸', label: 'Instagram' },
    whatsapp:  { icon: '📱', label: 'WhatsApp' },
    phone:     { icon: '📞', label: 'Telefon' },
}

export default function ConversationTable({ conversations }) {
    const router = useRouter()

    return (
        <div className="table-container">
            <table>
                <thead>
                    <tr>
                        <th style={{ width: '100px' }}>ID</th>
                        <th>Kunde</th>
                        <th>E-post</th>
                        <th>Telefon</th>
                        <th style={{ width: '60px' }}>Kanal</th>
                        <th>Sist oppdatert</th>
                        <th style={{ width: '50px' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {conversations.map((conv) => {
                        const channel = CHANNEL_ICONS[conv.channel] || CHANNEL_ICONS.web
                        return (
                            <tr
                                key={conv.id}
                                onClick={() => router.push(`/conversations/${conv.id}`)}
                                style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                                className="clickable-row"
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                                    {conv.id.slice(0, 8)}...
                                </td>
                                <td><strong>{conv.visitor_name || 'Ukjent'}</strong></td>
                                <td>{conv.visitor_email || '-'}</td>
                                <td>{conv.visitor_phone || '-'}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <span title={channel.label} style={{ fontSize: '16px' }}>{channel.icon}</span>
                                </td>
                                <td>{new Date(conv.updated_at).toLocaleString('no-NO')}</td>
                                <td>
                                    <div style={{ color: 'var(--color-text-muted)' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="m9 18 6-6-6-6" />
                                        </svg>
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
