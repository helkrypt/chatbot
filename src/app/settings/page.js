'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import InspectBanner from '@/components/InspectBanner'
import { useSearchParams } from 'next/navigation'

function SettingsPageInner() {
    const searchParams = useSearchParams()
    const isInspecting = searchParams.get('inspect') === 'true'
    const inspectedClientId = searchParams.get('client_id')

    const [prompt, setPrompt] = useState('')
    const [instruction, setInstruction] = useState('')
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)
    const [userRole, setUserRole] = useState(null)
    const [clientId, setClientId] = useState('')

    const [openingHours, setOpeningHours] = useState([])
    const [newHour, setNewHour] = useState({ category: 'regular', label: '', hours: '', specific_date: '' })

    // Install assistant
    const SNIPPET = clientId
        ? `<!-- Helkrypt AI Chat Widget -->\n<script src="https://app.helkrypt.no/widget.js" data-client="${clientId}" defer></script>`
        : `<!-- Helkrypt AI Chat Widget -->\n<script src="https://app.helkrypt.no/widget.js" data-client="DIN_KLIENT_ID" defer></script>`
    const [installMessages, setInstallMessages] = useState([
        { role: 'assistant', content: 'Hei! 👋 Jeg er installasjonsassistenten din. Jeg hjelper deg med å legge til chat-widgeten på nettsiden din.\n\nHvilken plattform bruker du? (f.eks. WordPress, Wix, Shopify, Squarespace, eller egendefinert HTML)' }
    ])
    const [installInput, setInstallInput] = useState('')
    const [installLoading, setInstallLoading] = useState(false)
    const [copied, setCopied] = useState(false)
    const chatEndRef = useRef(null)

    const supabase = createClient()

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        setLoading(true)

        // Check Role
        const { data: { user } } = await supabase.auth.getUser()
        let effectiveClientId = inspectedClientId || ''
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role, client_id')
                .eq('id', user.id)
                .single()
            setUserRole(profile?.role || 'agent')
            if (!inspectedClientId) {
                effectiveClientId = profile?.client_id || ''
            }
            setClientId(effectiveClientId)
        }

        // Fetch Prompt from system_prompts (multi-tenant)
        if (effectiveClientId) {
            const { data: promptData } = await supabase
                .from('system_prompts')
                .select('content')
                .eq('client_id', effectiveClientId)
                .eq('active', true)
                .single()

            if (promptData) {
                setPrompt(promptData.content)
            }
        }

        // Fetch Opening Hours
        let hoursQuery = supabase
            .from('opening_hours')
            .select('*')
            .order('category', { ascending: true })
            .order('sort_order', { ascending: true })

        if (effectiveClientId) {
            hoursQuery = hoursQuery.eq('client_id', effectiveClientId)
        }

        const { data: hoursData } = await hoursQuery
        if (hoursData) {
            setOpeningHours(hoursData)
        }

        setLoading(false)
    }

    const handleRequestPromptChange = async () => {
        if (!instruction.trim()) return

        setUpdating(true)
        try {
            const response = await fetch('/api/update-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId,
                    instruction: instruction.trim(),
                    autoApprove: false,
                }),
            })

            const data = await response.json()
            if (response.ok) {
                setInstruction('')
                alert(`Forespørselen er sendt til gjennomgang. Ny prompt-versjon ${data.version} venter på godkjenning.`)
            } else {
                alert('Feil: ' + data.error)
            }
        } catch (err) {
            alert('Nettverksfeil: ' + err.message)
        } finally {
            setUpdating(false)
        }
    }

    const handleAddOpeningHour = async () => {
        if (!newHour.label || !newHour.hours) {
            alert('Vennligst fyll ut både beskrivelse og tidspunkt.')
            return
        }

        // Require date for holiday category
        if (newHour.category === 'holiday' && (!newHour.specific_date || newHour.specific_date.trim() === '')) {
            alert('Dato er påkrevd for helligdager og ferie.')
            return
        }

        try {
            // Only include specific_date if it has a value
            const hourToInsert = {
                category: newHour.category,
                label: newHour.label,
                hours: newHour.hours,
                sort_order: newHour.sort_order || 0
            }

            // Only add specific_date if it's not empty
            if (newHour.specific_date && newHour.specific_date.trim() !== '') {
                hourToInsert.specific_date = newHour.specific_date
            }

            const { data, error } = await supabase
                .from('opening_hours')
                .insert([hourToInsert])
                .select()

            if (error) throw error

            setOpeningHours([...openingHours, data[0]])
            setNewHour({ category: 'regular', label: '', hours: '', specific_date: '' })
        } catch (error) {
            console.error(error)
            alert('Feil ved lagring av åpningstid: ' + error.message)
        }
    }

    const handleDeleteOpeningHour = async (id) => {
        if (!confirm('Er du sikker på at du vil slette denne åpningstiden?')) return

        try {
            const { error } = await supabase
                .from('opening_hours')
                .delete()
                .eq('id', id)

            if (error) throw error

            setOpeningHours(openingHours.filter(h => h.id !== id))
        } catch (error) {
            console.error(error)
            alert('Feil ved sletting: ' + error.message)
        }
    }

    const handleInstallSend = async () => {
        if (!installInput.trim() || installLoading) return
        const userMsg = { role: 'user', content: installInput.trim() }
        const next = [...installMessages, userMsg]
        setInstallMessages(next)
        setInstallInput('')
        setInstallLoading(true)
        try {
            const res = await fetch('/api/install-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: next })
            })
            const data = await res.json()
            setInstallMessages([...next, { role: 'assistant', content: data.reply || 'Beklager, prøv igjen.' }])
        } catch {
            setInstallMessages([...next, { role: 'assistant', content: 'Noe gikk galt. Prøv igjen.' }])
        } finally {
            setInstallLoading(false)
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
    }

    const handleInstallKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleInstallSend() }
    }

    const copySnippet = () => {
        navigator.clipboard.writeText(SNIPPET)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const categories = {
        regular: 'Vanlige åpningstider',
        phone: 'Telefontid',
        holiday: 'Helligdager / Ferie',
        special: 'Spesielle datoer'
    }

    if (loading) {
        return (
            <div className="app-container">
                <Sidebar />
                <main className="main-content">
                    <div className="loading"><div className="spinner"></div></div>
                </main>
            </div>
        )
    }

    if (userRole !== 'admin' && userRole !== 'sysadmin') {
        return (
            <div className="app-container">
                <Sidebar />
                <main className="main-content">
                    <div className="empty-state">
                        <h2 className="empty-state-title">Ingen tilgang</h2>
                        <p>Du må være administrator for å endre systeminnstillinger.</p>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <>
        {isInspecting && <InspectBanner clientId={inspectedClientId} />}
        <div className="app-container">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <h1 className="page-title">Innstillinger</h1>
                </div>

                <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>

                    {/* Opening Hours Card */}
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">Administrer Åpningstider</h2>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <p style={{ marginBottom: '16px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                                Legg inn faste åpningstider, telefontider og spesielle tider for ferier eller enkeltdatoer. Chatboten vil automatisk bruke disse tidene i sine svar.
                            </p>

                            <div style={{ marginBottom: '24px', background: '#f9fafb', padding: '20px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Legg til ny tid</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>Kategori</label>
                                        <select
                                            className="input-field"
                                            value={newHour.category}
                                            onChange={(e) => setNewHour({ ...newHour, category: e.target.value })}
                                        >
                                            {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>Beskrivelse (f.eks. Julaften)</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="Julaften / Mandag"
                                            value={newHour.label}
                                            onChange={(e) => setNewHour({ ...newHour, label: e.target.value })}
                                        />
                                    </div>
                                    {(newHour.category === 'holiday' || newHour.category === 'special') && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>
                                                Dato {newHour.category === 'holiday' ? '(påkrevd)' : '(valgfritt)'}
                                            </label>
                                            <input
                                                type="date"
                                                className="input-field"
                                                value={newHour.specific_date}
                                                onChange={(e) => setNewHour({ ...newHour, specific_date: e.target.value })}
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', color: '#6b7280' }}>Tidspunkt (f.eks. 08:00 - 16:00)</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="08:00-16:00 / Stengt"
                                            value={newHour.hours}
                                            onChange={(e) => setNewHour({ ...newHour, hours: e.target.value })}
                                        />
                                    </div>
                                    <button onClick={handleAddOpeningHour} className="btn btn-primary" style={{ height: '42px' }}>Lagre</button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {Object.entries(categories).map(([catId, catLabel]) => {
                                    const items = openingHours.filter(h => h.category === catId)
                                    if (items.length === 0) return null

                                    return (
                                        <div key={catId}>
                                            <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#374151', paddingBottom: '8px', borderBottom: '1px solid #f3f4f6', marginBottom: '12px' }}>{catLabel}</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {items.map(item => (
                                                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'white', borderRadius: '8px', border: '1px solid #f3f4f6', fontSize: '14px' }}>
                                                        <div style={{ display: 'flex', gap: '16px' }}>
                                                            <span style={{ fontWeight: '500', minWidth: '100px' }}>{item.label}{item.specific_date ? ` (${new Date(item.specific_date).toLocaleDateString('no-NO')})` : ''}</span>
                                                            <span style={{ color: '#6b7280' }}>{item.hours}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteOpeningHour(item.id)}
                                                            style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                                            title="Slett"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Request Prompt Change Card */}
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">Be om endring av AI-Instruksjoner</h2>
                        </div>
                        <div style={{ padding: '24px' }}>
                            <p style={{ marginBottom: '16px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                                Beskriv hva du ønsker å endre i chatboten sin oppførsel. En forespørsel vil bli sendt til teknisk ansvarlig (marius@helkrypt.no) som vil oppdatere instruksjonene manuelt.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <textarea
                                    className="input-field"
                                    style={{ width: '100%', minHeight: '100px', padding: '12px', fontSize: '14px' }}
                                    placeholder='F.eks: "Når en kunde spør om kaffemaskiner, svar at de må leveres til verkstedet."'
                                    value={instruction}
                                    onChange={(e) => setInstruction(e.target.value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={handleRequestPromptChange}
                                        className="btn btn-primary"
                                        disabled={updating || !instruction.trim()}
                                    >
                                        {updating ? 'Sender forespørsel...' : 'Send forespørsel'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Installation Assistant Card */}
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">🤖 Installasjonsassistent</h2>
                        </div>
                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Snippet always visible at top */}
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#15803d' }}>📋 Din installasjonskode</span>
                                    <button
                                        onClick={copySnippet}
                                        style={{
                                            padding: '4px 14px', fontSize: '12px', fontWeight: '600',
                                            background: copied ? '#15803d' : 'white',
                                            color: copied ? 'white' : '#374151',
                                            border: '1px solid #d1d5db', borderRadius: '6px',
                                            cursor: 'pointer', transition: 'all 0.2s'
                                        }}
                                    >
                                        {copied ? '✓ Kopiert!' : 'Kopier kode'}
                                    </button>
                                </div>
                                <pre style={{
                                    margin: 0, fontFamily: 'monospace', fontSize: '13px',
                                    color: '#166534', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                                }}>{SNIPPET}</pre>
                            </div>

                            {/* Chat area */}
                            <div style={{
                                border: '1px solid #e5e7eb', borderRadius: '12px',
                                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                                height: '380px'
                            }}>
                                {/* Messages */}
                                <div style={{
                                    flex: 1, overflowY: 'auto', padding: '16px',
                                    display: 'flex', flexDirection: 'column', gap: '12px',
                                    background: '#fafafa'
                                }}>
                                    {installMessages.map((msg, i) => (
                                        <div key={i} style={{
                                            display: 'flex',
                                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                                        }}>
                                            {msg.role === 'assistant' && (
                                                <div style={{
                                                    width: '32px', height: '32px', borderRadius: '50%',
                                                    background: '#0284c7', color: 'white',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '16px', flexShrink: 0, marginRight: '8px', marginTop: '2px'
                                                }}>🤖</div>
                                            )}
                                            <div style={{
                                                maxWidth: '80%',
                                                padding: '10px 14px',
                                                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                                background: msg.role === 'user' ? '#0284c7' : 'white',
                                                color: msg.role === 'user' ? 'white' : '#1f2937',
                                                fontSize: '14px', lineHeight: '1.5',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                                whiteSpace: 'pre-wrap'
                                            }}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {installLoading && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '50%',
                                                background: '#0284c7', color: 'white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '16px'
                                            }}>🤖</div>
                                            <div style={{
                                                padding: '10px 16px', background: 'white', borderRadius: '16px',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                                display: 'flex', gap: '4px', alignItems: 'center'
                                            }}>
                                                {[0, 1, 2].map(d => (
                                                    <div key={d} style={{
                                                        width: '6px', height: '6px', borderRadius: '50%',
                                                        background: '#9ca3af',
                                                        animation: `bounce 1s ease infinite ${d * 0.15}s`
                                                    }} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Input */}
                                <div style={{
                                    padding: '12px 16px', background: 'white',
                                    borderTop: '1px solid #e5e7eb',
                                    display: 'flex', gap: '8px', alignItems: 'flex-end'
                                }}>
                                    <textarea
                                        className="input-field"
                                        rows={1}
                                        style={{
                                            flex: 1, resize: 'none', fontSize: '14px',
                                            padding: '10px 14px', lineHeight: '1.4',
                                            maxHeight: '80px', overflowY: 'auto'
                                        }}
                                        placeholder="Skriv svaret ditt her..."
                                        value={installInput}
                                        onChange={(e) => setInstallInput(e.target.value)}
                                        onKeyDown={handleInstallKey}
                                    />
                                    <button
                                        onClick={handleInstallSend}
                                        disabled={!installInput.trim() || installLoading}
                                        className="btn btn-primary"
                                        style={{ padding: '10px 18px', flexShrink: 0 }}
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                    <style>{`
                        @keyframes bounce {
                            0%, 80%, 100% { transform: translateY(0); }
                            40% { transform: translateY(-6px); }
                        }
                    `}</style>

                </div>
            </main>
        </div>
        </>
    )
}

export default function SettingsPage() {
    return (
        <Suspense fallback={null}>
            <SettingsPageInner />
        </Suspense>
    )
}
