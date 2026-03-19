'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import InspectBanner from '@/components/InspectBanner'
import Link from 'next/link'

function InquiryDetailInner() {
    const { id } = useParams()
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const messagesEndRef = useRef(null)

    const isInspecting = searchParams.get('inspect') === 'true'
    const inspectedClientId = searchParams.get('client_id')
    const inspectSuffix = isInspecting && inspectedClientId
        ? `?inspect=true&client_id=${inspectedClientId}` : ''

    // Auth & Role State
    const [userRole, setUserRole] = useState(null)
    const [userId, setUserId] = useState(null)
    const [userName, setUserName] = useState(null)
    const [userEmail, setUserEmail] = useState(null)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    // Data State
    const [inquiry, setInquiry] = useState(null)
    const [messages, setMessages] = useState([])
    const [agents, setAgents] = useState([])
    const [notes, setNotes] = useState([])
    const [newNote, setNewNote] = useState('')
    const [loading, setLoading] = useState(true)

    // UI state for Email
    const [emailSubject, setEmailSubject] = useState('')
    const [emailContent, setEmailContent] = useState('')
    const [sendingEmail, setSendingEmail] = useState(false)
    const [optimizing, setOptimizing] = useState(false)

    // Feedback modal state
    const [showFeedbackModal, setShowFeedbackModal] = useState(false)
    const [feedbackText, setFeedbackText] = useState('')
    const [sendingFeedback, setSendingFeedback] = useState(false)
    const [promptProposal, setPromptProposal] = useState(null)
    const [applyingPrompt, setApplyingPrompt] = useState(false)

    // Email preview modal state
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [previewEmail, setPreviewEmail] = useState(null)

    useEffect(() => {
        loadData()
    }, [id])

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const loadData = async () => {
        setLoading(true)

        // Get Current User
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            setUserId(user.id)
            const { data: profile } = await supabase
                .from('profiles')
                .select('role, full_name, email')
                .eq('id', user.id)
                .single()
            setUserRole(profile?.role || 'agent')
            setUserName(profile?.full_name || profile?.email || 'Administrator')
            setUserEmail(profile?.email || user.email || '')
        }

        // 1. Fetch Inquiry
        const { data: inquiryData } = await supabase
            .from('inquiries')
            .select('*')
            .eq('id', id)
            .single()

        if (!inquiryData) {
            setLoading(false)
            return
        }

        const caseNr = inquiryData.ticket_number ? inquiryData.ticket_number : inquiryData.id.slice(0, 8).toUpperCase()
        setInquiry(inquiryData)
        setEmailSubject(`Re: [Sak #${caseNr}] ${inquiryData.subject}`)

        // 2. Auto-update status and assign if 'new'
        if (inquiryData.status === 'new') {
            await updateStatus(inquiryData, 'in_progress', false)
            inquiryData.status = 'in_progress'

            // Auto-assign to the first person who opens the inquiry
            if (!inquiryData.assigned_to && user) {
                await supabase
                    .from('inquiries')
                    .update({ assigned_to: user.id })
                    .eq('id', id)
                inquiryData.assigned_to = user.id
                setInquiry(prev => ({ ...prev, assigned_to: user.id }))
            }
        }

        // 3. Fetch Agents (Profiles)
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .order('full_name')
        setAgents(profiles || [])

        // 4. Fetch Conversation Messages
        const { data: msgData } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', inquiryData.conversation_id)
            .order('created_at', { ascending: true })
        setMessages(msgData || [])

        // 5. Fetch Internal Notes (inkl. sendte eposter)
        const { data: noteData } = await supabase
            .from('inquiry_notes')
            .select('*, profiles(full_name, email), sent_emails(id, subject, to_email, html_content, created_at)')
            .eq('inquiry_id', id)
            .order('created_at', { ascending: false })
        setNotes(noteData || [])

        setLoading(false)
    }

    const updateStatus = async (inq, newStatus, refresh = true) => {
        const { error } = await supabase
            .from('inquiries')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', id)

        if (!error) {
            if (refresh) {
                setInquiry({ ...inq, status: newStatus })
            }
            if (newStatus === 'resolved' && inq.status !== 'resolved') {
                try {
                    await fetch('/api/send-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            toAdmin: true,
                            subject: `Sak løst: #${inq.ticket_number || inq.id.slice(0, 8).toUpperCase()}`,
                            html: `<p>Saken <strong>${inq.subject}</strong> har blitt markert som løst av ${userName}.</p>
                                   <p><a href="${window.location.origin}/inquiries/${inq.id}">Gå til saken i dashboardet</a></p>`
                        })
                    })
                } catch (err) {
                    console.error("Feil ved sending av admin varsel:", err)
                }
            }
        }
    }

    const updatePriority = async (newPriority) => {
        const { error } = await supabase
            .from('inquiries')
            .update({ priority: newPriority, updated_at: new Date().toISOString() })
            .eq('id', id)

        if (!error) {
            setInquiry({ ...inquiry, priority: newPriority })
        }
    }

    const assignAgent = async (agentId) => {
        const val = agentId === "" ? null : agentId
        const { error } = await supabase
            .from('inquiries')
            .update({ assigned_to: val, updated_at: new Date().toISOString() })
            .eq('id', id)

        if (!error) {
            setInquiry({ ...inquiry, assigned_to: val })
            if (val && val !== inquiry.assigned_to) {
                const agent = agents.find(a => a.id === val)
                if (agent && agent.email) {
                    try {
                        await fetch('/api/send-email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                to: agent.email,
                                subject: `Ny sak tildelt: #${inquiry.ticket_number || inquiry.id.slice(0, 8).toUpperCase()}`,
                                html: `<p>Du har blitt tildelt saken <strong>${inquiry.subject}</strong> av ${userName}.</p>
                                       <p><a href="${window.location.origin}/inquiries/${inquiry.id}">Gå til saken i dashboardet</a></p>`
                            })
                        })
                    } catch (err) {
                        console.error("Feil ved sending av tildelingsvarsel:", err)
                    }
                }
            }
        }
    }

    const addNote = async () => {
        if (!newNote.trim()) return
        const { data, error } = await supabase
            .from('inquiry_notes')
            .insert({
                inquiry_id: id,
                created_by: userId,
                content: newNote
            })
            .select('*, profiles(full_name, email)')
            .single()

        if (!error) {
            setNotes([data, ...notes])
            setNewNote('')
        }
    }

    const optimizeResponse = async () => {
        if (!emailContent.trim()) return
        setOptimizing(true)
        try {
            const res = await fetch('/api/optimize-response', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: emailContent,
                    conversationMessages: messages.map(m => ({ role: m.role, content: m.content })),
                    customerName: inquiry?.customer_name || '',
                    agentName: userName,
                    agentEmail: userEmail,
                    inquirySubject: inquiry?.subject || ''
                })
            })
            const data = await res.json()
            if (data.optimizedText) {
                setEmailContent(data.optimizedText)
            }
        } catch (e) {
            console.error(e)
            alert('Kunne ikke optimalisere svar.')
        } finally {
            setOptimizing(false)
        }
    }

    const sendEmail = async () => {
        if (!emailContent.trim() || !inquiry.customer_email) return
        setSendingEmail(true)
        try {
            const htmlBody = `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                    <div style="padding: 24px;">
                        ${emailContent.replace(/\n/g, '<br>')}
                    </div>
                </div>
            `

            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: inquiry.customer_email,
                    subject: emailSubject,
                    replyTo: userEmail,
                    html: htmlBody,
                    inquiryId: id
                })
            })

            if (response.ok) {
                // 1. Lagre sendt epost
                const { data: savedEmail } = await supabase
                    .from('sent_emails')
                    .insert({
                        inquiry_id: id,
                        sent_by: userId,
                        to_email: inquiry.customer_email,
                        subject: emailSubject,
                        html_content: htmlBody
                    })
                    .select()
                    .single()

                // 2. Opprett logg-note med referanse
                await supabase.from('inquiry_notes').insert({
                    inquiry_id: id,
                    created_by: userId,
                    content: `📧 Sendt epost til kunde`,
                    sent_email_id: savedEmail?.id || null
                })

                // 3. Tøm felt og last inn på nytt
                setEmailContent('')
                loadData()
            } else {
                alert('Kunne ikke sende e-post. Sjekk n8n-konfigurasjon.')
            }
        } catch (error) {
            console.error(error)
            alert('En feil oppstod ved sending.')
        } finally {
            setSendingEmail(false)
        }
    }

    const getStatusLabel = (status) => {
        switch (status) {
            case 'new': return 'Ny';
            case 'in_progress': return 'Under behandling';
            case 'resolved': return 'Løst';
            default: return status;
        }
    }

    const getStatusBadgeClass = (status) => {
        switch (status) {
            case 'new': return 'new';
            case 'in_progress': return 'in-progress';
            case 'resolved': return 'active';
            default: return '';
        }
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

    if (!inquiry) {
        return (
            <>
                {isInspecting && <InspectBanner clientId={inspectedClientId} />}
                <div className="app-container">
                    <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                    <main className="main-content">
                        <Navbar onMenuClick={() => setIsSidebarOpen(true)} />
                        <div className="empty-state">
                            <div className="empty-state-title">Henvendelse ikke funnet</div>
                            <Link href={`/inquiries${inspectSuffix}`} className="btn btn-primary">
                                Tilbake til henvendelser
                            </Link>
                        </div>
                    </main>
                </div>
            </>
        )
    }

    const canAssign = userRole === 'admin' || userRole === 'sysadmin' || !inquiry.assigned_to

    return (
        <>
        {isInspecting && <InspectBanner clientId={inspectedClientId} />}
        <div className="app-container">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <main className="main-content">
                <Navbar onMenuClick={() => setIsSidebarOpen(true)} />

                <div className="page-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => router.back()}
                            className="btn-secondary"
                            style={{ padding: '8px' }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <h1 className="page-title">Sak #{inquiry.ticket_number || inquiry.id.slice(0, 8).toUpperCase()}</h1>
                        <span className={`status-badge ${getStatusBadgeClass(inquiry.status)}`}>
                            {getStatusLabel(inquiry.status)}
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                        {inquiry.status !== 'resolved' ? (
                            <button
                                onClick={() => updateStatus(inquiry, 'resolved')}
                                className="btn"
                                style={{ backgroundColor: '#10b981', color: 'white', border: 'none' }}
                            >
                                ✓ Sak løst
                            </button>
                        ) : (
                            <button
                                onClick={() => updateStatus(inquiry, 'in_progress')}
                                className="btn btn-secondary"
                            >
                                Gjenåpne sak
                            </button>
                        )}
                        <select
                            value={inquiry.priority}
                            onChange={(e) => updatePriority(e.target.value)}
                            className="form-select"
                            style={{ padding: '8px 12px' }}
                        >
                            <option value="low">Lav prioritet</option>
                            <option value="normal">Normal prioritet</option>
                            <option value="high">Høy prioritet</option>
                        </select>
                    </div>
                </div>

                <div className="detail-grid">
                    {/* Main Feed */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Conversation Log */}
                        {messages.length > 0 && (
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
                                        Endre svar
                                    </button>
                                </div>
                                <div style={{
                                    maxHeight: '500px',
                                    overflowY: 'auto',
                                    padding: '20px',
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
                                                maxWidth: '90%',
                                                backgroundColor: msg.role === 'user' ? 'white' : '#e0f2fe',
                                                color: 'var(--color-text)',
                                                padding: '12px 16px',
                                                borderRadius: '12px',
                                                borderBottomLeftRadius: msg.role === 'user' ? '2px' : '12px',
                                                borderBottomRightRadius: msg.role !== 'user' ? '2px' : '12px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                            }}
                                        >
                                            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                                                {msg.role === 'user' ? 'Kunde' : 'AI-Assistent'}
                                            </div>
                                            <div style={{ fontSize: '14px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{msg.content}</div>
                                            {msg.file_url && (
                                                <div style={{ marginTop: '8px' }}>
                                                    <img src={msg.file_url} alt="Vedlegg" style={{ maxWidth: '100%', borderRadius: '8px', cursor: 'pointer' }} onClick={() => window.open(msg.file_url, '_blank')} />
                                                </div>
                                            )}
                                            <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '6px' }}>
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>
                        )}

                        <div className="card">
                            <div className="card-header">
                                <h2 className="card-title">Opprinnelig henvendelse</h2>
                            </div>
                            <div style={{ padding: '16px', whiteSpace: 'pre-wrap' }}>
                                {inquiry.message}
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <h2 className="card-title">Svar kunde</h2>
                            </div>
                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Emne"
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                />
                                <div style={{ position: 'relative' }}>
                                    <textarea
                                        className="input-field"
                                        placeholder="Skriv svar til kunden her..."
                                        rows={8}
                                        value={emailContent}
                                        onChange={(e) => setEmailContent(e.target.value)}
                                        style={{ width: '100%', padding: '12px', resize: 'vertical' }}
                                    />
                                    <button
                                        onClick={optimizeResponse}
                                        disabled={optimizing || !emailContent.trim()}
                                        className="btn-ghost"
                                        style={{ position: 'absolute', bottom: '8px', right: '8px', fontSize: '12px', background: '#f0f9ff', padding: '4px 8px' }}
                                    >
                                        {optimizing ? '✨ Optimaliserer...' : '✨ Optimaliser med AI'}
                                    </button>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                                        Sendes til: {inquiry.customer_email || 'Ingen e-post'}
                                    </span>
                                    <button
                                        onClick={sendEmail}
                                        disabled={sendingEmail || !inquiry.customer_email}
                                        className="btn btn-primary"
                                    >
                                        {sendingEmail ? 'Sender...' : 'Send svar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="card">
                            <div className="card-header"><h3 className="card-title">Tildeling</h3></div>
                            <div style={{ padding: '16px' }}>
                                <select className="form-select" style={{ width: '100%' }} value={inquiry.assigned_to || ''} onChange={(e) => assignAgent(e.target.value)} disabled={!canAssign}>
                                    <option value="">-- Ingen tildelt --</option>
                                    {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.full_name || agent.email}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header"><h3 className="card-title">Kundeinformasjon</h3></div>
                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Navn</div><div style={{ fontWeight: '500' }}>{inquiry.customer_name || 'Ikke oppgitt'}</div></div>
                                <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>E-post</div><div style={{ fontWeight: '500' }}>{inquiry.customer_email || 'Ikke oppgitt'}</div></div>
                                <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Telefon</div><div style={{ fontWeight: '500' }}>{inquiry.customer_phone || 'Ikke oppgitt'}</div></div>
                                <div><div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Adresse</div><div style={{ fontWeight: '500' }}>{inquiry.customer_address || 'Ikke oppgitt'}</div></div>
                            </div>
                        </div>

                        <div className="card" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
                            <div className="card-header"><h3 className="card-title">Intern logg</h3></div>
                            <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input type="text" placeholder="Notat..." className="input-field" style={{ flex: 1 }} value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
                                    <button onClick={addNote} className="btn">+</button>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', maxHeight: '300px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {notes.map(note => (
                                        <div key={note.id} style={{
                                            background: note.sent_email_id ? '#eff6ff' : '#f3f4f6',
                                            padding: '8px',
                                            borderRadius: '6px',
                                            fontSize: '13px',
                                            borderLeft: note.sent_email_id ? '3px solid #3b82f6' : 'none'
                                        }}>
                                            <div style={{ marginBottom: '4px' }}>
                                                {note.content}
                                                {note.sent_email_id && (
                                                    <button
                                                        onClick={() => {
                                                            setPreviewEmail(note.sent_emails)
                                                            setShowEmailModal(true)
                                                        }}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: '#3b82f6',
                                                            cursor: 'pointer',
                                                            fontSize: '13px',
                                                            fontWeight: '600',
                                                            padding: '0 0 0 6px',
                                                            textDecoration: 'underline'
                                                        }}
                                                    >
                                                        Se her
                                                    </button>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '10px', color: '#6b7280' }}>
                                                {note.profiles?.full_name || 'Ukjent'} • {new Date(note.created_at).toLocaleString('no-NO')}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Email Preview Modal */}
                {showEmailModal && previewEmail && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000
                    }} onClick={() => setShowEmailModal(false)}>
                        <div style={{
                            background: 'white', borderRadius: '16px',
                            maxWidth: '680px', width: '90%', maxHeight: '85vh',
                            display: 'flex', flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                            animation: 'modalPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{
                                padding: '20px 24px',
                                borderBottom: '1px solid #e5e7eb',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                                flexShrink: 0
                            }}>
                                <div>
                                    <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 6px 0' }}>
                                        📧 Sendt epost til kunde
                                    </h2>
                                    <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span><strong>Til:</strong> {previewEmail.to_email}</span>
                                        <span><strong>Emne:</strong> {previewEmail.subject}</span>
                                        <span><strong>Sendt:</strong> {new Date(previewEmail.created_at).toLocaleString('no-NO')}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowEmailModal(false)}
                                    style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#6b7280' }}
                                >✕</button>
                            </div>
                            <div style={{ flex: 1, overflow: 'auto' }}>
                                <iframe
                                    srcDoc={previewEmail.html_content}
                                    style={{ width: '100%', height: '100%', minHeight: '350px', border: 'none', borderRadius: '0 0 16px 16px' }}
                                    title="Epost innhold"
                                    sandbox="allow-same-origin"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Feedback Modal — Step 1: Input */}
                {showFeedbackModal && !promptProposal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000
                    }} onClick={() => { setShowFeedbackModal(false); setFeedbackText('') }}>
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
                                <button onClick={() => { setShowFeedbackModal(false); setFeedbackText('') }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
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
                                <button onClick={() => { setShowFeedbackModal(false); setFeedbackText('') }} className="btn btn-secondary">Avbryt</button>
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
                                                    conversationId: inquiry?.conversation_id || id
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
                    }} onClick={() => { setShowFeedbackModal(false); setPromptProposal(null); setFeedbackText('') }}>
                        <div style={{
                            background: 'white', borderRadius: '16px',
                            maxWidth: '680px', width: '90%', maxHeight: '85vh',
                            display: 'flex', flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                            animation: 'modalPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Foreslåtte endringer
                                    </h2>
                                    <button onClick={() => { setShowFeedbackModal(false); setPromptProposal(null); setFeedbackText('') }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
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

                            </div>

                            <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '12px', justifyContent: 'flex-end', flexShrink: 0 }}>
                                <button
                                    onClick={() => { setPromptProposal(null) }}
                                    className="btn btn-secondary"
                                >
                                    Tilbake
                                </button>
                                <button
                                    onClick={() => { setShowFeedbackModal(false); setPromptProposal(null); setFeedbackText('') }}
                                    className="btn btn-secondary"
                                    style={{ color: '#ef4444' }}
                                >
                                    Forkast
                                </button>
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
                                                setShowFeedbackModal(false)
                                                setPromptProposal(null)
                                                setFeedbackText('')
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
                .detail-grid {
                    display: grid;
                    grid-template-columns: 2fr 1fr;
                    gap: 24px;
                }
                @media (max-width: 1024px) {
                    .detail-grid {
                        grid-template-columns: 1fr;
                    }
                }
                @keyframes modalPop {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
        </>
    )
}

export default function InquiryDetailPage() {
    return (
        <Suspense fallback={null}>
            <InquiryDetailInner />
        </Suspense>
    )
}
