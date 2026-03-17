'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Link from 'next/link'

const AVAILABLE_MODULES = [
]

export default function AdminClientPage() {
  const { clientId } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(null)
  const [selectedModules, setSelectedModules] = useState([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [retriggering, setRetriggering] = useState(false)

  // Brreg state
  const [brregLoading, setBrregLoading] = useState(false)
  const [brregError, setBrregError] = useState('')

  // For new clients: show orgnr search before the form
  const [showOrgnrSearch, setShowOrgnrSearch] = useState(true)
  const [orgnrInput, setOrgnrInput] = useState('')

  const isNew = clientId === 'new'

  const generateSlug = (name) => {
    return (name || '')
      .toLowerCase()
      .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
  }

  useEffect(() => {
    checkAuth()
    if (!isNew) loadClient()
    else setLoading(false)
  }, [clientId])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'sysadmin') router.push('/')
  }

  const loadClient = async () => {
    const res = await fetch(`/api/clients/${clientId}`)
    if (!res.ok) { router.push('/admin'); return }
    const { client } = await res.json()
    setClient(client)
    const mods = client.modules || []
    setSelectedModules(mods)
    setForm({
      ...client,
      orgnr: client.config?.orgnr || '',
      invoice_address: client.config?.invoice_address || '',
      contact_name: client.config?.contact_name || '',
      contact_phone: client.config?.contact_phone || '',
      contact_email: client.config?.contact_email || '',
    })
    setLoading(false)
  }

  const fetchBrreg = async (orgnr) => {
    const clean = (orgnr || '').replace(/\s/g, '')
    if (clean.length < 9) { setBrregError('Skriv inn et gyldig 9-sifret organisasjonsnummer.'); return }
    setBrregLoading(true)
    setBrregError('')
    try {
      const res = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${clean}`)
      if (!res.ok) { setBrregError('Fant ikke organisasjonen i Brønnøysundregisteret.'); setBrregLoading(false); return }
      const data = await res.json()
      const addr = data.forretningsadresse || data.postadresse || {}
      const addrLine = [
        (addr.adresse || []).join(', '),
        addr.postnummer && addr.poststed ? `${addr.postnummer} ${addr.poststed}` : '',
      ].filter(Boolean).join(', ')

      if (isNew) {
        const navn = data.navn || ''
        setForm({
          id: generateSlug(navn),
          name: navn,
          domain: data.hjemmeside ? `https://${data.hjemmeside.replace(/^https?:\/\//, '')}` : '',
          plan: 'standard',
          escalation_email: '',
          chatbot_title: 'Kundeservice',
          active: true,
          orgnr: clean,
          invoice_address: addrLine,
          contact_name: '',
          contact_phone: '',
          contact_email: '',
        })
        setShowOrgnrSearch(false)
      } else {
        setForm(prev => ({
          ...prev,
          name: data.navn || prev.name,
          domain: prev.domain || (data.hjemmeside ? `https://${data.hjemmeside.replace(/^https?:\/\//, '')}` : ''),
          orgnr: clean,
          invoice_address: addrLine,
        }))
      }
    } catch {
      setBrregError('Nettverksfeil – prøv igjen.')
    }
    setBrregLoading(false)
  }

  const toggleModule = (moduleId) => {
    setSelectedModules(prev =>
      prev.includes(moduleId) ? prev.filter(m => m !== moduleId) : [...prev, moduleId]
    )
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)

    const { orgnr, invoice_address, contact_name, contact_phone, contact_email, ...rest } = form
    const payload = {
      ...rest,
      modules: selectedModules,
      escalation_email: rest.escalation_email || contact_email || '',
      config: {
        ...(client?.config || {}),
        ...(orgnr ? { orgnr } : {}),
        ...(invoice_address ? { invoice_address } : {}),
        ...(contact_name ? { contact_name } : {}),
        ...(contact_phone ? { contact_phone } : {}),
        ...(contact_email ? { contact_email } : {}),
      },
    }

    let res
    if (isNew) {
      res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      const { id, created_at, ...updates } = payload
      res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    }

    if (res.ok) {
      router.push('/admin')
    } else {
      const { error } = await res.json()
      alert('Feil: ' + error)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirm(`Slett klient "${client?.name}"? Dette kan ikke angres.`)) return
    const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
    if (res.ok) router.push('/admin')
    else alert('Kunne ikke slette klienten.')
  }

  const handleRetriggerOnboarding = async () => {
    if (!confirm('Re-trigger onboarding for denne klienten?')) return
    setRetriggering(true)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retrigger_onboarding: true }),
      })
      if (res.ok) {
        alert('Onboarding er re-trigget. Sjekk n8n for status.')
        loadClient()
      } else {
        const { error } = await res.json()
        alert('Feil: ' + error)
      }
    } catch {
      alert('Nettverksfeil')
    }
    setRetriggering(false)
  }

  const BackButton = () => (
    <Link href="/admin" className="btn btn-secondary" style={{ padding: '8px' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </Link>
  )

  if (loading || (!isNew && !form)) {
    return (
      <div className="app-container">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <main className="main-content"><div className="loading"><div className="spinner"></div></div></main>
      </div>
    )
  }

  // New client: show Brreg search first
  if (isNew && showOrgnrSearch) {
    return (
      <div className="app-container">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <main className="main-content">
          <div className="page-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <BackButton />
              <h1 className="page-title">Ny kunde</h1>
            </div>
          </div>
          <div className="card" style={{ maxWidth: '500px' }}>
            <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 6px' }}>Søk i Brønnøysundregisteret</h2>
                <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: 0 }}>
                  Skriv inn organisasjonsnummer for å hente bedriftsinformasjon automatisk.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  className="form-input"
                  placeholder="123 456 789"
                  value={orgnrInput}
                  onChange={e => setOrgnrInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), fetchBrreg(orgnrInput))}
                  style={{ flex: 1 }}
                  maxLength={11}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => fetchBrreg(orgnrInput)}
                  disabled={brregLoading}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {brregLoading ? 'Henter...' : 'Hent info'}
                </button>
              </div>
              {brregError && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{brregError}</p>}
              <button
                type="button"
                onClick={() => {
                  setForm({ id: '', name: '', domain: '', plan: 'standard', escalation_email: '', chatbot_title: 'Kundeservice', active: true, orgnr: '', invoice_address: '', contact_name: '', contact_phone: '', contact_email: '' })
                  setShowOrgnrSearch(false)
                }}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', padding: 0 }}
              >
                Hopp over — fyll inn manuelt
              </button>
            </div>
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
            <BackButton />
            <h1 className="page-title">{isNew ? 'Ny kunde' : client?.name}</h1>
          </div>
          {!isNew && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Link
                href={`/dashboard/${clientId}?inspect=true`}
                style={{ padding: '8px 16px', background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-text)', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Inspiser
              </Link>
              <button onClick={handleDelete} style={{ padding: '8px 16px', background: 'none', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                Slett kunde
              </button>
            </div>
          )}
        </div>

        <div className="card" style={{ maxWidth: '700px' }}>
          <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Bedriftsinformasjon */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Bedriftsinformasjon</h3>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">Organisasjonsnummer</label>
                  <input
                    className="form-input"
                    value={form.orgnr || ''}
                    onChange={e => setForm({ ...form, orgnr: e.target.value })}
                    placeholder="123 456 789"
                    maxLength={11}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => fetchBrreg(form.orgnr)}
                  disabled={brregLoading}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {brregLoading ? 'Henter...' : 'Hent fra Brreg'}
                </button>
              </div>
              {brregError && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{brregError}</p>}

              <div className="form-group">
                <label className="form-label">Bedriftsnavn</label>
                <input
                  className="form-input"
                  value={form.name || ''}
                  onChange={e => {
                    const name = e.target.value
                    setForm(prev => ({
                      ...prev,
                      name,
                      ...(isNew ? { id: generateSlug(name) } : {}),
                    }))
                  }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Fakturaadresse</label>
                <input className="form-input" value={form.invoice_address || ''} onChange={e => setForm({ ...form, invoice_address: e.target.value })} placeholder="Storgata 1, 0150 Oslo" />
              </div>

              <div className="form-group">
                <label className="form-label">Nettsted</label>
                <input className="form-input" value={form.domain || ''} onChange={e => setForm({ ...form, domain: e.target.value })} placeholder="https://butikk.no" />
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px', marginTop: '2px' }}>
                <h4 style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Kontaktperson</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Navn</label>
                    <input className="form-input" value={form.contact_name || ''} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="Ola Nordmann" />
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label className="form-label">Telefon</label>
                      <input className="form-input" type="tel" value={form.contact_phone || ''} onChange={e => setForm({ ...form, contact_phone: e.target.value })} placeholder="+47 400 00 000" />
                    </div>
                    <div className="form-group" style={{ flex: 2, margin: 0 }}>
                      <label className="form-label">E-post <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(brukes som eskalerings-epost)</span></label>
                      <input className="form-input" type="email" value={form.contact_email || ''} onChange={e => setForm({ ...form, contact_email: e.target.value })} placeholder="ola@bedrift.no" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Innstillinger */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
              <h3 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Innstillinger</h3>

              <div className="form-group">
                <label className="form-label">Pakke</label>
                <select className="form-input" value={form.plan || 'standard'} onChange={e => setForm({ ...form, plan: e.target.value })}>
                  <option value="standard">Standard</option>
                  <option value="profesjonell">Profesjonell</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Moduler</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  {AVAILABLE_MODULES.map(mod => (
                    <label
                      key={mod.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer',
                        padding: '10px 14px',
                        border: `1px solid ${selectedModules.includes(mod.id) ? 'var(--color-accent)' : 'var(--color-border)'}`,
                        borderRadius: '8px',
                        background: selectedModules.includes(mod.id) ? 'var(--color-bg-subtle)' : 'transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedModules.includes(mod.id)}
                        onChange={() => toggleModule(mod.id)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                      />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500' }}>{mod.label}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{mod.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Eskalerings-epost <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(standard: kontaktpersonens e-post)</span></label>
                <input className="form-input" type="email" value={form.escalation_email || ''} onChange={e => setForm({ ...form, escalation_email: e.target.value })} placeholder={form.contact_email || ''} />
              </div>

              <div className="form-group">
                <label className="form-label">Chatbot-tittel</label>
                <input className="form-input" value={form.chatbot_title || ''} onChange={e => setForm({ ...form, chatbot_title: e.target.value })} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="active" checked={form.active !== false} onChange={e => setForm({ ...form, active: e.target.checked })} />
                <label htmlFor="active" style={{ fontSize: '14px' }}>Aktiv</label>
              </div>

              {/* Onboarding-status */}
              {!isNew && client?.status && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: client.status === 'onboarding_failed' ? '#fef2f2' : 'var(--color-bg-subtle)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Onboarding-status</div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: client.status === 'onboarding_failed' ? '#dc2626' : 'var(--color-text)', marginTop: '2px' }}>
                      {{ active: 'Fullfort', pending: 'Ventende', onboarding_pending: 'Onboarding startet', onboarding_failed: 'Onboarding feilet', inactive: 'Inaktiv', deleted: 'Slettet' }[client.status] || client.status}
                    </div>
                  </div>
                  {(client.status === 'onboarding_failed' || client.status === 'onboarding_pending') && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleRetriggerOnboarding}
                      disabled={retriggering}
                      style={{ fontSize: '13px', whiteSpace: 'nowrap' }}
                    >
                      {retriggering ? 'Sender...' : 'Re-trigger onboarding'}
                    </button>
                  )}
                </div>
              )}
            </section>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '4px' }}>
              <Link href="/admin" className="btn btn-secondary">Avbryt</Link>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Lagrer...' : 'Lagre'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
