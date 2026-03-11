'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function InquiriesPage() {
    const router = useRouter()
    const supabase = createClient()
    const [inquiries, setInquiries] = useState([])
    const [loading, setLoading] = useState(true)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [userRole, setUserRole] = useState('agent')
    const [showResolvedAdmin, setShowResolvedAdmin] = useState(false)

    useEffect(() => {
        loadInquiries()
    }, [])

    const loadInquiries = async () => {
        setLoading(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
            if (profile) setUserRole(profile.role)
        }

        const { data, error } = await supabase
            .from('inquiries')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Failed to load inquiries:', error)
        } else {
            setInquiries(data || [])
        }
        setLoading(false)
    }

    const getStatusLabel = (status) => {
        switch (status) {
            case 'new': return 'Ny';
            case 'in_progress': return 'Under arbeid';
            case 'resolved': return 'Løst';
            default: return status;
        }
    }

    const getPriorityLabel = (priority) => {
        switch (priority) {
            case 'high': return 'Høy';
            case 'normal': return 'Normal';
            case 'low': return 'Lav';
            default: return priority;
        }
    }

    return (
        <div className="app-container">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <main className="main-content">
                <Navbar onMenuClick={() => setIsSidebarOpen(true)} />

                <div className="page-header">
                    <h1 className="page-title">Henvendelser</h1>
                    {(userRole === 'admin' || userRole === 'sysadmin') && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-bg)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                            <input
                                type="checkbox"
                                id="showResolved"
                                checked={showResolvedAdmin}
                                onChange={(e) => setShowResolvedAdmin(e.target.checked)}
                                style={{
                                    width: '16px', height: '16px',
                                    accentColor: 'var(--color-accent)'
                                }}
                            />
                            <label htmlFor="showResolved" style={{ fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
                                Vis løste(arkiv)
                            </label>
                        </div>
                    )}
                </div>
                <div className="card">
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Sak #</th>
                                    <th>Kunde</th>
                                    <th>Emne</th>
                                    <th className="hide-mobile">Status</th>
                                    <th className="hide-mobile">Ansvarlig</th>
                                    <th className="hide-mobile">Opprettet</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="loading">Laster...</td>
                                    </tr>
                                ) : inquiries.filter(inq => inq.status !== 'resolved' || ((userRole === 'admin' || userRole === 'sysadmin') && showResolvedAdmin)).length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="empty-state">Ingen henvendelser funnet</td>
                                    </tr>
                                ) : (
                                    inquiries.filter(inq => inq.status !== 'resolved' || ((userRole === 'admin' || userRole === 'sysadmin') && showResolvedAdmin)).map((inquiry) => (
                                        <tr
                                            key={inquiry.id}
                                            onClick={() => router.push(`/inquiries/${inquiry.id}`)}
                                            style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg)'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <td style={{ fontWeight: '600' }}>
                                                #{inquiry.ticket_number || inquiry.id.slice(0, 8).toUpperCase()}
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: '500' }}>{inquiry.customer_name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{inquiry.customer_email}</div>
                                            </td>
                                            <td>
                                                <div className="text-truncate" style={{ maxWidth: '200px' }}>
                                                    {inquiry.subject}
                                                </div>
                                            </td>
                                            <td className="hide-mobile">
                                                <span className={`status-badge ${inquiry.status}`}>
                                                    {getStatusLabel(inquiry.status)}
                                                </span>
                                            </td>
                                            <td className="hide-mobile">
                                                {inquiry.assigned_agent?.full_name || '-'}
                                            </td>
                                            <td className="hide-mobile">
                                                {new Date(inquiry.created_at).toLocaleDateString('no-NO')}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
            <style jsx>{`
                .text-truncate {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                @media (max-width: 768px) {
                    .hide-mobile {
                        display: none;
                    }
                }
            `}</style>
        </div>
    )
}
