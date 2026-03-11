'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function InquiryTable({ inquiries }) {
    const router = useRouter()

    // Status badge styling helper
    const getStatusBadge = (status) => {
        const statusMap = {
            'new': { label: 'Ny', class: 'escalated' },
            'in_progress': { label: 'Under arbeid', class: 'active' },
            'resolved': { label: 'Løst', class: 'resolved' }
        }
        return statusMap[status] || { label: status, class: 'active' }
    }

    // Priority badge styling helper
    const getPriorityBadge = (priority) => {
        const priorityMap = {
            'low': { label: 'Lav', color: '#10b981' },
            'normal': { label: 'Normal', color: '#f59e0b' },
            'high': { label: 'Høy', color: '#ef4444' }
        }
        return priorityMap[priority] || { label: priority, color: '#6b7280' }
    }

    return (
        <div className="table-container">
            <table>
                <thead>
                    <tr>
                        <th style={{ width: '80px' }}>Saksnr</th>
                        <th>Emne</th>
                        <th>Kunde</th>
                        <th>Kontakt</th>
                        <th>Prioritet</th>
                        <th>Status</th>
                        <th>Opprettet</th>
                        <th style={{ width: '50px' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {inquiries.map((inquiry) => {
                        const statusBadge = getStatusBadge(inquiry.status)
                        const priorityBadge = getPriorityBadge(inquiry.priority)

                        return (
                            <tr
                                key={inquiry.id}
                                onClick={() => router.push(`/inquiries/${inquiry.id}`)}
                                style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                                className="clickable-row"
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <td>
                                    <span style={{ fontWeight: '600', color: 'var(--color-primary)', fontSize: '13px' }}>
                                        #{inquiry.ticket_number || inquiry.id.slice(0, 4).toUpperCase()}
                                    </span>
                                </td>
                                <td>
                                    <strong>{inquiry.subject}</strong>
                                </td>
                                <td>
                                    {inquiry.customer_name || inquiry.conversations?.visitor_name || 'Ukjent'}
                                </td>
                                <td>
                                    <div style={{ fontSize: '13px' }}>
                                        {inquiry.customer_email && (
                                            <div>{inquiry.customer_email}</div>
                                        )}
                                        {inquiry.customer_phone && (
                                            <div style={{ color: 'var(--color-text-muted)' }}>
                                                {inquiry.customer_phone}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <span
                                        className="status-badge"
                                        style={{
                                            background: `${priorityBadge.color}20`,
                                            color: priorityBadge.color,
                                            borderColor: priorityBadge.color
                                        }}
                                    >
                                        {priorityBadge.label}
                                    </span>
                                </td>
                                <td>
                                    <span className={`status-badge ${statusBadge.class}`}>
                                        {statusBadge.label}
                                    </span>
                                </td>
                                <td>{new Date(inquiry.created_at).toLocaleString('no-NO')}</td>
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
