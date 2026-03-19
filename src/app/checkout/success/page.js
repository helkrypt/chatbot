'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function CheckoutSuccessInner() {
    const searchParams = useSearchParams()
    const sessionId = searchParams.get('session_id')
    const [status, setStatus] = useState('loading') // loading | ready | error
    const [clientData, setClientData] = useState(null)

    useEffect(() => {
        if (!sessionId) {
            setStatus('error')
            return
        }

        let attempts = 0
        const maxAttempts = 30

        const poll = async () => {
            try {
                const res = await fetch(`/api/stripe/checkout-status?session_id=${encodeURIComponent(sessionId)}`)
                if (!res.ok) throw new Error('Kunne ikke hente status')

                const data = await res.json()
                setClientData(data)

                if (data.active) {
                    setStatus('ready')
                    return
                }

                attempts++
                if (attempts >= maxAttempts) {
                    setStatus('ready') // Show success anyway, onboarding may take time
                    return
                }

                setTimeout(poll, 3000)
            } catch {
                attempts++
                if (attempts >= maxAttempts) {
                    setStatus('error')
                    return
                }
                setTimeout(poll, 3000)
            }
        }

        poll()
    }, [sessionId])

    if (!sessionId) {
        return (
            <div className="login-container">
                <div className="login-card" style={{ textAlign: 'center' }}>
                    <h1 className="login-title">Ugyldig lenke</h1>
                    <p className="login-subtitle">Denne siden krever en gyldig checkout-session.</p>
                    <a href="/" className="btn btn-primary" style={{ display: 'inline-block', marginTop: '16px' }}>
                        Gå til forsiden
                    </a>
                </div>
            </div>
        )
    }

    return (
        <div className="login-container">
            <div className="login-card" style={{ textAlign: 'center' }}>
                {status === 'loading' && (
                    <>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9989;</div>
                        <h1 className="login-title">Takk for kjøpet!</h1>
                        <p className="login-subtitle">
                            Vi setter opp chatboten din nå. Dette tar vanligvis 1–2 minutter.
                        </p>
                        <div className="loading" style={{ marginTop: '24px' }}>
                            <div className="spinner"></div>
                        </div>
                        {clientData?.companyName && (
                            <p style={{ marginTop: '16px', fontWeight: 600 }}>
                                {clientData.companyName} — {clientData.plan}
                            </p>
                        )}
                    </>
                )}

                {status === 'ready' && (
                    <>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9989;</div>
                        <h1 className="login-title">Alt er klart!</h1>
                        <p className="login-subtitle">
                            {clientData?.companyName
                                ? `${clientData.companyName} er satt opp og klar til bruk.`
                                : 'Kontoen din er klar til bruk.'}
                        </p>
                        <p className="login-subtitle" style={{ marginTop: '8px' }}>
                            Sjekk e-posten din for innloggingsinformasjon.
                        </p>
                        <a href="/login" className="btn btn-primary" style={{ display: 'inline-block', marginTop: '24px', padding: '14px 32px' }}>
                            Logg inn
                        </a>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9888;&#65039;</div>
                        <h1 className="login-title">Noe gikk galt</h1>
                        <p className="login-subtitle">
                            Betalingen ble gjennomført, men vi klarte ikke å hente statusen.
                            Kontakt oss på {process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'support@helkrypt.no'} hvis dette vedvarer.
                        </p>
                        <a href="/" className="btn btn-primary" style={{ display: 'inline-block', marginTop: '16px' }}>
                            Gå til forsiden
                        </a>
                    </>
                )}
            </div>
        </div>
    )
}

export default function CheckoutSuccess() {
    return (
        <Suspense fallback={
            <div className="login-container">
                <div className="login-card" style={{ textAlign: 'center' }}>
                    <div className="loading"><div className="spinner"></div></div>
                </div>
            </div>
        }>
            <CheckoutSuccessInner />
        </Suspense>
    )
}
