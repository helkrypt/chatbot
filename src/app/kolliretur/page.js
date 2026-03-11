'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Navbar from '@/components/Navbar'
import { useRouter } from 'next/navigation'

export default function KolliReturPage() {
    const router = useRouter()
    const supabase = createClient()
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [currentTab, setCurrentTab] = useState('active')
    const [kollis, setKollis] = useState([])
    const [loading, setLoading] = useState(true)
    const [newKolliName, setNewKolliName] = useState('')
    const [creating, setCreating] = useState(false)
    const [sending, setSending] = useState(false)
    const [successModal, setSuccessModal] = useState(false)

    // Detail view state
    const [selectedKolli, setSelectedKolli] = useState(null)
    const [kolliItems, setKolliItems] = useState([])
    const [uploadingFiles, setUploadingFiles] = useState([])
    const [uploadProgress, setUploadProgress] = useState({ active: false, current: 0, total: 0, text: '' })

    useEffect(() => {
        checkAuth()
        fetchKollis()
    }, [])

    useEffect(() => {
        fetchKollis()
    }, [currentTab])

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) router.push('/login')
    }

    const fetchKollis = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('kollis')
            .select('*, kolli_items(antall)')
            .eq('status', currentTab === 'active' ? 'active' : 'sent')
            .order('created_at', { ascending: false })

        if (!error && data) {
            const enriched = data.map(k => ({
                ...k,
                total_antall: k.kolli_items.reduce((sum, item) => sum + (item.antall || 1), 0)
            }))
            setKollis(enriched)
        }
        setLoading(false)
    }

    const createKolli = async (e) => {
        e.preventDefault()
        if (!newKolliName.trim()) return
        setCreating(true)

        const { error } = await supabase
            .from('kollis')
            .insert([{ name: newKolliName, status: 'active' }])

        if (!error) {
            setNewKolliName('')
            fetchKollis()
        }
        setCreating(false)
    }

    const deleteKolli = async (id) => {
        if (!confirm('Er du sikker på at du vil fjerne dette kolliet og alt innhold?')) return
        await supabase.from('kolli_items').delete().eq('kolli_id', id)
        await supabase.from('kollis').delete().eq('id', id)
        fetchKollis()
    }

    const renameKolli = async (id, oldName) => {
        const newName = prompt('Endre navn på kolli:', oldName)
        if (!newName || newName === oldName) return
        await supabase.from('kollis').update({ name: newName }).eq('id', id)
        fetchKollis()
    }

    const sendReport = async () => {
        if (!confirm('Dette vil sende rapport for alle aktive kolli og deretter nullstille dashbordet. Fortsette?')) return
        setSending(true)

        try {
            // Get all active kollis with items
            const { data: activeKollis } = await supabase
                .from('kollis')
                .select('*, kolli_items(*)')
                .eq('status', 'active')

            if (!activeKollis || activeKollis.length === 0) {
                alert('Ingen aktive kolli å sende.')
                setSending(false)
                return
            }

            // Format payload
            const payload = {
                kollis: activeKollis.map(k => ({
                    name: k.name,
                    item_count: k.kolli_items.length,
                    items: k.kolli_items.map(i => ({
                        delenummer: (i.delenummer || '').replace(/[^0-9]/g, ''),
                        ordrenummer: i.ordrenummer,
                        antall: i.antall || 1
                    }))
                }))
            }

            // Send to n8n webhook
            const n8nUrl = process.env.NEXT_PUBLIC_N8N_KOLLIRETUR_WEBHOOK || '/api/kolliretur/send-report'
            const res = await fetch(n8nUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (res.ok) {
                // Mark kollis as 'sent'
                const ids = activeKollis.map(k => k.id)
                await supabase.from('kollis').update({ status: 'sent' }).in('id', ids)
                setSuccessModal(true)
                fetchKollis()
            } else {
                alert('Feil ved sending av rapport.')
            }
        } catch (e) {
            console.error(e)
            alert('Nettverksfeil: ' + e.message)
        } finally {
            setSending(false)
        }
    }

    // === Detail View Functions ===
    const openKolliDetail = async (kolli) => {
        setSelectedKolli(kolli)
        const { data } = await supabase
            .from('kolli_items')
            .select('*')
            .eq('kolli_id', kolli.id)
            .order('created_at', { ascending: false })
        setKolliItems(data || [])
    }

    const closeDetail = () => {
        setSelectedKolli(null)
        setKolliItems([])
        setUploadingFiles([])
        setUploadProgress({ active: false, current: 0, total: 0, text: '' })
        fetchKollis()
    }

    const updateAntall = async (itemId, newValue) => {
        const antall = parseInt(newValue) || 1
        await supabase.from('kolli_items').update({ antall }).eq('id', itemId)
    }

    const deleteItem = async (itemId) => {
        await supabase.from('kolli_items').delete().eq('id', itemId)
        setKolliItems(prev => prev.filter(i => i.id !== itemId))
    }

    const compressImage = (file, maxWidth = 1280, quality = 0.85) => {
        return new Promise((resolve) => {
            const img = new Image()
            const url = URL.createObjectURL(file)
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width)
                const canvas = document.createElement('canvas')
                canvas.width = img.width * scale
                canvas.height = img.height * scale
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
                URL.revokeObjectURL(url)
                canvas.toBlob(
                    (blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })),
                    'image/jpeg',
                    quality
                )
            }
            img.src = url
        })
    }

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files)
        if (!files.length || !selectedKolli) return

        setUploadingFiles(files.map((f, i) => ({ name: f.name, status: 'waiting', index: i })))
        setUploadProgress({ active: true, current: 0, total: files.length, text: 'Starter analyse...' })

        for (let i = 0; i < files.length; i++) {
            setUploadingFiles(prev => prev.map((f, idx) =>
                idx === i ? { ...f, status: 'processing' } : f
            ))
            setUploadProgress(prev => ({
                ...prev,
                current: i,
                text: `Analyserer etikett ${i + 1} av ${files.length}...`
            }))

            const compressed = await compressImage(files[i])
            const formData = new FormData()
            formData.append('file', compressed)

            try {
                const res = await fetch(`/api/kolliretur/scan?kolli_id=${selectedKolli.id}`, {
                    method: 'POST',
                    body: formData
                })
                const data = await res.json()

                if (data.success) {
                    if (data.is_duplicate) {
                        setUploadingFiles(prev => prev.map((f, idx) =>
                            idx === i ? { ...f, status: 'duplicate' } : f
                        ))
                    } else {
                        setUploadingFiles(prev => prev.map((f, idx) =>
                            idx === i ? { ...f, status: 'done' } : f
                        ))
                        setKolliItems(prev => [data.saved_item, ...prev])
                    }
                } else {
                    setUploadingFiles(prev => prev.map((f, idx) =>
                        idx === i ? { ...f, status: 'error' } : f
                    ))
                }
            } catch (err) {
                console.error('Upload feil:', err)
                setUploadingFiles(prev => prev.map((f, idx) =>
                    idx === i ? { ...f, status: 'error', errorMsg: 'For stort bilde eller nettverksfeil' } : f
                ))
            }
        }

        setUploadProgress(prev => ({
            ...prev,
            current: files.length,
            text: `Ferdig! ${files.length} etiketter behandlet.`
        }))

        setTimeout(() => {
            setUploadingFiles([])
            setUploadProgress({ active: false, current: 0, total: 0, text: '' })
        }, 3000)

        e.target.value = ''
    }

    // === RENDER ===

    // Detail View
    if (selectedKolli) {
        return (
            <div className="app-container">
                <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
                <main className="main-content">
                    <Navbar onMenuClick={() => setIsSidebarOpen(true)} />

                    <div className="page-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <button onClick={closeDetail} className="btn btn-secondary" style={{ padding: '8px' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M19 12H5M12 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <div>
                                <h1 className="page-title">{selectedKolli.name} <span style={{ color: 'var(--color-accent)', fontSize: '16px' }}>[RETUR]</span></h1>
                                <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '4px' }}>
                                    Etikettskanning og vareliste
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Upload Zone */}
                    <div className="card" style={{ marginBottom: '24px' }}>
                        <label htmlFor="kolli-upload" className="kolliretur-upload-zone">
                            <div style={{ fontSize: '2.5rem' }}>📸</div>
                            <div style={{ fontWeight: '600', fontSize: '15px' }}>Trykk for å velge bilder av etiketter</div>
                            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Du kan velge flere bilder samtidig</div>
                        </label>
                        <input
                            type="file"
                            id="kolli-upload"
                            accept="image/*"
                            multiple
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                    </div>

                    {/* Upload Status */}
                    {uploadingFiles.length > 0 && (
                        <div className="card" style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '16px' }}>
                                {uploadingFiles.map((f, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'var(--color-bg)', borderRadius: '8px', fontSize: '13px' }}>
                                        <span>{f.status === 'waiting' ? '⏳' : f.status === 'processing' ? '🔄' : f.status === 'done' ? '✅' : f.status === 'duplicate' ? '⚠️' : '❌'}</span>
                                        <span>{f.name.slice(0, 20)}</span>
                                    </div>
                                ))}
                            </div>
                            {uploadProgress.active && (
                                <div style={{ padding: '0 16px 16px' }}>
                                    <div style={{ height: '6px', background: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                                        <div style={{
                                            height: '100%',
                                            background: 'var(--color-accent)',
                                            borderRadius: '3px',
                                            transition: 'width 0.4s ease',
                                            width: `${(uploadProgress.current / uploadProgress.total) * 100}%`
                                        }} />
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{uploadProgress.text}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Items Table */}
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">Scannede varer</h2>
                            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{kolliItems.length} varer</span>
                        </div>
                        {kolliItems.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-state-icon">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="1" y="3" width="15" height="13" rx="2" />
                                        <path d="M16 3h5v13h-5" />
                                        <path d="M1 16l5 5h14l5-5" />
                                    </svg>
                                </div>
                                <div className="empty-state-title">Ingen varer skannet ennå</div>
                                <div className="empty-state-text">Last opp bilder av etiketter for å starte</div>
                            </div>
                        ) : (
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Delenummer</th>
                                            <th>Ordrenummer</th>
                                            <th>Antall</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {kolliItems.map(item => (
                                            <tr key={item.id}>
                                                <td style={{ fontWeight: '500' }}>{item.delenummer}</td>
                                                <td style={{ color: 'var(--color-accent)', fontWeight: '600' }}>{item.ordrenummer}</td>
                                                <td style={{ width: '100px' }}>
                                                    <input
                                                        type="number"
                                                        defaultValue={item.antall || 1}
                                                        min="1"
                                                        onChange={(e) => updateAntall(item.id, e.target.value)}
                                                        style={{
                                                            width: '60px',
                                                            padding: '6px 8px',
                                                            border: '1px solid var(--color-border)',
                                                            borderRadius: '6px',
                                                            textAlign: 'center',
                                                            fontSize: '14px'
                                                        }}
                                                    />
                                                </td>
                                                <td style={{ width: '50px' }}>
                                                    <button
                                                        onClick={() => deleteItem(item.id)}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: 'var(--color-error)',
                                                            cursor: 'pointer',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '16px'
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        )
    }

    // Dashboard View
    return (
        <div className="app-container">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <main className="main-content">
                <Navbar onMenuClick={() => setIsSidebarOpen(true)} />

                <div className="page-header">
                    <h1 className="page-title">📦 Kolliretur</h1>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid var(--color-border)' }}>
                    <button
                        onClick={() => setCurrentTab('active')}
                        className={`kolliretur-tab ${currentTab === 'active' ? 'active' : ''}`}
                    >
                        Aktive
                    </button>
                    <button
                        onClick={() => setCurrentTab('sent')}
                        className={`kolliretur-tab ${currentTab === 'sent' ? 'active' : ''}`}
                    >
                        Historikk
                    </button>
                </div>

                {/* Create New Kolli (only on active tab) */}
                {currentTab === 'active' && (
                    <form onSubmit={createKolli} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Opprett ny kolli (f.eks: 'Stor eske')"
                            value={newKolliName}
                            onChange={(e) => setNewKolliName(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <button type="submit" className="btn btn-primary" disabled={creating || !newKolliName.trim()}>
                            {creating ? 'Oppretter...' : '+ Opprett Kolli'}
                        </button>
                    </form>
                )}

                {/* Kolli Grid */}
                {loading ? (
                    <div className="loading"><div className="spinner"></div></div>
                ) : kollis.length === 0 ? (
                    <div className="card">
                        <div className="empty-state">
                            <div className="empty-state-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                    <line x1="12" y1="22.08" x2="12" y2="12" />
                                </svg>
                            </div>
                            <div className="empty-state-title">Ingen kolli funnet</div>
                            <div className="empty-state-text">{currentTab === 'active' ? 'Opprett din første kolli ovenfor' : 'Ingen sendte kolli i historikken'}</div>
                        </div>
                    </div>
                ) : (
                    <div className="kolliretur-grid">
                        {kollis.map(k => (
                            <div
                                key={k.id}
                                className="kolliretur-card"
                                onClick={() => openKolliDetail(k)}
                            >
                                <div className="kolliretur-card-icon">📦</div>
                                <div className="kolliretur-card-info">
                                    <div style={{ fontWeight: '600', fontSize: '15px' }}>{k.name}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                                        Inneholder {k.total_antall} kolli
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--color-text-light)' }}>
                                        {new Date(k.created_at).toLocaleDateString('no-NO')}
                                    </div>
                                </div>
                                {currentTab === 'active' && (
                                    <div className="kolliretur-card-actions" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => renameKolli(k.id, k.name)}
                                            className="btn btn-secondary"
                                            style={{ padding: '4px 10px', fontSize: '12px' }}
                                        >
                                            Endre
                                        </button>
                                        <button
                                            onClick={() => deleteKolli(k.id)}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '12px',
                                                background: 'none',
                                                border: '1px solid var(--color-error)',
                                                color: 'var(--color-error)',
                                                borderRadius: '6px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Fjern
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Send Report Button */}
                {currentTab === 'active' && kollis.length > 0 && (
                    <button
                        onClick={sendReport}
                        disabled={sending}
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: '24px', padding: '14px', fontSize: '15px' }}
                    >
                        {sending ? 'Sender...' : 'Send Sendingsbekreftelse'}
                    </button>
                )}

                {/* Success Modal */}
                {successModal && (
                    <div className="kolliretur-modal-overlay" onClick={() => setSuccessModal(false)}>
                        <div className="kolliretur-modal" onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
                            <h2 style={{ marginBottom: '8px' }}>Sendt!</h2>
                            <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>
                                Sendingsbekreftelse er nå opprettet og sendt via e-post.
                            </p>
                            <button onClick={() => setSuccessModal(false)} className="btn btn-primary">Lukk</button>
                        </div>
                    </div>
                )}
            </main>

            <style jsx>{`
                @media (max-width: 768px) {
                    .kolliretur-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </div>
    )
}
