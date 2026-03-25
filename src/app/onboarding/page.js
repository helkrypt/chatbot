'use client'

import { useState } from 'react'

const STEPS = ['Firma', 'Nettside', 'Tone', 'Setter opp...', 'Ferdig!']

const TONES = [
  {
    id: 'friendly',
    emoji: '😊',
    label: 'Vennlig og uformell',
    example: '"Hei! Hva kan jeg hjelpe deg med?"',
  },
  {
    id: 'formal',
    emoji: '👔',
    label: 'Profesjonell og høflig',
    example: '"Hei, hvordan kan jeg bistå deg i dag?"',
  },
  {
    id: 'casual',
    emoji: '🤝',
    label: 'Nøytral og saklig',
    example: '"God dag. Hva gjelder henvendelsen?"',
  },
]

const LOADING_MESSAGES = [
  'Leser nettsiden din...',
  'Lærer om bedriften din...',
  'Setter opp AI-assistenten...',
  'Genererer skreddersydd systemprompt...',
  'Klargjør chatboten...',
]

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [companyName, setCompanyName] = useState('')
  const [orgnr, setOrgnr] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminName, setAdminName] = useState('')
  const [tone, setTone] = useState('friendly')
  const [loadingMsg, setLoadingMsg] = useState(0)
  const [progress, setProgress] = useState(0)
  const [clientId, setClientId] = useState(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const totalSteps = STEPS.length

  async function startOnboarding() {
    setStep(3)
    setError('')

    // Animer fremgangsindikatoren
    let msgIndex = 0
    const interval = setInterval(() => {
      msgIndex = Math.min(msgIndex + 1, LOADING_MESSAGES.length - 1)
      setLoadingMsg(msgIndex)
      setProgress(Math.min((msgIndex / LOADING_MESSAGES.length) * 90, 90))
    }, 8000)

    try {
      const res = await fetch('/api/onboarding/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, orgnr, websiteUrl, adminEmail, adminName, tone }),
      })

      clearInterval(interval)

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Noe gikk galt. Prøv igjen.')
        setStep(2)
        return
      }

      const data = await res.json()
      setProgress(100)
      setClientId(data.clientId)
      setTimeout(() => setStep(4), 600)
    } catch (err) {
      clearInterval(interval)
      setError('Tilkoblingsfeil. Sjekk internettforbindelsen og prøv igjen.')
      setStep(2)
    }
  }

  function copySnippet() {
    const snippet = `<script src="${window.location.origin}/widget.js" data-client="${clientId}" defer></script>`
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const progressPercent = step === 3 ? progress : Math.round((step / (totalSteps - 1)) * 100)

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        background: 'white',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-lg)',
        padding: '40px',
      }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '10px',
              background: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 700, fontSize: '18px',
            }}>H</div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '18px' }}>
              Helkrypt AI
            </span>
          </div>

          {/* Progressbar */}
          {step < 4 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                {STEPS.slice(0, 4).map((s, i) => (
                  <span key={i} style={{
                    fontSize: '12px',
                    color: i <= step ? 'var(--color-accent)' : 'var(--color-text-light)',
                    fontWeight: i === step ? 600 : 400,
                  }}>{s}</span>
                ))}
              </div>
              <div style={{
                height: '6px', background: '#e5e7eb', borderRadius: '99px', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: 'var(--color-accent)',
                  borderRadius: '99px',
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </>
          )}
        </div>

        {/* Steg 0 — Firma */}
        {step === 0 && (
          <div>
            <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>
              Hei! La oss sette opp din chatbot
            </h1>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '28px' }}>
              Under 4 minutter fra start til fungerende kundeservice-chatbot.
            </p>

            <div className="form-group">
              <label className="form-label">Hva heter bedriften din?</label>
              <input
                type="text"
                className="form-input"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Eks: Hansen Rørlegger AS"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Org.nummer <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(valgfritt — gir bedre chatbot)</span></label>
              <input
                type="text"
                className="form-input"
                value={orgnr}
                onChange={e => setOrgnr(e.target.value)}
                placeholder="123 456 789"
                maxLength={11}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Din e-post</label>
              <input
                type="email"
                className="form-input"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="din@epost.no"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Ditt navn <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(valgfritt)</span></label>
              <input
                type="text"
                className="form-input"
                value={adminName}
                onChange={e => setAdminName(e.target.value)}
                placeholder="Ola Nordmann"
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px', marginTop: '8px' }}
              disabled={!companyName.trim() || !adminEmail.trim()}
              onClick={() => setStep(1)}
            >
              Neste →
            </button>
          </div>
        )}

        {/* Steg 1 — Nettside */}
        {step === 1 && (
          <div>
            <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>
              Hvor finner kundene deg på nett?
            </h1>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '28px' }}>
              Chatboten lærer automatisk hva du driver med.
            </p>

            <div className="form-group">
              <label className="form-label">Nettside-adresse</label>
              <input
                type="url"
                className="form-input"
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="https://www.dinbedrift.no"
                autoFocus
              />
            </div>

            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '24px',
            }}>
              {['Vi leser nettsiden din automatisk', 'Chatboten lærer hva du driver med', 'Tar ca. 10 sekunder'].map(t => (
                <div key={t} style={{ display: 'flex', gap: '10px', marginBottom: '6px', fontSize: '14px', color: '#166534' }}>
                  <span>✓</span><span>{t}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" style={{ flex: 1, padding: '14px' }} onClick={() => setStep(0)}>
                ← Tilbake
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2, padding: '14px' }}
                onClick={() => setStep(2)}
              >
                Neste →
              </button>
            </div>
          </div>
        )}

        {/* Steg 2 — Tone */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>
              Hvordan skal chatboten snakke?
            </h1>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '28px' }}>
              Du kan endre dette når som helst fra dashbordet.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
              {TONES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '14px',
                    padding: '16px',
                    border: `2px solid ${tone === t.id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    borderRadius: '10px',
                    background: tone === t.id ? '#f0fdfc' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '22px', marginTop: '2px' }}>{t.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{t.label}</div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{t.example}</div>
                  </div>
                </button>
              ))}
            </div>

            {error && (
              <div style={{
                color: '#ef4444', fontSize: '14px', marginBottom: '16px',
                padding: '12px', background: '#fef2f2', borderRadius: '8px',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" style={{ flex: 1, padding: '14px' }} onClick={() => setStep(1)}>
                ← Tilbake
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2, padding: '14px' }}
                onClick={startOnboarding}
              >
                Start oppsett →
              </button>
            </div>
          </div>
        )}

        {/* Steg 3 — Laster */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚙️</div>
            <h1 style={{ fontSize: '22px', marginBottom: '8px' }}>
              Setter opp chatboten din...
            </h1>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '32px', fontSize: '14px' }}>
              Tar vanligvis 1–3 minutter
            </p>

            <div style={{
              height: '10px', background: '#e5e7eb', borderRadius: '99px',
              overflow: 'hidden', marginBottom: '24px',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'var(--color-accent)',
                borderRadius: '99px',
                transition: 'width 0.8s ease',
              }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
              {LOADING_MESSAGES.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '10px', alignItems: 'center',
                  fontSize: '14px',
                  color: i < loadingMsg ? '#166534' : i === loadingMsg ? 'var(--color-text)' : 'var(--color-text-light)',
                }}>
                  <span>{i < loadingMsg ? '✅' : i === loadingMsg ? '⏳' : '○'}</span>
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Steg 4 — Ferdig! */}
        {step === 4 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
              <h1 style={{ fontSize: '26px', marginBottom: '8px' }}>Chatboten din er klar!</h1>
              <p style={{ color: 'var(--color-text-muted)' }}>
                Vi har sendt innloggingsinformasjon til <strong>{adminEmail}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
              <a
                href={`/chat-widget?client=${clientId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', textAlign: 'center' }}
              >
                Forhåndsvis
              </a>
              <a
                href={`/dashboard/${clientId}`}
                className="btn btn-primary"
                style={{ flex: 2, padding: '12px', textAlign: 'center' }}
              >
                Gå til dashbordet →
              </a>
            </div>

            <div style={{
              border: '1px solid var(--color-border)',
              borderRadius: '10px',
              padding: '20px',
            }}>
              <p style={{ fontWeight: 600, marginBottom: '12px' }}>Legg chatboten til på nettsiden din</p>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                Kopier kodelinjen nedenfor og lim den inn rett før &lt;/body&gt; på nettsiden din:
              </p>
              <div style={{
                background: '#1a1b2e',
                color: '#00c9b7',
                borderRadius: '8px',
                padding: '14px 16px',
                fontSize: '13px',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                marginBottom: '12px',
              }}>
                {`<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://app.helkrypt.no'}/widget.js" data-client="${clientId}" defer></script>`}
              </div>
              <button
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={copySnippet}
              >
                {copied ? '✅ Kopiert!' : '📋 Kopier kode'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
