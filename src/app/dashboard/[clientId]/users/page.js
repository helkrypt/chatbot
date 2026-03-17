'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

export default function UsersPage() {
  const { clientId } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('agent')
  const [inviteNotify, setInviteNotify] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  useEffect(() => {
    checkAuth()
    loadUsers()
  }, [clientId])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('role, client_id').eq('id', user.id).single()
    if (!profile) { router.push('/login'); return }
    if (profile.role === 'agent') router.push(`/dashboard/${clientId}`)
    if (profile.role === 'admin' && profile.client_id !== clientId) router.push(`/dashboard/${profile.client_id}`)
  }

  const loadUsers = async () => {
    setLoading(true)
    const res = await fetch(`/api/clients/${clientId}/users`)
    if (res.ok) {
      const { users } = await res.json()
      setUsers(users || [])
    }
    setLoading(false)
  }

  const toggleNotify = async (userId, current) => {
    setSaving(userId)
    const res = await fetch(`/api/clients/${clientId}/users`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, notify_on_escalation: !current }),
    })
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, notify_on_escalation: !current } : u))
    }
    setSaving(null)
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviting(true)
    setInviteError('')
    setInviteSuccess('')

    const res = await fetch(`/api/clients/${clientId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole, notify_on_escalation: inviteNotify }),
    })
    const data = await res.json()
    if (res.ok) {
      setInviteSuccess(`Invitasjon sendt til ${inviteEmail}`)
      setInviteEmail('')
      setInviteRole('agent')
      setInviteNotify(false)
      await loadUsers()
    } else {
      setInviteError(data.error || 'Kunne ikke sende invitasjon')
    }
    setInviting(false)
  }

  const handleDelete = async (userId, email) => {
    if (!confirm(`Fjern ${email || 'denne brukeren'} fra klienten?`)) return
    const res = await fetch(`/api/clients/${clientId}/users`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== userId))
    else alert('Kunne ikke fjerne bruker.')
  }

  const ROLE_LABELS = { sysadmin: 'Sysadmin', admin: 'Admin', agent: 'Agent' }

  return (
    <div className="app-container">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Brukere</h1>
          <button className="btn btn-primary" onClick={() => setShowInvite(!showInvite)}>
            {showInvite ? 'Avbryt' : '+ Inviter bruker'}
          </button>
        </div>

        {/* Invite form */}
        {showInvite && (
          <div className="card" style={{ maxWidth: '500px', marginBottom: '24px' }}>
            <form onSubmit={handleInvite} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>Inviter ny bruker</h3>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">E-post</label>
                <input
                  className="form-input"
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="bruker@bedrift.no"
                  required
                  autoFocus
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Rolle</label>
                <select className="form-input" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                  <option value="agent">Agent – kan se samtaler</option>
                  <option value="admin">Admin – full tilgang</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px 14px', border: `1px solid ${inviteNotify ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: '8px', background: inviteNotify ? 'var(--color-bg-subtle)' : 'transparent' }}>
                <input
                  type="checkbox"
                  checked={inviteNotify}
                  onChange={e => setInviteNotify(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--color-accent)' }}
                />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500' }}>Varsle ved eskalering</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Bruker mottar e-post når chat eskalerer til menneskelig støtte</div>
                </div>
              </label>

              {inviteError && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{inviteError}</p>}
              {inviteSuccess && <p style={{ color: '#22c55e', fontSize: '13px', margin: 0 }}>{inviteSuccess}</p>}

              <button type="submit" className="btn btn-primary" disabled={inviting}>
                {inviting ? 'Sender...' : 'Send invitasjon'}
              </button>
            </form>
          </div>
        )}

        {/* Users table */}
        <div className="card">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="spinner" />
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Ingen brukere ennå. Inviter den første!
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['E-post', 'Rolle', 'Varsling ved eskalering', ''].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '14px 16px', fontSize: '14px' }}>{u.email || <span style={{ color: 'var(--color-text-muted)' }}>Ukjent</span>}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', background: u.role === 'admin' ? '#fef3c7' : 'var(--color-bg-subtle)', color: u.role === 'admin' ? '#92400e' : 'var(--color-text-muted)' }}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        onClick={() => toggleNotify(u.id, u.notify_on_escalation)}
                        disabled={saving === u.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          background: u.notify_on_escalation ? 'var(--color-accent)' : 'var(--color-border)',
                          border: 'none', borderRadius: '20px', padding: '4px 12px',
                          color: u.notify_on_escalation ? '#fff' : 'var(--color-text-muted)',
                          fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                          opacity: saving === u.id ? 0.6 : 1,
                        }}
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: u.notify_on_escalation ? '#fff' : 'currentColor', display: 'inline-block' }} />
                        {u.notify_on_escalation ? 'På' : 'Av'}
                      </button>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {u.role !== 'sysadmin' && (
                        <button
                          onClick={() => handleDelete(u.id, u.email)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '13px', cursor: 'pointer', padding: '4px 8px' }}
                        >
                          Fjern
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
