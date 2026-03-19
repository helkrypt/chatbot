'use client'

import { useEffect, useState, useMemo, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import InspectBanner from '@/components/InspectBanner'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

const ITEMS_PER_PAGE = 10

function ConversationsPageInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const [conversations, setConversations] = useState([])
    const [loading, setLoading] = useState(true)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)

    const isInspecting = searchParams.get('inspect') === 'true'
    const inspectedClientId = searchParams.get('client_id')

    const inspectSuffix = isInspecting && inspectedClientId
        ? `?inspect=true&client_id=${inspectedClientId}` : ''

    useEffect(() => {
        loadConversations()
    }, [inspectedClientId])

    const loadConversations = async () => {
        setLoading(true)
        let query = supabase
            .from('conversations')
            .select('*')
            .order('updated_at', { ascending: false })

        if (isInspecting && inspectedClientId) {
            query = query.eq('client_id', inspectedClientId)
        }

        const { data, error } = await query
        if (!error) {
            setConversations(data)
        }
        setLoading(false)
    }

    // Filter conversations based on search query
    const filteredConversations = useMemo(() => {
        if (!searchQuery.trim()) return conversations
        const q = searchQuery.toLowerCase()
        return conversations.filter((conv) =>
            (conv.customer_name || '').toLowerCase().includes(q) ||
            (conv.customer_email || '').toLowerCase().includes(q) ||
            (conv.customer_phone || '').toLowerCase().includes(q) ||
            (conv.id || '').toLowerCase().includes(q)
        )
    }, [conversations, searchQuery])

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredConversations.length / ITEMS_PER_PAGE))
    const paginatedConversations = filteredConversations.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    )

    // Reset to page 1 when search changes
    useEffect(() => {
        setCurrentPage(1)
    }, [searchQuery])

    const goToPage = (page) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)))
    }

    return (
        <>
        {isInspecting && <InspectBanner clientId={inspectedClientId} />}
        <div className="app-container">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <main className="main-content">
                <Navbar onMenuClick={() => setIsSidebarOpen(true)} />

                <div className="page-header">
                    <h1 className="page-title">Samtaler</h1>
                    <div className="conversations-search">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.3-4.3" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Søk etter navn, e-post, telefon..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                className="conversations-search-clear"
                                onClick={() => setSearchQuery('')}
                                aria-label="Tøm søk"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                <div className="card">
                    {/* Mobile card view */}
                    <div className="conversation-cards">
                        {loading ? (
                            <div className="loading"><div className="spinner"></div></div>
                        ) : filteredConversations.length === 0 ? (
                            <div className="empty-state" style={{ padding: '40px 20px' }}>
                                {searchQuery ? 'Ingen samtaler matcher søket ditt' : 'Ingen samtaler funnet'}
                            </div>
                        ) : (
                            paginatedConversations.map((conv) => (
                                <div
                                    key={conv.id}
                                    className="conversation-card"
                                    onClick={() => router.push(`/conversations/${conv.id}${inspectSuffix}`)}
                                >
                                    <div className="conversation-card-header">
                                        <span className="conversation-card-name">{conv.customer_name || 'Gjest'}</span>
                                        <span className="conversation-card-time">
                                            {new Date(conv.updated_at).toLocaleString('no-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="conversation-card-meta">
                                        <span className={`status-badge ${conv.status === 'escalated' ? 'escalated' : 'active'}`} style={{ fontSize: '11px', padding: '2px 8px' }}>
                                            {conv.status === 'escalated' ? 'Eskalert' : 'Normal'}
                                        </span>
                                        {conv.customer_email && <span>{conv.customer_email}</span>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Desktop table view */}
                    <div className="table-container conversation-table-desktop">
                        <table>
                            <thead>
                                <tr>
                                    <th>Kunde / ID</th>
                                    <th className="hide-mobile">E-post</th>
                                    <th className="hide-mobile">Telefon</th>
                                    <th>Status</th>
                                    <th className="hide-mobile">Sist oppdatert</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="loading">Laster...</td>
                                    </tr>
                                ) : filteredConversations.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="empty-state">
                                            {searchQuery ? 'Ingen samtaler matcher søket ditt' : 'Ingen samtaler funnet'}
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedConversations.map((conv) => (
                                        <tr
                                            key={conv.id}
                                            onClick={() => router.push(`/conversations/${conv.id}${inspectSuffix}`)}
                                            style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg)'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <td>
                                                <div style={{ fontWeight: '500' }}>{conv.customer_name || 'Gjest'}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{conv.id.slice(0, 8)}</div>
                                            </td>
                                            <td className="hide-mobile">{conv.customer_email || '-'}</td>
                                            <td className="hide-mobile">{conv.customer_phone || '-'}</td>
                                            <td>
                                                <span className={`status-badge ${conv.status === 'escalated' ? 'escalated' : 'active'}`}>
                                                    {conv.status === 'escalated' ? 'Eskalert' : 'Normal'}
                                                </span>
                                            </td>
                                            <td className="hide-mobile">
                                                {new Date(conv.updated_at).toLocaleString('no-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {!loading && filteredConversations.length > ITEMS_PER_PAGE && (
                        <div className="conversations-pagination">
                            <span className="conversations-pagination-info">
                                Viser {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredConversations.length)} av {filteredConversations.length}
                            </span>
                            <div className="conversations-pagination-buttons">
                                <button
                                    className="conversations-pagination-btn"
                                    onClick={() => goToPage(1)}
                                    disabled={currentPage === 1}
                                    aria-label="Første side"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></svg>
                                </button>
                                <button
                                    className="conversations-pagination-btn"
                                    onClick={() => goToPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    aria-label="Forrige side"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                                </button>

                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter(page => {
                                        if (totalPages <= 5) return true
                                        if (page === 1 || page === totalPages) return true
                                        if (Math.abs(page - currentPage) <= 1) return true
                                        return false
                                    })
                                    .reduce((acc, page, idx, arr) => {
                                        if (idx > 0 && page - arr[idx - 1] > 1) {
                                            acc.push(<span key={`ellipsis-${page}`} className="conversations-pagination-ellipsis">…</span>)
                                        }
                                        acc.push(
                                            <button
                                                key={page}
                                                className={`conversations-pagination-btn conversations-pagination-page ${currentPage === page ? 'active' : ''}`}
                                                onClick={() => goToPage(page)}
                                            >
                                                {page}
                                            </button>
                                        )
                                        return acc
                                    }, [])}

                                <button
                                    className="conversations-pagination-btn"
                                    onClick={() => goToPage(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    aria-label="Neste side"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                                </button>
                                <button
                                    className="conversations-pagination-btn"
                                    onClick={() => goToPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                    aria-label="Siste side"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 17 5-5-5-5" /><path d="m13 17 5-5-5-5" /></svg>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            <style jsx>{`
                @media (max-width: 768px) {
                    .hide-mobile {
                        display: none;
                    }
                }
            `}</style>
        </div>
        </>
    )
}

export default function ConversationsPage() {
    return (
        <Suspense fallback={null}>
            <ConversationsPageInner />
        </Suspense>
    )
}
