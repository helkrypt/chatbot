'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './widget.module.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatWidget() {
    // Les client_id fra URL — satt av embed-scriptet via iframe src ?client=...
    const [clientId] = useState(() => {
        if (typeof window === 'undefined') return 'elesco-trondheim'
        return new URLSearchParams(window.location.search).get('client') || 'elesco-trondheim'
    })

    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [pendingFile, setPendingFile] = useState(null); // { url, name }
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    // Tell the parent embed script to hide the iframe and show the bubble
    const handleClose = () => {
        try {
            window.parent.postMessage({ type: 'elesco-close' }, '*');
        } catch (e) {
            // standalone mode — nothing to do
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

    const updateLastActivity = () => {
        localStorage.setItem('elesco_last_activity', Date.now().toString());
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Listen for open signals from parent
    useEffect(() => {
        const onMessage = (e) => {
            if (e.data && e.data.type === 'elesco-open') {
                // Widget is now visible — nothing to do state-wise
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    const WELCOME_MSG = {
        id: 'welcome',
        role: 'assistant',
        content: 'Hei! 👋 Jeg er Elesco sin AI-assistent. Hvordan kan jeg hjelpe deg i dag?',
        timestamp: new Date().toISOString()
    };

    useEffect(() => {
        const restoreSession = async () => {
            const savedConvId = localStorage.getItem('elesco_conv_id');
            const lastActivity = localStorage.getItem('elesco_last_activity');
            const now = Date.now();

            // Timed-out session → clear and show only welcome
            if (savedConvId && lastActivity && (now - parseInt(lastActivity) > SESSION_TIMEOUT)) {
                localStorage.removeItem('elesco_conv_id');
                localStorage.removeItem('elesco_last_activity');
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
                localStorage.removeItem('elesco_conv_id');
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
                    localStorage.setItem('elesco_conv_id', data.conversationId);
                }

                const assistantMessage = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: data.response,
                    timestamp: new Date().toISOString()
                };

                setMessages(prev => [...prev, assistantMessage]);
                updateLastActivity();
            }
        } catch (error) {
            console.error('Error sending message:', error);
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
            localStorage.removeItem('elesco_conv_id');
            window.location.reload();
        }
    };



    return (
        <div className={styles.widgetContainer}>
            <div className={styles.header}>
                <div className={styles.headerContent}>
                    <div className={styles.logo}>
                        <div className={styles.logoIcon}>⚡</div>
                        <div>
                            <div className={styles.companyName}>Elesco Trondheim</div>
                        </div>
                    </div>
                    <div className={styles.headerActions}>
                        <button className={styles.actionBtn} onClick={clearChat} title="Slett historikk">
                            ↺
                        </button>
                        <button
                            className={styles.minimizeBtn}
                            onClick={handleClose}
                            title="Lukk chat"
                        >
                            ✕
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
                            ✕
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
                    {uploading ? '⌛' : '📷'}
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
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </form>

            <div className={styles.footer}>
                <span className={styles.poweredBy}>Elesco Trondheim bruker KI for kundeservice på hjemmesiden. Feil kan oppstå</span>
            </div>
        </div>
    );
}
