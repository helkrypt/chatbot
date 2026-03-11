'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Link from 'next/link'

export default function AdminClientPage() {
  const { clientId } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const isNew = clientId === 'new'

  useEffect(() => {
    checkAuth()
    if (!isNew) loadClient()
    else {
      setForm({ id: '', name: '', domain: '', plan: 'standard', modules: '', escalation_email: '', chatbot_title: 'Kundeservice', webhook_url: '', active: true })
      setLoading(false)
    }
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
    setForm({
      ...client,
      modules: (client.modules || []).join(', '),
    })
    setLoading(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)

    const payload = {
      ...form,
      modules: form.modules ? form.modules.split(',').map(m => m.trim()).filter(Boolean) : [],
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

  if (loading || !form) {
    return (
      <div className="app-container">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <main className="main-content"><div className="loading"><div className="spinner"></div></div></main>
      </div>
    )
  }

  return (
    <div className="app-container">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <main className="main-content">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/admin" className="btn btn-secondary" style={{ padding: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="page-title">{isNew ? 'Ny kunde' : client?.name}</h1>
          </div>
          {!isNew && (
            <button onClick={handleDelete} style={{ padding: '8px 16px', background: 'none', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
              Slett kunde
            </button>
          )}
        </div>

        <div className="card" style={{ maxWidth: '700px' }}>
          <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {isNew && (
              <div className="form-group">
                <label className="form-label">ID (slug, f.eks. butikk-oslo)</label>
                <input className="form-input" value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} required pattern="[a-z0-9-]+" placeholder="butikk-oslo" />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Bedriftsnavn</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Domene</label>
              <input className="form-input" value={form.domain || ''} onChange={e => setForm({ ...form, domain: e.target.value })} placeholder="https://butikk.no" />
            </div>
            <div className="form-group">
              <label className="form-label">Pakke</label>
              <select className="form-input" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
                <option value="standard">Standard</option>
                <option value="profesjonell">Profesjonell</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Moduler (komma-separert, f.eks. kolliretur, booking)</label>
              <input className="form-input" value={form.modules} onChange={e => setForm({ ...form, modules: e.target.value })} placeholder="kolliretur, booking" />
            </div>
            <div className="form-group">
              <label className="form-label">Eskalerings-epost</label>
              <input className="form-input" type="email" value={form.escalation_email || ''} onChange={e => setForm({ ...form, escalation_email: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Chatbot-tittel</label>
              <input className="form-input" value={form.chatbot_title || ''} onChange={e => setForm({ ...form, chatbot_title: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Webhook URL (n8n)</label>
              <input className="form-input" value={form.webhook_url || ''} onChange={e => setForm({ ...form, webhook_url: e.target.value })} placeholder="https://n8n.helkrypt.no/webhook/..." />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="active" checked={form.active !== false} onChange={e => setForm({ ...form, active: e.target.checked })} />
              <label htmlFor="active" style={{ fontSize: '14px' }}>Aktiv</label>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
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
