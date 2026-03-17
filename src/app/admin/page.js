'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'

export default function AdminPage() {
  const router = useRouter()
  const [clients, setClients] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)

  useEffect(() => {
    fetch('/api/clients')
      .then(res => {
        if (res.status === 401) { router.push('/login'); return null }
        if (!res.ok) throw new Error('Feil ved henting av kunder')
        return res.json()
      })
      .then(data => {
        if (data) setClients(data.clients)
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [router])

  const visibleClients = showDeleted ? clients : clients?.filter(c => c.status !== 'deleted')
  const totalClients = visibleClients?.length || 0
  const activeClients = visibleClients?.filter(c => c.active).length || 0
  const inactiveClients = totalClients - activeClients

  if (loading) return null

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <h1 className="page-title">Helkrypt AI — Kundeadmin</h1>
          <Link href="/admin/clients/new" className="btn btn-primary">
            + Ny kunde
          </Link>
        </div>

        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-label">Totalt kunder</div>
            <div className="stat-value">{totalClients}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Aktive</div>
            <div className="stat-value" style={{ color: '#059669' }}>{activeClients}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Inaktive</div>
            <div className="stat-value" style={{ color: '#6b7280' }}>{inactiveClients}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <input type="checkbox" id="showDeleted" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
          <label htmlFor="showDeleted" style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Vis slettede kunder</label>
        </div>

        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Bedrift</th>
                  <th>ID</th>
                  <th>Pakke</th>
                  <th>Moduler</th>
                  <th>Status</th>
                  <th>Opprettet</th>
                  <th>Handlinger</th>
                </tr>
              </thead>
              <tbody>
                {visibleClients?.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/admin/clients/${c.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ color: 'var(--color-accent)', fontWeight: '500' }}>
                      {c.name}
                    </td>
                    <td>
                      <code style={{ fontSize: '12px', background: 'var(--color-bg-subtle)', padding: '2px 6px', borderRadius: '4px' }}>
                        {c.id}
                      </code>
                    </td>
                    <td>{c.plan}</td>
                    <td style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      {c.modules?.join(', ') || '—'}
                    </td>
                    <td>
                      <span style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: c.status === 'deleted' ? '#fef2f2' : c.status === 'onboarding_failed' ? '#fef2f2' : c.active ? '#d1fae5' : '#f3f4f6',
                        color: c.status === 'deleted' ? '#dc2626' : c.status === 'onboarding_failed' ? '#dc2626' : c.active ? '#065f46' : '#6b7280',
                      }}>
                        {{ active: 'Aktiv', inactive: 'Inaktiv', deleted: 'Slettet', onboarding_pending: 'Onboarding...', onboarding_failed: 'Feilet', pending: 'Ventende' }[c.status] || (c.active ? 'Aktiv' : 'Inaktiv')}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      {new Date(c.created_at).toLocaleDateString('no-NO')}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Link
                          href={`/admin/clients/${c.id}`}
                          style={{
                            padding: '4px 12px', fontSize: '13px',
                            background: 'var(--color-bg-subtle)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px', textDecoration: 'none',
                            color: 'var(--color-text)',
                          }}
                        >
                          Rediger
                        </Link>
                        <Link
                          href={`/dashboard/${c.id}?inspect=true`}
                          style={{
                            padding: '4px 12px', fontSize: '13px',
                            background: '#fff7ed',
                            border: '1px solid #fed7aa',
                            borderRadius: '6px', textDecoration: 'none',
                            color: '#c2410c',
                          }}
                        >
                          Inspiser
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
