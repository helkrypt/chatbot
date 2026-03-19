'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import InspectBanner from '@/components/InspectBanner'
import Link from 'next/link'

function ConversationDetailInner() {
    const { id } = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const messagesEndRef = useRef(null)

    const isInspecting = searchParams.get('inspect') === 'true'
    const inspectedClientId = searchParams.get('client_id')
    const inspectSuffix = isInspecting && inspectedClientId
        ? `?inspect=true&client_id=${inspectedClientId}` : ''

    const [conversation, setConversation] = useState(null)
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(true)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [userEmail, setUserEmail] = useState('')

    // Feedback modal state
    const [showFeedbackModal, setShowFeedbackModal] = useState(false)
    const [feedbackText, setFeedbackText] = useState('')
    const [sendingFeedback, setSendingFeedback] = useState(false)
    const [promptProposal, setPromptProposal] = useState(null)
    const [applyingPrompt, setApplyingPrompt] = useState(false)

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user?.email) setUserEmail(data.user.email)
        })
        loadConversation()
        loadMessages()

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

    const closeFeedback = () => {
        setShowFeedbackModal(false)
        setPromptProposal(null)
        setFeedbackText('')
    }

    if (loading) {
        return (
            <>
                {isInspecting && <InspectBanner clientId={inspectedClientId} />}
                <div className="app-container">
                    <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                    <main className="main-content">
                        <Navbar onMenuClick={() => setIsSidebarOpen(true)} />
                        <div className="loading"><div className="spinner"></div></div>
                    </main>
                </div>
            </>
        )
    }

    if (!conversation) {
        return (
            <>
                {isInspecting && <InspectBanner clientId={inspectedClientId} />}
                <div className="app-container">
                    <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                    <main className="main-content">
                        <Navbar onMenuClick={() => setIsSidebarOpen(true)} />
                        <div className="empty-state">
                            <div className="empty-state-title">Samtale ikke funnet</div>
                            <Link href={`/conversations${inspectSuffix}`} className="btn btn-primary">
                                Tilbake til samtaler
                            </Link>
                        </div>
                    </main>
                </div>
            </>
        )
    }

    return (
        <>
            {isInspecting && <InspectBanner clientId={inspectedClientId} />}
            <div className="app-container">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <main className="main-content">
                    <Navbar onMenuClick={() => setIsSidebarOpen(true)} />
                    <div className="page-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <Link href={`/conversations${inspectSuffix}`} className="btn btn-ghost">
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
                                                style={{ maxWidth: '100%', borderRadius: '8px', cursor: 'pointer' }}
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

                    {/* Feedback Modal — Step 1: Input */}
                    {showFeedbackModal && !promptProposal && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000
                        }} onClick={closeFeedback}>
                            <div style={{
                                background: 'white', borderRadius: '16px', padding: '32px',
                                maxWidth: '550px', width: '90%',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                                animation: 'modalPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                            }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>✏️</span> Endre svar på agenten
                                    </h2>
                                    <button onClick={closeFeedback} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
                                </div>
                                <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px', lineHeight: '1.5' }}>
                                    Beskriv hva agenten burde ha svart. AI-en vil automatisk foreslå endringer i systemprompten.
                                </p>
                                <textarea
                                    value={feedbackText}
                                    onChange={(e) => setFeedbackText(e.target.value)}
                                    placeholder="F.eks: 'Agenten svarte feil om åpningstider...'"
                                    rows={5}
                                    style={{ width: '100%', padding: '14px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: '1.5', marginBottom: '20px' }}
                                    autoFocus
                                />
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                    <button onClick={closeFeedback} className="btn btn-secondary">Avbryt</button>
                                    <button
                                        onClick={async () => {
                                            if (!feedbackText.trim()) return
                                            setSendingFeedback(true)
                                            try {
                                                const res = await fetch('/api/agent-feedback', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        feedback: feedbackText,
                                                        chatLog: messages.map(m => ({ role: m.role, content: m.content, created_at: m.created_at })),
                                                        conversationId: id
                                                    })
                                                })
                                                const data = await res.json()
                                                if (res.ok && data.success) {
                                                    setPromptProposal(data)
                                                } else {
                                                    alert(data.error || 'Kunne ikke generere forslag. Prøv igjen.')
                                                }
                                            } catch (e) { alert('Feil: ' + e.message) }
                                            finally { setSendingFeedback(false) }
                                        }}
                                        disabled={sendingFeedback || !feedbackText.trim()}
                                        style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: sendingFeedback || !feedbackText.trim() ? 'not-allowed' : 'pointer', opacity: sendingFeedback || !feedbackText.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        {sendingFeedback ? (
                                            <><div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div> Analyserer...</>
                                        ) : 'Foreslå endringer'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Feedback Modal — Step 2: Review proposed changes */}
                    {showFeedbackModal && promptProposal && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000
                        }} onClick={closeFeedback}>
                            <div style={{
                                background: 'white', borderRadius: '16px',
                                maxWidth: '680px', width: '90%', maxHeight: '85vh',
                                display: 'flex', flexDirection: 'column',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                                animation: 'modalPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                            }} onClick={e => e.stopPropagation()}>
                                <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Foreslåtte endringer</h2>
                                        <button onClick={closeFeedback} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
                                    </div>
                                    <p style={{ color: '#6b7280', fontSize: '14px', margin: '8px 0 0', lineHeight: '1.5' }}>
                                        {promptProposal.summary}
                                    </p>
                                </div>

                                <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
                                    <div style={{ marginBottom: '20px' }}>
                                        <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 10px', color: '#374151' }}>Endringer:</h3>
                                        <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {(promptProposal.changes || []).map((change, i) => (
                                                <li key={i} style={{ fontSize: '14px', lineHeight: '1.5', color: '#4b5563' }}>{change}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    <details style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
                                        <summary style={{ padding: '12px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#6b7280', userSelect: 'none' }}>
                                            Vis oppdatert systemprompt
                                        </summary>
                                        <pre style={{
                                            padding: '16px', margin: 0,
                                            fontSize: '12px', lineHeight: '1.6',
                                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                            maxHeight: '300px', overflow: 'auto',
                                            borderTop: '1px solid #e5e7eb',
                                            color: '#374151', background: '#f9fafb'
                                        }}>
                                            {promptProposal.updatedPrompt}
                                        </pre>
                                    </details>
                                </div>

                                <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '12px', justifyContent: 'flex-end', flexShrink: 0 }}>
                                    <button onClick={() => setPromptProposal(null)} className="btn btn-secondary">Tilbake</button>
                                    <button onClick={closeFeedback} className="btn btn-secondary" style={{ color: '#ef4444' }}>Forkast</button>
                                    <button
                                        onClick={async () => {
                                            setApplyingPrompt(true)
                                            try {
                                                const res = await fetch('/api/agent-feedback', {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        clientId: promptProposal.clientId,
                                                        currentPromptId: promptProposal.currentPromptId,
                                                        currentVersion: promptProposal.currentVersion,
                                                        updatedPrompt: promptProposal.updatedPrompt,
                                                        changeReason: feedbackText
                                                    })
                                                })
                                                const data = await res.json()
                                                if (res.ok && data.success) {
                                                    closeFeedback()
                                                    alert(`Systemprompten er oppdatert til versjon ${data.newVersion}.`)
                                                } else {
                                                    alert(data.error || 'Kunne ikke oppdatere. Prøv igjen.')
                                                }
                                            } catch (e) { alert('Feil: ' + e.message) }
                                            finally { setApplyingPrompt(false) }
                                        }}
                                        disabled={applyingPrompt}
                                        style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: applyingPrompt ? 'not-allowed' : 'pointer', opacity: applyingPrompt ? 0.5 : 1 }}
                                    >
                                        {applyingPrompt ? 'Lagrer...' : 'Godkjenn og aktiver'}
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
        </>
    )
}

export default function ConversationDetailPage() {
    return (
        <Suspense fallback={null}>
            <ConversationDetailInner />
        </Suspense>
    )
}
