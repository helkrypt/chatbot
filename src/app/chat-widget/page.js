'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './widget.module.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatWidget() {
    // Les client_id fra URL — satt av embed-scriptet via iframe src ?client=...
    const [clientId] = useState(() => {
        if (typeof window === 'undefined') return null
        return new URLSearchParams(window.location.search).get('client') || null
    })

    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [pendingFile, setPendingFile] = useState(null); // { url, name }
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const [clientName, setClientName] = useState('Kundeservice')
    const [widgetTheme, setWidgetTheme] = useState({
        primary_color: '#111827',
        bubble_color: '#111827',
        text_color: '#ffffff',
        background_color: '#ffffff',
        font_family: 'system-ui',
        header_text: 'Kundeservice',
        welcome_message: 'Hei! 👋 Hvordan kan jeg hjelpe deg i dag?',
    })

    useEffect(() => {
        fetch(`/api/clients/${clientId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.client) {
                    if (data.client.name) setClientName(data.client.name)
                    if (data.client.config?.widget_theme) {
                        setWidgetTheme(prev => ({ ...prev, ...data.client.config.widget_theme }))
                    } else if (data.client.chatbot_title) {
                        setWidgetTheme(prev => ({ ...prev, header_text: data.client.chatbot_title }))
                    }
                }
            })
            .catch(() => {})
    }, [clientId])

    // Tell the parent embed script to hide the iframe and show the bubble
    const handleClose = () => {
        try {
            window.parent.postMessage({ type: 'helkrypt-close' }, '*');
        } catch (e) {
            // standalone mode — nothing to do
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

    const convKey = clientId ? `helkrypt_conv_${clientId}` : null;
    const activityKey = clientId ? `helkrypt_activity_${clientId}` : null;

    const updateLastActivity = () => {
        if (activityKey) localStorage.setItem(activityKey, Date.now().toString());
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Listen for open signals from parent
    useEffect(() => {
        const onMessage = (e) => {
            if (e.data && e.data.type === 'helkrypt-open') {
                // Widget is now visible — nothing to do state-wise
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    const WELCOME_MSG = {
        id: 'welcome',
        role: 'assistant',
        content: widgetTheme.welcome_message || 'Hei! 👋 Hvordan kan jeg hjelpe deg i dag?',
        timestamp: new Date().toISOString()
    };

    useEffect(() => {
        const restoreSession = async () => {
            if (!convKey) { setMessages([WELCOME_MSG]); return; }
            const savedConvId = localStorage.getItem(convKey);
            const lastActivity = localStorage.getItem(activityKey);
            const now = Date.now();

            // Timed-out session → clear and show only welcome
            if (savedConvId && lastActivity && (now - parseInt(lastActivity) > SESSION_TIMEOUT)) {
                localStorage.removeItem(convKey);
                localStorage.removeItem(activityKey);
                setMessages([WELCOME_MSG]);
                return;
            }

            // Valid existing session → load messages from DB
            if (savedConvId) {
                try {
                    const res = await fetch(`/api/messages?conversation_id=${savedConvId}&client=${clientId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.length > 0) {
                            setConversationId(savedConvId);
                            updateLastActivity();
                            setMessages(data.map(msg => ({
                                id: msg.id,
                                role: msg.role,
                                content: msg.content,
                                file_url: msg.file_url,
                                timestamp: msg.created_at
                            })));
                            return;
                        }
                    }
                } catch (error) {
                    console.error('Failed to load messages:', error);
                }
                // Stale/empty session → clear it
                localStorage.removeItem(convKey);
                localStorage.removeItem(activityKey);
            }

            // No session → show static welcome, DO NOT create DB record yet
            setMessages([WELCOME_MSG]);
        };

        restoreSession();
    }, []);

    const handleSendMessage = async (e) => {
        if (e) e.preventDefault();

        // Allow sending if there's either text or a pending file
        if ((!inputValue.trim() && !pendingFile) || isLoading || uploading) return;

        const currentInput = inputValue;
        const currentFile = pendingFile;

        setInputValue('');
        setPendingFile(null);
        setIsLoading(true);
        updateLastActivity();

        const userMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: currentInput || (currentFile ? `[Vedlegg: ${currentFile.name}]` : ''),
            file_url: currentFile?.url,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);

        try {
            // Chat-APIet håndterer samtale-oppretting og meldingslagring atomisk
            const response = await fetch(`/api/chat?client=${clientId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: currentInput,
                    fileUrl: currentFile?.url,
                    conversationId: conversationId || null
                })
            });

            if (response.ok) {
                const data = await response.json();

                // Oppdater conversationId hvis vi fikk en ny (første melding)
                if (data.conversationId && !conversationId) {
                    setConversationId(data.conversationId);
                    if (convKey) localStorage.setItem(convKey, data.conversationId);
                }

                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: data.response,
                    timestamp: new Date().toISOString()
                }]);
                updateLastActivity();
            } else {
                // Graceful degradation — never leave the user hanging
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: 'Noe gikk galt teknisk. Prøv igjen, eller kontakt oss direkte.',
                    timestamp: new Date().toISOString()
                }]);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Noe gikk galt teknisk. Prøv igjen, eller kontakt oss direkte.',
                timestamp: new Date().toISOString()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('client_id', clientId);

        try {
            const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (uploadRes.ok) {
                const { url } = await uploadRes.json();
                setPendingFile({ url, name: file.name });
            }
        } catch (error) {
            console.error('Upload error:', error);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const clearChat = () => {
        if (confirm('Er du sikker på at du vil slette chat-historikken?')) {
            if (convKey) localStorage.removeItem(convKey);
            if (activityKey) localStorage.removeItem(activityKey);
            window.location.reload();
        }
    };



    if (!clientId) {
        return (
            <div className={styles.widgetContainer} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                <p>Mangler klient-konfigurasjon. Kontakt administrator.</p>
            </div>
        );
    }

    return (
        <div className={styles.widgetContainer} style={{ fontFamily: widgetTheme.font_family, background: widgetTheme.background_color }}>
            <div className={styles.header} style={{ background: widgetTheme.primary_color, color: widgetTheme.text_color }}>
                <div className={styles.headerContent}>
                    <div className={styles.logo}>
                        <div className={styles.logoIcon} style={{ background: 'rgba(255,255,255,0.15)', color: widgetTheme.text_color }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                        </div>
                        <div>
                            <div className={styles.companyName} style={{ color: widgetTheme.text_color }}>{widgetTheme.header_text || clientName}</div>
                        </div>
                    </div>
                    <div className={styles.headerActions}>
                        <button className={styles.actionBtn} onClick={clearChat} title="Slett historikk">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </button>
                        <button
                            className={styles.minimizeBtn}
                            onClick={handleClose}
                            title="Lukk chat"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>
            </div>

            <div className={styles.messagesContainer}>
                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`${styles.message} ${styles[message.role]}`}
                    >
                        <div className={styles.messageContent}>
                            {message.file_url && (
                                <div className={styles.filePreview}>
                                    <img src={message.file_url} alt="Vedlegg" className={styles.previewImg} />
                                    <a href={message.file_url} target="_blank" className={styles.viewFull}>Vis full størrelse ↗</a>
                                </div>
                            )}
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    a: ({ node, ...props }) => (
                                        <a {...props} target="_blank" rel="noopener noreferrer" />
                                    )
                                }}
                            >
                                {message.content}
                            </ReactMarkdown>
                        </div>
                        <div className={styles.messageTime}>
                            {new Date(message.timestamp).toLocaleTimeString('no-NO', {
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className={`${styles.message} ${styles.assistant}`}>
                        <div className={styles.messageContent}>
                            <div className={styles.typingIndicator}>
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Pending Attachment Preview */}
            {pendingFile && (
                <div className={styles.pendingAttachment}>
                    <div className={styles.pendingImgContainer}>
                        <img src={pendingFile.url} alt="Preview" className={styles.pendingImg} />
                        <button
                            className={styles.removeBtn}
                            onClick={() => setPendingFile(null)}
                            title="Fjern bilde"
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                    <div className={styles.pendingInfo}>
                        <div className={styles.pendingName}>{pendingFile.name}</div>
                        <div className={styles.pendingStatus}>Klar til å sendes</div>
                    </div>
                </div>
            )}

            <form className={styles.inputContainer} onSubmit={handleSendMessage}>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                    accept="image/*"
                />
                <button
                    type="button"
                    className={styles.attachBtn}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || isLoading}
                    title="Last opp bilde"
                >
                    {uploading
                        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={styles.spinIcon}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    }
                </button>
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={pendingFile ? "Skriv tekst til bildet..." : "Skriv din melding her..."}
                    className={styles.input}
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    className={styles.sendBtn}
                    disabled={isLoading || uploading || (!inputValue.trim() && !pendingFile)}
                    style={{ background: widgetTheme.primary_color, color: widgetTheme.text_color }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </form>

            <div className={styles.footer}>
                <span className={styles.poweredBy}>{clientName} bruker KI for kundeservice på hjemmesiden. Feil kan oppstå</span>
            </div>
        </div>
    );
}
