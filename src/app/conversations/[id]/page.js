'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Link from 'next/link'

export default function ConversationDetailPage() {
    const { id } = useParams()
    const router = useRouter()
    const supabase = createClient()
    const messagesEndRef = useRef(null)

    const [conversation, setConversation] = useState(null)
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(true)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [userEmail, setUserEmail] = useState('')

    // Feedback modal state
    const [showFeedbackModal, setShowFeedbackModal] = useState(false)
    const [feedbackText, setFeedbackText] = useState('')
    const [sendingFeedback, setSendingFeedback] = useState(false)

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user?.email) setUserEmail(data.user.email)
        })
        loadConversation()
        loadMessages()

        // Subscribe to new messages
        const channel = supabase
            .channel(`conversation-${id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${id}`
            }, (payload) => {
                setMessages(prev => [...prev, payload.new])
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [id])

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const loadConversation = async () => {
        const { data } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', id)
            .single()
        setConversation(data)
    }

    const loadMessages = async () => {
        const { data } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true })
        setMessages(data || [])
        setLoading(false)
    }

    const sendFeedback = async () => {
        if (!feedbackText.trim()) return
        setSendingFeedback(true)

        try {
            const res = await fetch('/api/agent-feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    feedback: feedbackText,
                    chatLog: messages.map(m => ({
                        role: m.role,
                        content: m.content,
                        created_at: m.created_at
                    })),
                    conversationId: id,
                    replyTo: userEmail
                })
            })

            if (res.ok) {
                alert('Tilbakemelding sendt til marius@helkrypt.no for endring av systemprompt!')
                setShowFeedbackModal(false)
                setFeedbackText('')
            } else {
                alert('Kunne ikke sende tilbakemelding. Prøv igjen.')
            }
        } catch (e) {
            console.error(e)
            alert('Nettverksfeil: ' + e.message)
        } finally {
            setSendingFeedback(false)
        }
    }

    if (loading) {
        return (
            <div className="app-container">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <main className="main-content">
                    <div className="loading"><div className="spinner"></div></div>
                </main>
            </div>
        )
    }

    if (!conversation) {
        return (
            <div className="app-container">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <main className="main-content">
                    <div className="empty-state">
                        <div className="empty-state-title">Samtale ikke funnet</div>
                        <Link href="/conversations" className="btn btn-primary">
                            Tilbake til samtaler
                        </Link>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="app-container">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            <main className="main-content">
                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Link href="/conversations" className="btn btn-ghost">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="m15 18-6-6 6-6" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="page-title">{conversation.customer_name || 'Ukjent kunde'}</h1>
                            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '4px' }}>
                                {conversation.customer_email || 'Ingen e-post'}
                                {conversation.customer_phone && ` • ${conversation.customer_phone}`}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 className="card-title">Samtalelogg</h2>
                        <button
                            onClick={() => setShowFeedbackModal(true)}
                            className="btn"
                            style={{
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: 'white',
                                border: 'none',
                                padding: '8px 16px',
                                fontSize: '13px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Endre svar på agenten
                        </button>
                    </div>
                    <div style={{
                        maxHeight: '600px',
                        overflowY: 'auto',
                        padding: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        backgroundColor: '#f8f9fa'
                    }}>
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                style={{
                                    alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                                    maxWidth: '80%',
                                    backgroundColor: msg.role === 'user' ? 'white' : '#e0f2fe',
                                    color: 'var(--color-text)',
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    borderBottomLeftRadius: msg.role === 'user' ? '2px' : '12px',
                                    borderBottomRightRadius: msg.role !== 'user' ? '2px' : '12px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    position: 'relative'
                                }}
                            >
                                <div style={{
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    color: 'var(--color-text-muted)',
                                    marginBottom: '4px',
                                    textAlign: msg.role === 'user' ? 'left' : 'right'
                                }}>
                                    {msg.role === 'user' ? 'Kunde' : 'AI-Assistent'}
                                </div>

                                <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                    {msg.content}
                                </div>

                                {msg.file_url && (
                                    <div style={{ marginTop: '8px' }}>
                                        <img
                                            src={msg.file_url}
                                            alt="Vedlegg"
                                            style={{
                                                maxWidth: '100%',
                                                borderRadius: '8px',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => window.open(msg.file_url, '_blank')}
                                        />
                                    </div>
                                )}

                                <div style={{
                                    fontSize: '10px',
                                    opacity: 0.6,
                                    marginTop: '6px',
                                    textAlign: msg.role === 'user' ? 'left' : 'right'
                                }}>
                                    {new Date(msg.created_at).toLocaleTimeString('no-NO', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Feedback Modal */}
                {showFeedbackModal && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 2000
                    }} onClick={() => setShowFeedbackModal(false)}>
                        <div style={{
                            background: 'white',
                            borderRadius: '16px',
                            padding: '32px',
                            maxWidth: '550px',
                            width: '90%',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                            animation: 'modalPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>✏️</span> Endre svar på agenten
                                </h2>
                                <button
                                    onClick={() => setShowFeedbackModal(false)}
                                    style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280', padding: '4px' }}
                                >
                                    ✕
                                </button>
                            </div>

                            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px', lineHeight: '1.5' }}>
                                Beskriv hva agenten burde ha svart istedenfor. Denne tilbakemeldingen sendes til
                                <strong> marius@helkrypt.no</strong> sammen med samtaleloggen for justering av systemprompten.
                            </p>

                            <textarea
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                                placeholder="F.eks: 'Agenten svarte feil om åpningstider. Riktig svar er at vi har åpent mandag-fredag 08-16.'"
                                rows={5}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '10px',
                                    fontSize: '14px',
                                    resize: 'vertical',
                                    outline: 'none',
                                    fontFamily: 'inherit',
                                    lineHeight: '1.5',
                                    marginBottom: '20px',
                                    transition: 'border-color 0.2s'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                                autoFocus
                            />

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => setShowFeedbackModal(false)}
                                    className="btn btn-secondary"
                                >
                                    Avbryt
                                </button>
                                <button
                                    onClick={sendFeedback}
                                    disabled={sendingFeedback || !feedbackText.trim()}
                                    style={{
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '10px 24px',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        cursor: sendingFeedback || !feedbackText.trim() ? 'not-allowed' : 'pointer',
                                        opacity: sendingFeedback || !feedbackText.trim() ? 0.5 : 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    {sendingFeedback ? 'Sender...' : '📤 Send tilbakemelding'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <style jsx>{`
                @keyframes modalPop {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    )
}
